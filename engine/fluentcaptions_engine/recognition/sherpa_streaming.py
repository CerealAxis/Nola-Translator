"""sherpa-onnx 在线识别的流式调度层。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from numpy.typing import NDArray
import numpy as np

from ..audio.resample import AudioFrame, FRAME_DURATION_MS
from .base import RecognitionUpdate
from .stabilizer import RecognitionStabilizer


@dataclass(frozen=True, slots=True)
class DecoderResult:
    text: str
    is_endpoint: bool


class StreamingDecoder(Protocol):
    def accept(self, samples: NDArray[np.float32]) -> DecoderResult: ...
    def finish(self) -> DecoderResult: ...
    def reset(self) -> None: ...


@dataclass(frozen=True, slots=True)
class SherpaModelConfig:
    tokens: str
    encoder: str
    decoder: str
    joiner: str
    num_threads: int = 2
    provider: str = "cpu"


class SherpaOnnxDecoder:
    """把 sherpa-onnx 原生 OnlineRecognizer 适配为可测试的最小接口。"""

    def __init__(self, recognizer: Any) -> None:
        self.recognizer = recognizer
        self.stream = recognizer.create_stream()

    @staticmethod
    def _result_text(result: Any) -> str:
        if isinstance(result, str):
            return result
        return str(result.text)

    @classmethod
    def from_transducer(cls, config: SherpaModelConfig) -> "SherpaOnnxDecoder":
        import sherpa_onnx

        recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
            tokens=config.tokens,
            encoder=config.encoder,
            decoder=config.decoder,
            joiner=config.joiner,
            num_threads=config.num_threads,
            sample_rate=16_000,
            feature_dim=80,
            enable_endpoint_detection=True,
            decoding_method="greedy_search",
            provider=config.provider,
        )
        return cls(recognizer)

    def accept(self, samples: NDArray[np.float32]) -> DecoderResult:
        self.stream.accept_waveform(16_000, samples)
        while self.recognizer.is_ready(self.stream):
            self.recognizer.decode_stream(self.stream)
        result = self.recognizer.get_result(self.stream)
        return DecoderResult(
            self._result_text(result), self.recognizer.is_endpoint(self.stream)
        )

    def finish(self) -> DecoderResult:
        self.stream.input_finished()
        while self.recognizer.is_ready(self.stream):
            self.recognizer.decode_stream(self.stream)
        text = self._result_text(self.recognizer.get_result(self.stream))
        return DecoderResult(text, bool(text.strip()))

    def reset(self) -> None:
        self.recognizer.reset(self.stream)


class SherpaStreamingRecognizer:
    def __init__(
        self,
        decoder: StreamingDecoder,
        *,
        language: str | None,
        partial_interval_ms: float = 100,
    ) -> None:
        self.decoder = decoder
        self.language = language
        self.partial_interval_ms = partial_interval_ms
        self.stabilizer: RecognitionStabilizer | None = None
        self.last_partial_at_ms: float | None = None
        self.last_frame_end_ms = 0.0

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        self.last_frame_end_ms = frame.started_at_ms + FRAME_DURATION_MS
        result = self.decoder.accept(frame.samples)
        if self.stabilizer is None and result.text.strip():
            self.stabilizer = RecognitionStabilizer(f"segment-{uuid4()}", frame.started_at_ms)

        updates: list[RecognitionUpdate] = []
        if self.stabilizer is not None and result.text.strip():
            can_emit_partial = (
                self.last_partial_at_ms is None
                or frame.started_at_ms - self.last_partial_at_ms >= self.partial_interval_ms
            )
            if result.is_endpoint or can_emit_partial:
                update = self.stabilizer.update(
                    result.text,
                    language=self.language,
                    is_final=result.is_endpoint,
                    ended_at_ms=self.last_frame_end_ms if result.is_endpoint else None,
                )
                if update is not None:
                    updates.append(update)
                    self.last_partial_at_ms = frame.started_at_ms

        if result.is_endpoint:
            self.decoder.reset()
            self.stabilizer = None
            self.last_partial_at_ms = None
        return updates

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        result = self.decoder.finish()
        update: RecognitionUpdate | None = None
        if self.stabilizer is None and result.text.strip():
            self.stabilizer = RecognitionStabilizer(f"segment-{uuid4()}", ended_at_ms)
        if self.stabilizer is not None:
            if result.text.strip():
                update = self.stabilizer.update(
                    result.text,
                    language=self.language,
                    is_final=True,
                    ended_at_ms=ended_at_ms,
                )
            else:
                update = self.stabilizer.flush(ended_at_ms)
        self.decoder.reset()
        self.stabilizer = None
        self.last_partial_at_ms = None
        return [update] if update is not None else []

    async def close(self) -> None:
        self.stabilizer = None
