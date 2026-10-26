"""Persistent, private JSONL worker for exactly one local gateway capability.

Only the Electron parent listens on the network. Models hydrate before init succeeds;
each process keeps its own accelerator allocation and never downloads weights.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import io
import json
from math import gcd
import os
from pathlib import Path
import sys
import struct
from uuid import uuid4
import wave

import numpy as np

MAX_LINE = 40 * 1024 * 1024
MAX_AUDIO_SECONDS = 300
MAX_STREAM_BACKLOG_SAMPLES = 16000 * 30


def stream_backlog_samples(state):
    recognizer = state['recognizer']
    return (state.get('inflight_samples', 0) + state['pending'].size +
        recognizer.segmenter._active_samples +
        sum(job.samples.size for job in recognizer._pending_finals) +
        sum(job.samples.size for job in recognizer._pending_intermediates.values()))


def speech_format(result, requested):
    if requested != 'mp3':
        return result
    import lameenc
    raw = base64.b64decode(result['audio'].split(',', 1)[1], validate=True)
    with wave.open(io.BytesIO(raw), 'rb') as source:
        if source.getsampwidth() != 2:
            raise ValueError('MP3 encoding requires PCM16')
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(128)
        encoder.set_in_sample_rate(source.getframerate())
        encoder.set_channels(source.getnchannels())
        encoder.set_quality(2)
        audio = encoder.encode(source.readframes(source.getnframes())) + encoder.flush()
    return {**result, 'audio': 'data:audio/mpeg;base64,' + base64.b64encode(audio).decode('ascii')}


def decode_file(encoded: str) -> np.ndarray:
    """Decode bounded PCM WAV and resample to the recognizers' mono 16 kHz contract."""
    raw = base64.b64decode(encoded, validate=True)
    with wave.open(io.BytesIO(raw), 'rb') as source:
        channels, width, rate = source.getnchannels(), source.getsampwidth(), source.getframerate()
        frames = source.getnframes()
        if channels not in (1, 2) or width not in (1, 2, 3, 4) or not 8000 <= rate <= 192000:
            raise ValueError('Unsupported PCM WAV format')
        if not frames or frames > rate * MAX_AUDIO_SECONDS:
            raise ValueError('Audio duration must be between zero and five minutes')
        pcm = source.readframes(frames)
    if len(pcm) != frames * channels * width:
        raise ValueError('Truncated WAV')
    if width == 1:
        values = (np.frombuffer(pcm, dtype=np.uint8).astype(np.float32) - 128) / 128
    elif width == 3:
        octets = np.frombuffer(pcm, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        values = octets[:, 0] | (octets[:, 1] << 8) | (octets[:, 2] << 16)
        values = ((values ^ 0x800000) - 0x800000).astype(np.float32) / 8388608
    else:
        values = np.frombuffer(pcm, dtype='<i2' if width == 2 else '<i4').astype(np.float32) / (32768 if width == 2 else 2147483648)
    samples = values.reshape(-1, channels).mean(axis=1)
    if rate != 16000:
        from scipy.signal import resample_poly
        factor = gcd(rate, 16000)
        samples = resample_poly(samples, 16000 // factor, rate // factor)
    return np.asarray(samples, dtype=np.float32)


class PersistentSynthesizer:
    def __init__(self, resources, model_id, compute):
        self.resources, self.model_id, self.compute = resources, model_id, compute
        self.runtime = None
        self.model = None
        self.pipeline = None
        self.voices = []
        self.mode = ''

    def load(self):
        from .recognition.crisp_asr import CrispAsrRuntime, prepare_crisp_synthesis
        root = self.resources.model_path(self.model_id)
        adapter = self.resources.adapter_for(self.model_id)
        if adapter == 'crisp-tts' or '-crisp-' in self.model_id:
            self.runtime = CrispAsrRuntime(self.resources.recognition_weight_path(self.model_id),
                threads=self.compute.cpuThreads or 4, use_vulkan=self.compute.recognitionDevice != 'cpu',
                allow_cpu_fallback=self.compute.allowCpuFallback)
            self.runtime.load()
            prepare_crisp_synthesis(self.runtime._session, root)
            if self.runtime._session.output_sample_rate() <= 0:
                raise ValueError('The selected model cannot synthesize speech')
            self.voices = list(self.runtime._session.speakers() or [])
            self.mode = 'crisp'
            return
        if adapter == 'llama.cpp' or self.model_id.startswith('tts-qwen3-tts-llama-'):
            raise ValueError('The llama.cpp TTS adapter does not support synthesis')
        from .compute import probe_devices
        from .local_call import torch_device_for_tts
        devices, _, _ = probe_devices(None)
        device = torch_device_for_tts(self.compute, devices)
        metadata = json.loads((root / 'config.json').read_text(encoding='utf8'))
        if metadata.get('model_type') == 'qwen3_tts':
            from qwen_tts import Qwen3TTSModel
            self.mode = metadata.get('tts_model_type', '')
            if self.mode not in ('custom_voice', 'voice_design'):
                raise ValueError('A reference voice is required by this TTS model')
            self.model = Qwen3TTSModel.from_pretrained(str(root), device_map=device, local_files_only=True)
            self.voices = list(self.model.get_supported_speakers() or [])
            return
        from transformers import AutoConfig, AutoModelForTextToWaveform, AutoModelForTextToSpectrogram, pipeline
        from .translation.transformers_causal import load_verified_model
        config = AutoConfig.from_pretrained(str(root), local_files_only=True, trust_remote_code=False)
        loader = AutoModelForTextToWaveform if type(config) in AutoModelForTextToWaveform._model_mapping else AutoModelForTextToSpectrogram
        self.model = load_verified_model(loader, root)
        self.pipeline = pipeline('text-to-audio', model=self.model, device=device, trust_remote_code=False)
        self.mode = 'pipeline'

    def synthesize(self, text, voice=''):
        from .local_call import encode_audio
        if voice and voice not in self.voices:
            raise ValueError('Unknown voice')
        if self.mode == 'crisp':
            session = self.runtime._session
            speaker = voice or (self.voices[0] if self.voices else '')
            if speaker:
                session.set_speaker_name(speaker)
            audio, rate = session.synthesize(text), session.output_sample_rate()
        elif self.mode == 'custom_voice':
            speaker = voice or (self.voices[0] if self.voices else None)
            if not speaker:
                raise ValueError('The model does not expose a speaker')
            wavs, rate = self.model.generate_custom_voice(text=text, speaker=speaker, language='Auto')
            audio = wavs[0]
        elif self.mode == 'voice_design':
            wavs, rate = self.model.generate_voice_design(text=text, language='Auto', instruct='A clear, neutral speaking voice.')
            audio = wavs[0]
        else:
            result = self.pipeline(text)
            audio, rate = result['audio'], result['sampling_rate']
        return {'text': text, 'audio': encode_audio(audio, rate)}

    def close(self):
        self.pipeline = None
        self.model = None
        if self.runtime:
            self.runtime.unload()
            self.runtime = None


class GatewayWorker:
    def __init__(self, emit):
        self.emit = emit
        self.runtime = None
        self.synthesizer = None
        self.kind = ''
        self.sessions = {}
        self.inference = asyncio.Lock()
        self.config = None

    def remote_recognizer(self, config=None):
        config = config or self.config
        if config.recognitionProvider == 'minimax':
            from .recognition.minimax import MiniMaxRecognizer
            return MiniMaxRecognizer(config)
        from .recognition.aliyun import AliyunRecognizer
        return AliyunRecognizer(config)

    async def initialize(self, request):
        from .runtime import EngineRuntime
        from .protocol import PrewarmConfig, PrewarmModelsCommand

        class IsolatedRuntime(EngineRuntime):
            def _write_engine_status(self):
                pass

            def _remove_engine_status(self):
                pass

        self.kind = request['kind']
        if self.kind not in ('asr', 'mt', 'tts'):
            raise ValueError('Unknown capability')
        self.runtime = IsolatedRuntime(Path(os.environ['NOLA_TRANSLATOR_MODEL_DIR']), lambda _event: None)
        config = PrewarmConfig.model_validate(request['config'])
        self.config = config
        if self.kind == 'asr' and config.recognitionProvider != 'local':
            # Validate configuration without opening or billing a cloud session at gateway startup.
            recognizer = self.remote_recognizer()
            try:
                recognizer.validate_credentials()
            finally:
                await recognizer.close()
            return {}
        if self.kind == 'mt' and config.translationProvider != 'local':
            if config.translationProvider == 'recognition':
                raise ValueError('Native speech translation requires audio, not a text request')
            command = PrewarmModelsCommand(protocolVersion=1, requestId='gateway', type='prewarmModels', config=config)
            self.runtime._configure_translation(command)
            return {}
        model_id = request['resourceId']
        record = self.runtime.resources.record(model_id)
        if not record.installed or record.kind != {'asr': 'recognitionModel', 'mt': 'translationModel', 'tts': 'ttsModel'}[self.kind]:
            raise ValueError('Selected model is unavailable or has the wrong capability')
        command = PrewarmModelsCommand(protocolVersion=1, requestId='gateway', type='prewarmModels', config=config)
        if self.kind == 'tts':
            self.synthesizer = PersistentSynthesizer(self.runtime.resources, model_id, config.compute)
            await asyncio.to_thread(self.synthesizer.load)
            return {'voices': self.synthesizer.voices}
        await self.runtime._configure_device_plan(command)
        if self.kind == 'mt':
            self.runtime._configure_translation(command)
            await self.runtime._ensure_translation_server(command)
        else:
            recognizer = await self.runtime._create_recognizer(command)
            try:
                await asyncio.to_thread(recognizer.prepare)
            finally:
                await recognizer.close()
        return {}

    async def transcribe(self, samples, language=None, prefix=None):
        async with self.inference:
            if self.config is not None and self.config.recognitionProvider != 'local':
                from .audio.resample import AudioFrame
                config = self.config.model_copy(update={'sourceLanguage': language or 'auto'})
                recognizer = self.remote_recognizer(config)
                updates = {}
                async def collect(update):
                    updates[update.segment_id] = update
                recognizer.on_update = collect
                try:
                    await recognizer.start()
                    for offset in range(0, samples.size, 320):
                        for update in await recognizer.accept(AudioFrame(samples[offset:offset + 320], offset / 16)):
                            await collect(update)
                    for update in await recognizer.flush(samples.size / 16):
                        await collect(update)
                    ordered = sorted(updates.values(), key=lambda item: item.started_at_ms)
                    return ' '.join(update.source_text for update in ordered), next((item.language for item in ordered if item.language), language)
                finally:
                    await recognizer.close()
            return await asyncio.to_thread(self.runtime._recognition_runtime().transcribe, samples, language=language, prefix=prefix)

    async def request(self, request):
        op = request['op']
        if op.startswith('session.'):
            if self.kind != 'asr':
                raise ValueError('Realtime requires ASR')
            return await self.realtime(request)
        if op != 'infer':
            raise ValueError('Unknown operation')
        if self.kind == 'asr':
            samples = decode_file(request['audio'])
            text, language = await self.transcribe(samples, None if request.get('source', 'auto') == 'auto' else request['source'])
            return {'text': text, 'language': language}
        text = request.get('text')
        if not isinstance(text, str) or not text.strip() or len(text) > 64000:
            raise ValueError('Invalid text')
        async with self.inference:
            if self.kind == 'tts':
                result = await asyncio.to_thread(self.synthesizer.synthesize, text, request.get('voice', ''))
                return await asyncio.to_thread(speech_format, result, request.get('response_format', 'mp3'))
            translated = await self.runtime.translation_provider.translate(text, request.get('source', 'auto'), request['target'])
            return {'text': translated.text}

    async def realtime(self, request):
        from .audio.resample import AudioFrame
        from .recognition.streaming import StreamingRecognizer
        from .recognition.volume_gate import SileroVadSegmenter

        session_id = request['session']
        op = request['op']
        if op == 'session.open':
            if session_id in self.sessions or len(self.sessions) >= 8:
                raise ValueError('Session limit reached')
            if self.config is not None and self.config.recognitionProvider != 'local':
                async def update(item):
                    if session_id in self.sessions:
                        self.emit({'session': session_id, 'event': {
                            'type': 'conversation.item.input_audio_transcription.completed' if item.is_final else 'conversation.item.input_audio_transcription.text',
                            'item_id': item.segment_id, 'content_index': 0, 'language': item.language,
                            'transcript': item.source_text, 'text': item.source_text,
                            'audio_start_ms': item.started_at_ms, 'audio_end_ms': item.ended_at_ms}})
                config = self.config.model_copy(update={'sourceLanguage': request.get('language') or 'auto'})
                recognizer = self.remote_recognizer(config)
                recognizer.on_update = update
                self.sessions[session_id] = {'remote': True, 'recognizer': recognizer, 'samples': 0}
                try:
                    await recognizer.start()
                except Exception:
                    self.sessions.pop(session_id, None)
                    await recognizer.close()
                    raise
                return {}
            if request.get('manual'):
                self.sessions[session_id] = {'recognizer': None, 'samples': 0, 'audio': [], 'last_partial': 0,
                    'language': request.get('language'), 'item_id': 'item_' + uuid4().hex}
                return {}
            async def update(item):
                if session_id not in self.sessions:
                    return
                event = {'type': 'conversation.item.input_audio_transcription.completed' if item.is_final else 'conversation.item.input_audio_transcription.text',
                    'item_id': item.segment_id, 'content_index': 0, 'language': item.language,
                    'transcript': item.source_text, 'text': item.source_text, 'audio_start_ms': item.started_at_ms,
                    'audio_end_ms': item.ended_at_ms}
                self.emit({'session': session_id, 'event': event})
            async def transcribe(job):
                state = self.sessions.get(session_id)
                if state is not None:
                    state['inflight_samples'] = job.samples.size
                try:
                    return await self.transcribe(job.samples, job.language, job.prefix)
                finally:
                    if state is not None:
                        state['inflight_samples'] = 0
            segmenter = SileroVadSegmenter(silence_end_ms=int(request.get('silenceMs', 800)))
            recognizer = StreamingRecognizer(self.runtime._recognition_runtime(), segmenter=segmenter,
                source_language=request.get('language'), block_ms=1000, first_block_ms=500,
                run_transcribe=transcribe, on_update=update)
            await asyncio.to_thread(recognizer.prepare)
            self.sessions[session_id] = {'recognizer': recognizer, 'samples': 0, 'pending': np.empty(0, dtype=np.float32), 'active_start': None, 'inflight_samples': 0}
            return {}
        state = self.sessions.get(session_id)
        if state is None:
            if op == 'session.close':
                return {}
            raise ValueError('Unknown realtime session')
        recognizer = state['recognizer']
        if state.get('remote'):
            if op == 'session.append':
                raw = base64.b64decode(request['audio'], validate=True)
                if not raw or len(raw) % 2 or len(raw) > 768 * 1024:
                    raise ValueError('Invalid PCM16 audio')
                samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
                for offset in range(0, samples.size, 320):
                    frame = samples[offset:offset + 320]
                    for update in await recognizer.accept(AudioFrame(frame, state['samples'] / 16)):
                        await recognizer.on_update(update)
                    state['samples'] += frame.size
                return {}
            if op in ('session.commit', 'session.finish'):
                for update in await recognizer.flush(state['samples'] / 16):
                    await recognizer.on_update(update)
                if op == 'session.commit':
                    return {}
            if op in ('session.close', 'session.finish'):
                self.sessions.pop(session_id, None)
                await recognizer.close()
                return {}
            raise ValueError('Unknown realtime operation')
        if recognizer is None:
            return await self.manual_realtime(request, state)
        if op == 'session.append':
            raw = base64.b64decode(request['audio'], validate=True)
            if not raw or len(raw) % 2 or len(raw) > 768 * 1024:
                raise ValueError('Invalid PCM16 audio')
            samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
            if stream_backlog_samples(state) + samples.size > MAX_STREAM_BACKLOG_SAMPLES:
                raise ValueError('Realtime audio backlog exceeded; pace audio in realtime and retry later')
            samples = np.concatenate((state['pending'], samples))
            count = samples.size // 320 * 320
            for offset in range(0, count, 320):
                await recognizer.accept(AudioFrame(samples[offset:offset + 320], state['samples'] / 16))
                state['samples'] += 320
                bounds = recognizer.segmenter.current_bounds()
                active = bounds[0] if bounds else None
                if state['active_start'] != active:
                    if state['active_start'] is not None:
                        self.emit({'session': session_id, 'event': {'type': 'input_audio_buffer.speech_stopped', 'audio_end_ms': state['samples'] / 16}})
                    if active is not None:
                        self.emit({'session': session_id, 'event': {'type': 'input_audio_buffer.speech_started', 'audio_start_ms': active}})
                    state['active_start'] = active
            state['pending'] = samples[count:].copy()
            return {}
        if op in ('session.commit', 'session.finish'):
            pending = state['pending']
            if pending.size:
                await recognizer.accept(AudioFrame(pending, state['samples'] / 16))
                state['samples'] += pending.size
                state['pending'] = np.empty(0, dtype=np.float32)
            await recognizer.flush(state['samples'] / 16)
            if state['active_start'] is not None:
                self.emit({'session': session_id, 'event': {'type': 'input_audio_buffer.speech_stopped', 'audio_end_ms': state['samples'] / 16}})
                state['active_start'] = None
            if op == 'session.commit':
                return {}
        if op in ('session.close', 'session.finish'):
            self.sessions.pop(session_id, None)
            await recognizer.close()
            return {}
        raise ValueError('Unknown realtime operation')

    async def manual_realtime(self, request, state):
        session_id, op = request['session'], request['op']
        if op == 'session.append':
            raw = base64.b64decode(request['audio'], validate=True)
            if not raw or len(raw) % 2 or len(raw) > 768 * 1024:
                raise ValueError('Invalid PCM16 audio')
            samples = np.frombuffer(raw, dtype='<i2').astype(np.float32) / 32768
            if state['samples'] + samples.size > 16000 * MAX_AUDIO_SECONDS:
                raise ValueError('Commit manual audio at least once every five minutes')
            state['audio'].append(samples)
            state['samples'] += samples.size
            if state['samples'] - state['last_partial'] < 16000:
                return {}
            state['last_partial'] = state['samples']
        elif op == 'session.close':
            self.sessions.pop(session_id, None)
            return {}
        elif op not in ('session.commit', 'session.finish'):
            raise ValueError('Unknown realtime operation')
        final = op != 'session.append'
        if state['samples']:
            language = state['language'] if state['language'] not in (None, '', 'auto') else None
            transcript, detected = await self.transcribe(np.concatenate(state['audio']), language)
            self.emit({'session': session_id, 'event': {
                'type': 'conversation.item.input_audio_transcription.completed' if final else 'conversation.item.input_audio_transcription.text',
                'item_id': state['item_id'], 'content_index': 0, 'transcript': transcript, 'text': transcript, 'language': detected}})
        if final:
            state.update(audio=[], samples=0, last_partial=0, item_id='item_' + uuid4().hex)
        if op == 'session.finish':
            self.sessions.pop(session_id, None)
        return {}

    async def close(self):
        for session in self.sessions.values():
            if session['recognizer']:
                await session['recognizer'].close()
        self.sessions.clear()
        if self.synthesizer:
            await asyncio.to_thread(self.synthesizer.close)
        if self.runtime:
            await self.runtime.close()


def error_code(error):
    message = str(error).lower()
    if isinstance(error, MemoryError) or any(part in message for part in ('out of memory', 'out_of_memory', 'cuda error', 'device lost')):
        return 'out_of_memory', True
    if isinstance(error, (ValueError, KeyError, TypeError, EOFError, wave.Error, binascii.Error, struct.error)):
        return 'invalid_request', False
    return 'inference_failed', True


async def serve(reader, emit, factory=GatewayWorker):
    worker = factory(emit)
    tasks = set()
    async def dispatch(request):
        request_id = request.get('id')
        try:
            result = await worker.request(request)
            emit({'id': request_id, 'result': result})
        except Exception as error:
            code, fatal = error_code(error)
            emit({'id': request_id, 'error': code, 'fatal': fatal})
            if fatal:
                # The parent terminates the entire failed process, including native children.
                return
    try:
        first = await reader()
        request = json.loads(first)
        if request.get('op') != 'init':
            raise ValueError('Initialization required')
        try:
            result = await worker.initialize(request)
            emit({'id': request.get('id'), 'result': result})
        except Exception as error:
            code, _fatal = error_code(error)
            emit({'id': request.get('id'), 'error': code, 'fatal': True})
            return
        while line := await reader():
            if len(line) > MAX_LINE:
                raise ValueError('Request limit exceeded')
            request = json.loads(line)
            if len(tasks) >= 16:
                emit({'id': request.get('id'), 'error': 'invalid_request'})
                continue
            task = asyncio.create_task(dispatch(request))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        for task in tasks:
            task.cancel()
        await worker.close()


def main():
    protocol = sys.stdout
    sys.stdout = sys.stderr
    def emit(message):
        print(json.dumps(message, ensure_ascii=True), file=protocol, flush=True)
    async def read():
        return await asyncio.to_thread(sys.stdin.readline, MAX_LINE + 1)
    try:
        asyncio.run(serve(read, emit))
    except Exception:
        # Never echo request data, resource paths or native diagnostics to API clients.
        emit({'error': 'inference_failed', 'fatal': True})


if __name__ == '__main__':
    main()
