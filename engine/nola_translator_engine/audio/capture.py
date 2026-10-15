"""The capacity-bounded queue between the PortAudio callback and the async recognition pipeline."""

from __future__ import annotations

import asyncio
import base64
import io
import math
import wave
from dataclasses import dataclass, replace
from collections import deque
from queue import Empty, Full, Queue
from time import monotonic
from typing import AsyncIterator, Callable, Literal, Protocol

import pyaudiowpatch as pyaudio
import numpy as np
from numpy.typing import NDArray

from .devices import AudioDeviceRecord, resolve_capture_device
from .resample import AudioFrame, FRAME_DURATION_MS, TARGET_SAMPLE_RATE, StreamingAudioNormalizer
from ..debug_log import exception_fields, write as write_debug


@dataclass(frozen=True, slots=True)
class RawAudioChunk:
    data: bytes
    captured_at_ms: float


class RawAudioQueue:
    """The callback only copies bytes through a non-blocking queue; a full queue evicts the oldest chunk."""

    def __init__(self, capacity: int = 100) -> None:
        if capacity <= 0:
            raise ValueError("capacity 必须为正数")
        self.capacity = capacity
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


class RawAudioSink(Protocol):
    def write_capture(self, data: bytes, sample_format: Literal["int16", "float32"]) -> None: ...
    def write_silence(self, duration_ms: float) -> None: ...


class AudioDeviceDisconnectedError(RuntimeError):
    """The active stream stopped because the device disconnected."""


async def capture_audio_test(capture: PortAudioCapture) -> dict[str, object]:
    """Preview the same 16 kHz mono input ASR receives, without gain or noise processing."""
    target_samples = TARGET_SAMPLE_RATE * 2
    chunks: list[NDArray[np.float32]] = []
    samples = 0
    try:
        capture.start()
        try:
            async with asyncio.timeout(2.0):
                async for frame in capture.frames():
                    chunk = frame.samples[:target_samples - samples]
                    chunks.append(chunk)
                    samples += chunk.size
                    if samples >= target_samples:
                        break
        except TimeoutError:
            pass
    finally:
        capture.stop()
    values = np.concatenate(chunks) if chunks else np.empty(0, dtype=np.float32)
    has_signal = bool(np.any(values != 0))
    write_debug("engine", "audio.test.complete", {"requestId": capture.request_id,
        "capturedSamples": samples, "durationMs": 2000, "hasSignal": has_signal})
    # PCM16 WAV requires integer full-scale encoding; this is conversion, not volume normalization.
    pcm = np.rint(np.clip(values, -1.0, 32767 / 32768) * 32768).astype("<i2")
    pcm = np.pad(pcm, (0, target_samples - pcm.size))
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(TARGET_SAMPLE_RATE)
        audio.writeframes(pcm.tobytes())
    return {"audioBase64": base64.b64encode(output.getvalue()).decode("ascii"),
            "durationMs": 2000, "hasSignal": has_signal}


class BrowserAudioCapture:
    """Accept PCM16 mono without touching a device; backlog includes the chunk being consumed."""

    def __init__(self) -> None:
        self._queue: deque[tuple[bytes, int, float]] = deque()
        self._wake = asyncio.Event()
        self.buffered_ms = 0.0
        self.running = False
        self.paused = False
        self.dropped_chunks = 0
        self._finishing = False
        self.normalizer: StreamingAudioNormalizer | None = None
        self._last_end_ms: float | None = None
        #: Counters behind the `capture.*` diagnostic lines. A browser session produces no device
        #: stream and `dropped_chunks` only counts refused pushes, so without these the only
        #: observable is silence — which is also what a healthy quiet passage looks like.
        self.pushed_chunks = 0
        self.pushed_samples = 0
        self.frames_out = 0
        self.frames_out_samples = 0
        self.peak_dbfs = -120.0
        self.rms_dbfs = -120.0
        self.last_sample_rate = 0
        self.push_rejects = 0

    def start(self) -> None:
        self.running = True

    def _measure(self, samples: NDArray[np.float32]) -> None:
        if samples.size == 0:
            return
        peak = float(np.max(np.abs(samples)))
        rms = float(np.sqrt(np.mean(np.square(samples.astype(np.float64)))))
        self.peak_dbfs = max(self.peak_dbfs, 20.0 * math.log10(peak) if peak > 0 else -120.0)
        self.rms_dbfs = max(self.rms_dbfs, 20.0 * math.log10(rms) if rms > 0 else -120.0)

    def push(self, data: bytes, sample_rate: int, captured_at_ms: float) -> bool:
        duration_ms = len(data) * 500 / sample_rate
        if not self.running or self.paused or self._finishing:
            self.push_rejects += 1
            return False
        # A count bound also protects against thousands of tiny valid PCM packets.
        if self.buffered_ms + duration_ms > 2000 + 1e-6 or len(self._queue) >= 100:
            self.push_rejects += 1
            self.dropped_chunks += 1
            return False
        self._queue.append((data, sample_rate, captured_at_ms))
        self.buffered_ms += duration_ms
        self.pushed_chunks += 1
        self.pushed_samples += len(data) // 2
        self.last_sample_rate = sample_rate
        self._measure(np.frombuffer(data, dtype="<i2").astype(np.float32) / 32768.0)
        self._wake.set()
        return True

    def pause(self) -> None:
        self.paused = True
        self._discard()

    def resume(self) -> None:
        self.paused = False
        self._finishing = False

    def finish(self) -> None:
        self._finishing = True
        self._wake.set()

    def _discard(self) -> None:
        self._queue.clear()
        self.buffered_ms = 0.0
        self.normalizer = None
        self._last_end_ms = None
        self._wake.set()

    def stop(self) -> None:
        self.running = False
        self._discard()

    async def frames(self) -> AsyncIterator[AudioFrame]:
        while self.running and not (self._finishing and not self._queue):
            if not self._queue or self.paused:
                self._wake.clear()
                await self._wake.wait()
                continue
            data, rate, captured_at_ms = self._queue.popleft()
            duration_ms = len(data) * 500 / rate
            # A missing packet must not collapse elapsed video time into sample time.
            if (self.normalizer is None or self.normalizer.input_rate != rate
                    or self._last_end_ms is not None and abs(captured_at_ms - self._last_end_ms) > 2):
                self.normalizer = StreamingAudioNormalizer(rate, 1)
            frames = self.normalizer.accept_int16(data, captured_at_ms)
            self._last_end_ms = captured_at_ms + duration_ms
            try:
                for frame in frames:
                    if not self.running or self.paused:
                        break
                    self.frames_out += 1
                    self.frames_out_samples += frame.samples.size
                    yield frame
            finally:
                self.buffered_ms = max(0.0, self.buffered_ms - duration_ms)
        if self._finishing and self.normalizer is not None:
            for frame in self.normalizer.finish():
                self.frames_out += 1
                self.frames_out_samples += frame.samples.size
                yield frame


class PortAudioCapture:
    """Capture one resolved WASAPI device and produce standard AudioFrames asynchronously."""

    def __init__(
        self,
        device: AudioDeviceRecord,
        backend_factory: Callable[[], object] = pyaudio.PyAudio,
        queue_capacity: int = 100,
        *,
        request_id: str | None = None,
    ) -> None:
        self.device = device
        self.backend_factory = backend_factory
        self.queue = RawAudioQueue(queue_capacity)
        self.normalizer = StreamingAudioNormalizer(device.sample_rate, device.channels)
        self.backend: object | None = None
        self.stream: PortAudioStream | None = None
        self.running = False
        self.paused = False
        self._finishing = False
        self.request_id = request_id
        self._sample_format = pyaudio.paFloat32
        self.recording_sink: RawAudioSink | None = None

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
        context = {"requestId": self.request_id, "kind": self.device.kind,
                   "deviceId": self.device.device_id, "deviceName": self.device.name,
                   "backendIndex": self.device.backend_index, "isDefault": self.device.is_default,
                   "sampleRate": self.device.sample_rate, "channels": self.device.channels,
                   "sampleFormat": "float32", "framesPerBuffer": max(1, self.device.sample_rate // 50)}
        started_at = monotonic()
        stage = "initialize"
        try:
            backend = self.backend_factory()
            self.backend = backend
            stage = "resolve"
            # Registry discovery uses a different PortAudio lifetime; its numeric index can move.
            self.device = resolve_capture_device(backend, self.device)
            context.update(backendIndex=self.device.backend_index, sampleRate=self.device.sample_rate,
                           channels=self.device.channels, framesPerBuffer=max(1, self.device.sample_rate // 50))
            stage = "open"
            # MP3 has no multichannel mode. Ask WASAPI for its stereo mix instead of
            # averaging an unlabelled surround layout and risking phase cancellation.
            channels = [min(self.device.channels, 2)]
            # WASAPI may advertise more channels than its current shared mix accepts. PortAudio
            # also maps IAudioClient initialization failures to paInvalidDevice, so try compatible
            # PCM layouts on this same endpoint before declaring it unavailable.
            # Prefer the recorder's native PCM16 representation; some input devices only expose float32.
            formats = [pyaudio.paInt16, pyaudio.paFloat32]
            candidates = [(count, sample_format) for sample_format in formats for count in channels]
            for attempt, (count, sample_format) in enumerate(candidates):
                context.update(channels=count, sampleFormat="float32" if sample_format == pyaudio.paFloat32 else "int16")
                write_debug("engine", "audio.capture.open.start", {**context, "attempt": attempt + 1})
                try:
                    self.stream = backend.open(
                        format=sample_format,
                        channels=count,
                        rate=self.device.sample_rate,
                        input=True,
                        input_device_index=self.device.backend_index,
                        frames_per_buffer=max(1, self.device.sample_rate // 50),
                        stream_callback=self._callback,
                        start=False,
                    )
                    break
                except OSError as error:
                    if (attempt + 1 == len(candidates) or error.errno not in {
                            pyaudio.paInvalidDevice, pyaudio.paInvalidChannelCount,
                            pyaudio.paInvalidSampleRate, pyaudio.paSampleFormatNotSupported}):
                        raise
                    write_debug("engine", "audio.capture.open.retry", {**context, "attempt": attempt + 1,
                        **exception_fields(error)})
            self.device = replace(self.device, channels=count)
            self._sample_format = sample_format
            self.normalizer = StreamingAudioNormalizer(self.device.sample_rate, count)
            stage = "start"
            write_debug("engine", "audio.capture.open.ready", context)
            self.running = True
            self.paused = False
            self.stream.start_stream()
        except Exception as error:
            write_debug("engine", "audio.capture.failed", {
                **context, "stage": stage, **exception_fields(error),
                "elapsedMs": round((monotonic() - started_at) * 1000),
                "streamAllocated": self.stream is not None, "backendAllocated": self.backend is not None,
                "running": self.running,
            })
            self.stop()
            write_debug("engine", "audio.capture.cleanup.complete", {**context,
                "backendAllocated": self.backend is not None, "streamAllocated": self.stream is not None,
                "running": self.running})
            raise
        write_debug("engine", "audio.capture.started", {**context, "elapsedMs": round((monotonic() - started_at) * 1000)})

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

    def reset_stream(self) -> None:
        """Drop pre-seek callback data while the WASAPI stream is paused."""
        # A cancelled frames() call can leave its blocking reader alive for 100 ms.
        # Replacing the queue prevents that old reader from stealing post-seek audio.
        old_queue = self.queue
        self.queue = RawAudioQueue(old_queue.capacity)
        self.queue.dropped_chunks = old_queue.dropped_chunks
        self.normalizer = StreamingAudioNormalizer(self.device.sample_rate, self.device.channels)
        self._finishing = False

    def finish(self) -> None:
        """Stop device input while allowing accepted callback packets to reach the final flush."""
        self.pause()
        self._finishing = True

    async def frames(self) -> AsyncIterator[AudioFrame]:
        # silence lookback window: pad with zero frames only once a full frame length has
        # elapsed, so sub-frame jitter doesn't allocate arrays.
        last_seen_ms = monotonic() * 1000
        while (self.running or not self.queue.empty()) and not (self._finishing and self.queue.empty()):
            try:
                chunk = await asyncio.to_thread(self.queue.get, 0.1)
            except Empty:
                if self.running and self.stream is not None and self.stream.is_active():
                    gap = monotonic() * 1000 - last_seen_ms
                    if gap >= FRAME_DURATION_MS:
                        # loopback pushes nothing while nothing is playing, so pad zero frames
                        # to hand the volume gate the silence — without it segments never close,
                        # and neither the final nor its translation ever fires.
                        silence_frames = self.normalizer.silence(gap)
                        if self.recording_sink is not None and not self.paused and silence_frames:
                            self.recording_sink.write_silence(len(silence_frames) * FRAME_DURATION_MS)
                        for frame in silence_frames:
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
            if self.recording_sink is not None and not self.paused:
                sample_format: Literal["int16", "float32"] = (
                    "int16" if self._sample_format == pyaudio.paInt16 else "float32"
                )
                self.recording_sink.write_capture(chunk.data, sample_format)
            samples = (self.normalizer.accept_int16(chunk.data, chunk.captured_at_ms)
                       if self._sample_format == pyaudio.paInt16 else
                       self.normalizer.accept_float32(np.frombuffer(chunk.data, dtype="<f4"), chunk.captured_at_ms))
            for frame in samples:
                yield frame
        if self._finishing:
            for frame in self.normalizer.finish():
                yield frame

    def stop(self) -> None:
        self.running = False
        self.paused = False
        stream, backend = self.stream, self.backend
        self.stream = None
        self.backend = None
        # A failed stop/close must still release PortAudio and preserve the original startup error.
        operations = [("stop", stream.stop_stream), ("close", stream.close)] if stream is not None else []
        if backend is not None:
            operations.append(("terminate", backend.terminate))
        for stage, operation in operations:
            try:
                operation()
            except Exception as error:
                write_debug("engine", "audio.capture.cleanup.failed", {"requestId": self.request_id,
                    "deviceId": self.device.device_id, "stage": stage, **exception_fields(error)})
