import asyncio
import json
import threading
from dataclasses import replace
from unittest.mock import AsyncMock

import pytest

from nola_translator_engine import runtime as runtime_module
from nola_translator_engine.protocol import (PrewarmConfig, PrewarmModelsCommand, SessionConfig,
    StartSessionCommand, StopSessionCommand, ResetStreamCommand, TranslationOptions, HelloCommand)
from nola_translator_engine.recognition.aliyun import AliyunRecognizer, MODELS
from nola_translator_engine.recognition.base import NativeTranslation, RecognitionUpdate
from nola_translator_engine.runtime import EngineRuntime, RemoteRecognitionRuntime
from nola_translator_engine.translation.base import ProviderTranslation
from nola_translator_engine.translation.mymemory import MyMemoryTranslationProvider
from nola_translator_engine.translation.scheduler import TranslationScheduler


class FakeSocket:
    def __init__(self):
        self.events = asyncio.Queue()
        self.events.put_nowait({"type": "session.created"})
        self.closed = False

    async def send(self, message):
        event = json.loads(message)
        if event["type"] == "session.update":
            self.events.put_nowait({"type": "session.updated"})

    async def recv(self):
        return json.dumps(await self.events.get())

    async def close(self):
        self.closed = True


def config(**changes):
    return PrewarmConfig(**dict(dict(recognitionProvider="aliyun", sourceLanguage="auto", targetLanguages=[],
        recognitionOptions={"workspaceId": "workspace", "model": MODELS[0]}, translationProvider="mymemory",
        translationOptions={"endpoint": "https://api.mymemory.translated.net/get"}), **changes))


@pytest.mark.asyncio
async def test_remote_prewarm_without_credentials_or_local_weights(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    local_load = AsyncMock(side_effect=AssertionError("Local recognition loaded"))
    probe = AsyncMock(side_effect=AssertionError("Unnecessary compute inventory"))
    monkeypatch.setattr(runtime, "_create_recognizer", local_load)
    monkeypatch.setattr(runtime, "_probe_compute_inventory", probe)
    monkeypatch.setattr(runtime_module.AliyunRecognizer, "start", AsyncMock(side_effect=AssertionError("Billable WebSocket opened")))
    result = await runtime.handle(PrewarmModelsCommand(protocolVersion=1, type="prewarmModels", requestId="warm",
        config=config(recognitionOptions={"workspaceId": "workspace"})))
    assert result[0].type == "modelsPrewarmed" and result[0].state == "ready"
    local_load.assert_not_called()
    probe.assert_not_called()
    assert not runtime._recognition_runtime().loaded
    await runtime.close()


@pytest.mark.asyncio
async def test_cloud_handshake_does_not_import_local_asr_dependencies(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    monkeypatch.setenv("NOLA_TRANSLATOR_RECOGNITION_MODEL_ID", "")
    imported = []
    monkeypatch.setattr(runtime_module.importlib, "import_module", imported.append)
    result = await runtime.handle(HelloCommand(protocolVersion=1, type="hello", requestId="hello", clientVersion="test"))
    assert result[0].type == "ready" and runtime._dependency_task is None
    await runtime._import_recognition_dependencies(" ")
    assert not imported
    await runtime.close()


@pytest.mark.asyncio
async def test_remote_prewarm_still_loads_selected_local_translator(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda model_id: True)
    monkeypatch.setattr(runtime, "_configure_device_plan", AsyncMock())
    monkeypatch.setattr(runtime, "_create_recognizer", AsyncMock(side_effect=AssertionError("Local ASR loaded")))
    translator = AsyncMock()
    monkeypatch.setattr(runtime, "_ensure_translation_server", translator)
    settings = config(targetLanguages=["zh"], translationProvider="local")
    result = await runtime.handle(PrewarmModelsCommand(protocolVersion=1, type="prewarmModels", requestId="warm", config=settings))
    assert result[0].state == "ready" and result[0].translationModelId
    translator.assert_awaited_once()
    await runtime.close()


@pytest.mark.asyncio
async def test_native_translation_retains_final_source_and_bypasses_scheduler(tmp_path):
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    runtime.service.session_id = "session"
    runtime.active_config = config(targetLanguages=["zh"], translationProvider="recognition")
    runtime.completed_segment_limit = 0
    update = RecognitionUpdate("source", 0, 0, 400, "hello", "en", True,
        NativeTranslation("zh", "你", "pending"))
    await runtime._emit_update(update)
    assert "source" in runtime.latest_updates
    assert not runtime.translation_tasks and not runtime.translation_jobs
    await runtime._emit_update(replace(update, revision=1, native_translation=NativeTranslation("zh", "你好", "complete")))
    assert emitted[-1].segment.isFinal and emitted[-1].segment.translations[0].text == "你好"
    assert emitted[-1].segment.translations[0].state == "complete"
    assert "source" not in runtime.latest_updates
    runtime.service.session_id = None
    await runtime.close()


@pytest.mark.asyncio
async def test_stop_marks_unsettled_native_translation_as_cancelled(tmp_path):
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    runtime.service.session_id = "session"
    runtime.active_config = config(targetLanguages=["zh"], translationProvider="recognition")
    update = RecognitionUpdate("source", 0, 0, 400, "hello", "en", True,
        NativeTranslation("zh", "你", "pending"))
    await runtime._emit_update(update)
    runtime._finalize_browser_partials()
    final = emitted[-1].segment
    assert final.isFinal and final.endedAtMs == 400
    assert final.translations[0].state == "failed" and final.translations[0].errorCode == "translationCancelled"
    runtime.service.session_id = None
    await runtime.close()


@pytest.mark.asyncio
async def test_external_translation_uses_source_not_native_translation(tmp_path):
    class Provider:
        name = "mymemory"
        async def translate(self, text, source, target):
            assert text == "hello"
            return ProviderTranslation("external", (source, target))
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    runtime.service.session_id = "session"
    runtime.active_config = config(targetLanguages=["zh"])
    runtime.translation_scheduler = TranslationScheduler(Provider())
    await runtime._emit_update(RecognitionUpdate("source", 0, 0, 400, "hello", "en", True,
        NativeTranslation("zh", "native", "complete")))
    for _ in range(40):
        await asyncio.sleep(0)
    assert emitted[-1].segment.translations[0].text == "external"
    runtime.service.session_id = None
    await runtime.close()


@pytest.mark.asyncio
async def test_mymemory_never_translates_speculative_source_even_when_requested(tmp_path):
    calls = []
    class Provider:
        name = "mymemory"
        async def translate(self, text, source, target):
            calls.append(text)
            return ProviderTranslation("confirmed", (source, target))
    runtime = EngineRuntime(tmp_path, lambda event: None)
    runtime.service.session_id = "session"
    runtime.active_config = config(targetLanguages=["zh"], allowIntermediateTranslation=True)
    runtime.translation_scheduler = TranslationScheduler(Provider())
    update = RecognitionUpdate("source", 0, 0, None, "draft", "en", False)
    await runtime._emit_update(update)
    await asyncio.gather(*runtime.translation_tasks.values())
    assert not calls
    await runtime._emit_update(replace(update, revision=1, source_text="final", is_final=True, ended_at_ms=400))
    for _ in range(40):
        await asyncio.sleep(0)
    assert calls == ["final"]
    runtime.service.session_id = None
    await runtime.close()


@pytest.mark.asyncio
async def test_remote_start_reset_and_stop_isolate_old_session(tmp_path, monkeypatch):
    emitted, sockets = [], []
    async def connector(url, headers):
        socket = FakeSocket()
        sockets.append(socket)
        return socket
    original = runtime_module.AliyunRecognizer
    monkeypatch.setattr(runtime_module, "AliyunRecognizer", type("InjectedAliyun", (original,), {
        "__init__": lambda self, settings: original.__init__(self, settings, connector=connector)}))
    runtime = EngineRuntime(tmp_path, emitted.append)
    monkeypatch.setattr(runtime, "_create_recognizer", AsyncMock(side_effect=AssertionError("Local ASR loaded")))
    settings = SessionConfig(**config(recognitionOptions={"workspaceId": "workspace", "apiKey": "secret"}).model_dump(),
        audioSource={"kind": "browserTab", "streamId": "tab"}, browserTimeline={"epoch": 0, "videoTimeMs": 5000, "playbackRate": 1}, recognitionMode="realtime")
    result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession", requestId="start", config=settings))
    assert result[0].type == "sessionStarted"
    session = result[0].sessionId
    old = runtime.recognizer
    old_callback = old.on_update
    result = await runtime.handle(ResetStreamCommand(protocolVersion=1, type="resetStream", requestId="reset", sessionId=session,
        epoch=1, videoTimeMs=8000, playbackRate=1))
    assert result[0].type == "streamReset" and sockets[0].closed and len(sockets) == 2
    count = len(emitted)
    await old_callback(RecognitionUpdate("old", 1, 0, 10, "stale", "en", True))
    assert len(emitted) == count
    result = await asyncio.wait_for(runtime.handle(StopSessionCommand(protocolVersion=1, type="stopSession", requestId="stop", sessionId=session)), 0.5)
    assert result[0].type == "sessionStopped" and sockets[1].closed
    await runtime.close()


@pytest.mark.asyncio
async def test_remote_desktop_stop_does_not_wait_for_native_local_translation(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    settings = SessionConfig(**config(targetLanguages=["zh"], translationProvider="local").model_dump(),
        audioSource={"kind": "defaultOutput"}, recognitionMode="realtime")
    runtime.service.session_id = "session"
    runtime.active_config = settings
    runtime.recognizer = AliyunRecognizer(settings)
    runtime._active_recognition_runtime = RemoteRecognitionRuntime("aliyun", MODELS[0])
    runtime._retain_models = True
    runtime.model_cleanup_timeout = 0.01
    entered, release = threading.Event(), threading.Event()
    def wait_idle():
        entered.set()
        release.wait(5)
    monkeypatch.setattr(runtime.llama_manager, "wait_idle", wait_idle)
    try:
        result = await asyncio.wait_for(runtime.handle(StopSessionCommand(protocolVersion=1, type="stopSession",
            requestId="stop", sessionId="session")), 0.2)
        assert result[0].type == "sessionStopped"
        assert await asyncio.to_thread(entered.wait, 1)
        assert runtime._model_cleanup_pending()
        assert not await runtime._await_model_cleanup()
        result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession", requestId="restart", config=settings))
        assert result[0].code == "resourceBusy" and result[0].details["reason"] == "modelCleanupPending"
    finally:
        release.set()
        if runtime._model_cleanup_task is not None:
            await runtime._model_cleanup_task
        await runtime.close()


def test_native_translation_rejects_other_recognizers_and_mymemory_dispatch(tmp_path):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    with pytest.raises(Exception, match="invalidConfiguration"):
        runtime._validate_model_selection(config(recognitionProvider="local", translationProvider="recognition", targetLanguages=["zh"]))
    command = PrewarmModelsCommand(protocolVersion=1, type="prewarmModels", requestId="warm",
        config=config(targetLanguages=["zh"], translationOptions=TranslationOptions(endpoint="https://api.mymemory.translated.net/get", email="test@example.com")))
    runtime._configure_translation(command)
    assert isinstance(runtime.translation_provider, MyMemoryTranslationProvider)
    assert runtime.translation_provider.email == "test@example.com"
