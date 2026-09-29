"""Volume-gate segmenter: splits speech on RMS energy, an adaptive noise baseline, and
silence hysteresis, with no third-party VAD model.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from math import log10

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


class VolumeGateSegmenter:
    """Gate opens and closes on 20 ms frame energy: ~200 ms pre-roll, 600 ms of silence ends
    a segment, 30 s force-splits, and anything under MIN_VOICED_MS is dropped.
    """

    PRE_ROLL_MS = 200
    SILENCE_END_MS = 600
    MAX_SEGMENT_MS = 30_000
    MIN_VOICED_MS = 250
    FRAME_MS = 20

    ABSOLUTE_FLOOR_DB = -60.0
    MARGIN_ON_DB = 12.0
    HYSTERESIS_DB = 6.0
    INITIAL_NOISE_FLOOR_DB = -60.0
    # noise floor EMA: floor += α·(db − floor). α=0.25 drops fast when the level is
    # quieter, α=0.02 climbs slowly when it's louder, so a transient bang can't raise
    # the threshold high enough to miss the speech after it.
    NOISE_ALPHA_FAST = 0.25
    NOISE_ALPHA_SLOW = 0.02
    DB_FLOOR = -120.0

    def __init__(
        self,
        *,
        pre_roll_ms: int = PRE_ROLL_MS,
        silence_end_ms: int = SILENCE_END_MS,
        max_segment_ms: int = MAX_SEGMENT_MS,
        min_voiced_ms: int = MIN_VOICED_MS,
        frame_ms: int = FRAME_MS,
        absolute_floor_db: float = ABSOLUTE_FLOOR_DB,
        margin_on_db: float = MARGIN_ON_DB,
        hysteresis_db: float = HYSTERESIS_DB,
    ) -> None:
        self.pre_roll_ms = pre_roll_ms
        self.silence_end_ms = silence_end_ms
        self.max_segment_ms = max_segment_ms
        self.min_voiced_ms = min_voiced_ms
        self.frame_ms = frame_ms
        self.absolute_floor_db = absolute_floor_db
        self.margin_on_db = margin_on_db
        self.hysteresis_db = hysteresis_db
        self.pre_roll_samples = TARGET_SAMPLE_RATE * pre_roll_ms // 1000
        self.silence_end_samples = TARGET_SAMPLE_RATE * silence_end_ms // 1000
        self.max_segment_samples = TARGET_SAMPLE_RATE * max_segment_ms // 1000
        self.min_voiced_samples = TARGET_SAMPLE_RATE * min_voiced_ms // 1000
        self._noise_floor_db = self.INITIAL_NOISE_FLOOR_DB
        self._pre_roll: deque[_Frame] = deque()
        self._pre_roll_count = 0
        self._active: list[_Frame] = []
        self._active_start_ms = 0.0
        self._active_samples = 0
        self._voiced_samples = 0
        self._silence_samples = 0
        self._gate_open = False

    @property
    def noise_floor_db(self) -> float:
        return self._noise_floor_db

    def accept(self, frame: AudioFrame) -> list[VolumeGateSegment]:
        db = self._rms_dbfs(frame.samples)
        completed: list[VolumeGateSegment] = []
        if not self._active:
            self._update_noise_floor(db)
            if db > self._on_threshold_db():
                self._start_segment(frame)
            else:
                self._push_pre_roll(_Frame(frame.samples, frame.started_at_ms, False))
            return completed

        on_db = self._on_threshold_db()
        off_db = on_db - self.hysteresis_db
        if self._gate_open:
            self._gate_open = db >= off_db
        else:
            self._gate_open = db > on_db
        voiced = self._gate_open

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
        if not self._active or self._voiced_samples == 0:
            self._clear_active()
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

    def _update_noise_floor(self, db: float) -> None:
        alpha = self.NOISE_ALPHA_FAST if db < self._noise_floor_db else self.NOISE_ALPHA_SLOW
        self._noise_floor_db += alpha * (db - self._noise_floor_db)

    def _on_threshold_db(self) -> float:
        return max(self.absolute_floor_db, self._noise_floor_db + self.margin_on_db)

    @staticmethod
    def _rms_dbfs(samples: NDArray[np.float32]) -> float:
        rms = float(np.sqrt(np.mean(np.square(samples.astype(np.float64)))))
        if rms <= 0.0:
            return VolumeGateSegmenter.DB_FLOOR
        return max(20.0 * log10(rms), VolumeGateSegmenter.DB_FLOOR)
