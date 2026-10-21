"""Silero VAD segmentation; the historical module name preserves internal imports."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from math import log10
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from ..audio.resample import AudioFrame, TARGET_SAMPLE_RATE


@dataclass(frozen=True, slots=True)
class VolumeGateSegment:
    start_ms: float
    end_ms: float
    samples: NDArray[np.float32]


@dataclass(frozen=True, slots=True)
class SegmentSnapshot:
    start_ms: float
    end_ms: float
    samples: NDArray[np.float32]


@dataclass(frozen=True, slots=True)
class _Frame:
    samples: NDArray[np.float32]
    start_ms: float
    voiced: bool


class SileroVadSegmenter:
    """Silero speech probabilities with pre-roll, silence hysteresis and bounded segments."""

    PRE_ROLL_MS = 200
    SILENCE_END_MS = 800
    # A caption latency budget, not a model limit: final-only translation must progress during uninterrupted speech.
    MAX_SEGMENT_MS = 10_000
    MIN_VOICED_MS = 250
    FRAME_MS = 20

    DB_FLOOR = -120.0

    def __init__(
        self,
        *,
        pre_roll_ms: int = PRE_ROLL_MS,
        silence_end_ms: int = SILENCE_END_MS,
        max_segment_ms: int = MAX_SEGMENT_MS,
        min_voiced_ms: int = MIN_VOICED_MS,
        frame_ms: int = FRAME_MS,
    ) -> None:
        if max_segment_ms <= 0 or silence_end_ms <= 0:
            raise ValueError("Segment and silence durations must be positive")
        self.pre_roll_ms = pre_roll_ms
        self.silence_end_ms = silence_end_ms
        self.max_segment_ms = max_segment_ms
        self.min_voiced_ms = min_voiced_ms
        self.frame_ms = frame_ms
        self.pre_roll_samples = TARGET_SAMPLE_RATE * pre_roll_ms // 1000
        self.silence_end_samples = TARGET_SAMPLE_RATE * silence_end_ms // 1000
        self.max_segment_samples = TARGET_SAMPLE_RATE * max_segment_ms // 1000
        self.min_voiced_samples = TARGET_SAMPLE_RATE * min_voiced_ms // 1000
        self._vad_session = None
        self._vad_state = np.zeros((2, 1, 128), dtype=np.float32)
        self._vad_context = np.zeros((1, 64), dtype=np.float32)
        self._vad_pending = np.empty(0, dtype=np.float32)
        self._vad_probability = 0.0
        self._pre_roll: deque[_Frame] = deque()
        self._pre_roll_count = 0
        self._active: list[_Frame] = []
        self._active_start_ms = 0.0
        self._active_samples = 0
        self._voiced_samples = 0
        self._silence_samples = 0
        self._gate_open = False
        #: Counters behind the `gate.*` diagnostic lines. The gate is the last filter before an
        #: inference job exists, so "no captions" and "the gate never opened" are otherwise
        #: indistinguishable from the outside.
        self.frames_in = 0
        self.frames_voiced = 0
        self.segments_started = 0
        self.segments_emitted = 0
        self.segments_dropped_short = 0
        self.highest_frame_db = -120.0

    def stats(self) -> dict[str, float | int]:
        return {
            "framesIn": self.frames_in,
            "framesVoiced": self.frames_voiced,
            "segmentsStarted": self.segments_started,
            "segmentsEmitted": self.segments_emitted,
            "segmentsDroppedShort": self.segments_dropped_short,
            "speechProbability": round(self._vad_probability, 4),
            "highestFrameDb": round(self.highest_frame_db, 2),
            "voicedMs": round(self._voiced_samples * 1000.0 / TARGET_SAMPLE_RATE, 1),
            "activeMs": round(self._active_samples * 1000.0 / TARGET_SAMPLE_RATE, 1),
        }

    def load(self) -> None:
        """Validate the CPU model and native runtime before a session starts capturing."""
        if self._vad_session is None:
            import onnxruntime as ort

            # Silero v6.2.3 (5cd7945676eb32225748052e2e6a0580e4686a08).
            # Bundled upstream model and MIT license; no Torch import or runtime download.
            options = ort.SessionOptions()
            options.inter_op_num_threads = 1
            options.intra_op_num_threads = 1
            session = ort.InferenceSession(
                str(Path(__file__).with_name("silero_vad.onnx")),
                sess_options=options, providers=["CPUExecutionProvider"])
            # Warm up without advancing this stream's recurrent state or audio clock.
            session.run(None, {
                "input": np.zeros((1, 576), dtype=np.float32),
                "state": np.zeros((2, 1, 128), dtype=np.float32),
                "sr": np.array(TARGET_SAMPLE_RATE, dtype=np.int64),
            })
            self._vad_session = session

    def _speech_probability(self, samples: NDArray[np.float32]) -> float:
        self.load()
        # Capture supplies 320 samples; Silero requires 512 at 16 kHz. Carry the
        # remainder and the latest decision (at most 20 ms old), never pad each frame.
        self._vad_pending = np.concatenate((self._vad_pending, samples))
        while self._vad_pending.size >= 512:
            window = self._vad_pending[:512].reshape(1, 512)
            inputs = np.concatenate((self._vad_context, window), axis=1)
            probability, self._vad_state = self._vad_session.run(None, {
                "input": inputs, "state": self._vad_state,
                "sr": np.array(TARGET_SAMPLE_RATE, dtype=np.int64),
            })
            self._vad_context = window[:, -64:].copy()
            self._vad_pending = self._vad_pending[512:]
            self._vad_probability = float(probability.item())
        return self._vad_probability

    def accept(self, frame: AudioFrame) -> list[VolumeGateSegment]:
        db = self._rms_dbfs(frame.samples)
        probability = self._speech_probability(frame.samples)
        completed: list[VolumeGateSegment] = []
        self.frames_in += 1
        self.highest_frame_db = max(self.highest_frame_db, db)
        if not self._active:
            if probability >= 0.5:
                self.frames_voiced += 1
                self._start_segment(frame)
            else:
                self._push_pre_roll(_Frame(frame.samples, frame.started_at_ms, False))
            return completed

        if self._gate_open:
            self._gate_open = probability >= 0.35
        else:
            self._gate_open = probability >= 0.5
        voiced = self._gate_open
        if voiced:
            self.frames_voiced += 1

        pushed = _Frame(frame.samples, frame.started_at_ms, voiced)
        self._push_pre_roll(pushed)
        self._active.append(pushed)
        self._active_samples += frame.samples.size
        if voiced:
            self._voiced_samples += frame.samples.size
            self._silence_samples = 0
        else:
            self._silence_samples += frame.samples.size

        if self._silence_samples >= self.silence_end_samples:
            segment = self._finalize_silence()
            if segment is not None:
                completed.append(segment)
        elif self._active_samples >= self.max_segment_samples:
            segment = self._force_split()
            if segment is not None:
                completed.append(segment)
        return completed

    def flush(self) -> list[VolumeGateSegment]:
        self._vad_state.fill(0)
        self._vad_context.fill(0)
        self._vad_pending = np.empty(0, dtype=np.float32)
        self._vad_probability = 0.0
        if not self._active or self._voiced_samples == 0:
            self._clear_active()
            self._pre_roll.clear()
            self._pre_roll_count = 0
            return []
        last = self._active[-1]
        end_ms = last.start_ms + last.samples.size * 1000.0 / TARGET_SAMPLE_RATE
        segment = VolumeGateSegment(
            self._active_start_ms,
            end_ms,
            np.concatenate([f.samples for f in self._active]),
        )
        self._clear_active()
        # the trailing audio we just emitted must not re-enter the next segment's pre-roll, or it is recognized twice.
        self._pre_roll.clear()
        self._pre_roll_count = 0
        return [segment]

    def current_segment(self) -> SegmentSnapshot | None:
        bounds = self.current_bounds()
        if bounds is None:
            return None
        return SegmentSnapshot(
            start_ms=bounds[0],
            end_ms=bounds[1],
            samples=np.concatenate([f.samples for f in self._active]),
        )

    def current_bounds(self) -> tuple[float, float] | None:
        """Read the active segment's time bounds without copying its audio every frame."""
        if not self._active:
            return None
        last = self._active[-1]
        return self._active_start_ms, last.start_ms + last.samples.size * 1000.0 / TARGET_SAMPLE_RATE

    def _start_segment(self, frame: AudioFrame) -> None:
        opener = _Frame(frame.samples, frame.started_at_ms, True)
        self._active = [*self._pre_roll, opener]
        self._active_start_ms = self._active[0].start_ms
        self._active_samples = self._pre_roll_count + opener.samples.size
        self._voiced_samples = opener.samples.size
        self._silence_samples = 0
        self._gate_open = True
        self.segments_started += 1
        self._push_pre_roll(opener)

    def _finalize_silence(self) -> VolumeGateSegment | None:
        trim_index = len(self._active)
        counted = 0
        while counted < self._silence_samples:
            trim_index -= 1
            counted += self._active[trim_index].samples.size
        kept = self._active[:trim_index]
        segment: VolumeGateSegment | None = None
        if kept and self._voiced_samples >= self.min_voiced_samples:
            segment = VolumeGateSegment(
                self._active_start_ms,
                self._active[trim_index].start_ms,
                np.concatenate([f.samples for f in kept]),
            )
            self.segments_emitted += 1
        elif kept:
            self.segments_dropped_short += 1
        self._clear_active()
        return segment

    def _force_split(self) -> VolumeGateSegment | None:
        boundary = self.max_segment_samples
        left: list[_Frame] = []
        right: list[_Frame] = []
        consumed = 0
        for frame in self._active:
            if consumed + frame.samples.size <= boundary:
                left.append(frame)
                consumed += frame.samples.size
            elif consumed >= boundary:
                right.append(frame)
            else:
                cut = boundary - consumed
                left.append(_Frame(frame.samples[:cut], frame.start_ms, frame.voiced))
                right.append(
                    _Frame(
                        frame.samples[cut:],
                        frame.start_ms + cut * 1000.0 / TARGET_SAMPLE_RATE,
                        frame.voiced,
                    )
                )
                consumed = boundary
        segment: VolumeGateSegment | None = None
        voiced_left = sum(f.samples.size for f in left if f.voiced)
        if left and voiced_left >= self.min_voiced_samples:
            end_ms = (
                right[0].start_ms
                if right
                else self._active_start_ms + boundary * 1000.0 / TARGET_SAMPLE_RATE
            )
            segment = VolumeGateSegment(
                self._active_start_ms,
                end_ms,
                np.concatenate([f.samples for f in left]),
            )
        self._rebase_after_split(right)
        return segment

    def _rebase_after_split(self, right: list[_Frame]) -> None:
        self._active = right
        self._active_samples = sum(f.samples.size for f in right)
        self._voiced_samples = sum(f.samples.size for f in right if f.voiced)
        self._silence_samples = 0
        for frame in reversed(right):
            if frame.voiced:
                break
            self._silence_samples += frame.samples.size
        if right:
            self._active_start_ms = right[0].start_ms
            # the pre-roll keeps only audio after the boundary, so the next segment can't overlap the one just emitted.
            self._pre_roll = deque(right)
            self._pre_roll_count = self._active_samples
        else:
            self._active_start_ms = 0.0
            self._pre_roll.clear()
            self._pre_roll_count = 0
            self._gate_open = False

    def _clear_active(self) -> None:
        self._active = []
        self._active_start_ms = 0.0
        self._active_samples = 0
        self._voiced_samples = 0
        self._silence_samples = 0
        self._gate_open = False

    def _push_pre_roll(self, frame: _Frame) -> None:
        self._pre_roll.append(frame)
        self._pre_roll_count += frame.samples.size
        while self._pre_roll_count > self.pre_roll_samples and len(self._pre_roll) > 1:
            dropped = self._pre_roll.popleft()
            self._pre_roll_count -= dropped.samples.size

    @staticmethod
    def _rms_dbfs(samples: NDArray[np.float32]) -> float:
        rms = float(np.sqrt(np.mean(np.square(samples.astype(np.float64)))))
        if rms <= 0.0:
            return SileroVadSegmenter.DB_FLOOR
        return max(20.0 * log10(rms), SileroVadSegmenter.DB_FLOOR)
