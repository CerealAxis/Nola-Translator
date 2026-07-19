import numpy as np
import pytest

from fluentcaptions_engine.audio.resample import AudioFrame
from fluentcaptions_engine.recognition.accurate import (
    AccurateRecognizer,
    SileroVadSegmenter,
    SpeechSegment,
    create_faster_whisper_backend,
)


class FakeVad:
    def __init__(self, segment: SpeechSegment | None) -> None:
        self.segment = segment

    def accept(self, _frame: AudioFrame) -> list[SpeechSegment]:
        if self.segment is None:
            return []
        segment, self.segment = self.segment, None
        return [segment]

    def flush(self) -> list[SpeechSegment]:
        return []


class FakeBackend:
    def transcribe(self, _samples: np.ndarray, _language: str | None) -> tuple[str, str]:
        return ("  Hello world  ", "en")


@pytest.mark.asyncio
async def test_accurate_recognizer_only_emits_final_segment() -> None:
    segment = SpeechSegment(np.zeros(16_000, dtype=np.float32), 0, 1000)
    recognizer = AccurateRecognizer(FakeVad(segment), FakeBackend(), source_language=None)
    updates = await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0))

    assert len(updates) == 1
    assert updates[0].is_final is True
    assert updates[0].revision == 0
    assert updates[0].source_text == "Hello world"
    assert updates[0].language == "en"


def test_whisper_backend_falls_back_from_cuda_to_cpu_int8() -> None:
    attempts = []

    def model_factory(_model: str, *, device: str, compute_type: str):
        attempts.append((device, compute_type))
        if device == "cuda":
            raise RuntimeError("CUDA unavailable")
        return object()

    statuses = []
    backend = create_faster_whisper_backend(
        "medium", model_factory=model_factory, on_fallback=statuses.append
    )
    assert backend.model is not None
    assert attempts == [("cuda", "float16"), ("cpu", "int8")]
    assert statuses == ["cpu-int8"]


class FakeSpeechProbability:
    def __init__(self, probabilities: list[float]) -> None:
        self.probabilities = iter(probabilities)

    def __call__(self, _window: np.ndarray) -> float:
        return next(self.probabilities)


def test_silero_vad_segments_after_configured_silence() -> None:
    probability = FakeSpeechProbability([0.1, 0.8, 0.9, 0.1, 0.1])
    vad = SileroVadSegmenter(
        probability_model=probability,
        min_speech_duration_ms=0,
        min_silence_duration_ms=64,
        speech_pad_ms=0,
    )

    segments = []
    for index in range(8):
        segments.extend(vad.accept(AudioFrame(np.zeros(320, dtype=np.float32), index * 20)))

    assert len(segments) == 1
    assert segments[0].started_at_ms == pytest.approx(32)
    assert segments[0].ended_at_ms > segments[0].started_at_ms
    assert segments[0].samples.dtype == np.float32


def test_silero_vad_flushes_active_speech() -> None:
    vad = SileroVadSegmenter(
        probability_model=FakeSpeechProbability([0.9]),
        min_speech_duration_ms=0,
        min_silence_duration_ms=500,
        speech_pad_ms=0,
    )
    vad.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0))
    vad.accept(AudioFrame(np.zeros(320, dtype=np.float32), 20))
    segments = vad.flush()
    assert len(segments) == 1
    assert segments[0].ended_at_ms == pytest.approx(40)
