"""The capacity-bounded queue between the PortAudio callback and the async recognition pipeline."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from queue import Empty, Full, Queue
from time import monotonic
from typing import AsyncIterator, Callable, Protocol

import pyaudiowpatch as pyaudio
import numpy as np

from .devices import AudioDeviceRecord
from .resample import AudioFrame, FRAME_DURATION_MS, StreamingAudioNormalizer


@dataclass(frozen=True, slots=True)
class RawAudioChunk:
    data: bytes
    captured_at_ms: float


class RawAudioQueue:
    """The callback only copies bytes through a non-blocking queue; a full queue evicts the oldest chunk."""

    def __init__(self, capacity: int = 100) -> None:
        if capacity <= 0:
            raise ValueError("capacity 必须为正数")
        self._queue: Queue[RawAudioChunk] = Queue(maxsize=capacity)
        self.dropped_chunks = 0

    def put_from_callback(self, chunk: RawAudioChunk) -> bool:
        try:
            self._queue.put_nowait(chunk)
            return True
        except Full:
            try:
                self._queue.get_nowait()
                self.dropped_chunks += 1
            except Empty:
                pass
            try:
                self._queue.put_nowait(chunk)
                return True
            except Full:
                self.dropped_chunks += 1
                return False

    def get_nowait(self) -> RawAudioChunk:
        return self._queue.get_nowait()

    def get(self, timeout: float) -> RawAudioChunk:
        return self._queue.get(timeout=timeout)

    def empty(self) -> bool:
        return self._queue.empty()


class PortAudioStream(Protocol):
    def start_stream(self) -> None: ...
    def stop_stream(self) -> None: ...
    def close(self) -> None: ...
    def is_active(self) -> bool: ...


class AudioDeviceDisconnectedError(RuntimeError):
    """The active stream stopped because the device disconnected."""


class PortAudioCapture:
    """Capture one resolved WASAPI device and produce standard AudioFrames asynchronously."""

    def __init__(
        self,
        device: AudioDeviceRecord,
        backend_factory: Callable[[], object] = pyaudio.PyAudio,
        queue_capacity: int = 100,
    ) -> None:
        self.device = device
        self.backend_factory = backend_factory
        self.queue = RawAudioQueue(queue_capacity)
        self.normalizer = StreamingAudioNormalizer(device.sample_rate, device.channels)
        self.backend: object | None = None
        self.stream: PortAudioStream | None = None
        self.running = False
        self.paused = False

    @property
    def dropped_chunks(self) -> int:
        return self.queue.dropped_chunks

    def _callback(
        self,
        in_data: bytes,
        _frame_count: int,
        _time_info: dict[str, float],
        _status_flags: int,
    ) -> tuple[None, int]:
        self.queue.put_from_callback(RawAudioChunk(bytes(in_data), monotonic() * 1000))
        return (None, pyaudio.paContinue)

    def start(self) -> None:
        if self.running:
            return
        backend = self.backend_factory()
        self.backend = backend
        try:
            self.stream = backend.open(
                format=pyaudio.paFloat32,
                channels=self.device.channels,
                rate=self.device.sample_rate,
                input=True,
                input_device_index=self.device.backend_index,
                frames_per_buffer=max(1, self.device.sample_rate // 50),
                stream_callback=self._callback,
                start=False,
            )
        except Exception:
            backend.terminate()
            self.backend = None
            raise
        self.running = True
        self.paused = False
        self.stream.start_stream()

    def pause(self) -> None:
        """Stop the device stream but keep it open, so a resume costs nothing to set up.

        Pausing at the PortAudio level (rather than discarding frames in the consumer)
        is what makes pause honest: the microphone is genuinely released, nothing is
        written to the recorder, and the recognizer keeps the in-flight sentence it was
        building. The caller is responsible for shifting its own timeline so caption
        timestamps stay continuous across the gap.
        """
        if not self.running or self.paused or self.stream is None:
            return
        try:
            self.stream.stop_stream()
        except OSError:
            pass
        self.paused = True

    def resume(self) -> None:
        """Restart a paused stream. A no-op when not paused, so resume is always safe."""
        if not self.running or not self.paused or self.stream is None:
            return
        self.stream.start_stream()
        self.paused = False

    async def frames(self) -> AsyncIterator[AudioFrame]:
        # silence lookback window: pad with zero frames only once a full frame length has
        # elapsed, so sub-frame jitter doesn't allocate arrays.
        last_seen_ms = monotonic() * 1000
        while self.running or not self.queue.empty():
            try:
                chunk = await asyncio.to_thread(self.queue.get, 0.1)
            except Empty:
                if self.running and self.stream is not None and self.stream.is_active():
                    gap = monotonic() * 1000 - last_seen_ms
                    if gap >= FRAME_DURATION_MS:
                        # loopback pushes nothing while nothing is playing, so pad zero frames
                        # to hand the volume gate the silence — without it segments never close,
                        # and neither the final nor its translation ever fires.
                        for frame in self.normalizer.silence(gap):
                            yield frame
                        last_seen_ms = monotonic() * 1000
                    continue
                if self.running and self.stream is not None and not self.stream.is_active() and not self.paused:
                    # A paused stream is deliberately inactive, so it must not be mistaken
                    # for a device that dropped out. While paused the loop just keeps
                    # polling an empty queue until resume() puts the callback back.
                    raise AudioDeviceDisconnectedError(self.device.device_id)
                continue
            last_seen_ms = monotonic() * 1000
            samples = self.normalizer.accept_float32(np.frombuffer(chunk.data, dtype="<f4"), chunk.captured_at_ms)
            for frame in samples:
                yield frame

    def stop(self) -> None:
        self.running = False
        self.paused = False
        if self.stream is not None:
            try:
                self.stream.stop_stream()
            except OSError:
                pass
            finally:
                self.stream.close()
            self.stream = None
        if self.backend is not None:
            self.backend.terminate()
            self.backend = None
