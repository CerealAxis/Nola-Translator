"""M05 snapshot translation scheduling without model or network access."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode, TranslationPolicy
from nola_translator_engine.backend.gateway.operations import TranslationResult
from nola_translator_engine.backend.translation_pipeline import TranslationScheduler
from nola_translator_engine.backend.glossary import RealtimeGlossary, RealtimeGlossaryUpdate


class FakeGateway:
    def __init__(self, *, policy: TranslationPolicy | None = None) -> None:
        self.entry = SimpleNamespace(
            definition=SimpleNamespace(
                capabilities=SimpleNamespace(
                    translation_policy=policy or TranslationPolicy(),
                    model_revision="rev-1",
                    adapter_revision="adapter-1",
                )
            ),
            configuration=SimpleNamespace(revision=3),
        )
        self.matches = []
        self.calls = []
        self.started = asyncio.Event()
        self.release = asyncio.Event()
        self.block = False
        self.match_error: Exception | None = None

    def match(self, request):
        self.matches.append(request)
        if self.match_error:
            raise self.match_error
        return SimpleNamespace(entry=self.entry)

    async def translate(self, ctx, *, text, source, target, request):
        self.calls.append((ctx, text, source, target, request))
        self.started.set()
        if self.block:
            await self.release.wait()
        return TranslationResult(text=f"{target}:{text}", source=source, target=target)


def source(segment_id: str, revision: int, text: str, *, state: str = "stable") -> dict:
    return {
        "segment_id": segment_id,
        "source_revision": revision,
        "text": text,
        "language": "en",
        "text_state": state,
    }


def make_scheduler(gateway: FakeGateway, events: list[tuple[str, dict]], **kwargs) -> TranslationScheduler:
    return TranslationScheduler(
        gateway,
        session_id="session-1",
        pipeline_id="pipeline-1",
        epoch=2,
        model_id="model:pinned-mt",
        target_languages=["zh"],
        event_sink=lambda event, payload: events.append((event, payload)),
        preview_interval_ms=0,
        preview_max_wait_ms=0,
        **kwargs,
    )


async def test_failed_committed_translation_uses_separate_fallback_credentials():
    class Gateway(FakeGateway):
        async def translate(self, ctx, *, text, source, target, request):
            if request.model_id == "model:pinned-mt":
                raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="primary unavailable")
            assert request.model_id == "fallback" and not request.source_is_provisional
            assert ctx.provider_options == {"api_key": "backup-key"}
            return await super().translate(ctx, text=text, source=source, target=target, request=request)

    events = []
    scheduler = make_scheduler(Gateway(), events, fallback_model_id="fallback",
                               fallback_provider_options={"api_key": "backup-key"}, latency_detection=True)
    try:
        await scheduler.source_final(source("s1", 1, "Hello"))
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        commits = [payload["text"] for event, payload in events if event == "translation_committed"]
        assert commits == ["zh:Hello"]
        start, ready = [payload for event, payload in events if event == "latency_observation"]
        assert (start["kind"], ready["kind"]) == ("translation_started", "translation_ready")
        assert start["provider"] == ready["provider"] == "fallback"
        assert start["segment_id"] == ready["segment_id"] == "s1"
        assert ready["at_ms"] >= start["at_ms"]
    finally:
        await scheduler.close()


@pytest.mark.asyncio
async def test_glossary_edit_fences_pending_final_and_keeps_other_target_private():
    glossary = RealtimeGlossary()

    def update(revision, target):
        return glossary.update(RealtimeGlossaryUpdate.model_validate({"revision": revision, "libraries": [[
            {"source": "A小", "target": target, "caseSensitive": True, "targetLanguage": "zh", "mode": "fixed"},
            {"source": "A小", "target": "A Short", "caseSensitive": True, "targetLanguage": "en", "mode": "fixed"},
        ]]}))

    assert update(1, "旧译")
    gateway, events = FakeGateway(), []
    gateway.block = True
    scheduler = make_scheduler(gateway, events, glossary=glossary)
    try:
        await scheduler.source_final(source("s1", 1, "A小"))
        await asyncio.wait_for(gateway.started.wait(), 1)
        assert update(2, "新译")
        await scheduler.refresh_glossary()
        assert not update(1, "失效")
        gateway.release.set()
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        assert [[term.target for term in ctx.translation_context["glossary"]] for ctx, *_ in gateway.calls] == [["旧译"], ["新译"]]
        assert sum(event == "translation_committed" for event, _ in events) == 1
        assert update(3, "后来改名")
        await scheduler.refresh_glossary()
        await scheduler.source_final(source("s2", 1, "No match."))
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        assert len(gateway.calls) == 3 and "glossary" not in gateway.calls[-1][0].translation_context
    finally:
        gateway.release.set()
        await scheduler.close()


async def test_editing_queued_target_does_not_resubmit_another_languages_inflight_request():
    glossary = RealtimeGlossary()
    gateway, events = FakeGateway(), []
    gateway.block = True
    scheduler = make_scheduler(gateway, events, glossary=glossary)
    scheduler.target_languages = ("ja", "zh")
    try:
        await scheduler.source_final(source("s1", 1, "A小"))
        await asyncio.wait_for(gateway.started.wait(), 1)
        glossary.update(RealtimeGlossaryUpdate.model_validate({"revision": 1, "libraries": [[
            {"source": "A小", "target": "短道", "caseSensitive": True, "targetLanguage": "zh", "mode": "fixed"},
        ]]}))
        await scheduler.refresh_glossary()
        gateway.release.set()
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        assert [target for _, _, _, target, _ in gateway.calls] == ["ja", "zh"]
        assert [payload["target_language"] for event, payload in events if event == "translation_committed"] == ["ja", "zh"]
    finally:
        gateway.release.set()
        await scheduler.close()


@pytest.mark.parametrize("reason", ["glossaryUnsupported", "glossaryBudgetExceeded"])
def test_local_worker_term_failure_remains_a_localizable_segment_error(reason):
    from nola_translator_engine.backend.gateway.adapters import map_local_error
    scheduler = make_scheduler(FakeGateway(), [])
    error = map_local_error(f"ValueError: {reason}", stage="mt")
    payload = scheduler._error_event_payload("s1", error)["error"]
    assert (payload["scope"], payload["message_key"]) == ("task", reason)


@pytest.mark.asyncio
async def test_preview_omits_draft_suffix_and_suppressed_final_fences_result() -> None:
    gateway = FakeGateway()
    gateway.block = True
    events = []
    scheduler = make_scheduler(gateway, events)
    try:
        stable = source("s1", 1, "one two three unstable suffix")
        stable["stable_end_offset"] = len("one two three")
        await scheduler.source_snapshot(stable)
        await asyncio.wait_for(gateway.started.wait(), 1)
        assert gateway.calls[0][1] == "one two three"
        revised = source("s1", 2, "one two three different draft")
        revised["stable_end_offset"] = stable["stable_end_offset"]
        await scheduler.source_snapshot(revised)
        await scheduler.source_final(source("s1", 3, "", state="committed"))
        gateway.release.set()
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        assert not events
        assert len(gateway.calls) == 1
    finally:
        gateway.release.set()
        await scheduler.close()


@pytest.mark.asyncio
async def test_stop_cancels_inflight_translation() -> None:
    gateway = FakeGateway()
    gateway.block = True
    events = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_final(source("s1", 1, "final", state="committed"))
    await asyncio.wait_for(gateway.started.wait(), 1)
    await asyncio.wait_for(scheduler.close(), 1)
    assert not events


@pytest.mark.asyncio
async def test_latest_snapshot_replaces_inflight_preview_and_stale_result_is_dropped() -> None:
    gateway = FakeGateway()
    gateway.block = True
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_snapshot(source("s1", 1, "one two three"), {"context_revision": 1})
    await asyncio.wait_for(gateway.started.wait(), 1)

    await scheduler.source_snapshot(source("s1", 2, "one two three four"), {"context_revision": 1})
    await scheduler.source_snapshot(source("s1", 3, "one two three newest"), {"context_revision": 2})
    gateway.release.set()
    await asyncio.wait_for(scheduler.wait_idle(), 1)

    outputs = [payload for event, payload in events if event == "translated_text" and payload["state"] == "provisional"]
    assert len(gateway.calls) == 2
    assert outputs[-1]["text"] == "zh:one two three newest"
    assert outputs[-1]["based_on_source_revision"] == 3
    assert all(call[4].model_id == "model:pinned-mt" for call in gateway.calls)
    await scheduler.close()


@pytest.mark.asyncio
async def test_draft_rollback_invalidates_inflight_stable_translation() -> None:
    gateway = FakeGateway()
    gateway.block = True
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_snapshot(source("s1", 1, "one two three"))
    await asyncio.wait_for(gateway.started.wait(), 1)
    await scheduler.source_snapshot(source("s1", 2, "one two", state="draft"))
    gateway.release.set()
    await asyncio.wait_for(scheduler.wait_idle(), 1)

    assert len(gateway.calls) == 1
    assert not [payload for event, payload in events if event == "translated_text" and payload["state"] == "provisional"]
    await scheduler.close()


@pytest.mark.asyncio
async def test_final_only_provider_skips_stable_preview_but_commits_source_final() -> None:
    gateway = FakeGateway(policy=TranslationPolicy(min_source_state="committed", allow_preview=False))
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_snapshot(source("s1", 1, "a sufficiently long stable source"))
    await asyncio.sleep(0)
    assert not gateway.calls

    await scheduler.source_final(source("s1", 2, "a sufficiently long stable source", state="committed"), {"context_revision": 4})
    await asyncio.wait_for(scheduler.wait_idle(), 1)
    assert len(gateway.calls) == 1
    assert [event for event, _ in events] == ["translated_text", "translation_committed"]
    assert events[-1][1]["based_on_context_revision"] == 4
    await scheduler.close()


@pytest.mark.asyncio
async def test_matching_provisional_is_promoted_without_second_translation() -> None:
    gateway = FakeGateway()
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    stable = source("s1", 1, "one two three")
    context = {"context_revision": 2, "glossary": {"Nola": "诺拉"}}
    await scheduler.source_snapshot(stable, context)
    await asyncio.wait_for(scheduler.wait_idle(), 1)
    await scheduler.source_final(source("s1", 1, stable["text"], state="committed"), context)
    await asyncio.wait_for(scheduler.wait_idle(), 1)

    assert len(gateway.calls) == 1
    assert [event for event, _ in events].count("translation_committed") == 1
    assert events[-1][1]["text"] == "zh:one two three"
    await scheduler.close()


@pytest.mark.asyncio
async def test_final_jobs_keep_arrival_order_and_short_final_text_bypasses_preview_gate() -> None:
    gateway = FakeGateway()
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_final(source("s1", 1, "好", state="committed"))
    await scheduler.source_final(source("s2", 1, "yes", state="committed"))
    await asyncio.wait_for(scheduler.wait_idle(), 1)

    commits = [payload for event, payload in events if event == "translation_committed"]
    assert [payload["segment_id"] for payload in commits] == ["s1", "s2"]
    assert [call[1] for call in gateway.calls] == ["好", "yes"]
    await scheduler.close()


@pytest.mark.asyncio
async def test_promotion_waits_behind_earlier_final_and_retry_is_bounded() -> None:
    class Gateway(FakeGateway):
        async def translate(self, *args, **kwargs):
            if kwargs["text"] == "first":
                self.attempts += 1
                if self.attempts == 1:
                    raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="translation",
                                       message="test transient error", retryable=True)
            return await super().translate(*args, **kwargs)

    gateway = Gateway()
    gateway.attempts = 0
    events = []
    scheduler = make_scheduler(gateway, events)
    try:
        stable = source("s2", 1, "one two three")
        await scheduler.source_snapshot(stable)
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        await scheduler.source_final(source("s1", 1, "first", state="committed"))
        await scheduler.source_final(source("s2", 2, stable["text"], state="committed"))
        await asyncio.wait_for(scheduler.wait_idle(), 1)
        assert gateway.attempts == 2
        assert [payload["segment_id"] for kind, payload in events if kind == "translation_committed"] == ["s1", "s2"]
        assert [call[1] for call in gateway.calls] == ["one two three", "first"]
    finally:
        await scheduler.close()


@pytest.mark.asyncio
async def test_small_stable_text_is_gated_until_phrase_boundary_or_threshold() -> None:
    gateway = FakeGateway()
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_snapshot(source("s1", 1, "two words"))
    assert not gateway.calls
    await scheduler.source_snapshot({**source("s1", 2, "好。"), "phrase_boundary": True})
    await asyncio.wait_for(scheduler.wait_idle(), 1)
    assert len(gateway.calls) == 1
    await scheduler.close()


@pytest.mark.asyncio
async def test_final_match_failure_is_reported_and_source_is_not_falsely_committed() -> None:
    gateway = FakeGateway()
    gateway.match_error = ValueError("not supported")
    events: list[tuple[str, dict]] = []
    scheduler = make_scheduler(gateway, events)
    await scheduler.source_final(source("s1", 1, "hello", state="committed"))

    assert events[0][0] == "error"
    assert events[0][1]["error"]["segment_id"] == "s1"
    assert events[0][1]["error"]["code"] == "INTERNAL_ERROR"
    assert not gateway.calls
    await scheduler.close()
