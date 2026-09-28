"""Qwen 流式字幕调度：累计分块识别、前缀回退、单飞合并与过期结果丢弃。"""

from __future__ import annotations

import asyncio
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray

from ..audio.resample import AudioFrame
from .base import RecognitionUpdate
from .qwen_runtime import QwenRuntime, get_qwen_runtime
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


class QwenStreamingRecognizer:
    """Qwen 流式识别器：音量门断句 + 累计分块转写 + 官方前缀回退。

    推理全部在一个后台 asyncio worker 中执行：FINAL 优先于 INTERMEDIATE，同段
    INTERMEDIATE 按 segment_id 合并为最新快照；在飞的中间结果即使已定段也先显示，
    过期结果在最终结果完成后丢弃，
    ``accept()`` 只入队与收取结果，从不等待推理。

    模型在首个 job 的线程中惰性加载；``QwenModelUnavailable`` 等加载失败没有
    协议错误通道，会从 ``accept()``/``flush()`` 直接抛出，由 runtime.py 映射为
    ``modelUnavailable`` 错误事件。
    """

    def __init__(
        self,
        runtime: QwenRuntime,
        *,
        source_language: str | None = None,
        segmenter: VolumeGateSegmenter | None = None,
        block_ms: int = 2000,
        rollback_tokens: int = 5,
        run_transcribe: Callable[[_Job], Awaitable[tuple[str, str | None]]] | None = None,
        on_update: Callable[[RecognitionUpdate], Awaitable[None]] | None = None,
    ) -> None:
        self.runtime = runtime
        self.segmenter = segmenter if segmenter is not None else VolumeGateSegmenter()
        self.block_ms = block_ms
        self.rollback_tokens = rollback_tokens
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

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        """喂入一帧；只入队推理任务并收取已完成结果，绝不阻塞等待推理。"""
        if self._pending_error is not None:
            raise self._pending_error

        for segment in self.segmenter.accept(frame):
            state = self._current if self._current is not None else self._new_state(segment.start_ms)
            self._finalize(state, segment, segment.end_ms)

        bounds = self.segmenter.current_bounds()
        if bounds is None:
            if self._current is not None:
                # 段被 MIN_VOICED 规则丢弃：不产生任何 job
                self._drop_current()
        else:
            state = (
                self._current
                if self._current is not None
                else self._new_state(bounds[0])
            )
            # 只在真正需要发起推理时拼接音频；分块时钟使用音频时钟。
            if bounds[1] - state.last_dispatch_end_ms >= self.block_ms:
                snapshot = self.segmenter.current_segment()
                if snapshot is not None:
                    self._dispatch_intermediate(state, snapshot)
        return self._drain()

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        """强制结束当前段、执行尾音识别并等待 worker 排空，返回未投递的结果。"""
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
        """取消后台 worker 并清空全部状态。"""
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

    # ------------------------------------------------------------------ 内部

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
        # 官方 unfixed_chunk_num=2：前两块无前缀，之后回退末尾 5 个 token
        if state.blocks_dispatched < 2:
            return None
        if not state.last_completed_text:
            return None
        return (
            self.runtime.rollback_text(state.last_completed_text, self.rollback_tokens)
            or None
        )

    def _next_job_meta(self, state: _SegmentState) -> tuple[int, str | None]:
        prefix = self._prefix_for(state)
        generation = state.next_generation
        state.next_generation += 1
        state.blocks_dispatched += 1
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
            self._worker = asyncio.create_task(self._work_loop(), name="qwen-asr-worker")

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
            # 协议无错误通道：暂存后由 accept()/flush() 抛出（含 QwenModelUnavailable）
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
                # 仍在推理中的中间结果，即使随后静音定段，也先给用户显示。
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
            # 段已有文本时，空 final 携带最后文本以便字幕收尾
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
        # 首个 job 在线程中触发 runtime.load()（惰性加载）
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


def create_qwen_recognizer(
    model_dir: Path, *, source_language: str | None = None
) -> QwenStreamingRecognizer:
    """构造默认 Qwen 流式识别器；模型在首个 job 的线程中惰性加载。

    加载失败（QwenModelUnavailable）会从 accept()/flush() 抛出，由 runtime.py
    映射为 modelUnavailable 错误事件。
    """
    if Path(model_dir).name == "qwen3-asr-0.6b-hf":
        return QwenStreamingRecognizer(
            get_qwen_runtime(model_dir),
            source_language=source_language,
            segmenter=VolumeGateSegmenter(max_segment_ms=6000),
            block_ms=3000,
        )
    return QwenStreamingRecognizer(get_qwen_runtime(model_dir), source_language=source_language)
