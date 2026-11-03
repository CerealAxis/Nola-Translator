"""Opt-in capture timing and amplitude summaries for the desktop monitor."""

from collections.abc import Callable
from math import isfinite
from time import monotonic, time_ns

from ..audio.resample import AudioFrame
from .ingestion import canonical_ms


def unix_ms() -> float:
    return time_ns() / 1_000_000


class LatencyCapture:
    def __init__(self, emit: Callable) -> None:
        self.emit = emit
        # Capture is stamped with the process monotonic clock; keep one wall anchor per epoch.
        self.wall_offset_ms = unix_ms() - monotonic() * 1000
        self.last_end_sample: int | None = None
        self.peak: tuple[int, float, float, float] | None = None

    def observe(self, frame: AudioFrame, end_sample: int) -> None:
        start_sample = end_sample - frame.samples.size
        at_ms = frame.started_at_ms + self.wall_offset_ms
        if not isfinite(at_ms) or at_ms < 0:
            return
        if self.last_end_sample != start_sample:
            self.peak = None
        self.last_end_sample = end_sample
        low = min(1.0, max(-1.0, float(frame.samples.min())))
        high = min(1.0, max(-1.0, float(frame.samples.max())))
        start, bin_at_ms, minimum, maximum = self.peak or (start_sample, at_ms, low, high)
        minimum, maximum = min(minimum, low), max(maximum, high)
        duration_ms = canonical_ms(end_sample - start)
        if duration_ms >= 100:
            self.emit("latency_observation", {
                "kind": "input", "at_ms": bin_at_ms, "duration_ms": duration_ms,
                "min": minimum, "max": maximum,
            })
            self.peak = None
        else:
            self.peak = (start, bin_at_ms, minimum, maximum)
