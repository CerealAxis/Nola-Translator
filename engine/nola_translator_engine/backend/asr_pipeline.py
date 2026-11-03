"""Windowed ASR over canonical PCM, with separate hypotheses and commits."""

import asyncio
from collections import OrderedDict, deque
from dataclasses import dataclass, field, replace
from time import monotonic
from uuid import uuid4

import numpy as np

from ..audio.resample import AudioFrame
from ..recognition.base import create_cloud_recognizer
from ..recognition.volume_gate import SileroVadSegmenter
from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.gateway import MatchRequest
from .gateway.operations import AsrObservation
from .latency import unix_ms
from .source_agreement import SourceAgreement


@dataclass
class _CloudSegment:
    segment_id: str
    index: int
    agreement: SourceAgreement = field(default_factory=SourceAgreement)
    boundary_reported: bool = False


class CloudAsrPipeline:
    def __init__(self, session, config, emit, *, latency_detection=False):
        self.session = session
        self.emit = emit
        self.final_only = config.recognitionProvider == "minimax"
        self.latency_detection = latency_detection
        self.recognizer = create_cloud_recognizer(config, latency_detection=latency_detection)
        self.recognizer.on_update = self._update
        self.recognizer.on_error = self._on_error
        self.error = None
        self.segments = OrderedDict()
        self.index = 0
        self.end_sample = 0

    def _on_error(self, error):
        self.error = error

    def check(self):
        if self.error is not None:
            raise self.error

    async def prepare(self):
        if self.final_only:
            await asyncio.to_thread(self.recognizer.prepare)
        await self.recognizer.start()

    async def accept(self, frame, start_sample):
        self.check()
        self.end_sample = start_sample + frame.samples.size
        for update in await self.recognizer.accept(AudioFrame(frame.samples, start_sample / 16)):
            await self._update(update)

    async def finish(self):
        for update in await self.recognizer.flush(self.end_sample / 16):
            await self._update(update)
        self.check()

    async def close(self):
        await self.recognizer.close()

    async def _update(self, update):
        if self.final_only and not update.is_final:
            return
        segment = self.segments.get(update.segment_id)
        if segment is None:
            segment = _CloudSegment(str(uuid4()), self.index)
            self.segments[update.segment_id] = segment
            self.index += 1
            if len(self.segments) > 512:
                self.segments.popitem(last=False)
        segment_id, agreement = segment.segment_id, segment.agreement
        before = agreement.snapshot
        if before.committed:
            return
        if self.latency_detection and update.boundary_at_ms is not None and not segment.boundary_reported:
            segment.boundary_reported = True
            self.emit("latency_observation", {
                "kind": "segment_boundary", "at_ms": update.boundary_at_ms, "segment_id": segment_id,
            })
        after = agreement.commit(update.source_text) if update.is_final else agreement.observe(
            AsrObservation(update.source_text), self.end_sample,
        )
        if after is before:
            return
        start = max(0, round(update.started_at_ms * 16))
        end = max(start, self.end_sample if update.ended_at_ms is None else round(update.ended_at_ms * 16))
        payload = {
            "segment_id": segment_id, "utterance_id": segment_id, "segment_index": segment.index,
            "source_revision": after.revision, "text": after.text,
            "language": update.language or self.session.config.source_language,
            "audio_span": {"start_sample": start, "end_sample": end},
            "timing_quality": "estimated" if update.ended_at_ms is None else "segment",
        }
        self.session.source_revision_watermark += 1
        self.emit("source_text", {
            **payload, "text_state": "committed" if after.committed else "stable" if after.stable_end else "draft",
            "stable_end_offset": after.stable_end,
        })
        if after.committed:
            self.emit("source_committed", {
                **payload, "commit_id": segment_id, "boundary_reason": "model_final", "cutoff_sample": end,
            })


@dataclass(frozen=True)
class _FinalJob:
    segment: object
    reason: str
    flags: tuple[str, ...]
    agreement: SourceAgreement
    segment_id: str
    utterance_id: str
    segment_index: int
    language: str
    epoch: int


@dataclass(frozen=True)
class _PreviewJob:
    segment: object
    watermark: int
    agreement: SourceAgreement
    segment_id: str
    utterance_id: str
    segment_index: int
    language: str
    epoch: int
    segment_generation: int
    request_revision: int


class AsrPipeline:
    def __init__(self, session, gateway, emit, *, segmenter=None, latency_detection=False):
        self.session = session
        self.gateway = gateway
        self.emit = emit
        self.latency_detection = latency_detection
        self.gate = segmenter or SileroVadSegmenter(
            silence_end_ms=session.config.silence_end_ms, max_segment_ms=session.config.max_segment_ms,
            min_voiced_ms=120,
        )
        self.segment_index = 0
        self.next_sample = None
        self.speaker_embedder = None
        self.speaker_profiles = {}
        self.last_speaker = None
        self.speaker_revision = 0
        self._final_jobs = deque()
        self._max_pending_finals = 8
        self._pending_preview = None
        self._preview_revision = 0
        self._segment_generation = 0
        self._wake = asyncio.Event()
        self._worker_task = None
        self._worker_error = None
        self._finishing = False
        self._closed = False
        self._speaker_boundary_ms = -1.0
        self._next_speaker_probe_ms = 0.0
        self._reset_segment()

    def _reset_segment(self, *, continue_utterance=False):
        self._segment_generation += 1
        self._preview_revision += 1
        self._pending_preview = None
        self.agreement = SourceAgreement()
        self.segment_id = str(uuid4())
        if not continue_utterance:
            self.utterance_id = self.segment_id
        self.last_preview = None
        self.language = self.session.config.source_language

    async def prepare(self):
        instance, lease, _, _ = await self.gateway.acquire(self._request())
        try:
            await asyncio.to_thread(self.gate.load)
            from ..recognition.speaker import SpeakerEmbedder, SpeakerInstallationError

            try:
                self.speaker_embedder = await asyncio.to_thread(SpeakerEmbedder)
            except SpeakerInstallationError as error:
                raise GatewayError(
                    GatewayErrorCode.MODEL_INTEGRITY, stage="speaker",
                    message="Bundled speaker detector could not be initialized",
                ) from error
        finally:
            await self.gateway.release(instance, lease)

    def _request(self):
        config = self.session.config
        return MatchRequest(
            operation=Operation.TRANSCRIBE, source_language=config.source_language,
            model_id=config.pipeline.asr_model,
        )

    async def accept(self, frame, start_sample, *, allow_preview=True):
        self.check()
        if self._closed or self._finishing:
            return
        if self.next_sample is not None and self.next_sample != start_sample:
            for segment in self.gate.flush():
                self._queue_final(segment, "input_end", flags=("audio_gap",))
        self.next_sample = start_sample + frame.samples.size
        for segment in self.gate.accept(AudioFrame(frame.samples, start_sample / 16)):
            duration = segment.end_ms - segment.start_ms
            reason = "forced_duration" if duration >= self.gate.max_segment_ms else "hard_silence"
            self._queue_final(segment, reason)
        snapshot = self.agreement.snapshot
        stable_text = snapshot.text[:snapshot.stable_end]
        if stable_text == snapshot.text and stable_text.endswith((".", "!", "?", "。", "！", "？")):
            segment = self.gate.close_on_silence(500)
            if segment is not None:
                self._queue_final(segment, "soft_silence_boundary")
        bounds = self.gate.current_bounds()
        if bounds and allow_preview and self.speaker_embedder and bounds[1] >= self._next_speaker_probe_ms:
            self._next_speaker_probe_ms = bounds[1] + 300
            if await self._split_on_speaker_change():
                bounds = self.gate.current_bounds()
        if not allow_preview:
            self._preview_revision += 1
            self._pending_preview = None
            return
        if allow_preview and bounds and bounds[1] - bounds[0] >= 500 and (
            self.last_preview is None or bounds[1] - self.last_preview >= 650
        ):
            segment = self.gate.current_segment()
            self.last_preview = bounds[1]
            self._pending_preview = _PreviewJob(
                segment=segment,
                watermark=round(bounds[1] * 16),
                agreement=self.agreement,
                segment_id=self.segment_id,
                utterance_id=self.utterance_id,
                segment_index=self.segment_index,
                language=self.language,
                epoch=self.session.epoch,
                segment_generation=self._segment_generation,
                request_revision=self._preview_revision,
            )
            self._wake_worker()

    async def _split_on_speaker_change(self) -> bool:
        candidate = self.gate.speaker_boundary(self._speaker_boundary_ms)
        if candidate is None:
            return False
        index, boundary_ms, previous, current = candidate
        self._speaker_boundary_ms = boundary_ms
        embedder = self.speaker_embedder
        first, second = await asyncio.to_thread(lambda: (embedder.embed(previous), embedder.embed(current)))
        # Require both an acoustic pause and a strong embedding disagreement.
        if first is None or second is None or float(first @ second) > 0.35:
            return False
        self._queue_final(self.gate.split_at_frame(index), "speaker_change")
        return True

    async def finish(self):
        if self._closed:
            return
        self._finishing = True
        self._preview_revision += 1
        self._pending_preview = None
        for segment in self.gate.flush():
            self._queue_final(segment, "input_end")
        self._wake_worker()
        if self._worker_task is not None:
            await self._worker_task
        self.check()

    async def close(self):
        """Fence and cancel outstanding inference during immediate session stop."""

        if self._closed:
            return
        self._closed = True
        self._segment_generation += 1
        self._preview_revision += 1
        self._pending_preview = None
        self._final_jobs.clear()
        task, self._worker_task = self._worker_task, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def dispatch(self):
        """Wake background recognition without waiting for model inference."""

        self.check()
        self._wake_worker()

    def check(self):
        """Surface background inference failures from the realtime consumer loop."""

        if self._worker_error is not None:
            raise self._worker_error
        task = self._worker_task
        if task is not None and task.done() and not task.cancelled():
            error = task.exception()
            if error is not None:
                self._worker_error = error
                raise error

    def _queue_final(self, segment, reason, *, flags=()):
        if len(self._final_jobs) >= self._max_pending_finals:
            error = GatewayError(
                GatewayErrorCode.RESOURCE_EXHAUSTED,
                stage="asr",
                message="final recognition queue is full",
                fatal_scope="session",
            )
            self._worker_error = error
            raise error
        self._final_jobs.append(_FinalJob(
            segment=segment,
            reason=reason,
            flags=tuple(flags),
            agreement=self.agreement,
            segment_id=self.segment_id,
            utterance_id=self.utterance_id,
            segment_index=self.segment_index,
            language=self.language,
            epoch=self.session.epoch,
        ))
        if self.latency_detection:
            self.emit("latency_observation", {
                "kind": "segment_boundary", "at_ms": unix_ms(), "segment_id": self.segment_id,
            })
        self.segment_index += 1
        self._reset_segment(continue_utterance=reason == "forced_duration")
        self._wake_worker()

    def _wake_worker(self):
        if self._closed or self._worker_error is not None:
            return
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._run_worker())
        self._wake.set()

    async def _run_worker(self):
        try:
            while not self._closed:
                if self._final_jobs:
                    await self._finalize(self._final_jobs.popleft())
                    continue
                if self._pending_preview is not None and not self._finishing:
                    job, self._pending_preview = self._pending_preview, None
                    await self._run_preview(job)
                    continue
                if self._finishing:
                    return
                self._wake.clear()
                await self._wake.wait()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._worker_error = error

    async def _run_preview(self, job):
        try:
            observation = await self._recognize(job.segment, 3, epoch=job.epoch)
        except GatewayError as error:
            if error.code == GatewayErrorCode.TIMEOUT:
                return
            raise
        if (
            self._closed
            or job.segment_generation != self._segment_generation
            or job.request_revision != self._preview_revision
            or job.epoch != self.session.epoch
        ):
            return
        previous = job.agreement.snapshot
        snapshot = job.agreement.observe(observation, job.watermark)
        language = job.language
        if observation.language and observation.language != language:
            language = observation.language
            if snapshot == previous:
                snapshot = job.agreement.snapshot = replace(snapshot, revision=snapshot.revision + 1)
        if snapshot != previous:
            self._publish(
                snapshot, self._span(job.segment), segment_id=job.segment_id,
                utterance_id=job.utterance_id, segment_index=job.segment_index,
                language=language,
            )

    async def _recognize(self, segment, timeout, *, epoch=None):
        samples = np.clip(segment.samples * 32768, -32768, 32767).astype("<i2")
        session = self.session
        ctx = CallContext(
            Operation.TRANSCRIBE, str(uuid4()), session_id=session.session_id,
            pipeline_id=str(session.pipeline_id), epoch=session.epoch if epoch is None else epoch,
            deadline=monotonic() + timeout,
        )
        return await self.gateway.transcribe(
            ctx, audio=samples.tobytes(), language=session.config.source_language,
            request=self._request(),
        )

    async def _finalize(self, job):
        try:
            observation = await self._recognize(job.segment, 3, epoch=job.epoch)
            text = observation.text
            language = observation.language or job.language
        except GatewayError as error:
            if error.code != "TIMEOUT":
                raise
            text = job.agreement.snapshot.text
            language = job.language
            job = replace(job, flags=(*job.flags, "finalization_timeout"))
        span = self._span(job.segment)
        speaker_id = await self._identify_speaker(job.segment.samples, span, segment_id=job.segment_id) if text.strip() else None
        self._publish(
            job.agreement.commit(text), span,
            reason=job.reason if text.strip() else "empty_suppressed",
            flags=job.flags, speaker_id=speaker_id, segment_id=job.segment_id,
            utterance_id=job.utterance_id, segment_index=job.segment_index,
            language=language,
        )

    async def _identify_speaker(self, samples, span, *, segment_id=None):
        if self.speaker_embedder is None or samples.size < 32_000:
            return None

        def embeddings():
            return self.speaker_embedder.embed(samples[-32_000:-8_000]), self.speaker_embedder.embed(samples[-24_000:])

        first, second = await asyncio.to_thread(embeddings)
        if first is None or second is None:
            return None
        similarity = float(first @ second)
        # These thresholds favor an unknown label when a speaker match is ambiguous.
        if similarity < 0.75:
            return None
        scores = sorted(
            ((min(float(first @ profile), float(second @ profile)), key)
             for key, profile in self.speaker_profiles.items()), reverse=True,
        )
        if scores and scores[0][0] >= 0.75:
            if len(scores) > 1 and scores[0][0] - scores[1][0] < 0.08:
                return None
            speaker_id = scores[0][1]
            confidence = scores[0][0]
            average = self.speaker_profiles[speaker_id] * 3 + second
            self.speaker_profiles[speaker_id] = average / np.linalg.norm(average)
        elif (not scores or scores[0][0] < 0.45) and len(self.speaker_profiles) < 32:
            speaker_id = str(uuid4())
            self.speaker_profiles[speaker_id] = second
            confidence = similarity
        else:
            return None
        if speaker_id != self.last_speaker:
            self.last_speaker = speaker_id
            self.speaker_revision += 1
            self.emit("speaker_changed", {
                "speaker_id": speaker_id, "segment_id": segment_id or self.segment_id,
                "speaker_metadata_revision": self.speaker_revision, "source": "local",
                "confidence": min(1.0, confidence), "span": span,
            })
        return speaker_id

    @staticmethod
    def _span(segment):
        return {"start_sample": round(segment.start_ms * 16), "end_sample": round(segment.end_ms * 16)}

    def _publish(
        self, snapshot, span, *, reason=None, flags=(), speaker_id=None,
        segment_id=None, utterance_id=None, segment_index=None, language=None,
    ):
        payload = {
            "segment_id": segment_id or self.segment_id,
            "utterance_id": utterance_id or self.utterance_id,
            "segment_index": self.segment_index if segment_index is None else segment_index,
            "source_revision": snapshot.revision,
            "text": snapshot.text, "language": language or self.language, "audio_span": span,
            "timing_quality": "segment", "quality_flags": flags,
            "speaker_id": speaker_id,
        }
        self.session.source_revision_watermark += 1
        state = "committed" if snapshot.committed else "stable" if snapshot.stable_end else "draft"
        self.emit("source_text", {
            **payload, "text_state": state, "stable_end_offset": snapshot.stable_end,
            "speaker_metadata_revision": self.speaker_revision if speaker_id else 0,
        })
        if reason:
            self.emit("source_committed", {
                **payload, "commit_id": payload["segment_id"], "boundary_reason": reason,
                "cutoff_sample": span["end_sample"],
            })
