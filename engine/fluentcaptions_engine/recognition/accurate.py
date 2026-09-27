"""完整语音片段上的 faster-whisper 高精度识别调度。"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
import re
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

    @property
    def current_sample_count(self) -> int:
        return int(self.active_audio.size + self.pending.size) if self.active_audio.size else 0

    def current_segment(self) -> SpeechSegment | None:
        """返回当前正在说话片段的快照，供伪流式识别器生成中间结果。"""
        if self.active_audio.size == 0:
            return None
        samples = (
            np.concatenate((self.active_audio, self.pending))
            if self.pending.size
            else self.active_audio.copy()
        )
        if samples.size == 0:
            return None
        return SpeechSegment(
            samples=samples.astype(np.float32, copy=False),
            started_at_ms=self._time_ms(self.active_start_sample),
            ended_at_ms=self._time_ms(self.received_samples),
        )

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


class SenseVoiceBackend:
    """sherpa-onnx 的 SenseVoiceSmall 离线识别后端。

    SenseVoice 是按完整语音片段解码的非自回归模型，和本模块的 VAD 分段器组合后
    仍能持续输出字幕。use_itn=True 让模型恢复标点和常见数字格式。
    """

    TAG_PATTERN = re.compile(r"<\|[^>]+\|>")
    LANGUAGE_PATTERN = re.compile(r"<\|(zh|yue|en|ja|ko)\|>")

    def __init__(
        self,
        model_path: str,
        tokens_path: str,
        *,
        language: str | None = None,
        num_threads: int = 2,
    ) -> None:
        import sherpa_onnx

        self.recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=model_path,
            tokens=tokens_path,
            num_threads=num_threads,
            sample_rate=16_000,
            provider="cpu",
            language=language or "auto",
            use_itn=True,
        )

    def transcribe(
        self, samples: NDArray[np.float32], language: str | None
    ) -> tuple[str, str | None]:
        stream = self.recognizer.create_stream()
        stream.accept_waveform(16_000, samples)
        self.recognizer.decode_stream(stream)
        raw_result = stream.result
        raw_text = getattr(raw_result, "text", raw_result)
        text = str(raw_text).strip()
        detected = self.LANGUAGE_PATTERN.search(text)
        detected_language = language or (detected.group(1) if detected else None)
        text = self.TAG_PATTERN.sub("", text).strip()
        return text, detected_language


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


class StreamingSenseVoiceRecognizer:
    """使用离线 SenseVoice 模型模拟流式输出。

    SenseVoiceSmall 本身不是 sherpa-onnx OnlineRecognizer；这里在 VAD 语音片段
    仍未结束时，按固定间隔对当前音频快照重新解码并发送中间 revision。这样不需要
    引入 FunASR/Torch 专用运行时，同时保留句尾的最终标点结果。
    """

    def __init__(
        self,
        vad: SileroVadSegmenter,
        backend: TranscriptionBackend,
        *,
        source_language: str | None,
        partial_interval_ms: int = 650,
        min_partial_ms: int = 420,
        max_partial_seconds: float = 12,
    ) -> None:
        self.vad = vad
        self.backend = backend
        self.source_language = source_language
        self.partial_interval_samples = max(320, int(16_000 * partial_interval_ms / 1000))
        self.min_partial_samples = max(320, int(16_000 * min_partial_ms / 1000))
        self.max_partial_samples = max(
            self.min_partial_samples, int(16_000 * max_partial_seconds)
        )
        self.stabilizer: RecognitionStabilizer | None = None
        self.decode_task: asyncio.Task[tuple[str, str, str | None] | None] | None = None
        self.last_scheduled_samples = 0

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        completed = self.vad.accept(frame)
        if completed:
            updates: list[RecognitionUpdate] = []
            for segment in completed:
                updates.extend(await self._finish_segment(segment))
            return updates

        updates = await self._collect_decode_task(wait=False)
        if self.decode_task is not None:
            return updates
        sample_count = self.vad.current_sample_count
        if (
            sample_count >= self.min_partial_samples
            and sample_count - self.last_scheduled_samples >= self.partial_interval_samples
        ):
            current = self.vad.current_segment()
            if current is not None:
                self._ensure_stabilizer(current)
                self.last_scheduled_samples = sample_count
                assert self.stabilizer is not None
                self.decode_task = asyncio.create_task(
                    self._decode_partial(
                        self.stabilizer.segment_id, self._partial_samples(current.samples)
                    )
                )
        return updates

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        del ended_at_ms
        updates: list[RecognitionUpdate] = []
        for segment in self.vad.flush():
            updates.extend(await self._finish_segment(segment))
        return updates

    async def _finish_segment(self, segment: SpeechSegment) -> list[RecognitionUpdate]:
        updates = await self._collect_decode_task(wait=True)
        self._ensure_stabilizer(segment)
        assert self.stabilizer is not None
        text, language = await asyncio.to_thread(
            self.backend.transcribe, segment.samples, self.source_language
        )
        final = self.stabilizer.update(
            text,
            language=language,
            is_final=True,
            ended_at_ms=segment.ended_at_ms,
        )
        if final is not None:
            updates.append(final)
        self.stabilizer = None
        self.last_scheduled_samples = 0
        return updates

    async def _collect_decode_task(self, *, wait: bool) -> list[RecognitionUpdate]:
        task = self.decode_task
        if task is None or (not wait and not task.done()):
            return []
        self.decode_task = None
        try:
            result = await task
        except asyncio.CancelledError:
            return []
        except Exception:
            return []
        if result is None or self.stabilizer is None:
            return []
        segment_id, text, language = result
        if segment_id != self.stabilizer.segment_id:
            return []
        update = self.stabilizer.update(
            text,
            language=language,
            is_final=False,
        )
        return [update] if update is not None else []

    async def _decode_partial(
        self, segment_id: str, samples: NDArray[np.float32]
    ) -> tuple[str, str, str | None] | None:
        text, language = await asyncio.to_thread(
            self.backend.transcribe, samples, self.source_language
        )
        return segment_id, text, language

    def _ensure_stabilizer(self, segment: SpeechSegment) -> None:
        if self.stabilizer is None:
            self.stabilizer = RecognitionStabilizer(
                f"segment-{uuid4()}", segment.started_at_ms
            )

    def _partial_samples(self, samples: NDArray[np.float32]) -> NDArray[np.float32]:
        if samples.size <= self.max_partial_samples:
            return samples.astype(np.float32, copy=True)
        return samples[-self.max_partial_samples :].astype(np.float32, copy=True)

    async def close(self) -> None:
        if self.decode_task is not None:
            self.decode_task.cancel()
            await asyncio.gather(self.decode_task, return_exceptions=True)
            self.decode_task = None
