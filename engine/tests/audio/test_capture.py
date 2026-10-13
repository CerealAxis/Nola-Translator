import asyncio
import base64
import io
import wave
from dataclasses import replace

import numpy as np
import pytest

from nola_translator_engine.audio.capture import (
    AudioDeviceDisconnectedError,
    PortAudioCapture,
    RawAudioChunk,
    RawAudioQueue,
)
from nola_translator_engine.audio.devices import AudioDeviceRecord, _stable_device_id
from nola_translator_engine.audio.resample import FRAME_DURATION_MS


def test_audio_preview_records_two_seconds_and_preserves_level():
    from nola_translator_engine.audio.capture import capture_audio_test
    from nola_translator_engine.audio.resample import AudioFrame

    class PreviewCapture:
        request_id = None
        stopped = False

        def start(self):
            pass

        def stop(self):
            self.stopped = True

        async def frames(self):
            for index in range(100):
                yield AudioFrame(np.full(320, 0.125, dtype=np.float32), index * 20)

    capture = PreviewCapture()
    result = asyncio.run(capture_audio_test(capture))
    assert capture.stopped
    assert result["durationMs"] == 2000
    assert result["hasSignal"]
    with wave.open(io.BytesIO(base64.b64decode(result["audioBase64"])), "rb") as audio:
        assert audio.getframerate() == 16000
        assert audio.getnchannels() == 1
        assert audio.getnframes() == 32000
        assert np.max(np.abs(np.frombuffer(audio.readframes(32000), dtype="<i2"))) == 4096


def test_audio_preview_marks_silence_and_releases_capture_on_failure():
    from nola_translator_engine.audio.capture import capture_audio_test
    from nola_translator_engine.audio.resample import AudioFrame

    class PreviewCapture:
        request_id = None
        stopped = False
        fail = False

        def start(self):
            if self.fail:
                raise OSError("preview device unavailable")

        def stop(self):
            self.stopped = True

        async def frames(self):
            yield AudioFrame(np.zeros(32000, dtype=np.float32), 0)

    capture = PreviewCapture()
    assert not asyncio.run(capture_audio_test(capture))["hasSignal"]
    assert capture.stopped
    capture = PreviewCapture()
    capture.fail = True
    with pytest.raises(OSError):
        asyncio.run(capture_audio_test(capture))
    assert capture.stopped


def test_bounded_callback_queue_drops_oldest_chunk_without_blocking() -> None:
    queue = RawAudioQueue(capacity=2)
    assert queue.put_from_callback(RawAudioChunk(b"first", 0)) is True
    assert queue.put_from_callback(RawAudioChunk(b"second", 20)) is True
    assert queue.put_from_callback(RawAudioChunk(b"third", 40)) is True

    assert queue.dropped_chunks == 1
    assert queue.get_nowait().data == b"second"
    assert queue.get_nowait().data == b"third"


class FakeStream:
    def __init__(self, callback, frame_count: int, channels: int) -> None:
        self.callback = callback
        self.frame_count = frame_count
        self.channels = channels
        self.started = False
        self.closed = False

    def start_stream(self) -> None:
        self.started = True
        data = np.zeros(self.frame_count * self.channels, dtype=np.float32).tobytes()
        self.callback(data, self.frame_count, {}, 0)

    def stop_stream(self) -> None:
        self.started = False

    def close(self) -> None:
        self.closed = True

    def is_active(self) -> bool:
        return self.started


class FakeBackend:
    def __init__(self, fail_open: bool = False) -> None:
        self.fail_open = fail_open
        self.open_options = None
        self.stream = None
        self.terminated = False
        self.device = _device()

    def get_loopback_device_info_generator(self):
        yield {"index": self.device.backend_index, "name": self.device.name + " [Loopback]",
               "defaultSampleRate": self.device.sample_rate, "maxInputChannels": self.device.channels}

    def open(self, **options):
        self.open_options = options
        if self.fail_open:
            raise OSError("device unavailable")
        self.stream = FakeStream(options["stream_callback"], options["frames_per_buffer"], options["channels"])
        return self.stream

    def terminate(self) -> None:
        self.terminated = True


def _device() -> AudioDeviceRecord:
    return AudioDeviceRecord(
        device_id=_stable_device_id("systemOutput", "测试扬声器", 48_000, 2),
        backend_index=33,
        name="测试扬声器",
        kind="systemOutput",
        is_default=True,
        sample_rate=48_000,
        channels=2,
    )


@pytest.mark.asyncio
async def test_loopback_remaps_device_and_recovers_invalid_multichannel_format(monkeypatch):
    import pyaudiowpatch as pyaudio

    device = replace(_device(), channels=8,
                     device_id=_stable_device_id("systemOutput", _device().name, 48_000, 8))
    backend = FakeBackend()
    backend.device = replace(device, backend_index=41)
    attempts = []
    original_open = backend.open

    def compatible_open(**options):
        attempts.append(options)
        if options["input_device_index"] != 41 or options["channels"] != 2 or options["format"] != pyaudio.paInt16:
            raise OSError(-9996, "Invalid device")
        return original_open(**options)

    def start_pcm16(stream):
        stream.started = True
        pcm = np.full(stream.frame_count * stream.channels, 4096, dtype="<i2")
        stream.callback(pcm.tobytes(), stream.frame_count, {}, 0)

    monkeypatch.setattr(backend, "open", compatible_open)
    monkeypatch.setattr(FakeStream, "start_stream", start_pcm16)
    capture = PortAudioCapture(device, backend_factory=lambda: backend)
    try:
        capture.start()
        frame = await asyncio.wait_for(anext(capture.frames()), 1)
        assert frame.samples.shape == (320,)
        assert np.mean(frame.samples) == pytest.approx(0.125, abs=0.001)
        assert all(attempt["input_device_index"] == 41 for attempt in attempts)
        assert len(attempts) <= 4
    finally:
        capture.stop()
    assert backend.terminated


@pytest.mark.asyncio
async def test_capture_opens_selected_device_and_yields_standard_frame() -> None:
    backend = FakeBackend()
    capture = PortAudioCapture(_device(), backend_factory=lambda: backend)
    capture.start()
    capture.stop()

    frames = [frame async for frame in capture.frames()]
    assert len(frames) == 1
    assert frames[0].samples.shape == (320,)
    assert backend.open_options["input_device_index"] == 33
    assert backend.open_options["rate"] == 48_000
    assert backend.stream.closed is True
    assert backend.terminated is True


def test_capture_releases_backend_when_open_fails() -> None:
    backend = FakeBackend(fail_open=True)
    capture = PortAudioCapture(_device(), backend_factory=lambda: backend)
    with pytest.raises(OSError, match="device unavailable"):
        capture.start()
    assert backend.terminated is True
    assert capture.backend is None


def test_capture_releases_stream_and_backend_when_start_fails(monkeypatch):
    backend = FakeBackend()

    def fail_start(self):
        raise OSError(-9999, "WASAPI start failed")

    monkeypatch.setattr(FakeStream, "start_stream", fail_start)
    capture = PortAudioCapture(_device(), backend_factory=lambda: backend)
    with pytest.raises(OSError):
        capture.start()
    assert backend.stream.closed
    assert backend.terminated
    assert not capture.running
    assert capture.stream is None
    assert capture.backend is None


@pytest.mark.parametrize("stage", ["initialize", "open", "start"])
def test_capture_diagnostics_identify_failure_stage_and_original_error(monkeypatch, stage):
    from nola_translator_engine.audio import capture as capture_module

    observations = []
    monkeypatch.setattr(capture_module, "write_debug", lambda layer, event, data: observations.append((event, data)))
    backend = FakeBackend()

    def fail(*args, **kwargs):
        raise OSError(-9999, "original WASAPI failure")

    if stage == "open":
        monkeypatch.setattr(backend, "open", fail)
    elif stage == "start":
        monkeypatch.setattr(FakeStream, "start_stream", fail)
    capture = PortAudioCapture(_device(), backend_factory=fail if stage == "initialize" else lambda: backend,
                               request_id="audio-test-request")
    try:
        with pytest.raises(OSError):
            capture.start()
        failed = next(data for event, data in observations if event == "audio.capture.failed")
        assert failed["stage"] == stage
        assert failed["errorCode"] == -9999
        assert "original WASAPI failure" in failed["message"]
        assert failed["requestId"] == "audio-test-request"
        assert failed["deviceId"] == _device().device_id
        assert failed["deviceName"] == _device().name
        assert failed["sampleRate"] == 48_000
        assert failed["channels"] == 2
        assert failed["streamAllocated"] is (stage == "start")
        if stage == "open":
            assert any(event == "audio.capture.cleanup.complete" for event, _ in observations)
    finally:
        capture.stop()


@pytest.mark.asyncio
async def test_capture_reports_device_disconnect_instead_of_waiting_forever() -> None:
    backend = FakeBackend()
    capture = PortAudioCapture(_device(), backend_factory=lambda: backend)
    capture.start()
    capture.queue.get_nowait()
    backend.stream.started = False

    with pytest.raises(AudioDeviceDisconnectedError):
        await anext(capture.frames())
    capture.stop()


@pytest.mark.asyncio
async def test_capture_fills_silence_while_loopback_stops_pushing_data() -> None:
    """A loopback device pushes nothing while nothing is playing, so silence must be synthesised or the volume gate can never close a segment."""
    backend = FakeBackend()
    capture = PortAudioCapture(_device(), backend_factory=lambda: backend)
    capture.start()
    frames: list = []
    try:
        stream = capture.frames().__aiter__()
        deadline = asyncio.get_running_loop().time() + 0.6
        while asyncio.get_running_loop().time() < deadline and len(frames) < 12:
            frames.append(await asyncio.wait_for(stream.__anext__(), timeout=3.0))
    finally:
        capture.stop()

    assert len(frames) >= 4, "静默期应该持续产出补零帧"
    # The first frame is real audio; after that loopback goes quiet and every frame is synthesised.
    silence = [frame for frame in frames[1:] if np.all(frame.samples == 0)]
    assert len(silence) >= 3
    starts = [frame.started_at_ms for frame in frames]
    assert starts == sorted(starts), "时间轴必须单调推进"
    assert np.diff(starts) == pytest.approx(np.full(len(starts) - 1, float(FRAME_DURATION_MS)))
