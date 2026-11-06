"""Owner-scoped inference worker using the same installed models and compute policy as captions.

The dedicated process reuses loaded models until cancellation, model changes, or owner shutdown.
It never replaces caption weights or capture state. stdin/stdout carry private JSON lines.
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

_TTS_CACHE = {}


def load_qwen3_tts(root: Path, device: str):
    try:
        from qwen_tts import Qwen3TTSModel
    except ImportError as error:
        raise ValueError('Qwen3-TTS requires the qwen-tts Python runtime; install the TTS runtime first') from error
    return Qwen3TTSModel.from_pretrained(str(root), device_map=device, local_files_only=True)


def generate_qwen3_tts(model, mode: str | None, text: str, voice: str | None = None):
    if mode == 'custom_voice':
        voices = model.get_supported_speakers() or []
        speaker = voice or (voices[0] if voices else None)
        if not speaker:
            raise ValueError('This Qwen3-TTS model does not expose a selectable speaker')
        return model.generate_custom_voice(text=text, speaker=speaker, language='Auto')
    if mode == 'voice_design':
        return model.generate_voice_design(text=text, language='Auto', instruct='A clear, neutral speaking voice.')
    raise ValueError('This Base model needs a reference voice. Select a CustomVoice or VoiceDesign model.')


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


def find_vision_projector(model_dir: Path, model_name: str) -> Path | None:
    """Find the matching projector; official Index files put `mmproj` after the model name."""
    family = Path(model_name).name.split('.', 1)[0]
    candidates = [path for path in model_dir.rglob(f'{family}.mmproj*.gguf') if path.is_file()]
    if not candidates:
        candidates = [path for path in model_dir.rglob('*mmproj*.gguf') if path.is_file()]
    return next((path for path in sorted(candidates, key=lambda item: ('q8_0' not in item.name.casefold(), item.name.casefold()))), None)


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


def split_crisp_tts_text(text: str, max_chars: int = 120) -> list[str]:
    """Keep Kokoro chunks below its finite phoneme context while preserving sentence boundaries."""
    remaining = text.strip()
    chunks = []
    punctuation = '.!?。！？;；\n'
    while len(remaining) > max_chars:
        window = remaining[:max_chars]
        boundary = max((window.rfind(mark) for mark in punctuation), default=-1)
        if boundary < max_chars // 2:
            boundary = window.rfind(' ')
            end = boundary if boundary >= max_chars // 2 else max_chars
        else:
            end = boundary + 1
        chunk = remaining[:end].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[end:].strip()
    if remaining:
        chunks.append(remaining)
    return chunks


def synthesize_crisp_text(session, text: str) -> np.ndarray:
    """Generate long Kokoro text in bounded pieces and insert short natural pauses."""
    chunks = split_crisp_tts_text(text)
    if not chunks:
        raise ValueError('Speech synthesis text is empty')
    audio = []
    for chunk in chunks:
        samples = np.asarray(session.synthesize(chunk), dtype=np.float32).squeeze()
        if samples.ndim != 1 or not samples.size:
            raise RuntimeError('CrispASR returned an empty audio chunk')
        audio.append(samples)
    if len(audio) == 1:
        return audio[0]
    silence = np.zeros(2400, dtype=np.float32)
    combined = []
    for index, samples in enumerate(audio):
        if index:
            combined.append(silence)
        combined.append(samples)
    return np.concatenate(combined)


def synthesize(resources, request, compute):
    from .recognition.crisp_asr import CrispAsrRuntime, prepare_crisp_synthesis
    model_id = request['resourceId']
    root = resources.model_path(model_id)
    adapter = resources.adapter_for(model_id)
    cache_key = (model_id, compute.recognitionDevice, compute.cpuThreads, compute.precision, compute.quantization)
    if adapter == 'crisp-tts' or '-crisp-' in model_id:
        def run_crisp(use_vulkan):
            key = (*cache_key, use_vulkan)
            runtime = _TTS_CACHE.get(key)
            if runtime is None:
                runtime = CrispAsrRuntime(resources.recognition_weight_path(model_id), threads=compute.cpuThreads or 4,
                    use_vulkan=use_vulkan, allow_cpu_fallback=compute.allowCpuFallback)
                runtime.load()
                _TTS_CACHE[key] = runtime
            try:
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
                audio = synthesize_crisp_text(session, request['text']) if 'kokoro' in model_id.casefold() else session.synthesize(request['text'])
                return {'text': request['text'], 'audio': encode_audio(audio, sample_rate), 'voices': voices}
            except Exception:
                _TTS_CACHE.pop(key, None)
                runtime.unload()
                raise

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
        from .compute import probe_devices
        devices, _, _ = probe_devices(None)
        device = torch_device_for_tts(compute, devices)
        model = _TTS_CACHE.get(cache_key)
        if model is None:
            model = load_qwen3_tts(root, device)
            _TTS_CACHE[cache_key] = model
        voices = model.get_supported_speakers() or []
        if request.get('inspect'):
            return {'text': '', 'voices': voices}
        wavs, rate = generate_qwen3_tts(model, config.get('tts_model_type'), request['text'], request.get('voice'))
        return {'text': request['text'], 'audio': encode_audio(wavs[0], rate), 'voices': voices}
    from transformers import AutoConfig, AutoModelForTextToWaveform, AutoModelForTextToSpectrogram, pipeline
    from .translation.transformers_causal import load_verified_model
    config = AutoConfig.from_pretrained(str(root), local_files_only=True, trust_remote_code=False)
    loader = AutoModelForTextToWaveform if type(config) in AutoModelForTextToWaveform._model_mapping else AutoModelForTextToSpectrogram
    model = _TTS_CACHE.get(cache_key)
    if model is None:
        model = load_verified_model(loader, root)
        _TTS_CACHE[cache_key] = model
    if request.get('inspect'):
        return {'text': '', 'voices': []}
    from .compute import probe_devices
    devices, _, _ = probe_devices(None)
    pipeline_key = (*cache_key, 'pipeline')
    audio_pipeline = _TTS_CACHE.get(pipeline_key)
    if audio_pipeline is None:
        audio_pipeline = pipeline('text-to-audio', model=model, device=torch_device_for_tts(compute, devices), trust_remote_code=False)
        _TTS_CACHE[pipeline_key] = audio_pipeline
    result = audio_pipeline(request['text'])
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
    model_dir = runtime.resources.model_path(request['resourceId'])
    weight_path = runtime.resources.translation_gguf_path(request['resourceId'])
    projector = find_vision_projector(model_dir, weight_path.name)
    if projector is None:
        raise ValueError('当前本地 Index-Translate 模型缺少视觉投影文件（mmproj）。请在模型管理页补充下载该文件后重试。')
    if runtime.llama_manager.mmproj_path != projector:
        runtime.llama_manager.mmproj_path = projector
        await runtime.llama_manager.stop()
        await runtime.llama_manager.start()
    return await asyncio.to_thread(runtime.llama_manager.chat_sync, [{'role': 'user', 'content': content}], max_tokens=4096)


def create_runtime():
    from .runtime import EngineRuntime

    # The caption process owns this shared status file even though models run in a separate process.
    class LocalCallRuntime(EngineRuntime):
        gateway_device = None

        async def _probe_compute_inventory(self, *, refresh: bool = False):
            devices, notes, version = await super()._probe_compute_inventory(refresh=refresh)
            if self.gateway_device is not None:
                devices = [device for device in devices if device.id in ("cpu", self.gateway_device)]
            return devices, notes, version

        def _write_engine_status(self):
            pass

        def _remove_engine_status(self):
            pass

    return LocalCallRuntime(Path(os.environ['NOLA_TRANSLATOR_MODEL_DIR']), lambda _event: None)


async def _start_qwen_server(runtime, model_id: str, compute) -> None:
    from .compute import choose_devices, model_memory_mb

    key = (model_id, compute.model_dump_json())
    if getattr(runtime, '_local_call_language_model', None) != key:
        weights = runtime.resources.translation_gguf_path(model_id)
        devices, _, _ = await runtime._probe_compute_inventory()
        options = compute.model_copy(update={"recognitionDevice": "cpu"})
        _, device, _ = choose_devices(devices, options, 0, model_memory_mb(weights, "llama.cpp", options), "llama.cpp")
        runtime.llama_manager.switch_gguf(weights)
        runtime.llama_manager.chat_template = None
        runtime.llama_manager.model_alias = model_id
        runtime.llama_manager.configure_compute(device, compute)
        runtime._local_call_language_model = key
    await runtime.llama_manager.start()


async def infer(request, runtime, *, prepare_only=False):
    from .protocol import PrewarmConfig, PrewarmModelsCommand

    if request['kind'] == 'batch':
        return {'results': await infer_batch(request['requests'], runtime)}
    config = PrewarmConfig.model_validate(request['config'])
    if request.get('max_concurrency', 1) > 1:
        runtime.llama_manager.configure_parallel(request['max_concurrency'])
    # A gateway worker may fall back to CPU, but may only allocate on its reserved GPU.
    runtime.gateway_device = request.get('gatewayDevice')
    runtime._local_call_asr_concurrency = request.get('max_concurrency', 1)
    command = PrewarmModelsCommand(protocolVersion=1, requestId='direct', type='prewarmModels', config=config)
    if request['kind'] == 'llm':
        from .models.qwen35_catalog import QWEN35_SPECS
        model_id = request.get('resourceId')
        if model_id not in {spec.model_id for spec in QWEN35_SPECS}:
            raise ValueError('Selected resource is not a supported local language model')
        record = runtime.resources.record(model_id)
        if not record.installed or record.kind != 'translationModel' or config.translationModelId != model_id:
            raise ValueError('Selected language model is not installed')
        await _start_qwen_server(runtime, model_id, config.compute)
        return {'text': '', 'endpoint': runtime.llama_manager.api_base_url,
                'contextWindow': config.compute.contextSize}
    if request.get('resourceId'):
        from .resources import INDEX_TRANSLATE_RESOURCE_IDS
        record = runtime.resources.record(request['resourceId'])
        expected = {'asr': 'recognitionModel', 'mt': 'translationModel', 'tts': 'ttsModel'}.get(request['kind'])
        legacy_text_model = (expected == 'translationModel' and not request.get('image') and
            request['resourceId'] in INDEX_TRANSLATE_RESOURCE_IDS and
            runtime.resources.translation_gguf_path(request['resourceId']).is_file())
        if expected is None:
            raise ValueError('Unsupported inference task')
        if (not record.installed and not legacy_text_model) or record.kind != expected:
            raise ValueError('Selected model is not installed or has the wrong task type')
    if request['kind'] == 'tts':
        if prepare_only:
            return None
        return await asyncio.to_thread(synthesize, runtime.resources, request, config.compute)
    if request['kind'] == 'mt':
        from .models.qwen35_catalog import QWEN35_SPECS

        model_id = config.translationModelId
        if (
            'history' in request and not request.get('image')
            and model_id == request.get('resourceId')
            and any(spec.model_id == model_id for spec in QWEN35_SPECS)
        ):
            from contextlib import aclosing
            from .translation.network import LocalQwenTranslationProvider

            await _start_qwen_server(runtime, model_id, config.compute)
            if prepare_only:
                return None
            async with aclosing(LocalQwenTranslationProvider(
                endpoint=runtime.llama_manager.api_base_url,
                model=model_id,
                context_window=config.compute.contextSize,
                max_output_tokens=512,
                history=request['history'],
            )) as provider:
                translated = await translate_with_glossary(provider, request)
            return {'text': translated.text}
    await runtime._configure_device_plan(command)
    if request['kind'] == 'mt':
        translation_key = (runtime._local_translation_model_id(config), config.compute.model_dump_json())
        if getattr(runtime, '_local_call_translation_key', None) != translation_key:
            runtime._configure_translation(command)
            runtime._local_call_translation_key = translation_key
        await runtime._ensure_translation_server(command)
        if prepare_only:
            return None
        if request.get('image') and request.get('glossary'):
            raise ValueError('glossaryUnsupported')
        text = await translate_image(runtime, request) if request.get('image') else (
            await translate_with_glossary(runtime.translation_provider, request)).text
        return {'text': text}
    samples = decode_audio(request['audio'])
    if config.recognitionProvider == 'local':
        if runtime.active_model_id != request['resourceId'] or runtime._active_recognition_runtime is None:
            await runtime._create_recognizer(command)
        manager = getattr(runtime._recognition_runtime(), 'manager', None)
        if manager is not None:
            manager.configure_parallel(runtime._local_call_asr_concurrency)
            if not manager.ready:
                await manager.start()
        if prepare_only:
            return None
        text, language = await asyncio.to_thread(runtime._recognition_runtime().transcribe, samples,
            language=None if config.sourceLanguage == 'auto' else config.sourceLanguage)
        return {'text': text, 'language': language}
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


async def translate_with_glossary(provider, request):
    from .backend.glossary import GlossaryTerm, active_glossary, glossary_prompt
    from .translation.network import _BudgetedChatProvider

    terms = [GlossaryTerm.model_validate(term) for term in request.get('glossary', [])]
    if terms and not isinstance(provider, _BudgetedChatProvider) and getattr(provider, 'name', '') not in (
        'hymt2', 'index-translate-local', 'index-translate-transformers', 'transformers-causal',
    ):
        raise ValueError('glossaryUnsupported')
    instructions = glossary_prompt(terms)
    if instructions:
        from .translation.network import _estimate_tokens
        manager = getattr(provider, 'manager', None)
        context_size = getattr(provider, 'context_window', None) or getattr(getattr(provider, 'runtime', None), 'context_size', None) or getattr(getattr(manager, '_compute', None), 'contextSize', None)
        if context_size and _estimate_tokens(instructions) > context_size // 5:
            raise ValueError('glossaryBudgetExceeded')
    token = active_glossary.set(instructions)
    try:
        return await provider.translate(request['text'], request['source'], request['target'])
    finally:
        active_glossary.reset(token)


async def infer_batch(requests, runtime):
    if not isinstance(requests, list) or not 1 <= len(requests) <= 5 or not all(isinstance(item, dict) for item in requests):
        raise ValueError('Invalid inference batch')
    first = requests[0]
    if first.get('kind') not in ('asr', 'mt', 'tts'):
        raise ValueError('Unsupported batch operation')
    for request in requests:
        if any(request.get(key) != first.get(key) for key in ('kind', 'config', 'resourceId', 'gatewayDevice', 'source', 'target')):
            raise ValueError('Batch requests must share a model and language pair')
        if request.get('inspect'):
            raise ValueError('Voice inspection cannot be batched')
        if request['kind'] in ('mt', 'tts') and (not isinstance(request.get('text'), str) or not request['text'].strip() or len(request['text']) > 64000):
            raise ValueError('Invalid batch text')
    if first['kind'] == 'tts':
        from .protocol import PrewarmConfig
        config = PrewarmConfig.model_validate(first['config'])
        await infer(first, runtime, prepare_only=True)
        return await asyncio.to_thread(synthesize_batch, runtime.resources, requests, config.compute)
    await infer(first, runtime, prepare_only=True)
    if first['kind'] == 'asr':
        recognizer = runtime._recognition_runtime()
        batch = getattr(recognizer, 'transcribe_batch', None)
        if batch is not None:
            samples = [decode_audio(item['audio']) for item in requests]
            language = first['config'].get('sourceLanguage')
            results = await asyncio.to_thread(batch, samples, language=None if language == 'auto' else language)
            if len(results) != len(requests):
                raise ValueError('ASR batch result count mismatch')
            return [{'text': text, 'language': language} for text, language in results]
    elif not any(item.get('image') or 'history' in item or item.get('glossary') for item in requests):
        batch = getattr(runtime.translation_provider, 'translate_batch', None)
        if batch is not None:
            results = await batch([item['text'] for item in requests], first['source'], first['target'])
            if len(results) != len(requests):
                raise ValueError('Translation batch result count mismatch')
            return [{'text': result.text} for result in results]
    if first['kind'] == 'mt' and 'history' in first:
        return await asyncio.gather(*(infer(item, runtime) for item in requests))
    return [await infer(item, runtime) for item in requests]


def synthesize_batch(resources, requests, compute):
    model_id = requests[0].get('resourceId')
    root = resources.model_path(model_id)
    config_path = root / 'config.json'
    config = json.loads(config_path.read_text(encoding='utf8')) if config_path.is_file() else {}
    if config.get('model_type') != 'qwen3_tts':
        return [synthesize(resources, request, compute) for request in requests]
    voices = synthesize(resources, {**requests[0], 'inspect': True}, compute)['voices']
    model = _TTS_CACHE[(model_id, compute.recognitionDevice, compute.cpuThreads, compute.precision, compute.quantization)]
    speakers = [request.get('voice') or (voices[0] if voices else None) for request in requests]
    wavs, rate = generate_qwen3_tts(model, config.get('tts_model_type'), [request['text'] for request in requests], speakers)
    if len(wavs) != len(requests):
        raise ValueError('TTS batch result count mismatch')
    return [{'text': request['text'], 'audio': encode_audio(audio, rate), 'voices': voices} for request, audio in zip(requests, wavs)]


def main():
    protocol = sys.stdout
    sys.stdout = sys.stderr
    async def serve():
        runtime = create_runtime()
        try:
            for line in sys.stdin:
                if len(line) > 40000000:
                    break
                request = None
                try:
                    request = json.loads(line)
                    result = await infer(request, runtime)
                    result = {'id': request.get('id'), **result}
                except Exception as error:
                    message = str(error)
                    prefix = f'{type(error).__name__}: '
                    while message.startswith(prefix):
                        message = message[len(prefix):]
                    result = {'id': request.get('id') if isinstance(request, dict) else None,
                        'error': f'{prefix}{message}'[:2000]}
                print(json.dumps(result, ensure_ascii=True), file=protocol, flush=True)
        finally:
            await runtime.close()
    asyncio.run(serve())


if __name__ == '__main__':
    main()
