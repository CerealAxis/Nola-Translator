"""M06 committed sentence synthesis and single-owner playback grants."""

from __future__ import annotations

import asyncio

from nola_translator_engine.backend.gateway.operations import SynthesisChunk, SynthesisResult
from nola_translator_engine.backend.playback_queue import PlaybackQueue
from nola_translator_engine.backend.tts_pipeline import TtsPipeline


class FakeGateway:
    def __init__(self, failures: int = 0) -> None:
        self.calls: list[str] = []
        self.failures = failures
        self.synthesized = asyncio.Queue()

    async def synthesize(self, ctx, *, text, voice, request):
        self.calls.append(text)
        if len(self.calls) <= self.failures:
            raise RuntimeError("temporary synthesis failure")
        self.synthesized.put_nowait(text)
        return SynthesisResult([SynthesisChunk(pcm=b"\0\0" * 4, sample_rate=24000, terminal=True)])


async def test_committed_sentences_are_granted_in_order_once(tmp_path):
    gateway = FakeGateway()
    queue = PlaybackQueue(tmp_path / "playback.sqlite", "pipe")
    events = []
    pipeline = TtsPipeline(gateway, queue, pipeline_id="pipe", epoch=2, model_id="voice", latency_detection=True,
                           event_sink=lambda event, payload: events.append((event, payload)))
    grants = asyncio.Queue()

    async def sink(grant):
        await grants.put(grant)

    assert pipeline.translation_committed({"commit_id": "c1", "text": "one", "segment_id": "s1"})
    assert await asyncio.wait_for(gateway.synthesized.get(), 1) == "one"
    assert pipeline.attach("owner", sink)
    assert not pipeline.attach("other", sink)
    first = await asyncio.wait_for(grants.get(), 1)
    assert first.job.text == "one"
    start, ready = [payload for event, payload in events if event == "latency_observation"]
    assert (start["kind"], ready["kind"]) == ("synthesis_started", "audio_ready")
    assert start["segment_id"] == ready["segment_id"] == "s1"
    assert start["audio_stream_id"] == ready["audio_stream_id"] == first.claim.job_id
    assert ready["at_ms"] >= start["at_ms"]
    assert pipeline.ack(first.job.job_id, "owner", first.claim.claim_id,
                        first.claim.generation, "started")
    assert pipeline.translation_committed({"commit_id": "c2", "text": "two", "segment_id": "s2"})
    assert await asyncio.wait_for(gateway.synthesized.get(), 1) == "two"
    assert grants.empty()
    assert pipeline.ack(first.job.job_id, "owner", first.claim.claim_id,
                        first.claim.generation, "finished", first.claim.sample_count)
    second = await asyncio.wait_for(grants.get(), 1)
    assert second.job.text == "two"
    assert pipeline.ack(second.job.job_id, "owner", second.claim.claim_id,
                        second.claim.generation, "started")
    assert pipeline.ack(second.job.job_id, "owner", second.claim.claim_id,
                        second.claim.generation, "finished", second.claim.sample_count)
    await asyncio.wait_for(pipeline.wait_idle(), 1)
    assert gateway.calls == ["one", "two"]
    await pipeline.close()


async def test_one_synthesis_failure_retries_before_playback(tmp_path):
    gateway = FakeGateway(failures=1)
    queue = PlaybackQueue(tmp_path / "playback.sqlite", "pipe")
    events = []
    pipeline = TtsPipeline(gateway, queue, pipeline_id="pipe", epoch=0, model_id="voice",
                          event_sink=lambda name, payload: events.append((name, payload)))
    grants = asyncio.Queue()
    pipeline.attach("owner", grants.put)
    assert pipeline.translation_committed({"commit_id": "retry", "text": "retry me"})

    grant = await asyncio.wait_for(grants.get(), 1)
    assert gateway.calls == ["retry me", "retry me"]
    assert grant.job.synthesis_attempt == 2
    assert not any(payload.get("state") == "failed" for _, payload in events)
    await pipeline.close()


async def test_second_synthesis_failure_exposes_only_oldest_blocked_job(tmp_path):
    gateway = FakeGateway(failures=2)
    queue = PlaybackQueue(tmp_path / "playback.sqlite", "pipe")
    pipeline = TtsPipeline(gateway, queue, pipeline_id="pipe", epoch=0, model_id="voice")
    grants = asyncio.Queue()
    pipeline.attach("owner", grants.put)
    assert pipeline.translation_committed({"commit_id": "blocked", "text": "blocked"})
    assert pipeline.translation_committed({"commit_id": "later", "text": "later"})
    await asyncio.wait_for(pipeline.wait_idle(), 1)
    assert await asyncio.wait_for(gateway.synthesized.get(), 1) == "later"
    assert grants.empty()

    blocked = queue.blocked_job()
    assert blocked and blocked[0] == "failed" and blocked[1].text == "blocked"
    assert gateway.calls == ["blocked", "blocked", "later"]
    assert not pipeline.resolve_failure("tts-" + "0" * 32, retry=True)
    assert pipeline.resolve_failure(blocked[1].job_id, retry=True)
    for expected in ("blocked", "later"):
        grant = await asyncio.wait_for(grants.get(), 1)
        assert grant.job.text == expected
        assert pipeline.ack(grant.job.job_id, "owner", grant.claim.claim_id,
                            grant.claim.generation, "started", 0)
        assert pipeline.ack(grant.job.job_id, "owner", grant.claim.claim_id,
                            grant.claim.generation, "finished", grant.claim.sample_count)
    assert gateway.calls == ["blocked", "blocked", "later", "blocked"]
    await pipeline.close()
