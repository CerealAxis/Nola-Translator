import numpy as np
import pytest

from nola_translator_engine.audio.resample import FRAME_SAMPLES, StreamingAudioNormalizer


@pytest.mark.parametrize(("sample_rate", "channels"), [(44_100, 1), (48_000, 2)])
def test_normalizes_to_mono_16khz_float32_frames(sample_rate: int, channels: int) -> None:
    duration_seconds = 1
    timeline = np.arange(sample_rate * duration_seconds, dtype=np.float64) / sample_rate
    mono = (0.5 * np.sin(2 * np.pi * 440 * timeline)).astype(np.float32)
    samples = mono if channels == 1 else np.column_stack((mono, mono * 0.5)).reshape(-1)
    normalizer = StreamingAudioNormalizer(input_rate=sample_rate, channels=channels)

    frames = []
    chunk_frames = 997
    for start in range(0, sample_rate, chunk_frames):
        chunk = samples[start * channels : (start + chunk_frames) * channels]
        frames.extend(normalizer.accept_float32(chunk, captured_at_ms=10_000 + start * 1000 / sample_rate))

    assert len(frames) == 50
    assert all(frame.samples.shape == (FRAME_SAMPLES,) for frame in frames)
    assert all(frame.samples.dtype == np.float32 for frame in frames)
    assert all(np.max(np.abs(frame.samples)) <= 1 for frame in frames)
    assert [frame.started_at_ms for frame in frames[:3]] == pytest.approx([10_000, 10_020, 10_040])


def test_clips_float_input_and_keeps_silent_frames() -> None:
    normalizer = StreamingAudioNormalizer(input_rate=16_000, channels=1)
    samples = np.concatenate(
        (np.zeros(FRAME_SAMPLES, dtype=np.float32), np.full(FRAME_SAMPLES, 2.0, dtype=np.float32))
    )
    frames = normalizer.accept_float32(samples, captured_at_ms=500)

    assert len(frames) == 2
    assert np.all(frames[0].samples == 0)
    assert np.all(frames[1].samples == 1)
    assert frames[1].started_at_ms > frames[0].started_at_ms


def test_decodes_int16_without_exceeding_unit_range() -> None:
    normalizer = StreamingAudioNormalizer(input_rate=16_000, channels=1)
    raw = np.array([-32768, 0, 32767] * 107, dtype=np.int16)[:FRAME_SAMPLES].tobytes()
    frames = normalizer.accept_int16(raw, captured_at_ms=0)
    assert len(frames) == 1
    assert np.min(frames[0].samples) >= -1
    assert np.max(frames[0].samples) <= 1
