"""Records the normalized session audio to a playable WAV file.

Fed from the async frame loop rather than the PortAudio callback on purpose: a blocking write
in a realtime callback would glitch the stream, while the frame loop already runs off the audio
thread. Chunks the capture queue dropped under backpressure are therefore missing from the
recording *and* from the transcript, which keeps the two in sync by construction.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import BinaryIO

import numpy as np
from numpy.typing import NDArray

from .resample import FRAME_DURATION_MS, TARGET_SAMPLE_RATE

BITS_PER_SAMPLE = 16
CHANNELS = 1
BLOCK_ALIGN = CHANNELS * BITS_PER_SAMPLE // 8
BYTE_RATE = TARGET_SAMPLE_RATE * BLOCK_ALIGN
"""16 kHz mono 16-bit PCM: 32 KB/s, so an hour-long meeting is about 115 MB."""


def wav_header(data_bytes: int) -> bytes:
    """A canonical 44-byte RIFF/WAVE header for `data_bytes` of PCM payload."""
    return b"".join(
        (
            b"RIFF",
            (36 + data_bytes).to_bytes(4, "little"),
            b"WAVE",
            b"fmt ",
            (16).to_bytes(4, "little"),
            (1).to_bytes(2, "little"),
            CHANNELS.to_bytes(2, "little"),
            TARGET_SAMPLE_RATE.to_bytes(4, "little"),
            BYTE_RATE.to_bytes(4, "little"),
            BLOCK_ALIGN.to_bytes(2, "little"),
            BITS_PER_SAMPLE.to_bytes(2, "little"),
            b"data",
            data_bytes.to_bytes(4, "little"),
        )
    )


class WavRecorder:
    """Appends float32 frames to a WAV file and patches the real sizes in on close.

    The header is written with zero lengths up front so the file is never truncated by a crash:
    a player reads the (empty) `data` chunk and the host treats a short read as "no audio yet".
    `close()` rewinds and rewrites it, and is safe to call twice.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.samples_written = 0
        self._file: BinaryIO | None = open(self.path, "wb", buffering=1 << 20)
        self._file.write(wav_header(0))

    @property
    def closed(self) -> bool:
        return self._file is None

    @property
    def duration_ms(self) -> int:
        return round(self.samples_written / TARGET_SAMPLE_RATE * 1000)

    def write(self, samples: NDArray[np.float32]) -> None:
        """Append one frame. Values outside [-1, 1] are clipped rather than wrapped."""
        if self._file is None:
            return
        pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
        with self._lock:
            if self._file is None:
                return
            self._file.write(pcm)
            self.samples_written += len(pcm) // BLOCK_ALIGN

    def close(self) -> None:
        with self._lock:
            file, self._file = self._file, None
        if file is None:
            return
        file.flush()
        file.seek(0)
        file.write(wav_header(self.samples_written * BLOCK_ALIGN))
        file.flush()
        os.fsync(file.fileno())
        file.close()

    def __enter__(self) -> "WavRecorder":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

__all__ = ["BLOCK_ALIGN", "BYTE_RATE", "FRAME_DURATION_MS", "WavRecorder", "wav_header"]
