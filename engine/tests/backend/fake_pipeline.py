"""Fake provider pipeline used to drive the full protocol chain without models.

M01 requires a fake Provider exercising start → events → pause/resume → stop
including stale callbacks and shutdown. The fake emits a deterministic source
revision trajectory (doc 04 §11) through the real SessionEventLog, so contract
tests cover the reducer/fanout/replay path that production pipelines will use.

The fixture consumes no audio and calls no models.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from uuid import uuid4

from nola_translator_engine.backend.contracts import ErrorPayload
from nola_translator_engine.backend.sessions import Session

#: Deterministic revision trajectory: draft → stable growth → commit.
_TRAJECTORY = [
    ("draft", "I scream", None),
    ("draft", "ice cream is", None),
    ("stable", "ice cream is very", 9),
    ("stable", "ice cream is very good", 9),
]
_FINAL_TEXT = "Ice cream is very good."


@dataclass
class FakePipeline:
    """One scripted utterance per start; cancelled tasks never emit late."""

    session: Session
    _task: asyncio.Task | None = field(default=None, repr=False)
    _stopped: asyncio.Event = field(default_factory=asyncio.Event, repr=False)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._stopped.clear()
            self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        log = self.session._log
        utterance_id = str(uuid4())
        segment_id = str(uuid4())
        try:
            for revision, (state, text, stable_end) in enumerate(_TRAJECTORY, start=1):
                await asyncio.sleep(0)  # yield so stop can interleave
                if self._stopped.is_set():
                    return
                self.session.source_revision_watermark = max(
                    self.session.source_revision_watermark, revision
                )
                log.submit(
                    "source_text",
                    {
                        "utterance_id": utterance_id,
                        "segment_id": segment_id,
                        "segment_index": 0,
                        "source_revision": revision,
                        "text": text,
                        "text_state": state,
                        "stable_end_offset": stable_end if stable_end is not None else 0,
                        "language": "en",
                        "timing_quality": "segment",
                        "quality_flags": [],
                    },
                )
            if self._stopped.is_set():
                return
            commit_id = str(uuid4())
            revision = len(_TRAJECTORY) + 1
            log.submit(
                "source_text",
                {
                    "utterance_id": utterance_id,
                    "segment_id": segment_id,
                    "segment_index": 0,
                    "source_revision": revision,
                    "text": _FINAL_TEXT,
                    "text_state": "committed",
                    "stable_end_offset": len(_FINAL_TEXT),
                    "language": "en",
                    "timing_quality": "segment",
                    "quality_flags": [],
                },
            )
            log.submit(
                "source_committed",
                {
                    "commit_id": commit_id,
                    "segment_id": segment_id,
                    "segment_index": 0,
                    "utterance_id": utterance_id,
                    "source_revision": revision,
                    "text": _FINAL_TEXT,
                    "language": "en",
                    "boundary_reason": "hard_silence",
                    "cutoff_sample": 48000,
                    "timing_quality": "segment",
                    "quality_flags": [],
                },
            )
        except asyncio.CancelledError:
            # Stale callback contract: a cancelled pipeline emits nothing more.
            raise

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def pause(self) -> None:
        # Fake input stops producing; committed work stays queued.
        self._stopped.set()
        if self._task is not None and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    def resume(self) -> None:
        self.start()


class FakePipelineRegistry:
    """Installs fake pipelines as the SessionManager command effect."""

    def __init__(self) -> None:
        self._pipelines: dict[object, FakePipeline] = {}

    def effect(self, session: Session, command) -> "asyncio.Future[str]":
        loop = asyncio.get_running_loop()
        future: asyncio.Future[str] = loop.create_future()

        async def _apply() -> None:
            try:
                future.set_result(await self._apply(session, command))
            except Exception as error:  # surface as a failed prepare
                session.last_error = ErrorPayload(
                    code="INTERNAL_ERROR",
                    stage="pipeline",
                    message_key="pipeline.fakeFailed",
                    safe_details={"exception": type(error).__name__},
                )
                future.set_result("failed")

        loop.create_task(_apply())
        return future

    async def _apply(self, session: Session, command) -> str:
        kind = command.type
        if kind == "start":
            pipeline = self._pipelines.get(session.session_id)
            if pipeline is None:
                pipeline = FakePipeline(session=session)
                self._pipelines[session.session_id] = pipeline
            session.pipeline_handle = pipeline
            pipeline.start()
            # Fake prepare completes synchronously: models are not real.
            return "running"
        if kind == "pause":
            pipeline = self._pipelines.get(session.session_id)
            if pipeline is not None:
                await pipeline.pause()
            return "paused"
        if kind == "resume":
            pipeline = self._pipelines.get(session.session_id)
            if pipeline is not None:
                pipeline.resume()
            return "running"
        if kind == "stop":
            pipeline = self._pipelines.pop(session.session_id, None)
            if pipeline is not None:
                await pipeline.stop()
            session.pipeline_handle = None
            return "closed"
        if kind in ("reset_stream", "switch_pipeline"):
            pipeline = self._pipelines.get(session.session_id)
            if pipeline is not None:
                await pipeline.stop()
                pipeline.start()
            return session.state
        return session.state

    async def shutdown(self) -> None:
        for pipeline in list(self._pipelines.values()):
            await pipeline.stop()
        self._pipelines.clear()
