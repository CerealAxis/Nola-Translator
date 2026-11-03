"""Synthesize committed sentences ahead of ordered playback."""

from __future__ import annotations

import asyncio
import inspect
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

from .gateway.capabilities import CallContext, Operation
from .gateway.gateway import MatchRequest, ModelGateway
from .gateway.operations import SynthesisResult
from .latency import unix_ms
from .playback_queue import PlaybackClaim, PlaybackQueue, TtsJob


@dataclass(frozen=True)
class PlaybackGrant:
    job: TtsJob
    claim: PlaybackClaim
    synthesis: SynthesisResult


PlaybackSink = Callable[[PlaybackGrant], Awaitable[None]]
EventSink = Callable[[str, dict[str, Any]], Awaitable[None] | None]


class TtsPipeline:
    def __init__(
        self,
        gateway: ModelGateway,
        queue: PlaybackQueue,
        *,
        pipeline_id: str,
        epoch: int,
        model_id: str,
        voice: str | None = None,
        event_sink: EventSink | None = None,
        deadline_s: float = 30.0,
        provider_options: dict[str, str] | None = None,
        latency_detection: bool = False,
    ) -> None:
        self.gateway, self.queue = gateway, queue
        self.pipeline_id, self.epoch = pipeline_id, epoch
        self.model_id, self.voice = model_id, voice
        self.event_sink, self.deadline_s = event_sink, deadline_s
        self.provider_options = provider_options or {}
        self.latency_detection = latency_detection
        self._owner_id: str | None = None
        self._sink: PlaybackSink | None = None
        self._synth_wake = asyncio.Event()
        self._play_wake = asyncio.Event()
        self._idle = asyncio.Event()
        self._idle.set()
        self._synth_task: asyncio.Task | None = None
        self._play_task: asyncio.Task | None = None
        # shortcut: keep pending audio in memory; spool it if long playback backlogs become common.
        self._ready: dict[str, tuple[TtsJob, SynthesisResult, int]] = {}
        self._order = 0
        self._closed = False
        self._attachment = 0

    def attach(self, owner_id: str, playback_sink: PlaybackSink) -> bool:
        if self._closed or not owner_id or (self._owner_id is not None and self._owner_id != owner_id):
            return False
        self._owner_id, self._sink = owner_id, playback_sink
        self._attachment += 1
        self._play_wake.set()
        self._start()
        return True

    def detach(self, owner_id: str) -> bool:
        if self._closed or self._owner_id != owner_id:
            return False
        self.queue.owner_lost(owner_id)
        self._owner_id = self._sink = None
        self._attachment += 1
        self._play_wake.set()
        return True

    def translation_committed(self, payload: dict[str, Any]) -> bool:
        text = payload.get("text")
        commit_id = payload.get("commit_id")
        if not isinstance(text, str) or not text.strip() or not isinstance(commit_id, str):
            return False
        self._order += 1
        job = TtsJob(
            translation_commit_id=commit_id,
            translation_id=str(payload.get("translation_id", "")),
            segment_id=str(payload.get("segment_id", "")),
            target_revision=int(payload.get("target_revision", 1)),
            target_language=str(payload.get("target_language", "")),
            order_index=self._order,
            text=text,
            model_id=self.model_id,
            voice=self.voice,
            origin_epoch=self.epoch,
        )
        accepted = self.queue.enqueue(job)
        if accepted:
            if self.event_sink:
                notified = self.event_sink("synthesis_state", self._state(job, "queued"))
                if inspect.isawaitable(notified):
                    asyncio.ensure_future(notified)
            self._idle.clear()
            self._synth_wake.set()
            self._play_wake.set()
            self._start()
        return accepted

    def _start(self) -> None:
        if self._synth_task is None:
            self._synth_task = asyncio.create_task(self._synthesize())
            self._play_task = asyncio.create_task(self._play())

    async def _synthesize(self) -> None:
        while not self._closed:
            self._synth_wake.clear()
            job = self.queue.begin_next()
            if job is None:
                await self._synth_wake.wait()
                continue
            try:
                await self._emit("synthesis_state", self._state(job, "running"))
                started = unix_ms() if self.latency_detection and job.origin_epoch == self.epoch else None
                result = await asyncio.wait_for(self.gateway.synthesize(
                    CallContext(operation=Operation.SYNTHESIZE, task_id=job.job_id,
                                pipeline_id=self.pipeline_id, epoch=self.epoch,
                                deadline=time.monotonic() + self.deadline_s, provider_options=self.provider_options),
                    text=job.text, voice=job.voice,
                    request=MatchRequest(operation=Operation.SYNTHESIZE, model_id=job.model_id,
                                         target_language=job.target_language, required_outputs=["speech"]),
                ), timeout=self.deadline_s)
                samples = sum(len(chunk.pcm) // (2 * chunk.channels) for chunk in result.chunks)
                if samples <= 0:
                    raise ValueError("Synthesis returned no audio")
            except Exception:
                if self.queue.fail(job.job_id, attempt=job.synthesis_attempt) and job.synthesis_attempt < 2:
                    self.queue.retry(job.job_id)
                self._play_wake.set()
                continue
            if self.queue.mark_ready(job.job_id, job.synthesis_attempt):
                self._ready[job.job_id] = (job, result, samples)
                if started is not None and job.origin_epoch == self.epoch:
                    ready = unix_ms()
                    fields = {"segment_id": job.segment_id, "provider": job.model_id, "audio_stream_id": job.job_id}
                    await self._emit("latency_observation", {**fields, "kind": "synthesis_started", "at_ms": started})
                    await self._emit("latency_observation", {**fields, "kind": "audio_ready", "at_ms": ready})
                await self._emit("synthesis_state", self._state(job, "complete"))
                self._play_wake.set()

    async def _play(self) -> None:
        last_blocked = None
        while not self._closed:
            self._play_wake.clear()
            blocked = self.queue.blocked_job()
            if blocked:
                state, job = blocked
                key = (state, job.job_id, job.synthesis_attempt, self._attachment)
                if key != last_blocked:
                    await self._emit("synthesis_state" if state == "failed" else "playback_state",
                                     self._state(job, state))
                    last_blocked = key
                    continue
            else:
                last_blocked = None
            if blocked or not self.queue.has_unfinished():
                self._idle.set()
            owner, sink = self._owner_id, self._sink
            ready_id = self.queue.ready_job_id()
            if owner is not None and sink is not None and ready_id is not None:
                job, result, samples = self._ready[ready_id]
                claim = self.queue.claim(ready_id, owner, samples, attempt=job.synthesis_attempt)
                if claim is not None:
                    del self._ready[ready_id]
                    attachment = self._attachment
                    try:
                        await sink(PlaybackGrant(job, claim, result))
                    except Exception:
                        if attachment == self._attachment:
                            self.queue.owner_lost(owner)
                    continue
            await self._play_wake.wait()

    def ack(self, job_id: str, owner_id: str, claim_id: str, generation: int,
            state: str, played_sample_offset: int = 0) -> bool:
        if self._closed:
            return False
        accepted = self.queue.ack(job_id, owner_id, claim_id, generation, state, played_sample_offset)
        if accepted and state in ("finished", "interrupted", "unknown"):
            self._play_wake.set()
        return accepted

    def pause(self) -> int:
        generation = self.queue.pause()
        self._play_wake.set()
        return generation

    def resume(self) -> None:
        self.queue.resume()
        self._synth_wake.set()
        self._play_wake.set()

    def resolve_failure(self, job_id: str, *, retry: bool) -> bool:
        if self._closed:
            return False
        blocked = self.queue.blocked_job()
        if blocked is None or blocked[1].job_id != job_id:
            return False
        accepted = self.queue.retry(job_id) if retry else self.queue.skip(job_id)
        if accepted:
            asyncio.create_task(self._emit("synthesis_state", self._state(blocked[1], "queued" if retry else "cancelled")))
            if self.queue.has_unfinished():
                self._idle.clear()
            else:
                self._idle.set()
            self._synth_wake.set()
            self._play_wake.set()
            self._start()
        return accepted

    def stop(self) -> int:
        self._closed = True
        generation = self.queue.stop()
        self._ready.clear()
        self._idle.set()
        for task in (self._synth_task, self._play_task):
            if task:
                task.cancel()
        return generation

    async def wait_idle(self) -> None:
        await self._idle.wait()

    async def _emit(self, name: str, payload: dict[str, Any]) -> None:
        if self.event_sink:
            result = self.event_sink(name, payload)
            if inspect.isawaitable(result):
                await result

    @staticmethod
    def _state(job: TtsJob, state: str) -> dict[str, Any]:
        return {"job_id": job.job_id, "translation_id": job.translation_id,
                "synthesis_attempt": max(1, job.synthesis_attempt), "state": state}

    async def close(self) -> None:
        self.stop()
        try:
            outcomes = await asyncio.gather(*(task for task in (self._synth_task, self._play_task) if task),
                                            return_exceptions=True)
            for outcome in outcomes:
                if isinstance(outcome, BaseException) and not isinstance(outcome, asyncio.CancelledError):
                    raise outcome
        finally:
            self.queue.close()
