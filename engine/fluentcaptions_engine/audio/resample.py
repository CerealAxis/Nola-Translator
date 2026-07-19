"""把任意常见 WASAPI 格式标准化为 16 kHz、单声道、float32、20 ms 帧。"""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

import numpy as np
from numpy.typing import NDArray
from scipy.signal import resample_poly


TARGET_SAMPLE_RATE = 16_000
FRAME_DURATION_MS = 20
FRAME_SAMPLES = TARGET_SAMPLE_RATE * FRAME_DURATION_MS // 1000


@dataclass(frozen=True, slots=True)
class AudioFrame:
    samples: NDArray[np.float32]
    started_at_ms: float


class StreamingAudioNormalizer:
    """以有限重叠保留重采样边界，并输出固定长度的连续音频帧。"""

    def __init__(self, input_rate: int, channels: int) -> None:
        if input_rate <= 0:
            raise ValueError("input_rate 必须为正数")
        if channels <= 0:
            raise ValueError("channels 必须为正数")
        self.input_rate = input_rate
        self.channels = channels
        common = gcd(input_rate, TARGET_SAMPLE_RATE)
        self.up = TARGET_SAMPLE_RATE // common
        self.down = input_rate // common
        self.history_samples = max(64, self.down * 16)
        self.history = np.empty(0, dtype=np.float32)
        self.pending = np.empty(0, dtype=np.float32)
        self.total_input_samples = 0
        self.total_output_samples = 0
        self.delivered_samples = 0
        self.origin_ms: float | None = None

    def accept_int16(self, data: bytes, captured_at_ms: float) -> list[AudioFrame]:
        samples = np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0
        return self.accept_float32(samples, captured_at_ms)

    def accept_float32(
        self, samples: NDArray[np.float32] | list[float], captured_at_ms: float
    ) -> list[AudioFrame]:
        values = np.asarray(samples, dtype=np.float32).reshape(-1)
        if values.size == 0:
            return []
        if values.size % self.channels != 0:
            raise ValueError("交错音频样本数量必须能被声道数整除")

        mono = values.reshape(-1, self.channels).mean(axis=1, dtype=np.float32)
        mono = np.clip(mono, -1.0, 1.0).astype(np.float32, copy=False)
        if self.origin_ms is None:
            self.origin_ms = captured_at_ms

        if self.input_rate == TARGET_SAMPLE_RATE:
            output = mono
            self.total_input_samples += mono.size
            self.total_output_samples += output.size
        else:
            combined = np.concatenate((self.history, mono))
            resampled = resample_poly(combined, self.up, self.down).astype(np.float32, copy=False)
            self.total_input_samples += mono.size
            target_total = round(self.total_input_samples * TARGET_SAMPLE_RATE / self.input_rate)
            new_sample_count = max(0, target_total - self.total_output_samples)
            output = resampled[-new_sample_count:] if new_sample_count else np.empty(0, dtype=np.float32)
            self.total_output_samples = target_total
            self.history = combined[-self.history_samples :].copy()

        if output.size:
            self.pending = np.concatenate((self.pending, np.clip(output, -1.0, 1.0)))

        frames: list[AudioFrame] = []
        while self.pending.size >= FRAME_SAMPLES:
            frame_samples = self.pending[:FRAME_SAMPLES].astype(np.float32, copy=True)
            self.pending = self.pending[FRAME_SAMPLES:]
            started_at_ms = self.origin_ms + self.delivered_samples * 1000 / TARGET_SAMPLE_RATE
            self.delivered_samples += FRAME_SAMPLES
            frames.append(AudioFrame(samples=frame_samples, started_at_ms=started_at_ms))
        return frames
