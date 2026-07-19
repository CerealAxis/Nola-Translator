"""完整语音片段上的 faster-whisper 高精度识别调度。"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray

from ..audio.resample import AudioFrame
from .base import RecognitionUpdate
from .stabilizer import RecognitionStabilizer


@dataclass(frozen=True, slots=True)
class SpeechSegment:
    samples: NDArray[np.float32]
    started_at_ms: float
    ended_at_ms: float


class VadSegmenter(Protocol):
    def accept(self, frame: AudioFrame) -> list[SpeechSegment]: ...
    def flush(self) -> list[SpeechSegment]: ...


class SpeechProbabilityModel(Protocol):
    def __call__(self, window: NDArray[np.float32]) -> float: ...


class StatefulSileroProbability:
    """复用 faster-whisper 内置 Silero ONNX，并跨 512 样本窗口保留状态。"""

    def __init__(self) -> None:
        from faster_whisper.vad import get_vad_model

        self.session = get_vad_model().session
        self.reset()

    def reset(self) -> None:
        self.hidden = np.zeros((1, 1, 128), dtype=np.float32)
        self.cell = np.zeros((1, 1, 128), dtype=np.float32)
        self.context = np.zeros(64, dtype=np.float32)

    def __call__(self, window: NDArray[np.float32]) -> float:
        if window.shape != (512,):
            raise ValueError("Silero VAD 窗口必须包含 512 个样本")
        input_samples = np.concatenate((self.context, window)).reshape(1, -1)
        output, self.hidden, self.cell = self.session.run(
            None,
            {"input": input_samples, "h": self.hidden, "c": self.cell},
        )
        self.context = window[-64:].copy()
        return float(np.asarray(output).reshape(-1)[0])


class SileroVadSegmenter:
    """把 20 ms 帧组合为完整语音片段，静音达到阈值后才交给 Whisper。"""

    WINDOW_SAMPLES = 512

    def __init__(
        self,
        *,
        probability_model: SpeechProbabilityModel | None = None,
        threshold: float = 0.5,
        negative_threshold: float = 0.35,
        min_speech_duration_ms: int = 200,
        min_silence_duration_ms: int = 500,
        speech_pad_ms: int = 160,
        max_speech_duration_s: float = 30,
    ) -> None:
        self.probability_model = probability_model or StatefulSileroProbability()
        self.threshold = threshold
        self.negative_threshold = negative_threshold
        self.min_speech_samples = int(16_000 * min_speech_duration_ms / 1000)
        self.min_silence_samples = int(16_000 * min_silence_duration_ms / 1000)
        self.speech_pad_samples = int(16_000 * speech_pad_ms / 1000)
        self.max_speech_samples = int(16_000 * max_speech_duration_s)
        self.pending = np.empty(0, dtype=np.float32)
        self.pre_roll = np.empty(0, dtype=np.float32)
        self.active_audio = np.empty(0, dtype=np.float32)
        self.active_start_sample = 0
        self.silence_samples = 0
        self.processed_samples = 0
        self.received_samples = 0
        self.origin_ms: float | None = None

    def accept(self, frame: AudioFrame) -> list[SpeechSegment]:
        if self.origin_ms is None:
            self.origin_ms = frame.started_at_ms
        self.received_samples += frame.samples.size
        self.pending = np.concatenate((self.pending, frame.samples))
        completed: list[SpeechSegment] = []
        while self.pending.size >= self.WINDOW_SAMPLES:
            window = self.pending[: self.WINDOW_SAMPLES]
            self.pending = self.pending[self.WINDOW_SAMPLES :]
            completed.extend(self._accept_window(window))
        return completed

    def _accept_window(self, window: NDArray[np.float32]) -> list[SpeechSegment]:
        probability = self.probability_model(window)
        window_start = self.processed_samples
        self.processed_samples += self.WINDOW_SAMPLES

        if self.active_audio.size == 0:
            if probability < self.threshold:
                if self.speech_pad_samples:
                    self.pre_roll = np.concatenate((self.pre_roll, window))[-self.speech_pad_samples :]
                else:
                    self.pre_roll = np.empty(0, dtype=np.float32)
                return []
            self.active_start_sample = max(0, window_start - self.pre_roll.size)
            self.active_audio = np.concatenate((self.pre_roll, window))
            self.pre_roll = np.empty(0, dtype=np.float32)
            self.silence_samples = 0
            return []

        self.active_audio = np.concatenate((self.active_audio, window))
        if probability < self.negative_threshold:
            self.silence_samples += self.WINDOW_SAMPLES
        else:
            self.silence_samples = 0

        if self.active_audio.size >= self.max_speech_samples:
            return self._finalize(self.processed_samples, trim_samples=0)
        if self.silence_samples >= self.min_silence_samples:
            trim_samples = max(0, self.silence_samples - self.speech_pad_samples)
            return self._finalize(self.processed_samples - trim_samples, trim_samples)
        return []

    def _finalize(self, end_sample: int, trim_samples: int) -> list[SpeechSegment]:
        audio = self.active_audio[:-trim_samples] if trim_samples else self.active_audio
        trailing = (
            self.active_audio[-min(self.speech_pad_samples, self.silence_samples) :].copy()
            if self.speech_pad_samples and self.silence_samples
            else np.empty(0, dtype=np.float32)
        )
        started_at_ms = self._time_ms(self.active_start_sample)
        ended_at_ms = self._time_ms(end_sample)
        self.active_audio = np.empty(0, dtype=np.float32)
        self.pre_roll = trailing
        self.silence_samples = 0
        if audio.size < self.min_speech_samples:
            return []
        return [SpeechSegment(audio.astype(np.float32, copy=False), started_at_ms, ended_at_ms)]

    def flush(self) -> list[SpeechSegment]:
        if self.active_audio.size == 0:
            self.pending = np.empty(0, dtype=np.float32)
            return []
        if self.pending.size:
            self.active_audio = np.concatenate((self.active_audio, self.pending))
        end_sample = self.received_samples
        self.pending = np.empty(0, dtype=np.float32)
        return self._finalize(end_sample, trim_samples=0)

    def _time_ms(self, sample: int) -> float:
        return (self.origin_ms or 0.0) + sample * 1000 / 16_000


class TranscriptionBackend(Protocol):
    def transcribe(
        self, samples: NDArray[np.float32], language: str | None
    ) -> tuple[str, str | None]: ...


class FasterWhisperBackend:
    def __init__(self, model: Any) -> None:
        self.model = model

    def transcribe(
        self, samples: NDArray[np.float32], language: str | None
    ) -> tuple[str, str | None]:
        segments, info = self.model.transcribe(
            samples,
            language=language,
            beam_size=5,
            vad_filter=False,
        )
        text = "".join(segment.text for segment in segments)
        return text, getattr(info, "language", language)


def create_faster_whisper_backend(
    model_name_or_path: str,
    *,
    model_factory: Callable[..., Any] | None = None,
    on_fallback: Callable[[str], None] | None = None,
    download_root: str | None = None,
) -> FasterWhisperBackend:
    if model_factory is None:
        from faster_whisper import WhisperModel

        model_factory = WhisperModel
    model_options = {"download_root": download_root} if download_root is not None else {}
    try:
        model = model_factory(
            model_name_or_path, device="cuda", compute_type="float16", **model_options
        )
    except Exception:
        if on_fallback is not None:
            on_fallback("cpu-int8")
        model = model_factory(
            model_name_or_path, device="cpu", compute_type="int8", **model_options
        )
    return FasterWhisperBackend(model)


class AccurateRecognizer:
    def __init__(
        self,
        vad: VadSegmenter,
        backend: TranscriptionBackend,
        *,
        source_language: str | None,
    ) -> None:
        self.vad = vad
        self.backend = backend
        self.source_language = source_language

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        return await self._transcribe(self.vad.accept(frame))

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        del ended_at_ms
        return await self._transcribe(self.vad.flush())

    async def _transcribe(self, segments: list[SpeechSegment]) -> list[RecognitionUpdate]:
        updates: list[RecognitionUpdate] = []
        for segment in segments:
            text, language = await asyncio.to_thread(
                self.backend.transcribe, segment.samples, self.source_language
            )
            stabilizer = RecognitionStabilizer(
                f"segment-{uuid4()}", segment.started_at_ms
            )
            update = stabilizer.update(
                text,
                language=language,
                is_final=True,
                ended_at_ms=segment.ended_at_ms,
            )
            if update is not None:
                updates.append(update)
        return updates

    async def close(self) -> None:
        return None
