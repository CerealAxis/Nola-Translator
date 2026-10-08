"""Streaming caption scheduler: cumulative block recognition, single-flight merging, stale-result dropping.

The scheduler itself is model-agnostic. Every block re-transcribes the *whole* accumulated
audio, and ``prefix_builder`` decides whether the model also gets a continuation hint —
autoregressive models (Qwen3-ASR) use it for prefix rollback, non-autoregressive ones
(SenseVoice) don't, so each block is a standalone whole-segment transcription.
"""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray

from ..audio.resample import AudioFrame
from .base import RecognitionUpdate, Transcriber
from .volume_gate import SegmentSnapshot, VolumeGateSegment, VolumeGateSegmenter


@dataclass(frozen=True, slots=True)
class _Job:
    segment_id: str
    generation: int
    is_final: bool
    samples: NDArray[np.float32]
    prefix: str | None
    language: str | None
    started_at_ms: float
    ended_at_ms: float | None


@dataclass(slots=True)
class _SegmentState:
    segment_id: str
    started_at_ms: float
    last_dispatch_end_ms: float
    next_generation: int = 0
    blocks_dispatched: int = 0
    finalized: bool = False
    final_done: bool = False
    emitted_generation: int = -1
    revision: int = -1
    last_completed_text: str = ""
    last_nonempty_text: str = ""
    language: str | None = None


class StreamingRecognizer:
    """Volume-gated segmentation plus cumulative block transcription.

    All inference runs on one background asyncio worker: FINAL outranks INTERMEDIATE,
    and INTERMEDIATE jobs for a segment collapse to the newest snapshot per segment_id.
    An in-flight intermediate is shown even when the segment has already been closed;
    stale results are dropped once the final one has landed. ``accept()`` only enqueues
    and collects — it never blocks waiting on inference.

    The model loads lazily on the first job's thread. Load failures such as
    ``ModelUnavailable`` have no protocol error channel, so they propagate straight out
    of ``accept()``/``flush()``, where runtime.py maps them to a ``modelUnavailable``
    error event.
    """

    def __init__(
        self,
        runtime: Transcriber,
        *,
        source_language: str | None = None,
        segmenter: VolumeGateSegmenter | None = None,
        block_ms: int = 2000,
        first_block_ms: int | None = None,
        prefix_builder: Callable[[str], str | None] | None = None,
        prefix_after_blocks: int = 0,
        run_transcribe: Callable[[_Job], Awaitable[tuple[str, str | None]]] | None = None,
        on_update: Callable[[RecognitionUpdate], Awaitable[None]] | None = None,
    ) -> None:
        self.runtime = runtime
        self.segmenter = segmenter if segmenter is not None else VolumeGateSegmenter()
        self.block_ms = block_ms
        self.first_block_ms = first_block_ms if first_block_ms is not None else block_ms
        self._prefix_builder = prefix_builder
        self._prefix_after_blocks = prefix_after_blocks
        self._forced_language = (
            source_language if source_language not in (None, "", "auto") else None
        )
        self._run_transcribe = run_transcribe
        self.on_update = on_update

        self._states: dict[str, _SegmentState] = {}
        self._current: _SegmentState | None = None
        self._pending_finals: deque[_Job] = deque()
        self._pending_intermediates: dict[str, _Job] = {}
        self._ready: deque[RecognitionUpdate] = deque()
        self._worker: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()
        self._idle = asyncio.Event()
        self._idle.set()
        self._pending_error: Exception | None = None
        #: Dispatch and delivery counters behind the `asr.*` diagnostic lines. A recognizer that
        #: never dispatches a job and one whose jobs all return empty text are the same silence
        #: from the outside, so both sides are counted.
        self.blocks_dispatched = 0
        self.updates_produced = 0
        self.empty_updates = 0

    def stats(self) -> dict[str, int]:
        stats: dict[str, int] = {
            "blocksDispatched": self.blocks_dispatched,
            "updatesProduced": self.updates_produced,
            "emptyUpdates": self.empty_updates,
        }
        segmenter = self.segmenter
        if hasattr(segmenter, "stats"):
            stats.update(segmenter.stats())
        return stats

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        """Feed one frame: enqueue inference jobs and collect finished results, never blocking on inference."""
        if self._pending_error is not None:
            raise self._pending_error
        updates = self._feed(frame)
        for update in updates:
            self.updates_produced += 1
            if not update.source_text.strip():
                self.empty_updates += 1
        return updates

    def _feed(self, frame: AudioFrame) -> list[RecognitionUpdate]:

        for segment in self.segmenter.accept(frame):
            state = self._current if self._current is not None else self._new_state(segment.start_ms)
            self._finalize(state, segment, segment.end_ms)

        bounds = self.segmenter.current_bounds()
        if bounds is None:
            if self._current is not None:
                # the MIN_VOICED rule dropped this segment, so it produces no job at all
                self._drop_current()
        else:
            state = (
                self._current
                if self._current is not None
                else self._new_state(bounds[0])
            )
            # audio is concatenated only when an inference job is actually due; the block clock is the audio clock.
            interval_ms = self.first_block_ms if state.blocks_dispatched == 0 else self.block_ms
            if bounds[1] - state.last_dispatch_end_ms >= interval_ms:
                snapshot = self.segmenter.current_segment()
                if snapshot is not None:
                    self._dispatch_intermediate(state, snapshot)
        return self._drain()

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        """Force the current segment closed, transcribe its tail, wait for the worker to
        drain, and return undelivered results.
        """
        if self._pending_error is not None:
            raise self._pending_error

        for segment in self.segmenter.flush():
            state = (
                self._current
                if self._current is not None
                else self._new_state(segment.start_ms)
            )
            self._finalize(state, segment, ended_at_ms)
        if self.segmenter.current_segment() is None and self._current is not None:
            self._drop_current()

        await self._wait_idle()
        if self._pending_error is not None:
            raise self._pending_error
        return self._drain()

    async def close(self) -> None:
        """Cancel the background worker and clear all state."""
        task = self._worker
        self._worker = None
        if task is not None:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
        self._states.clear()
        self._current = None
        self._pending_finals.clear()
        self._pending_intermediates.clear()
        self._ready.clear()

    def _new_state(self, started_at_ms: float) -> _SegmentState:
        state = _SegmentState(
            segment_id=f"segment-{uuid4()}",
            started_at_ms=started_at_ms,
            last_dispatch_end_ms=started_at_ms,
        )
        self._states[state.segment_id] = state
        self._current = state
        return state

    def _drop_current(self) -> None:
        state = self._current
        if state is None:
            return
        self._states.pop(state.segment_id, None)
        self._pending_intermediates.pop(state.segment_id, None)
        self._current = None

    def _prefix_for(self, state: _SegmentState) -> str | None:
        if self._prefix_builder is None:
            return None
        if state.blocks_dispatched < self._prefix_after_blocks:
            return None
        if not state.last_completed_text:
            return None
        return self._prefix_builder(state.last_completed_text)

    def _next_job_meta(self, state: _SegmentState) -> tuple[int, str | None]:
        prefix = self._prefix_for(state)
        generation = state.next_generation
        state.next_generation += 1
        state.blocks_dispatched += 1
        self.blocks_dispatched += 1
        return generation, prefix

    def _dispatch_intermediate(
        self, state: _SegmentState, snapshot: SegmentSnapshot
    ) -> None:
        generation, prefix = self._next_job_meta(state)
        state.last_dispatch_end_ms = snapshot.end_ms
        self._submit(
            _Job(
                segment_id=state.segment_id,
                generation=generation,
                is_final=False,
                samples=snapshot.samples,
                prefix=prefix,
                language=self._forced_language,
                started_at_ms=state.started_at_ms,
                ended_at_ms=None,
            )
        )

    def _finalize(self, state: _SegmentState, segment: VolumeGateSegment, ended_at_ms: float) -> None:
        if state.finalized:
            return
        state.finalized = True
        self._pending_intermediates.pop(state.segment_id, None)
        generation, prefix = self._next_job_meta(state)
        if self._current is state:
            self._current = None
        self._submit(
            _Job(
                segment_id=state.segment_id,
                generation=generation,
                is_final=True,
                samples=segment.samples,
                prefix=prefix,
                language=self._forced_language,
                started_at_ms=state.started_at_ms,
                ended_at_ms=ended_at_ms,
            )
        )

    def _submit(self, job: _Job) -> None:
        if job.is_final:
            self._pending_finals.append(job)
            self._pending_intermediates.pop(job.segment_id, None)
        else:
            self._pending_intermediates[job.segment_id] = job
        self._idle.clear()
        self._wake.set()
        if self._worker is None:
            self._worker = asyncio.create_task(self._work_loop(), name="asr-worker")

    def _pop_job(self) -> _Job | None:
        if self._pending_finals:
            return self._pending_finals.popleft()
        if self._pending_intermediates:
            segment_id = next(iter(self._pending_intermediates))
            return self._pending_intermediates.pop(segment_id)
        return None

    async def _work_loop(self) -> None:
        while True:
            self._wake.clear()
            self._idle.clear()
            job = self._pop_job()
            while job is not None:
                await self._process(job)
                job = self._pop_job()
            self._idle.set()
            await self._wake.wait()

    async def _process(self, job: _Job) -> None:
        try:
            text, language = await self._run(job)
        except Exception as error:
            # the protocol has no error channel: stash it for accept()/flush() to raise (includes ModelUnavailable)
            self._pending_error = error
            return

        state = self._states.get(job.segment_id)
        if state is None:
            return
        if job.is_final:
            if state.final_done:
                return
            state.final_done = True
            update = self._emit(
                state, text, language, is_final=True, ended_at_ms=job.ended_at_ms
            )
            self._states.pop(job.segment_id, None)
        else:
            if state.final_done or job.generation <= state.emitted_generation:
                # an intermediate already in flight is still shown, even if silence then closed the segment.
                return
            update = self._emit(state, text, language, is_final=False, ended_at_ms=None)
            if update is not None:
                state.emitted_generation = job.generation
        if update is not None:
            if self.on_update is None:
                self._ready.append(update)
            else:
                try:
                    await self.on_update(update)
                except Exception as error:
                    self._pending_error = error

    def _emit(
        self,
        state: _SegmentState,
        text: str,
        language: str | None,
        *,
        is_final: bool,
        ended_at_ms: float | None,
    ) -> RecognitionUpdate | None:
        clean = (text or "").strip()
        if self._forced_language is not None:
            resolved = self._forced_language
        else:
            if language:
                state.language = language
            resolved = state.language
        if clean:
            state.last_completed_text = clean
            state.last_nonempty_text = clean
        elif is_final and state.last_nonempty_text:
            # when the segment already has text, an empty final carries the last text so the caption can close cleanly
            clean = state.last_nonempty_text
        else:
            return None
        state.revision += 1
        return RecognitionUpdate(
            segment_id=state.segment_id,
            revision=state.revision,
            started_at_ms=state.started_at_ms,
            ended_at_ms=ended_at_ms,
            source_text=clean,
            language=resolved,
            is_final=is_final,
        )

    async def _run(self, job: _Job) -> tuple[str, str | None]:
        if self._run_transcribe is not None:
            return await self._run_transcribe(job)
        # the first job triggers runtime.load() on this thread (lazy load)
        return await asyncio.to_thread(
            self.runtime.transcribe,
            job.samples,
            prefix=job.prefix,
            language=job.language,
        )

    async def _wait_idle(self) -> None:
        if self._worker is None:
            return
        await self._idle.wait()

    def _drain(self) -> list[RecognitionUpdate]:
        if not self._ready:
            return []
        updates = list(self._ready)
        self._ready.clear()
        return updates
