"""Tests for the meeting audio recorder that runs inside the engine."""

import struct
import wave
from pathlib import Path

import numpy as np
import pytest

from nola_translator_engine.audio.recorder import BYTE_RATE, WavRecorder, wav_header
from nola_translator_engine.audio.resample import FRAME_SAMPLES


def _frame(count: int = FRAME_SAMPLES, value: float = 0.25) -> np.ndarray:
    return np.full(count, value, dtype=np.float32)


def test_header_describes_16k_mono_16bit(tmp_path: Path) -> None:
    header = wav_header(3200)
    assert len(header) == 44
    assert header[0:4] == b"RIFF"
    assert header[8:12] == b"WAVE"
    assert header[12:16] == b"fmt "
    channels, rate = struct.unpack_from("<HI", header, 22)
    assert channels == 1
    assert rate == 16_000
    assert struct.unpack_from("<I", header, 28)[0] == BYTE_RATE == 32_000
    assert struct.unpack_from("<I", header, 40)[0] == 3200
    assert struct.unpack_from("<I", header, 4)[0] == 36 + 3200


def test_written_file_plays_back_with_the_expected_length(tmp_path: Path) -> None:
    path = tmp_path / "audio.wav"
    with WavRecorder(path) as recorder:
        for _ in range(50):
            recorder.write(_frame())
        assert recorder.closed is False
    assert recorder.closed is True

    with wave.open(str(path), "rb") as handle:
        assert handle.getframerate() == 16_000
        assert handle.getnchannels() == 1
        assert handle.getsampwidth() == 2
        assert handle.getnframes() == 50 * FRAME_SAMPLES
    assert recorder.duration_ms == 50 * FRAME_SAMPLES / 16_000 * 1000


def test_crash_before_close_leaves_a_parsable_empty_file(tmp_path: Path) -> None:
    path = tmp_path / "partial.wav"
    recorder = WavRecorder(path)
    recorder.write(_frame() * 3)
    del recorder  # no close(): exactly what a killed engine leaves behind

    raw = path.read_bytes()
    assert len(raw) > 44
    assert raw[0:4] == b"RIFF" and raw[8:12] == b"WAVE"
    assert struct.unpack_from("<I", raw, 40)[0] == 0


def test_values_outside_the_unit_range_are_clipped_not_wrapped(tmp_path: Path) -> None:
    path = tmp_path / "clipped.wav"
    with WavRecorder(path) as recorder:
        recorder.write(np.array([2.0, -2.0, 0.0], dtype=np.float32))
    with wave.open(str(path), "rb") as handle:
        samples = np.frombuffer(handle.readframes(3), dtype="<i2")
    assert samples.tolist() == [32767, -32767, 0]


def test_close_is_idempotent_and_writes_after_close_are_ignored(tmp_path: Path) -> None:
    path = tmp_path / "twice.wav"
    recorder = WavRecorder(path)
    recorder.write(_frame())
    recorder.close()
    recorder.close()
    recorder.write(_frame() * 5)
    with wave.open(str(path), "rb") as handle:
        assert handle.getnframes() == FRAME_SAMPLES


def test_parent_directories_are_created(tmp_path: Path) -> None:
    path = tmp_path / "nested" / "deeper" / "audio.wav"
    WavRecorder(path).close()
    assert path.exists()


@pytest.mark.parametrize("value", [0.0, -0.0, 1.0, -1.0])
def test_boundary_values_round_trip(tmp_path: Path, value: float) -> None:
    path = tmp_path / f"{value}.wav"
    with WavRecorder(path) as recorder:
        recorder.write(np.array([value], dtype=np.float32))
    with wave.open(str(path), "rb") as handle:
        assert handle.readframes(1) == struct.pack("<h", int(value * 32767))
