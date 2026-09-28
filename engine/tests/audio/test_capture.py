import numpy as np
import pytest

from nola_translator_engine.audio.capture import (
    AudioDeviceDisconnectedError,
    PortAudioCapture,
    RawAudioChunk,
    RawAudioQueue,
)
from nola_translator_engine.audio.devices import AudioDeviceRecord


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
        device_id="wasapi:systemOutput:test",
        backend_index=33,
        name="测试扬声器",
        kind="systemOutput",
        is_default=True,
        sample_rate=48_000,
        channels=2,
    )


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
