"""Task selection must not impose the recommendation catalog's backend defaults."""
import io
import wave
import base64
from unittest.mock import AsyncMock

import numpy as np
import pytest

from nola_translator_engine.compute import ComputeDevice, ComputeOptions, choose_devices
from nola_translator_engine.models.registry import CustomFile
from nola_translator_engine.protocol import ModelConfiguration, PrewarmModelsCommand, ModelSelection
from nola_translator_engine.recognition.llama_asr import LlamaAsrRuntime
from nola_translator_engine.runtime import EngineRuntime
from nola_translator_engine.translation.llama_server import LlamaServerManager
from nola_translator_engine.translation.transformers_causal import CausalTranslationProvider
from nola_translator_engine.hub import HubRepoInfo, HubFile, detect_runtime
from nola_translator_engine.runtime import _custom_files


def register(runtime, adapter, slot, files):
    entry = runtime.resources.register_hub_model('test/' + adapter, 'rev', adapter, slot, adapter,
        tuple(CustomFile(name, 1, '0' * 64) for name in files), ())
    engine = 'llama' if adapter in ('llama.cpp', 'llama-asr') else 'pytorch'
    runtime.resources.configure(entry.resource_id, ModelConfiguration(slot=slot, engine=engine,
        languages=['en'] if slot == 'recognition' else [], supportsAutoDetection=slot == 'recognition',
        sourceLanguages=['en'] if slot == 'translation' else [], targetLanguages=['zh'] if slot == 'translation' else []))
    return entry.resource_id


def test_llama_audio_device_does_not_require_torch():
    cpu = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu', recognition=True, translation=True)
    gpu = ComputeDevice('vulkan', 'GPU', 'vulkan', llamaDevice='Vulkan0', translation=True)
    a, b, _ = choose_devices([cpu, gpu], ComputeOptions(recognitionEngine='llama'), 256, 256, 'llama.cpp', 'llama-asr')
    assert a is gpu and b is gpu


def test_hub_audio_download_selects_one_complete_pair():
    names = [('Qwen3-ASR-Q8_0.gguf', 100), ('mmproj-Qwen3-ASR-Q8_0.gguf', 20),
        ('Qwen3-ASR-bf16.gguf', 200), ('mmproj-Qwen3-ASR-bf16.gguf', 40)]
    info = HubRepoInfo(repo='owner/audio', gguf_architecture='qwen3vl',
        files=tuple(HubFile(name, size, '0' * 64) for name, size in names))
    assert detect_runtime(info).adapter_id == 'llama-asr'
    assert {item.path for item in _custom_files(info)} == {names[0][0], names[1][0]}


def test_instruction_text_gguf_can_be_configured_for_translation():
    info = HubRepoInfo(repo='owner/instruct', gguf_architecture='llama', pipeline_tag='text-generation',
        files=(HubFile('model.gguf', 10, '0' * 64),))
    verdict = detect_runtime(info)
    assert verdict.compatible and verdict.slot == 'translation'


@pytest.mark.asyncio
async def test_asr_and_translation_have_independent_llama_servers(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    asr = register(runtime, 'llama-asr', 'recognition', ['model.gguf', 'mmproj-model.gguf'])
    translator = register(runtime, 'llama.cpp', 'translation', ['translation.gguf'])
    config = ModelSelection(recognitionModelId=asr, sourceLanguage='en', targetLanguages=['zh'],
        translationModelId=translator, compute={'recognitionEngine': 'llama', 'translationEngine': 'llama'})
    runtime._recognition_device = runtime._translation_device = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu')
    runtime._device_plan = {'recognitionEstimateMb': 0, 'translationEstimateMb': 0}
    monkeypatch.setattr(LlamaServerManager, 'start', AsyncMock(return_value='cpu'))
    recognizer = await runtime._create_recognizer(PrewarmModelsCommand(protocolVersion=1, type='prewarmModels', requestId='test', config={**config.model_dump(), 'recognitionMode': 'realtime'}))
    provider = runtime._local_translation_provider(config)
    assert isinstance(recognizer.runtime, LlamaAsrRuntime)
    assert recognizer.runtime.manager is not provider.manager
    assert recognizer.runtime.manager.mmproj_path.name == 'mmproj-model.gguf'
    assert provider.manager.mmproj_path is None
    await recognizer.close()
    await runtime.close()


def test_causal_translation_uses_torch_and_rejects_wrong_engine_before_loading(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    translator = register(runtime, 'transformers-causal', 'translation', ['model.safetensors'])
    monkeypatch.setattr(runtime.resources, 'is_installed', lambda _: True)
    config = ModelSelection(recognitionModelId='sensevoice-small', sourceLanguage='en', targetLanguages=['zh'],
        translationModelId=translator, compute={'translationEngine': 'pytorch'})
    assert runtime._validate_model_selection(config)[1] == []
    assert isinstance(runtime._local_translation_provider(config), CausalTranslationProvider)
    with pytest.raises(Exception, match='invalidConfiguration'):
        runtime._validate_model_selection(config.model_copy(update={'compute': ComputeOptions(translationEngine='llama')}))


def test_audio_request_is_memory_wav_and_qwen_output_is_parsed():
    class Manager:
        ready = True
        device = 'cpu'
        def chat_sync(self, messages, **options):
            payload = messages[1]['content'][0]['input_audio']
            with wave.open(io.BytesIO(base64.b64decode(payload['data']))) as audio:
                assert (audio.getframerate(), audio.getnchannels(), audio.getsampwidth()) == (16000, 1, 2)
                assert audio.getnframes() == 1600
            return 'language English<asr_text>Hello world.<|im_end|>'
    runtime = LlamaAsrRuntime(Manager())
    assert runtime.transcribe(np.zeros(1600, dtype=np.float32)) == ('Hello world.', 'en')
    assert runtime.transcribe(np.zeros(1600, dtype=np.float32), language='en') == ('Hello world.', 'en')
