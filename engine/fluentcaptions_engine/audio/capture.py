"""PortAudio callback 与异步识别管线之间的容量受限队列。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from queue import Empty, Full, Queue
from time import monotonic
from typing import AsyncIterator, Callable, Protocol

import pyaudiowpatch as pyaudio
import numpy as np

from .devices import AudioDeviceRecord
from .resample import AudioFrame, StreamingAudioNormalizer


@dataclass(frozen=True, slots=True)
class RawAudioChunk:
    data: bytes
    captured_at_ms: float


class RawAudioQueue:
    """callback 仅复制字节并使用非阻塞队列；满载时淘汰最旧块。"""

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
    """活动流因设备断开而停止。"""


class PortAudioCapture:
    """采集一个已解析的 WASAPI 设备，并异步产生标准 AudioFrame。"""

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
        self.stream.start_stream()

    async def frames(self) -> AsyncIterator[AudioFrame]:
        while self.running or not self.queue.empty():
            try:
                chunk = await asyncio.to_thread(self.queue.get, 0.1)
            except Empty:
                if self.running and self.stream is not None and not self.stream.is_active():
                    raise AudioDeviceDisconnectedError(self.device.device_id)
                continue
            samples = self.normalizer.accept_float32(np.frombuffer(chunk.data, dtype="<f4"), chunk.captured_at_ms)
            for frame in samples:
                yield frame

    def stop(self) -> None:
        self.running = False
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
