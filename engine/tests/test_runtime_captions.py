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

@pytest.mark.asyncio
async def test_partial_updates_coalesce_and_final_wakes_throttle(tmp_path) -> None:
    from dataclasses import replace
    calls = []
    class Provider(ImmediateProvider):
        async def translate(self, text, source, target):
            calls.append(text)
            return await super().translate(text, source, target)
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    runtime.active_config = SimpleNamespace(targetLanguages=['zh'], allowIntermediateTranslation=False)
    runtime.translation_scheduler = TranslationScheduler(Provider())
    runtime.partial_translation_interval = 60
    update = RecognitionUpdate('segment', 0, 0, None, 'hello', 'en', False)
    await runtime._emit_update(update)
    await asyncio.gather(*runtime.translation_tasks.values())
    await runtime._emit_update(replace(update, revision=1, source_text='hello again'))
    await asyncio.sleep(0)
    await runtime._emit_update(replace(update, revision=2, source_text='final', is_final=True, ended_at_ms=10))
    await asyncio.wait_for(asyncio.gather(*runtime.translation_tasks.values()), 1)
    assert calls == ['hello', 'final']


@pytest.mark.asyncio
async def test_completed_caption_state_is_bounded_and_korean_detected(tmp_path) -> None:
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.service.session_id = 'session'
    runtime.completed_segment_limit = 3
    for index in range(20):
        await runtime._emit_update(RecognitionUpdate(str(index), 0, 0, 10, 'hello', 'en', True))
    assert len(runtime.latest_updates) == 3
    assert len(runtime.caption_revisions) == 3
    assert runtime._detect_language('안녕하세요') == 'ko'

@pytest.mark.asyncio
async def test_argos_path_scan_is_cached_for_session(tmp_path) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    class Packages:
        def __init__(self):
            self.calls = 0
        def installed_path(self, source, target, *, allow_intermediate):
            self.calls += 1
            return None
    packages = Packages()
    runtime.argos_packages = packages
    for index in range(3):
        update = RecognitionUpdate('segment', index, 0, None, 'hello', 'en', False)
        result = await runtime._translate_request(TranslationRequest(update, 'en', ('zh',), False))
        assert result[0].errorCode == 'resourceUnavailable'
    assert packages.calls == 1


@pytest.mark.asyncio
async def test_stale_translation_completion_is_not_emitted(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / 'models', emitted.append)
    runtime.service.session_id = 'session'
    runtime.active_config = SimpleNamespace(
        targetLanguages=['zh'], allowIntermediateTranslation=False
    )
    provider = ControlledProvider()
    runtime.translation_scheduler = TranslationScheduler(provider)

    stale = RecognitionUpdate('segment-slow', 1, 0, None, 'old words', 'en', False)
    await runtime._emit_update(stale)
    worker = next(iter(runtime.translation_tasks.values()))
    await provider.started.wait()

    fresh = RecognitionUpdate('segment-slow', 2, 0, 10, 'final words', 'en', True)
    await runtime._emit_update(fresh)
    provider.release.set()
    await asyncio.wait_for(worker, 1)

    completed = [
        event.segment.translations[0].text
        for event in emitted
        if event.type == 'caption'
        and event.segment.translations
        and event.segment.translations[0].state == 'complete'
    ]
    assert 'zh:old words' not in completed, '旧 revision 的翻译完成后不能覆盖新句'
    assert completed == ['zh:final words']
