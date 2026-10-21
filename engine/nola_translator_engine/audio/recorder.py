"""Records device-rate session audio to a compact MP3 file.

Fed from the async capture consumer rather than the PortAudio callback so file writes cannot
block realtime capture. Recognition continues through its separate normalized 16 kHz mono path.
"""

from __future__ import annotations

import os
import threading
from math import gcd
from pathlib import Path
from typing import BinaryIO, Literal

import numpy as np
from numpy.typing import NDArray
from scipy.signal import resample_poly

from .resample import FRAME_DURATION_MS, TARGET_SAMPLE_RATE

BITS_PER_SAMPLE = 16
CHANNELS = 1
BLOCK_ALIGN = CHANNELS * BITS_PER_SAMPLE // 8
BYTE_RATE = TARGET_SAMPLE_RATE * BLOCK_ALIGN
"""16 kHz mono 16-bit PCM: 32 KB/s, so an hour-long meeting is about 115 MB."""


def wav_header(data_bytes: int, sample_rate: int = TARGET_SAMPLE_RATE, channels: int = CHANNELS) -> bytes:
    """A canonical 44-byte RIFF/WAVE header for interleaved PCM16 payload."""
    block_align = channels * BITS_PER_SAMPLE // 8
    return b"".join(
        (
            b"RIFF",
            (36 + data_bytes).to_bytes(4, "little"),
            b"WAVE",
            b"fmt ",
            (16).to_bytes(4, "little"),
            (1).to_bytes(2, "little"),
            channels.to_bytes(2, "little"),
            sample_rate.to_bytes(4, "little"),
            (sample_rate * block_align).to_bytes(4, "little"),
            block_align.to_bytes(2, "little"),
            BITS_PER_SAMPLE.to_bytes(2, "little"),
            b"data",
            data_bytes.to_bytes(4, "little"),
        )
    )


class WavRecorder:
    """Writes captured audio as PCM16 WAV and patches the real sizes in on close.

    Capture chunks are consumed outside PortAudio's realtime callback. Float32 input is converted
    to PCM16 while preserving the device's sample rate and channel count. The zero-size header lets
    players recognize the file as still-growing, and `close()` safely patches its final lengths.
    """

    def __init__(
        self,
        path: str | Path,
        sample_rate: int = TARGET_SAMPLE_RATE,
        channels: int = CHANNELS,
    ) -> None:
        if sample_rate <= 0 or channels <= 0:
            raise ValueError("sample_rate and channels must be positive")
        self.path = Path(path)
        self.sample_rate = sample_rate
        self.channels = channels
        self.block_align = channels * BITS_PER_SAMPLE // 8
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.samples_written = 0
        self._file: BinaryIO | None = open(self.path, "wb", buffering=1 << 20)
        self._file.write(wav_header(0, sample_rate, channels))

    @property
    def closed(self) -> bool:
        return self._file is None

    @property
    def duration_ms(self) -> int:
        return round(self.samples_written / self.sample_rate * 1000)

    def write(self, samples: NDArray[np.float32]) -> None:
        """Append one frame. Values outside [-1, 1] are clipped rather than wrapped."""
        if self._file is None:
            return
        pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()
        with self._lock:
            if self._file is None:
                return
            self._file.write(pcm)
            self.samples_written += len(pcm) // self.block_align

    def write_capture(self, data: bytes, sample_format: Literal["int16", "float32"]) -> None:
        """Append one interleaved device chunk without resampling or downmixing it."""
        if sample_format == "int16":
            pcm = data
        else:
            values = np.frombuffer(data, dtype="<f4")
            scaled = np.rint(np.clip(values, -1.0, 1.0) * 32768.0)
            pcm = np.clip(scaled, -32768, 32767).astype("<i2").tobytes()
        if len(pcm) % self.block_align:
            raise ValueError("captured audio does not contain complete interleaved samples")
        with self._lock:
            if self._file is None:
                return
            self._file.write(pcm)
            self.samples_written += len(pcm) // self.block_align

    def write_silence(self, duration_ms: float) -> None:
        """Keep loopback recordings timed when WASAPI emits no packets during silence."""
        sample_count = round(duration_ms * self.sample_rate / 1000)
        if sample_count <= 0:
            return
        silence = bytes(min(sample_count, self.sample_rate) * self.block_align)
        with self._lock:
            if self._file is None:
                return
            while sample_count:
                count = min(sample_count, self.sample_rate)
                self._file.write(silence[:count * self.block_align])
                self.samples_written += count
                sample_count -= count

    def close(self) -> None:
        with self._lock:
            file, self._file = self._file, None
        if file is None:
            return
        file.flush()
        file.seek(0)
        file.write(wav_header(self.samples_written * self.block_align, self.sample_rate, self.channels))
        file.flush()
        os.fsync(file.fileno())
        file.close()

    def __enter__(self) -> "WavRecorder":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


class Mp3Recorder:
    """Compress device-rate PCM16 chunks to a constant-bitrate MP3 stream."""

    BIT_RATE_STEREO = 128
    BIT_RATE_MONO = 64

    def __init__(self, path: str | Path, sample_rate: int, channels: int) -> None:
        if sample_rate < 8000 or channels not in (1, 2):
            raise ValueError("MP3 recording requires at least 8 kHz and one or two channels")
        import lameenc

        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.sample_rate = sample_rate
        self.encoder_sample_rate = min(sample_rate, 48000)
        self.channels = channels
        self.samples_written = 0
        self._lock = threading.Lock()
        common = gcd(sample_rate, self.encoder_sample_rate)
        self._resample_up = self.encoder_sample_rate // common
        self._resample_down = sample_rate // common
        self._resample_history = np.empty((0, channels), dtype=np.float32)
        self._resample_history_samples = max(64, self._resample_down * 16)
        self._resample_input_samples = 0
        self._resample_output_samples = 0
        self._encoder = lameenc.Encoder()
        self._encoder.set_bit_rate(self.BIT_RATE_STEREO if channels == 2 else self.BIT_RATE_MONO)
        self._encoder.set_in_sample_rate(self.encoder_sample_rate)
        self._encoder.set_channels(channels)
        self._encoder.set_quality(5)
        self._encoder_started = False
        self._file: BinaryIO | None = open(self.path, "wb", buffering=1 << 20)

    @property
    def closed(self) -> bool:
        return self._file is None

    @property
    def duration_ms(self) -> int:
        return round(self.samples_written / self.sample_rate * 1000)

    def write_capture(self, data: bytes, sample_format: Literal["int16", "float32"]) -> None:
        if sample_format == "int16":
            pcm = data
        else:
            values = np.frombuffer(data, dtype="<f4")
            scaled = np.rint(np.clip(values, -1.0, 1.0) * 32768.0)
            pcm = np.clip(scaled, -32768, 32767).astype("<i2").tobytes()
        block_align = self.channels * 2
        if len(pcm) % block_align:
            raise ValueError("captured audio does not contain complete interleaved samples")
        self._write_pcm(pcm, len(pcm) // block_align)

    def _write_pcm(self, pcm: bytes, source_samples: int) -> None:
        with self._lock:
            if self._file is None:
                return
            encoded_input = pcm
            if self.encoder_sample_rate != self.sample_rate:
                samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32).reshape(-1, self.channels) / 32768.0
                combined = np.concatenate((self._resample_history, samples), axis=0)
                resampled = resample_poly(combined, self._resample_up, self._resample_down, axis=0)
                self._resample_input_samples += source_samples
                target_total = round(self._resample_input_samples * self.encoder_sample_rate / self.sample_rate)
                new_count = max(0, target_total - self._resample_output_samples)
                output = resampled[-new_count:] if new_count else np.empty((0, self.channels), dtype=np.float32)
                self._resample_output_samples = target_total
                self._resample_history = combined[-self._resample_history_samples:].copy()
                if output.size:
                    scaled = np.rint(np.clip(output, -1.0, 32767 / 32768) * 32768.0)
                    encoded_input = np.clip(scaled, -32768, 32767).astype("<i2").tobytes()
                else:
                    encoded_input = b""
            if encoded_input:
                self._file.write(self._encoder.encode(encoded_input))
                self._encoder_started = True
            self.samples_written += source_samples

    def write_silence(self, duration_ms: float) -> None:
        sample_count = round(duration_ms * self.sample_rate / 1000)
        if sample_count <= 0:
            return
        silence = bytes(min(sample_count, self.sample_rate) * self.channels * 2)
        while sample_count:
            count = min(sample_count, self.sample_rate)
            self._write_pcm(silence[:count * self.channels * 2], count)
            sample_count -= count

    def close(self) -> None:
        with self._lock:
            file, self._file = self._file, None
            if file is None:
                return
            try:
                # The LAME encoder initialises itself on the first encoded frame, so a recorder
                # that never received audio has nothing to flush and the encoder rejects the
                # call. An empty recording is a valid outcome, not a failure.
                if self._encoder_started:
                    file.write(self._encoder.flush())
                file.flush()
                os.fsync(file.fileno())
            finally:
                file.close()

    def __enter__(self) -> "Mp3Recorder":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

__all__ = ["BLOCK_ALIGN", "BYTE_RATE", "FRAME_DURATION_MS", "Mp3Recorder", "WavRecorder", "wav_header"]
