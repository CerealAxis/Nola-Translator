import asyncio
from types import SimpleNamespace

import pytest

from fluentcaptions_engine.recognition.base import RecognitionUpdate
from fluentcaptions_engine.runtime import EngineRuntime
from fluentcaptions_engine.translation.base import ProviderTranslation
from fluentcaptions_engine.translation.scheduler import TranslationScheduler
from fluentcaptions_engine.protocol import Translation


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
async def test_changed_source_does_not_pair_with_previous_revision_translation(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.service.session_id = "session-live"
    runtime.active_config = SimpleNamespace(targetLanguages=["zh"], allowIntermediateTranslation=False)
    runtime.translation_scheduler = TranslationScheduler(ControlledProvider())
    runtime.latest_updates["segment-live"] = RecognitionUpdate(
        "segment-live", 1, 0, None, "First words", "en", False
    )
    runtime.latest_translations["segment-live"] = [
        Translation(targetLanguage="zh", state="complete", provider="controlled", text="第一句")
    ]

    await runtime._emit_update(RecognitionUpdate(
        "segment-live", 2, 0, None, "Second words", "en", False
    ))
    assert emitted[0].segment.translations[0].state == "pending"
    assert emitted[0].segment.translations[0].text is None
    for task in runtime.translation_tasks.values():
        task.cancel()
    await asyncio.gather(*runtime.translation_tasks.values(), return_exceptions=True)


@pytest.mark.asyncio
async def test_partial_is_not_translated_until_final_by_default(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.service.session_id = "session-live"
    runtime.session_started_at_ms = 0
    runtime.active_config = SimpleNamespace(
        targetLanguages=["zh"], allowIntermediateTranslation=False
    )
    runtime.translation_scheduler = TranslationScheduler(ImmediateProvider())

    await runtime._emit_update(RecognitionUpdate(
        segment_id="segment-live", revision=3, started_at_ms=0, ended_at_ms=None,
        source_text="Hello world", language="en", is_final=False,
    ))
    await asyncio.sleep(0.05)

    captions = [event for event in emitted if event.type == "caption"]
    assert captions[0].segment.translations[0].state == "pending"
    assert all(
        event.segment.translations[0].state != "complete"
        for event in captions
    ), "默认关闭时中间字幕不应提交翻译"

    await runtime._emit_update(RecognitionUpdate(
        segment_id="segment-live", revision=4, started_at_ms=0, ended_at_ms=900,
        source_text="Hello world.", language="en", is_final=True,
    ))
    await asyncio.gather(*runtime.translation_tasks.values())

    captions = [event for event in emitted if event.type == "caption"]
    final = captions[-1].segment
    assert final.isFinal is True
    assert final.translations[0].state == "complete"
    assert final.translations[0].text == "zh:Hello world."


@pytest.mark.asyncio
async def test_allow_intermediate_translates_partials(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.service.session_id = "session-live"
    runtime.session_started_at_ms = 0
    runtime.active_config = SimpleNamespace(
        targetLanguages=["zh"], allowIntermediateTranslation=True
    )
    runtime.translation_scheduler = TranslationScheduler(ImmediateProvider())

    await runtime._emit_update(RecognitionUpdate(
        segment_id="segment-live", revision=3, started_at_ms=0, ended_at_ms=None,
        source_text="Hello world", language="en", is_final=False,
    ))
    await asyncio.gather(*runtime.translation_tasks.values())

    captions = [event for event in emitted if event.type == "caption"]
    assert captions[-1].segment.translations[0].state == "complete"
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
    runtime.active_config = SimpleNamespace(targetLanguages=['zh'], allowIntermediateTranslation=True)
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
async def test_stale_translation_completion_is_not_emitted(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / 'models', emitted.append)
    runtime.service.session_id = 'session'
    runtime.active_config = SimpleNamespace(
        targetLanguages=['zh'], allowIntermediateTranslation=True
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


@pytest.mark.asyncio
async def test_hymt2_missing_model_fails_targets_without_network(tmp_path) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    from fluentcaptions_engine.translation.hymt2 import HyMt2TranslationProvider
    from fluentcaptions_engine.translation.llama_server import LlamaServerManager

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.translation_scheduler = TranslationScheduler(
        HyMt2TranslationProvider(LlamaServerManager())
    )
    update = RecognitionUpdate('segment', 0, 0, 10, 'hello', 'en', True)
    for _ in range(3):
        result = await runtime._translate_request(
            TranslationRequest(update, 'en', ('zh',), False)
        )
        assert result[0].state == 'failed'
        assert result[0].errorCode == 'resourceUnavailable'
        assert result[0].provider == 'hymt2'


@pytest.mark.asyncio
async def test_hymt2_server_not_ready_fails_targets(tmp_path, monkeypatch) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    from fluentcaptions_engine.translation.hymt2 import HyMt2TranslationProvider
    from fluentcaptions_engine.translation.llama_server import LlamaServerManager

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    monkeypatch.setattr(runtime.resources, 'is_installed', lambda _rid: True)
    runtime.translation_scheduler = TranslationScheduler(
        HyMt2TranslationProvider(LlamaServerManager())
    )
    update = RecognitionUpdate('segment', 0, 0, 10, 'hello', 'en', True)
    result = await runtime._translate_request(
        TranslationRequest(update, 'en', ('zh',), False)
    )
    assert result[0].state == 'failed'
    assert result[0].errorCode == 'llamaServerUnavailable'


@pytest.mark.asyncio
async def test_hymt2_unsupported_target_language_fails_that_target(tmp_path, monkeypatch) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    from fluentcaptions_engine.translation.hymt2 import HyMt2TranslationProvider
    from fluentcaptions_engine.translation.llama_server import LlamaServerManager

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    monkeypatch.setattr(runtime.resources, 'is_installed', lambda _rid: True)
    runtime.translation_scheduler = TranslationScheduler(
        HyMt2TranslationProvider(LlamaServerManager())
    )
    update = RecognitionUpdate('segment', 0, 0, 10, 'hello', 'en', True)
    result = await runtime._translate_request(
        TranslationRequest(update, 'en', ('zz',), False)
    )
    assert result[0].state == 'failed'
    assert result[0].errorCode == 'unsupportedLanguagePair'


@pytest.mark.asyncio
async def test_m2m100_missing_model_fails_targets_without_network(tmp_path) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    from fluentcaptions_engine.translation.m2m100 import M2M100TranslationProvider

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    runtime.translation_scheduler = TranslationScheduler(
        M2M100TranslationProvider(tmp_path / 'models' / 'm2m100-418m')
    )
    update = RecognitionUpdate('segment', 0, 0, 10, 'hello', 'en', True)
    result = await runtime._translate_request(
        TranslationRequest(update, 'en', ('zh',), False)
    )
    assert result[0].state == 'failed'
    assert result[0].errorCode == 'resourceUnavailable'
    assert result[0].provider == 'm2m100'


@pytest.mark.asyncio
async def test_m2m100_unsupported_target_language_fails_that_target(
    tmp_path, monkeypatch
) -> None:
    from fluentcaptions_engine.runtime import TranslationRequest
    from fluentcaptions_engine.translation.m2m100 import M2M100TranslationProvider

    runtime = EngineRuntime(tmp_path / 'models', lambda _: None)
    monkeypatch.setattr(runtime.resources, 'is_installed', lambda _rid: True)
    runtime.translation_scheduler = TranslationScheduler(
        M2M100TranslationProvider(tmp_path / 'models' / 'm2m100-418m')
    )
    update = RecognitionUpdate('segment', 0, 0, 10, 'hello', 'en', True)
    result = await runtime._translate_request(
        TranslationRequest(update, 'en', ('yue',), False)
    )
    assert result[0].state == 'failed'
    assert result[0].errorCode == 'unsupportedLanguagePair'
