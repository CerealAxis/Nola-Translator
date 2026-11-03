"""Map Qwen provider observations onto the realtime event contracts."""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from contextlib import suppress
from dataclasses import dataclass, field
from hashlib import sha256
from uuid import uuid4

import numpy as np

from ..audio.resample import AudioFrame, TARGET_SAMPLE_RATE
from .latency import unix_ms
from .s2s_provider import LANGUAGE_ALIASES, QwenS2SSession, S2SObservation, S2SProtocolError
from .sessions import Session

AudioSink = Callable[[S2SObservation, str | None, str | None], Awaitable[None]]
EventSink = Callable[[str, dict], object]
PROVIDER_LANGUAGE_ALIASES = {value: key for key, value in LANGUAGE_ALIASES.items()}


@dataclass
class SourceSegment:
    segment_id: str = field(default_factory=lambda: str(uuid4()))
    index: int = 0
    revision: int = 0
    speaker_id: str | None = None
    boundary_reported: bool = False


@dataclass
class TargetSegment:
    translation_id: str = field(default_factory=lambda: str(uuid4()))
    revision: int = 0


class S2SPipeline:
    def __init__(self, session: Session, provider: QwenS2SSession, emit: EventSink, *,
                 on_audio: AudioSink | None = None, latency_detection: bool = False) -> None:
        self.session = session
        self.provider = provider
        self.emit = emit
        self.on_audio = on_audio
        self.latency_detection = latency_detection
        self._epoch = session.epoch
        self._pipeline_id = session.pipeline_id
        self._closed = False
        self._origin: int | None = None
        self._next_sample: int | None = None
        self._sources: OrderedDict[str, SourceSegment] = OrderedDict()
        self._segment_index = 0
        self._speaker_revision = 0
        self._targets: dict[str, dict[str, TargetSegment]] = {}
        self.receiver = asyncio.create_task(self._receive())

    def _current(self) -> bool:
        return not self._closed and self.session.epoch == self._epoch and self.session.pipeline_id == self._pipeline_id

    async def accept(self, frame: AudioFrame, start_sample: int) -> None:
        if self.receiver.done():
            await self.receiver
            raise S2SProtocolError("provider_finished_unexpectedly")
        if not self._current():
            return
        if self._next_sample is not None and start_sample != self._next_sample:
            raise S2SProtocolError("provider_input_gap")
        if self._origin is None:
            self._origin = start_sample
        self._next_sample = start_sample + frame.samples.size
        pcm = np.clip(frame.samples * 32768, -32768, 32767).astype("<i2")
        await self.provider.append_audio(pcm.tobytes())

    async def finish(self) -> None:
        await self.provider.finish()
        try:
            await asyncio.wait_for(self.receiver, 10)
        except TimeoutError:
            raise S2SProtocolError("provider_finish_timeout") from None

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        self.receiver.cancel()
        try:
            with suppress(asyncio.CancelledError, Exception):
                await self.receiver
        finally:
            await self.provider.close()

    async def _receive(self) -> None:
        async for observation in self.provider.observations():
            if not self._current():
                return
            if observation.kind == "source":
                self._source(observation)
            elif observation.kind in ("audio", "target"):
                targets = self._targets.setdefault(observation.response_id, {})
                target = targets.setdefault(observation.item_id, TargetSegment())
                if observation.kind == "target":
                    self._target(observation, target)
                elif self.on_audio:
                    source = self._sources.get(observation.source_ids[0]) if len(observation.source_ids) == 1 else None
                    await self.on_audio(observation, target.translation_id, source.segment_id if source else None)
            elif observation.kind == "response":
                self._targets.pop(observation.response_id, None)
                if self.on_audio:
                    await self.on_audio(observation, None, None)

    def _source(self, observation: S2SObservation) -> None:
        segment = self._sources.get(observation.item_id)
        if segment is None:
            segment = SourceSegment(index=self._segment_index)
            self._segment_index += 1
            self._sources[observation.item_id] = segment
            if len(self._sources) > 2048:
                self._sources.popitem(last=False)
        if self.latency_detection and observation.speech_stopped and not segment.boundary_reported:
            segment.boundary_reported = True
            self.emit("latency_observation", {
                "kind": "segment_boundary", "at_ms": unix_ms(), "segment_id": segment.segment_id,
            })
        if observation.speaker_id is not None:
            speaker_id = f"provider:{observation.speaker_id}"
            if speaker_id != segment.speaker_id:
                segment.speaker_id = speaker_id
                self._speaker_revision += 1
                self.emit("speaker_changed", {
                    "speaker_metadata_revision": self._speaker_revision,
                    "segment_id": segment.segment_id, "speaker_id": speaker_id, "source": "provider",
                })
        if not observation.text.strip():
            return
        segment.revision += 1
        self.session.source_revision_watermark += 1
        cutoff = self._next_sample or 0
        span = None
        if self._origin is not None and observation.started_at_ms is not None:
            start = min(cutoff, self._origin + observation.started_at_ms * TARGET_SAMPLE_RATE // 1000)
            if observation.ended_at_ms is not None:
                cutoff = min(cutoff, self._origin + observation.ended_at_ms * TARGET_SAMPLE_RATE // 1000)
            span = {"start_sample": start, "end_sample": max(start, cutoff)}
        language = observation.language or self.session.config.source_language

        payload = {
            "utterance_id": segment.segment_id, "segment_id": segment.segment_id,
            "segment_index": segment.index, "source_revision": segment.revision,
            "text": observation.text, "language": PROVIDER_LANGUAGE_ALIASES.get(language, language),
            "audio_span": span, "timing_quality": ("unknown" if span is None else
                "segment" if observation.ended_at_ms is not None else "estimated"),
            "speaker_id": segment.speaker_id,
            "quality_flags": ("incomplete",) if observation.status == "incomplete" else (),
        }
        self.emit("source_text", {
            **payload, "text_state": "committed" if observation.final else "draft",
            "stable_end_offset": len(observation.text) if observation.final else 0,
            "speaker_metadata_revision": self._speaker_revision,
        })
        if observation.final:
            self.emit("source_committed", {
                **payload, "commit_id": segment.segment_id,
                "boundary_reason": "model_final", "cutoff_sample": cutoff,
            })

    def _target(self, observation: S2SObservation, target: TargetSegment) -> None:
        if not observation.text.strip():
            return
        sources = [self._sources[key] for key in observation.source_ids if key in self._sources and self._sources[key].revision]
        source = sources[0] if len(sources) == 1 else None
        source_revision = max((item.revision for item in sources), default=0)
        target.revision += 1
        self.session.target_revision_watermark += 1
        config = self.session.config
        language = config.target_languages[0] if config.target_languages else config.speech_target_language or "en"
        payload = {
            "translation_id": target.translation_id,
            "segment_id": source.segment_id if source else target.translation_id,
            "target_language": language, "target_revision": target.revision,
            "text": observation.text, "based_on_source_revision": source_revision, "origin": "s2s",
            "source_refs": tuple(item.segment_id for item in sources),
        }
        self.emit("translated_text", {
            **payload, "source_revision": max(1, source_revision),
            "state": "committed" if observation.final else "provisional",
            "alignment_quality": "segment" if sources else "unknown",
            "quality_flags": ("incomplete",) if observation.status == "incomplete" else (),
        })
        if observation.final:
            self.emit("translation_committed", {
                **payload, "commit_id": target.translation_id,
                "text_fingerprint": sha256(observation.text.encode()).hexdigest(),
            })
