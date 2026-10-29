"""Persistent, private JSONL worker for exactly one local gateway capability.

Only the Electron parent listens on the network. Models hydrate before init succeeds;
each process keeps its own accelerator allocation and never downloads weights.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
from contextlib import asynccontextmanager
from dataclasses import asdict
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
MAX_BATCH_SEGMENT_SAMPLES = 16000 * 5


def split_batch_audio(samples):
    """Use the existing CPU VAD to bound native file-ASR calls without overlapping speech."""
    if samples.size <= MAX_BATCH_SEGMENT_SAMPLES:
        return [samples]
    from .audio.resample import AudioFrame
    from .recognition.volume_gate import SileroVadSegmenter
    segmenter = SileroVadSegmenter(max_segment_ms=MAX_BATCH_SEGMENT_SAMPLES // 16)
    segments = []
    for offset in range(0, samples.size, 320):
        segments.extend(segment.samples for segment in segmenter.accept(
            AudioFrame(samples[offset:offset + 320], offset / 16)))
    segments.extend(segment.samples for segment in segmenter.flush())
    return segments


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
        self.fallback_runtime = None
        self.fallback_config = None
        self.fallback_uses_primary = False
        self._native_requests = set()
        self._realtime_waiters = 0
        self._realtime_idle = asyncio.Event()
        self._realtime_idle.set()

    @asynccontextmanager
    async def _inference_scope(self, remote, request_id=None, *, realtime=False):
        if remote:
            yield
            return
        acquired = False
        if realtime:
            self._realtime_waiters += 1
            self._realtime_idle.clear()
        try:
            while not acquired:
                await self.inference.acquire()
                acquired = True
                if not realtime and self._realtime_waiters:
                    self.inference.release()
                    acquired = False
                    await self._realtime_idle.wait()
            if request_id is not None:
                self._native_requests.add(request_id)
            try:
                yield
            finally:
                self._native_requests.discard(request_id)
        finally:
            if acquired:
                self.inference.release()
            if realtime:
                self._realtime_waiters -= 1
                if not self._realtime_waiters:
                    self._realtime_idle.set()

    def can_cancel(self, request):
        # A queued task is safe to cancel. Once native inference has started, detaching
        # the caller cannot stop its thread or release the model lock it still owns.
        return request.get('op') == 'infer' and request.get('id') not in self._native_requests

    def remote_recognizer(self, config=None):
        config = config or self.config
        if config.recognitionProvider == 'minimax':
            from .recognition.minimax import MiniMaxRecognizer
            return MiniMaxRecognizer(config)
        from .recognition.aliyun import AliyunRecognizer, AliyunInferenceRecognizer, INFERENCE_ASR_MODELS
        if config.recognitionOptions and config.recognitionOptions.model in INFERENCE_ASR_MODELS:
            return AliyunInferenceRecognizer(config)
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
        if self.kind == 'mt':
            await self._initialize_translation(self.runtime, config, request.get('resourceId'))
            self.fallback_uses_primary = request.get('fallbackUsesPrimary') is True
            if request.get('fallbackConfig') and not self.fallback_uses_primary:
                self.fallback_config = PrewarmConfig.model_validate(request['fallbackConfig'])
                fields = {'compute', 'translationProvider', 'translationModelId', 'translationOptions'}
                self.fallback_uses_primary = (self.fallback_config.model_dump(include=fields)
                                             == config.model_dump(include=fields))
                if not self.fallback_uses_primary:
                    self.fallback_runtime = IsolatedRuntime(Path(os.environ['NOLA_TRANSLATOR_MODEL_DIR']), lambda _event: None)
                    await self._initialize_translation(self.fallback_runtime, self.fallback_config,
                                                       request.get('fallbackResourceId'))
            ready = {'providerName': getattr(self.runtime.translation_provider, 'name', 'gateway-mt'),
                     'fallbackReady': self.fallback_runtime is not None or self.fallback_uses_primary}
            if ready['fallbackReady']:
                fallback = self.runtime if self.fallback_uses_primary else self.fallback_runtime
                ready['fallbackProviderName'] = getattr(fallback.translation_provider, 'name', 'gateway-fallback')
            return ready
        if self.kind == 'asr' and config.recognitionProvider != 'local':
            # Validate configuration without opening or billing a cloud session at gateway startup.
            recognizer = self.remote_recognizer()
            try:
                recognizer.validate_credentials()
            finally:
                await recognizer.close()
            from .recognition.aliyun import MODELS, NATIVE_TRANSLATION_MODELS
            return {'providerName': config.recognitionProvider,
                    'nativeTranslation': config.recognitionProvider == 'aliyun'
                        and (getattr(config.recognitionOptions, 'model', None) or MODELS[0]) in NATIVE_TRANSLATION_MODELS}
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
        recognizer = await self.runtime._create_recognizer(command)
        try:
            await asyncio.to_thread(recognizer.prepare)
        finally:
            await recognizer.close()
        return {'providerName': 'local', 'nativeTranslation': False}

    async def _initialize_translation(self, runtime, config, resource_id):
        from .protocol import PrewarmModelsCommand
        if config.translationProvider == 'recognition':
            raise ValueError('Native speech translation requires audio, not a text request')
        command = PrewarmModelsCommand(protocolVersion=1, requestId='gateway', type='prewarmModels', config=config)
        if config.translationProvider == 'local':
            if not resource_id:
                raise ValueError('Select an installed translation model')
            record = runtime.resources.record(resource_id)
            if not record.installed or record.kind != 'translationModel':
                raise ValueError('Selected model is unavailable or has the wrong capability')
            await runtime._configure_device_plan(command)
        runtime._configure_translation(command)
        if config.translationProvider == 'local':
            await runtime._ensure_translation_server(command)

    async def transcribe_file(self, samples, language=None, request_id=None):
        if self.config is not None and self.config.recognitionProvider != 'local':
            return await self.transcribe(samples, language=language, request_id=request_id)
        segments = await asyncio.to_thread(split_batch_audio, samples)
        transcript, detected = [], None
        for segment in segments:
            # Give audio/RPC input and cancellation a turn between uninterruptible calls.
            await asyncio.sleep(0)
            text, current_language = await self.transcribe(segment, language=language, request_id=request_id)
            if text:
                transcript.append(text)
                detected = detected or current_language
        return ' '.join(transcript), detected or language

    async def transcribe(self, samples, language=None, prefix=None, request_id=None, *, realtime=False):
        remote = self.config is not None and self.config.recognitionProvider != 'local'
        async with self._inference_scope(remote, request_id, realtime=realtime):
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
            inference = asyncio.create_task(asyncio.to_thread(
                self.runtime._recognition_runtime().transcribe, samples, language=language, prefix=prefix))
            try:
                return await asyncio.shield(inference)
            except asyncio.CancelledError:
                # Cancelling the sentence scheduler cannot stop native inference. Keep
                # its shared model lock until the thread has actually left the backend.
                while not inference.done():
                    try:
                        await asyncio.shield(inference)
                    except asyncio.CancelledError:
                        continue
                    except Exception:
                        break
                if not inference.cancelled():
                    inference.exception()
                raise

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
            text, language = await self.transcribe_file(samples,
                None if request.get('source', 'auto') == 'auto' else request['source'], request_id=request.get('id'))
            return {'text': text, 'language': language}
        text = request.get('text')
        if not isinstance(text, str) or not (text.strip() or request.get('image')) or len(text) > 64000:
            raise ValueError('Invalid text')
        use_fallback = request.get('fallback') and not self.fallback_uses_primary
        runtime = self.fallback_runtime if use_fallback else self.runtime
        config = self.fallback_config if use_fallback else self.config
        remote_translation = self.kind == 'mt' and config is not None and config.translationProvider != 'local'
        async with self._inference_scope(remote_translation, request.get('id')):
            if self.kind == 'tts':
                result = await asyncio.to_thread(self.synthesizer.synthesize, text, request.get('voice', ''))
                return await asyncio.to_thread(speech_format, result, request.get('response_format', 'mp3'))
            if runtime is None:
                raise ValueError('The fallback translator is not enabled')
            if config is not None and config.translationProvider == 'local':
                from .model_capabilities import supports_translation
                capability = runtime.resources.configuration(config.translationModelId)
                if not supports_translation(capability, request.get('source', 'auto'), request['target']):
                    raise ValueError('The active translation model does not support this language pair')
            if request.get('image'):
                from .local_call import translate_image
                image_request = {**request, 'source': request.get('source', 'auto'),
                                 'resourceId': getattr(config, 'translationModelId', None)}
                return {'text': await translate_image(runtime, image_request)}
            provider = runtime.translation_provider
            stream = getattr(provider, 'translate_stream', None)
            if request.get('stream') and stream is not None:
                def progress(value):
                    self.emit({'id': request.get('id'), 'event': {'type': 'translation.delta', 'text': value}})
                translated = await stream(text, request.get('source', 'auto'), request['target'], progress)
            else:
                translated = await provider.translate(text, request.get('source', 'auto'), request['target'])
            result = {'text': translated.text}
            if hasattr(translated, 'path'):
                result['path'] = list(translated.path)
            return result

    async def realtime(self, request):
        from .audio.resample import AudioFrame
        from .recognition.streaming import StreamingRecognizer
        from .recognition.volume_gate import SileroVadSegmenter

        session_id = request['session']
        op = request['op']
        if op == 'session.reset':
            state = self.sessions.get(session_id)
            if state is None:
                raise ValueError('Unknown realtime session')
            opening = state['open_request']
            await self.realtime({'op': 'session.close', 'session': session_id})
            return await self.realtime(opening)
        if op == 'session.open':
            if session_id in self.sessions or len(self.sessions) >= 8:
                raise ValueError('Session limit reached')
            language = request.get('language')
            generation = object()
            if self.config is not None and self.config.recognitionProvider == 'local':
                if request.get('nativeTranslation'):
                    raise ValueError('The selected ASR model does not provide native translation')
                selection = self.config.model_copy(update={'sourceLanguage': language or 'auto',
                    'targetLanguages': [], 'fallbackTranslationProvider': None})
                self.runtime._validate_model_selection(selection)
                language = selection.sourceLanguage
            if self.config is not None and self.config.recognitionProvider != 'local':
                async def update(item):
                    if self.sessions.get(session_id, {}).get('generation') is generation:
                        self.emit({'session': session_id, 'event': {
                            'type': 'conversation.item.input_audio_transcription.completed' if item.is_final else 'conversation.item.input_audio_transcription.text',
                            'item_id': item.segment_id, 'content_index': 0, 'language': item.language,
                            'revision': item.revision,
                            'transcript': item.source_text, 'text': item.source_text,
                            'audio_start_ms': item.started_at_ms, 'audio_end_ms': item.ended_at_ms,
                            'native_translation': asdict(item.native_translation) if item.native_translation else None}})
                config = self.config.model_copy(update={'sourceLanguage': request.get('language') or 'auto',
                    'targetLanguages': request.get('targetLanguages', []),
                    'translationProvider': 'recognition' if request.get('nativeTranslation') else 'local'})
                recognizer = self.remote_recognizer(config)
                recognizer.on_update = update
                def on_error(error):
                    if self.sessions.get(session_id, {}).get('generation') is generation:
                        self.emit({'session': session_id, 'event': {'type': 'error', 'code': getattr(error, 'reason', 'networkUnavailable')}})
                recognizer.on_error = on_error
                self.sessions[session_id] = {'remote': True, 'recognizer': recognizer, 'samples': 0,
                    'open_request': dict(request), 'generation': generation}
                try:
                    await recognizer.start()
                except Exception:
                    self.sessions.pop(session_id, None)
                    await recognizer.close()
                    raise
                return {}
            if request.get('manual'):
                self.sessions[session_id] = {'recognizer': None, 'samples': 0, 'audio': [], 'last_partial': 0,
                    'language': language, 'item_id': 'item_' + uuid4().hex,
                    'open_request': dict(request), 'generation': generation}
                return {}
            async def update(item):
                if self.sessions.get(session_id, {}).get('generation') is not generation:
                    return
                event = {'type': 'conversation.item.input_audio_transcription.completed' if item.is_final else 'conversation.item.input_audio_transcription.text',
                    'item_id': item.segment_id, 'content_index': 0, 'language': item.language,
                    'revision': item.revision,
                    'transcript': item.source_text, 'text': item.source_text, 'audio_start_ms': item.started_at_ms,
                    'audio_end_ms': item.ended_at_ms}
                self.emit({'session': session_id, 'event': event})
            async def transcribe(job):
                state = self.sessions.get(session_id)
                if state is not None:
                    state['inflight_samples'] = job.samples.size
                try:
                    return await self.transcribe(job.samples, job.language, job.prefix, realtime=True)
                finally:
                    if state is not None:
                        state['inflight_samples'] = 0
            segmenter = SileroVadSegmenter(silence_end_ms=int(request.get('silenceMs', 800)),
                max_segment_ms=int(request.get('maxSegmentMs', self.config.max_segment_ms if self.config else 10000)))
            recognizer = StreamingRecognizer(self.runtime._recognition_runtime(), segmenter=segmenter,
                source_language=language, block_ms=1000, first_block_ms=500,
                run_transcribe=transcribe, on_update=update)
            await asyncio.to_thread(recognizer.prepare)
            self.sessions[session_id] = {'recognizer': recognizer, 'samples': 0, 'pending': np.empty(0, dtype=np.float32),
                'active_start': None, 'inflight_samples': 0, 'open_request': dict(request), 'generation': generation}
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
                start = request.get('startedAtMs', state['samples'] / 16)
                for offset in range(0, samples.size, 320):
                    frame = samples[offset:offset + 320]
                    for update in await recognizer.accept(AudioFrame(frame, start + offset / 16)):
                        await recognizer.on_update(update)
                    state['samples'] += frame.size
                return {}
            if op in ('session.commit', 'session.finish'):
                for update in await recognizer.flush(request.get('endedAtMs', state['samples'] / 16)):
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
            start = state.get('pending_started_ms', request.get('startedAtMs', state['samples'] / 16))
            count = samples.size // 320 * 320
            for offset in range(0, count, 320):
                await recognizer.accept(AudioFrame(samples[offset:offset + 320], start + offset / 16))
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
            if state['pending'].size:
                state['pending_started_ms'] = start + count / 16
            else:
                state.pop('pending_started_ms', None)
            return {}
        if op in ('session.commit', 'session.finish'):
            pending = state['pending']
            if pending.size:
                await recognizer.accept(AudioFrame(pending, state.get('pending_started_ms', state['samples'] / 16)))
                state['samples'] += pending.size
                state['pending'] = np.empty(0, dtype=np.float32)
            await recognizer.flush(request.get('endedAtMs', state['samples'] / 16))
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
            transcript, detected = await self.transcribe(np.concatenate(state['audio']), language, realtime=True)
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
        if self.fallback_runtime:
            await self.fallback_runtime.close()


def error_code(error):
    import httpx
    from .recognition.aliyun import CloudRecognitionError
    message = str(error).lower()
    if isinstance(error, MemoryError) or any(part in message for part in ('out of memory', 'out_of_memory', 'cuda error', 'device lost')):
        return 'out_of_memory', True
    if isinstance(error, (ValueError, KeyError, TypeError, EOFError, wave.Error, binascii.Error, struct.error)):
        return 'invalid_request', False
    if isinstance(error, CloudRecognitionError):
        reason = error.reason
        code = {'recognitionUnauthorized': 'authentication_failed',
                'recognitionRateLimited': 'rate_limited',
                'recognitionTimeout': 'request_timeout'}.get(reason, 'network_unavailable')
        return code, False
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        code = ('authentication_failed' if status in (401, 403) else 'rate_limited' if status == 429
                else 'request_timeout' if status in (408, 504) else 'inference_failed')
        return code, False
    if isinstance(error, (httpx.TimeoutException, TimeoutError)):
        return 'request_timeout', False
    if isinstance(error, httpx.RequestError):
        return 'network_unavailable', False
    return 'inference_failed', True


async def serve(reader, emit, factory=GatewayWorker):
    worker = factory(emit)
    tasks = {}
    async def dispatch(request):
        request_id = request.get('id')
        try:
            result = await worker.request(request)
            emit({'id': request_id, 'result': result})
        except Exception as error:
            code, fatal = error_code(error)
            config = getattr(worker, 'config', None)
            if request.get('fallback') and not getattr(worker, 'fallback_uses_primary', False):
                config = getattr(worker, 'fallback_config', None)
            if (code == 'inference_failed' and getattr(worker, 'kind', None) == 'mt'
                    and config is not None and config.translationProvider != 'local'):
                fatal = False
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
            if request.get('op') == 'cancel':
                target = tasks.get(request.get('requestId'))
                if target is not None and worker.can_cancel(target[1]):
                    target[0].cancel()
                continue
            request_id = request.get('id')
            if len(tasks) >= 16 or request_id in tasks:
                emit({'id': request.get('id'), 'error': 'invalid_request'})
                continue
            task = asyncio.create_task(dispatch(request))
            tasks[request_id] = (task, request)
            def retire(done, key=request_id):
                if tasks.get(key, (None,))[0] is done:
                    tasks.pop(key, None)
            task.add_done_callback(retire)
        if tasks:
            await asyncio.gather(*(task for task, _request in tasks.values()), return_exceptions=True)
    finally:
        for task, _request in tasks.values():
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
