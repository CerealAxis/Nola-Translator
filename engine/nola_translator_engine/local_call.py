"""One-shot inference worker using the same installed models and compute policy as captions.

The dedicated process owns its models and is killed on cancellation. It never replaces the
caption process's loaded weights or capture session. stdin/stdout carry one private JSON RPC.
"""
from __future__ import annotations

import asyncio
import base64
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np


def torch_device_for_tts(compute, devices) -> str:
    requested = compute.recognitionDevice
    if requested == 'auto':
        selected = max((item for item in devices if item.torchDevice and item.recognition), key=lambda item: item.score, default=None)
        return selected.torchDevice if selected else 'cpu'
    selected = next((item for item in devices if item.id == requested and item.torchDevice and item.recognition), None)
    if selected:
        return selected.torchDevice
    if compute.allowCpuFallback:
        return 'cpu'
    raise ValueError(f'Requested TTS device is unavailable: {requested}')


def retry_tts_on_cpu(request):
    cpu_request = dict(request)
    config = dict(request['config'])
    compute = dict(config.get('compute') or {})
    compute['recognitionDevice'] = 'cpu'
    config['compute'] = compute
    cpu_request['config'] = config

    import_paths = list(dict.fromkeys(str(Path(path).resolve()) for path in sys.path if path))
    native_paths = [str(Path(sys.executable).resolve().parent)]
    for path in import_paths:
        root = Path(path)
        if (root / 'torch' / '__init__.py').is_file():
            native_paths.extend((path, str(root / 'Library' / 'bin'), str(root / 'bin')))
        if (root / 'crispasr' / '__init__.py').is_file():
            native_paths.extend((path, str(root / 'crispasr' / 'vulkan')))
    bootstrap = (
        'import os,sys,runpy; '
        f'sys.path[:0]={json.dumps(import_paths)}; '
        f'_nola_dll_handles=[os.add_dll_directory(p) for p in {json.dumps(list(dict.fromkeys(native_paths)))} if os.path.isdir(p)]; '
        'runpy.run_module("nola_translator_engine.local_call", run_name="__main__")'
    )
    env = {key: os.environ[key] for key in (
        'SystemRoot', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'TMPDIR',
        'NOLA_TRANSLATOR_MODEL_DIR', 'NOLA_TRANSLATOR_LLAMA_DIR',
    ) if key in os.environ}
    env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', PYTHONIOENCODING='utf-8')
    result = subprocess.run(
        [sys.executable, '-I', '-X', 'utf8', '-c', bootstrap],
        input=json.dumps(cpu_request), capture_output=True, text=True, encoding='utf-8', errors='replace',
        cwd=str(Path(sys.executable).resolve().parent), env=env, timeout=10 * 60,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
    )
    if result.returncode != 0:
        raise RuntimeError('CPU TTS retry worker failed')
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError('CPU TTS retry worker returned an invalid response') from error
    if response.get('error'):
        raise RuntimeError(response['error'])
    return response


def decode_audio(data: str) -> np.ndarray:
    raw = base64.b64decode(data.split(',', 1)[-1], validate=True)
    with wave.open(io.BytesIO(raw), 'rb') as source:
        if source.getnchannels() != 1 or source.getsampwidth() != 2 or source.getframerate() != 16000:
            raise ValueError('Audio must be mono 16 kHz PCM16 WAV')
        if source.getnframes() > 16000 * 300:
            raise ValueError('Audio exceeds five minutes')
        return np.frombuffer(source.readframes(source.getnframes()), dtype='<i2').astype(np.float32) / 32768


def encode_audio(audio, rate: int) -> str:
    values = np.asarray(audio, dtype=np.float32).squeeze()
    if values.ndim != 1 or not values.size or not np.isfinite(values).all():
        raise ValueError('Synthesizer returned invalid audio')
    if not isinstance(rate, (int, np.integer)) or rate < 8000 or rate > 192000:
        raise ValueError('Synthesizer returned an invalid sample rate')
    pcm = np.rint(np.clip(values, -1, 32767 / 32768) * 32768).astype('<i2').tobytes()
    output = io.BytesIO()
    with wave.open(output, 'wb') as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(rate)
        target.writeframes(pcm)
    return 'data:audio/wav;base64,' + base64.b64encode(output.getvalue()).decode('ascii')


def synthesize(resources, request, compute):
    from .recognition.crisp_asr import CrispAsrRuntime, prepare_crisp_synthesis
    model_id = request['resourceId']
    root = resources.model_path(model_id)
    adapter = resources.adapter_for(model_id)
    if adapter == 'crisp-tts' or '-crisp-' in model_id:
        def run_crisp(use_vulkan):
            runtime = CrispAsrRuntime(resources.recognition_weight_path(model_id), threads=compute.cpuThreads or 4,
                use_vulkan=use_vulkan, allow_cpu_fallback=compute.allowCpuFallback)
            try:
                runtime.load()
                session = runtime._session
                prepare_crisp_synthesis(session, root)
                voices = list(session.speakers() or [])
                if request.get('inspect'):
                    return {'text': '', 'voices': voices}
                voice = request.get('voice')
                if voice:
                    if voice not in voices:
                        raise ValueError('Selected voice is not provided by this model')
                    session.set_speaker_name(voice)
                sample_rate = session.output_sample_rate()
                if sample_rate <= 0:
                    raise ValueError('Selected CrispASR model does not provide speech synthesis')
                audio = session.synthesize(request['text'])
                return {'text': request['text'], 'audio': encode_audio(audio, sample_rate), 'voices': voices}
            finally:
                runtime.unload()

        use_vulkan = compute.recognitionDevice != 'cpu'
        retry_on_cpu = False
        try:
            return run_crisp(use_vulkan)
        except RuntimeError:
            if not use_vulkan or not compute.allowCpuFallback:
                raise
            retry_on_cpu = True
        if retry_on_cpu:
            # A fresh process is needed because CrispASR retains native backend state after unload.
            return retry_tts_on_cpu(request)
    if adapter == 'llama.cpp' or model_id.startswith('tts-qwen3-tts-llama-'):
        raise ValueError('Qwen3-TTS GGUF models using llama.cpp are not supported for speech synthesis yet; select a CrispASR TTS model')
    config = json.loads((root / 'config.json').read_text(encoding='utf8'))
    if config.get('model_type') == 'qwen3_tts':
        try:
            from qwen_tts import Qwen3TTSModel
        except ImportError as error:
            raise ValueError('Qwen3-TTS requires the qwen-tts Python runtime; install the TTS runtime first') from error
        from .compute import probe_devices
        devices, _, _ = probe_devices(None)
        device = torch_device_for_tts(compute, devices)
        model = Qwen3TTSModel.from_pretrained(str(root), device_map=device, local_files_only=True)
        voices = model.get_supported_speakers() or []
        if request.get('inspect'):
            return {'text': '', 'voices': voices}
        if config.get('tts_model_type') == 'custom_voice':
            speaker = request.get('voice') or (voices[0] if voices else None)
            if not speaker:
                raise ValueError('This Qwen3-TTS model does not expose a selectable speaker')
            wavs, rate = model.generate_custom_voice(text=request['text'], speaker=speaker, language='Auto')
        elif config.get('tts_model_type') == 'voice_design':
            wavs, rate = model.generate_voice_design(text=request['text'], language='Auto', instruct='A clear, neutral speaking voice.')
        else:
            raise ValueError('This Base model needs a reference voice. Select a CustomVoice or VoiceDesign model.')
        return {'text': request['text'], 'audio': encode_audio(wavs[0], rate), 'voices': voices}
    from transformers import AutoConfig, AutoModelForTextToWaveform, AutoModelForTextToSpectrogram, pipeline
    from .translation.transformers_causal import load_verified_model
    config = AutoConfig.from_pretrained(str(root), local_files_only=True, trust_remote_code=False)
    loader = AutoModelForTextToWaveform if type(config) in AutoModelForTextToWaveform._model_mapping else AutoModelForTextToSpectrogram
    model = load_verified_model(loader, root)
    if request.get('inspect'):
        return {'text': '', 'voices': []}
    from .compute import probe_devices
    devices, _, _ = probe_devices(None)
    result = pipeline('text-to-audio', model=model, device=torch_device_for_tts(compute, devices), trust_remote_code=False)(request['text'])
    return {'text': request['text'], 'audio': encode_audio(result['audio'], result['sampling_rate']), 'voices': []}


async def translate_image(runtime, request):
    from .translation.index_translate import prompt_header, IndexTranslateTransformersProvider, IndexTranslatePublicProvider
    from .translation.network import _post_json
    image = request['image']
    prompt = prompt_header(request['source'], request['target']) + '\nTranslate all text in this image. ' + request.get('text', '')
    content = [{'type': 'text', 'text': prompt}, {'type': 'image_url', 'image_url': {'url': image}}]
    provider = runtime.translation_provider
    if isinstance(provider, IndexTranslatePublicProvider):
        payload = {'model': provider.model, 'messages': [{'role': 'user', 'content': content}], 'max_tokens': provider.max_output_tokens,
            'chat_template_kwargs': {'enable_thinking': False}}
        response = await asyncio.to_thread(_post_json, provider.endpoint + '/chat/completions', payload, provider._headers())
        return response['choices'][0]['message']['content']
    if isinstance(provider, IndexTranslateTransformersProvider):
        from PIL import Image
        import torch
        def run():
            inference = provider.runtime
            inference.load()
            bundle = inference._bundle
            photo = Image.open(io.BytesIO(base64.b64decode(image.split(',', 1)[-1]))).convert('RGB')
            messages = [{'role': 'user', 'content': [{'type': 'image', 'image': photo}, {'type': 'text', 'text': prompt}]}]
            inputs = bundle.tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                enable_thinking=False, return_tensors='pt', return_dict=True).to(inference.device)
            input_count = inputs['input_ids'].shape[1]
            context_limit = min(inference.context_size,
                getattr(bundle.model.config, 'max_position_embeddings', inference.context_size))
            output_tokens = min(4096, context_limit - input_count)
            if output_tokens < 32:
                raise ValueError('Image and prompt exceed the selected translation model context')
            with torch.inference_mode():
                output = bundle.model.generate(**inputs, max_new_tokens=output_tokens, do_sample=False)
            if output.shape[1] - input_count >= output_tokens:
                raise ValueError('Image translation reached the selected model output limit')
            return bundle.tokenizer.batch_decode(output[:, input_count:], skip_special_tokens=True)[0]
        return await asyncio.to_thread(run)
    if not request.get('resourceId'):
        raise ValueError('The selected translation provider does not support image translation')
    projectors = list(runtime.resources.model_path(request['resourceId']).rglob('mmproj*.gguf'))
    if not projectors:
        raise ValueError('Image translation requires the matching vision projector; use the Index-Translate PyTorch model or public API')
    runtime.llama_manager.mmproj_path = projectors[0]
    await runtime.llama_manager.stop()
    await runtime.llama_manager.start()
    return await asyncio.to_thread(runtime.llama_manager.chat_sync, [{'role': 'user', 'content': content}], max_tokens=4096)


async def infer(request):
    from .runtime import EngineRuntime
    from .protocol import PrewarmConfig, PrewarmModelsCommand

    # The caption process owns this shared status file even though models run in a separate process.
    class LocalCallRuntime(EngineRuntime):
        def _write_engine_status(self):
            pass

        def _remove_engine_status(self):
            pass

    runtime = LocalCallRuntime(Path(os.environ['NOLA_TRANSLATOR_MODEL_DIR']), lambda _event: None)
    try:
        config = PrewarmConfig.model_validate(request['config'])
        command = PrewarmModelsCommand(protocolVersion=1, requestId='direct', type='prewarmModels', config=config)
        if request.get('resourceId'):
            record = runtime.resources.record(request['resourceId'])
            expected = {'asr': 'recognitionModel', 'mt': 'translationModel', 'tts': 'ttsModel'}.get(request['kind'])
            if expected is None:
                raise ValueError('Unsupported inference task')
            if not record.installed or record.kind != expected:
                raise ValueError('Selected model is not installed or has the wrong task type')
        if request['kind'] == 'tts':
            return await asyncio.to_thread(synthesize, runtime.resources, request, config.compute)
        await runtime._configure_device_plan(command)
        if request['kind'] == 'mt':
            runtime._configure_translation(command)
            await runtime._ensure_translation_server(command)
            text = await translate_image(runtime, request) if request.get('image') else (
                await runtime.translation_provider.translate(request['text'], request['source'], request['target'])).text
            return {'text': text}
        samples = decode_audio(request['audio'])
        if config.recognitionProvider == 'local':
            await runtime._create_recognizer(command)
            text, _language = await asyncio.to_thread(runtime._recognition_runtime().transcribe, samples,
                language=None if config.sourceLanguage == 'auto' else config.sourceLanguage)
            return {'text': text}
        from .recognition.minimax import MiniMaxRecognizer
        from .recognition.aliyun import AliyunRecognizer
        from .audio.resample import AudioFrame
        recognizer = MiniMaxRecognizer(config) if config.recognitionProvider == 'minimax' else AliyunRecognizer(config)
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
            return {'text': ' '.join(update.source_text for update in sorted(updates.values(), key=lambda item: item.started_at_ms))}
        finally:
            await recognizer.close()
    finally:
        await runtime.close()


def main():
    protocol = sys.stdout
    sys.stdout = sys.stderr
    try:
        request = json.loads(sys.stdin.read(40000000))
        result = asyncio.run(infer(request))
    except Exception as error:
        result = {'error': f'{type(error).__name__}: {error}'[:2000]}
    print(json.dumps(result, ensure_ascii=True), file=protocol, flush=True)


if __name__ == '__main__':
    main()
