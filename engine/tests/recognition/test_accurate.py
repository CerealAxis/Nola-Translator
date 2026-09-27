import asyncio
import numpy as np
import pytest

from fluentcaptions_engine.audio.resample import AudioFrame
from fluentcaptions_engine.recognition.accurate import (
    AccurateRecognizer,
    SileroVadSegmenter,
    SpeechSegment,
    StreamingSenseVoiceRecognizer,
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


class FakeStreamingVad:
    def __init__(self) -> None:
        self.calls = 0
        self.active: SpeechSegment | None = SpeechSegment(
            np.zeros(640, dtype=np.float32), 0, 40
        )

    def accept(self, _frame: AudioFrame) -> list[SpeechSegment]:
        self.calls += 1
        assert self.active is not None
        self.active = SpeechSegment(
            np.concatenate((self.active.samples, np.zeros(320, dtype=np.float32))),
            self.active.started_at_ms,
            self.active.ended_at_ms + 20,
        )
        if self.calls == 2:
            completed = self.active
            self.active = None
            return [completed]
        return []

    @property
    def current_sample_count(self) -> int:
        return self.active.samples.size if self.active is not None else 0

    def current_segment(self) -> SpeechSegment | None:
        return self.active

    def flush(self) -> list[SpeechSegment]:
        return []


class FakeStreamingBackend:
    def __init__(self) -> None:
        self.calls = 0

    def transcribe(self, _samples: np.ndarray, _language: str | None) -> tuple[str, str]:
        self.calls += 1
        return ("hello" if self.calls == 1 else "hello world", "en")


@pytest.mark.asyncio
async def test_accurate_recognizer_only_emits_final_segment() -> None:
    segment = SpeechSegment(np.zeros(16_000, dtype=np.float32), 0, 1000)
    recognizer = AccurateRecognizer(FakeVad(segment), FakeBackend(), source_language=None)
    updates = await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0))

    assert len(updates) == 1
    assert updates[0].is_final is True
    assert updates[0].revision == 0
    assert updates[0].source_text == "Hello world."
    assert updates[0].language == "en"


@pytest.mark.asyncio
async def test_sensevoice_streaming_emits_intermediate_then_final_revision() -> None:
    recognizer = StreamingSenseVoiceRecognizer(
        FakeStreamingVad(),
        FakeStreamingBackend(),
        source_language=None,
        partial_interval_ms=20,
        min_partial_ms=20,
    )

    assert await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0)) == []
    await asyncio.sleep(0.02)
    updates = await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 20))

    assert [item.is_final for item in updates] == [False, True]
    assert updates[0].segment_id == updates[1].segment_id
    assert updates[0].revision == 0
    assert updates[1].revision == 1
    assert updates[1].source_text == "hello world."


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

@pytest.mark.asyncio
async def test_partial_continues_after_window_limit_and_skips_busy_snapshots() -> None:
    vad = SileroVadSegmenter(probability_model=lambda _: 0.9, max_speech_duration_s=30)
    snapshots = 0
    original_snapshot = vad.current_segment
    def snapshot():
        nonlocal snapshots
        snapshots += 1
        return original_snapshot()
    vad.current_segment = snapshot
    recognizer = StreamingSenseVoiceRecognizer(
        vad, FakeBackend(), source_language=None,
        partial_interval_ms=280, min_partial_ms=420,
    )
    for index in range(660):
        await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), index * 20))
        if recognizer.decode_task is not None:
            await recognizer.decode_task
    assert recognizer.last_scheduled_samples > 12 * 16_000
    assert snapshots < 50
    blocker = asyncio.Event()
    async def blocked():
        await blocker.wait()
        return None
    recognizer.decode_task = asyncio.create_task(blocked())
    before = snapshots
    for index in range(10):
        await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 13200 + index * 20))
    assert snapshots == before
    blocker.set()
    await recognizer.close()
