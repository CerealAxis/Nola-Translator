"""Selected-model residency, concurrent loading and readiness without trial inference."""

import asyncio
import threading
from dataclasses import replace

import pytest

from nola_translator_engine import runtime as runtime_module
from nola_translator_engine.compute import ComputeDevice
from nola_translator_engine.protocol import (
    HelloCommand, PrewarmConfig, PrewarmModelsCommand, ReleaseModelsCommand, SessionConfig,
    StartSessionCommand, StopSessionCommand,
)
from nola_translator_engine.recognition.sensevoice_runtime import SenseVoiceRuntime
from nola_translator_engine.runtime import EngineRuntime
from nola_translator_engine.translation.llama_server import LlamaServerError, LlamaServerManager


class LoadedSenseVoice(SenseVoiceRuntime):
    def __init__(self, path):
        super().__init__(path, device='cpu')
        self.loads = 0
        self.unloads = 0
        self.on_load = lambda: None

    def load(self):
        if not self._loaded:
            self.on_load()
            self.loads += 1
            self._loaded = True
            self._device = self._requested_device

    def unload(self):
        self.unloads += 1
        self._loaded = False

    def warmup(self):
        pytest.fail('Model preparation must not run trial inference')


class LoadedLlama(LlamaServerManager):
    def __init__(self):
        super().__init__()
        self.loads = 0
        self.failure = None
        self.on_start = None

    async def start(self):
        if not self._ready:
            if self.on_start:
                await self.on_start()
            if self.failure:
                raise self.failure
            self.loads += 1
            self._ready = True
            self._device = 'cpu'
        return self._device


@pytest.fixture
def models(tmp_path, monkeypatch):
    events = []
    runtime = EngineRuntime(tmp_path / 'models', events.append)
    recognition = LoadedSenseVoice(tmp_path / 'sensevoice')
    translation = LoadedLlama()
    cpu = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu', recognition=True, translation=True)
    probes = []

    def inventory(_directory):
        probes.append(True)
        return [cpu], [], 'test'

    monkeypatch.setattr(runtime_module, 'probe_devices', inventory)
    monkeypatch.setattr(runtime_module, 'get_sensevoice_runtime', lambda _path, **_options: recognition)
    monkeypatch.setattr(runtime.resources, 'is_installed', lambda _id: True)
    runtime.llama_manager = translation
    config = PrewarmConfig(recognitionModelId='sensevoice-small', sourceLanguage='auto',
        targetLanguages=['zh'], translationModelId='hy-mt2-1.8b-q4-k-m')
    command = PrewarmModelsCommand(protocolVersion=1, type='prewarmModels', requestId='load', config=config)
    return runtime, recognition, translation, events, probes, command


@pytest.mark.asyncio
async def test_service_loads_both_models_concurrently_and_waits_for_translation(models):
    runtime, recognition, translation, events, _, command = models
    recognition_started = threading.Event()
    translation_started = threading.Event()
    release = asyncio.Event()

    def load():
        recognition_started.set()
        assert translation_started.wait(1), 'Translation loading was serialized behind ASR'

    async def start():
        translation_started.set()
        assert await asyncio.to_thread(recognition_started.wait, 1)
        await release.wait()

    recognition.on_load = load
    translation.on_start = start
    work = asyncio.create_task(runtime.handle(command))
    try:
        assert await asyncio.to_thread(translation_started.wait, 1)
        assert events[0].state == 'loading'
        assert not work.done()
    finally:
        release.set()
    result = await work
    assert result[0].state == 'ready'
    assert recognition.loaded and translation.ready
    assert result[0].translationModelId == command.config.translationModelId
    await runtime.close()


@pytest.mark.asyncio
async def test_stop_reuses_models_and_explicit_service_close_releases_them(models):
    runtime, recognition, translation, _, probes, command = models
    await runtime.handle(command)
    config = SessionConfig(**command.config.model_dump(), audioSource={'kind': 'browserTab', 'streamId': 'tab'},
        browserTimeline={'epoch': 0, 'videoTimeMs': 0, 'playbackRate': 1}, recognitionMode='realtime')
    for index in range(2):
        start = StartSessionCommand(protocolVersion=1, type='startSession', requestId=f'start-{index}', config=config)
        result = await runtime.handle(start)
        assert result[0].type == 'sessionStarted'
        await runtime.handle(StopSessionCommand(protocolVersion=1, type='stopSession', requestId='stop', sessionId=result[0].sessionId))
        await runtime._model_cleanup_task
        assert recognition.loaded and translation.ready
    assert recognition.loads == translation.loads == 1
    assert len(probes) == 1
    result = await runtime.handle(ReleaseModelsCommand(protocolVersion=1, type='releaseModels', requestId='release'))
    assert result[0].type == 'modelsReleased' and not result[0].deferred
    assert not recognition.loaded and not translation.ready
    await runtime.close()


@pytest.mark.asyncio
async def test_translation_failure_waits_for_native_loader_before_cleanup(models):
    runtime, recognition, translation, events, _, command = models
    recognition_started = threading.Event()
    release = threading.Event()

    def load():
        recognition_started.set()
        assert release.wait(2)

    async def fail():
        assert await asyncio.to_thread(recognition_started.wait, 1)
        raise LlamaServerError('translation load failed')

    recognition.on_load = load
    translation.on_start = fail
    work = asyncio.create_task(runtime.handle(command))
    try:
        assert await asyncio.to_thread(recognition_started.wait, 1)
        await asyncio.sleep(0)
        assert not work.done()
    finally:
        release.set()
    result = await work
    assert result[0].code == 'modelUnavailable'
    assert not recognition.loaded and not translation.ready
    assert not [event for event in events if event.state == 'ready']
    await runtime.close()


@pytest.mark.asyncio
async def test_resident_models_keep_gpu_placement_when_free_memory_decreases(models, monkeypatch):
    runtime, recognition, translation, _, _, command = models
    cpu = ComputeDevice('cpu', 'CPU', 'cpu', torchDevice='cpu', recognition=True, translation=True)
    gpu = ComputeDevice('gpu', 'GPU', 'cuda', torchDevice='cuda:0', llamaDevice='CUDA0',
        totalMemoryMb=16000, freeMemoryMb=14000, recognition=True, translation=True)
    inventory = [cpu, gpu]
    monkeypatch.setattr(runtime_module, 'probe_devices', lambda _directory: (inventory, [], 'test'))
    await runtime.handle(command)
    assert runtime._recognition_device.id == runtime._translation_device.id == 'gpu'
    assert translation._compute.reservedVramMb > command.config.compute.reservedVramMb
    inventory[1] = replace(gpu, freeMemoryMb=300)
    runtime._compute_inventory_at = 0
    result = await runtime.handle(command)
    assert result[0].state == 'ready'
    assert runtime._recognition_device.id == runtime._translation_device.id == 'gpu'
    assert recognition.loads == translation.loads == 1
    await runtime.close()


@pytest.mark.asyncio
async def test_cloud_service_does_not_load_local_translation(models):
    runtime, recognition, translation, _, _, command = models
    command = command.model_copy(update={'config': command.config.model_copy(update={'translationProvider': 'cloud'})})
    result = await runtime.handle(command)
    assert result[0].state == 'ready' and recognition.loaded
    assert translation.loads == 0 and result[0].translationModelId is None
    await runtime.close()


@pytest.mark.asyncio
async def test_handshake_imports_selected_dependency_in_background_without_loading_models(models, monkeypatch):
    runtime, recognition, translation, _, _, _ = models
    started = threading.Event()
    release = threading.Event()
    imported = []

    def import_module(name):
        imported.append(name)
        started.set()
        assert release.wait(2)

    monkeypatch.setenv('NOLA_TRANSLATOR_RECOGNITION_MODEL_ID', 'sensevoice-small')
    monkeypatch.setattr(runtime_module.importlib, 'import_module', import_module)
    try:
        result = await asyncio.wait_for(runtime.handle(HelloCommand(protocolVersion=1, type='hello', requestId='hello', clientVersion='test')), 0.3)
        assert result[0].type == 'ready'
        assert await asyncio.to_thread(started.wait, 1)
        assert recognition.loads == translation.loads == 0
        assert not runtime._dependency_task.done()
    finally:
        release.set()
        if runtime._dependency_task:
            await runtime._dependency_task
        await runtime.close()
    assert imported == ['funasr']
