import numpy as np
import pytest

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.recognition.volume_gate import (
    SegmentSnapshot,
    VolumeGateSegment,
    VolumeGateSegmenter,
)

FRAME_SAMPLES = 320
FRAME_MS = 20


def make_frame(index: int, amplitude: float) -> AudioFrame:
    start = index * FRAME_SAMPLES
    t = np.arange(start, start + FRAME_SAMPLES, dtype=np.float64)
    # 500 Hz 在 16 kHz 下每帧恰好 10 个周期，帧内 RMS 恒定。
    samples = (amplitude * np.sin(2.0 * np.pi * t / 32.0)).astype(np.float32)
    return AudioFrame(samples=samples, started_at_ms=float(index * FRAME_MS))


def feed(
    segmenter: VolumeGateSegmenter, indices: range, amplitude: float
) -> list[VolumeGateSegment]:
    completed: list[VolumeGateSegment] = []
    for index in indices:
        completed.extend(segmenter.accept(make_frame(index, amplitude)))
    return completed


def test_speech_burst_emits_one_segment_with_preroll_and_no_trailing_silence() -> None:
    segmenter = VolumeGateSegmenter()
    completed: list[VolumeGateSegment] = []
    completed += feed(segmenter, range(0, 10), 0.0)  # 200 ms 静音基线
    speech_start = 10 * FRAME_MS
    completed += feed(segmenter, range(10, 35), 0.5)  # 500 ms 语音
    silence_start = 35 * FRAME_MS
    completed += feed(segmenter, range(35, 65), 0.0)  # 600 ms 静音触发断句

    assert len(completed) == 1
    segment = completed[0]
    assert isinstance(segment, VolumeGateSegment)
    assert segment.start_ms == pytest.approx(speech_start - 200, abs=FRAME_MS)
    assert segment.end_ms == pytest.approx(silence_start, abs=FRAME_MS)
    assert segment.samples.dtype == np.float32
    assert segment.samples.size == int(round((segment.end_ms - segment.start_ms) * 16))


def test_sub_silence_gap_keeps_one_segment() -> None:
    segmenter = VolumeGateSegmenter()
    completed: list[VolumeGateSegment] = []
    completed += feed(segmenter, range(0, 10), 0.0)  # 基线
    completed += feed(segmenter, range(10, 30), 0.5)  # 400 ms 语音
    completed += feed(segmenter, range(30, 50), 0.0)  # 400 ms 静音 < 600 ms
    completed += feed(segmenter, range(50, 65), 0.5)  # 继续说话
    tail_start = 65 * FRAME_MS
    completed += feed(segmenter, range(65, 95), 0.0)  # 600 ms 静音断句

    assert len(completed) == 1
    assert completed[0].start_ms == pytest.approx(0.0, abs=FRAME_MS)
    assert completed[0].end_ms == pytest.approx(tail_start, abs=FRAME_MS)


def test_force_split_at_30s_starts_next_segment_at_boundary() -> None:
    segmenter = VolumeGateSegmenter()
    completed: list[VolumeGateSegment] = []
    completed += feed(segmenter, range(0, 1550), 0.5)  # 31 s 连续语音
    completed += feed(segmenter, range(1550, 1580), 0.0)  # 收尾静音

    assert len(completed) == 2
    first, second = completed
    assert first.start_ms == pytest.approx(0.0, abs=FRAME_MS)
    assert first.end_ms == pytest.approx(30_000, abs=FRAME_MS)
    assert second.start_ms == pytest.approx(first.end_ms, abs=1e-6)
    assert first.samples.size == 30 * 16_000
    assert second.samples.size == 16_000  # 边界后剩余 1 s 语音
    # 无重叠且总量正确：31 s 语音恰好被两段无重复地覆盖。
    assert first.samples.size + second.samples.size == 31 * 16_000
    assert second.end_ms == pytest.approx(31_000, abs=FRAME_MS)


def test_blip_shorter_than_min_voiced_is_discarded() -> None:
    segmenter = VolumeGateSegmenter()
    completed: list[VolumeGateSegment] = []
    completed += feed(segmenter, range(0, 10), 0.0)
    completed += feed(segmenter, range(10, 15), 0.5)  # 100 ms 短促噪声
    completed += feed(segmenter, range(15, 45), 0.0)  # 600 ms 静音触发候选段

    assert completed == []
    assert segmenter.current_segment() is None
    assert segmenter.flush() == []


def test_flush_finalizes_active_segment_and_idle_flush_returns_empty() -> None:
    idle_segmenter = VolumeGateSegmenter()
    assert idle_segmenter.flush() == []

    segmenter = VolumeGateSegmenter()
    feed(segmenter, range(0, 10), 0.0)
    feed(segmenter, range(10, 30), 0.4)  # 400 ms 语音，尚无收尾静音

    snapshot = segmenter.current_segment()
    assert snapshot is not None

    flushed = segmenter.flush()
    assert len(flushed) == 1
    assert flushed[0].start_ms == pytest.approx(0.0, abs=FRAME_MS)
    assert flushed[0].end_ms == pytest.approx(30 * FRAME_MS, abs=1e-6)
    assert flushed[0].samples.size == 30 * FRAME_SAMPLES
    assert segmenter.flush() == []
    assert segmenter.current_segment() is None


def test_noise_baseline_does_not_open_gate_until_louder_speech() -> None:
    segmenter = VolumeGateSegmenter()
    noise = 0.004  # 约 -51 dBFS 的恒定背景噪声
    completed: list[VolumeGateSegment] = []
    completed += feed(segmenter, range(0, 100), noise)  # 2 s 基线
    assert completed == []
    assert segmenter.noise_floor_db == pytest.approx(-51.0, abs=2.0)

    completed += feed(segmenter, range(100, 150), noise)  # 基线稳定后仍不误开
    assert completed == []
    assert segmenter.current_segment() is None

    completed += feed(segmenter, range(150, 175), 0.3)  # 更响的语音开门
    completed += feed(segmenter, range(175, 205), noise)  # 600 ms 背景噪声收尾
    assert len(completed) == 1
    assert completed[0].end_ms == pytest.approx(175 * FRAME_MS, abs=FRAME_MS)


def test_current_segment_grows_during_speech_and_clears_when_idle() -> None:
    segmenter = VolumeGateSegmenter()
    feed(segmenter, range(0, 10), 0.0)
    feed(segmenter, range(10, 30), 0.5)

    first = segmenter.current_segment()
    assert isinstance(first, SegmentSnapshot)
    assert first.start_ms == pytest.approx(0.0, abs=FRAME_MS)

    feed(segmenter, range(30, 50), 0.5)
    second = segmenter.current_segment()
    assert second is not None
    assert second.samples.size > first.samples.size
    assert second.start_ms == first.start_ms
    assert second.end_ms > first.end_ms

    completed = feed(segmenter, range(50, 80), 0.0)  # 600 ms 静音定段
    assert len(completed) == 1
    assert segmenter.current_segment() is None
