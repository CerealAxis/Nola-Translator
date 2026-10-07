import asyncio
from unittest.mock import AsyncMock

import pytest

from nola_translator_engine.models.registry import CustomFile
from nola_translator_engine.protocol import ModelConfiguration, SessionConfig, StartSessionCommand
from nola_translator_engine.recognition.base import RecognitionUpdate
from nola_translator_engine.runtime import EngineRuntime


def start_config(**changes):
    return SessionConfig(**dict(dict(audioSource={"kind": "defaultOutput"}, recognitionMode="realtime", recognitionModelId="sensevoice-small", sourceLanguage="auto", targetLanguages=["en"], translationProvider="local", translationModelId="hub:test/translator"), **changes))


def setup_translator(runtime, monkeypatch):
    runtime.resources.register_hub_model("test/translator", "revision", "llama.cpp", "translation", "Test translator", (CustomFile("model.gguf", 1, "0" * 64),), ())
    monkeypatch.setattr(runtime.resources.models, "is_installed", lambda spec: True)
    runtime.resources.configure("hub:test/translator", ModelConfiguration(slot="translation", engine="llama", languages=[], supportsAutoDetection=False, sourceLanguages=["ja", "en"], targetLanguages=["ja", "en"]))


@pytest.mark.asyncio
async def test_unconfigured_download_is_rejected_before_any_model_is_loaded(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    runtime.resources.register_hub_model("test/translator", "revision", "llama.cpp", "translation", "Test", (CustomFile("model.gguf", 1, "0" * 64),), ())
    load = AsyncMock()
    monkeypatch.setattr(runtime, "_configure_device_plan", load)
    result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession", requestId="start", config=start_config()))
    assert result[0].code == "invalidConfiguration"
    assert result[0].details["reason"] == "modelNeedsConfiguration"
    load.assert_not_called()


@pytest.mark.asyncio
async def test_manual_incompatible_source_is_rejected_before_loading(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path, lambda event: None)
    setup_translator(runtime, monkeypatch)
    load = AsyncMock()
    monkeypatch.setattr(runtime, "_configure_device_plan", load)
    result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession", requestId="start", config=start_config(sourceLanguage="zh")))
    assert result[0].details["reason"] == "unsupportedTranslationLanguage"
    load.assert_not_called()


@pytest.mark.asyncio
async def test_automatic_unsupported_language_keeps_original_without_translation_or_notice(tmp_path, monkeypatch):
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    setup_translator(runtime, monkeypatch)
    emitted.clear()
    runtime.active_config = start_config()
    runtime.service.session_id = "session"
    update = RecognitionUpdate("segment", 1, 0, 100, "你好", "zh", True)
    await runtime._emit_update(update)
    assert len(emitted) == 1
    assert emitted[0].type == "caption"
    assert emitted[0].segment.sourceText == "你好"
    assert emitted[0].segment.translations == []
    assert not runtime.translation_tasks


@pytest.mark.asyncio
async def test_supported_detected_language_still_schedules_translation(tmp_path, monkeypatch):
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    setup_translator(runtime, monkeypatch)
    emitted.clear()
    runtime.active_config = start_config()
    runtime.service.session_id = "session"
    worker = AsyncMock()
    monkeypatch.setattr(runtime, "_translation_worker", worker)
    await runtime._emit_update(RecognitionUpdate("segment", 1, 0, 100, "こんにちは", "ja", True))
    assert emitted[0].segment.translations[0].state == "pending"
    await runtime.translation_tasks["segment"]
    worker.assert_awaited_once()


def test_script_variants_survive_runtime_normalization():
    assert EngineRuntime._language_code("zh-Hant") == "zh-Hant"
    assert EngineRuntime._language_code("zh-TW") == "zh-Hant"
    assert EngineRuntime._language_code("fil") == "tl"


@pytest.mark.asyncio
async def test_language_revision_cancels_previous_translation_when_no_longer_supported(tmp_path, monkeypatch):
    emitted = []
    runtime = EngineRuntime(tmp_path, emitted.append)
    setup_translator(runtime, monkeypatch)
    runtime.active_config = start_config(allowIntermediateTranslation=True)
    runtime.service.session_id = "session"
    started = asyncio.Event()

    async def waiting_translation(request):
        started.set()
        await asyncio.Event().wait()

    monkeypatch.setattr(runtime, "_translate_request", waiting_translation)
    await runtime._emit_update(RecognitionUpdate("segment", 1, 0, 100, "partial", "ja", False))
    await asyncio.wait_for(started.wait(), timeout=1)
    task = runtime.translation_tasks["segment"]
    await runtime._emit_update(RecognitionUpdate("segment", 2, 0, 200, "你好", "zh", True))
    with pytest.raises(asyncio.CancelledError):
        await task
    assert emitted[-1].segment.sourceText == "你好"
    assert emitted[-1].segment.translations == []
    assert not runtime.translation_requests
