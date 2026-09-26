import asyncio
from types import SimpleNamespace

import pytest

from fluentcaptions_engine.recognition.base import RecognitionUpdate
from fluentcaptions_engine.runtime import EngineRuntime
from fluentcaptions_engine.translation.base import ProviderTranslation
from fluentcaptions_engine.translation.scheduler import TranslationScheduler


class ImmediateProvider:
    name = "immediate"

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        return ProviderTranslation(f"{target}:{text}", (source, target))


class ControlledProvider:
    name = "controlled"

    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.release = asyncio.Event()

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        self.started.set()
        await self.release.wait()
        return ProviderTranslation(f"{target}:{text}", (source, target))


@pytest.mark.asyncio
async def test_partial_recognition_is_translated_without_blocking_until_endpoint(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.service.session_id = "session-live"
    runtime.session_started_at_ms = 0
    runtime.active_config = SimpleNamespace(
        targetLanguages=["zh"], allowIntermediateTranslation=False
    )
    runtime.translation_scheduler = TranslationScheduler(ImmediateProvider())
    update = RecognitionUpdate(
        segment_id="segment-live",
        revision=3,
        started_at_ms=0,
        ended_at_ms=None,
        source_text="Hello world",
        language="en",
        is_final=False,
    )

    await runtime._emit_update(update)
    await asyncio.sleep(0.05)

    captions = [event for event in emitted if event.type == "caption"]
    assert captions[0].segment.translations[0].state == "pending"
    assert captions[-1].segment.translations[0].text == "zh:Hello world"
    assert captions[-1].segment.isFinal is False


@pytest.mark.asyncio
async def test_slow_translation_does_not_block_the_audio_consumer(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.service.session_id = "session-live"
    runtime.session_started_at_ms = 0
    runtime.active_config = SimpleNamespace(
        targetLanguages=["zh"], allowIntermediateTranslation=False
    )
    provider = ControlledProvider()
    runtime.translation_scheduler = TranslationScheduler(provider)
    update = RecognitionUpdate(
        segment_id="segment-final",
        revision=1,
        started_at_ms=0,
        ended_at_ms=800,
        source_text="Hello world.",
        language="en",
        is_final=True,
    )

    emit_task = asyncio.create_task(runtime._emit_update(update))
    await provider.started.wait()

    assert emit_task.done(), "翻译后端不应阻塞音频帧消费循环"
    provider.release.set()


    await emit_task
