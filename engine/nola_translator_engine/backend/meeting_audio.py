"""Native playback and original-audio mixing for the meeting routes."""

from __future__ import annotations

import asyncio
from collections import deque
from math import gcd
from threading import Lock

import numpy as np
import pyaudiowpatch as pyaudio
from scipy.signal import resample_poly

from ..audio.devices import AudioDeviceUnavailableError, _stable_device_id
from ..audio.resample import TARGET_SAMPLE_RATE


def _resample(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or not samples.size:
        return samples
    if samples.size == 1:
        return np.repeat(samples, round(target_rate / source_rate))
    common = gcd(source_rate, target_rate)
    return resample_poly(samples, target_rate // common, source_rate // common, padtype="line")


class MeetingOutput:
    def __init__(self, device_id: str, duck_volume: float, *, monitor: bool):
        self.loop = asyncio.get_running_loop()
        self.lock = Lock()
        self.original = deque()
        self.translation = deque()
        self.translation_samples = 0
        self.duck_volume = duck_volume
        self.gain = 1.0
        self.monitor = monitor
        self.enabled = False
        self.passthrough = False
        self.stream = None
        self.backend = pyaudio.PyAudio()
        try:
            host = self.backend.get_host_api_info_by_type(pyaudio.paWASAPI)
            for index in range(int(host["deviceCount"])):
                info = self.backend.get_device_info_by_host_api_device_index(int(host["index"]), index)
                if (info["maxOutputChannels"] and not info.get("isLoopbackDevice")
                        and _stable_device_id("systemOutput", info["name"].strip()) == device_id):
                    break
            else:
                raise AudioDeviceUnavailableError(device_id)
            self.name = info["name"]
            self.rate = round(info["defaultSampleRate"])
            for self.channels in range(min(2, int(info["maxOutputChannels"])), 0, -1):
                try:
                    self.stream = self.backend.open(
                        output=True, output_device_index=info["index"], rate=self.rate, channels=self.channels,
                        format=pyaudio.paFloat32, frames_per_buffer=self.rate // 100,
                        stream_callback=self._render,
                    )
                    break
                except OSError:
                    if self.channels == 1:
                        raise
        except BaseException:
            self.backend.terminate()
            raise

    def set_route(self, enabled: bool, *, passthrough: bool = False) -> None:
        with self.lock:
            self.enabled = enabled
            self.passthrough = passthrough
            self.original.clear()
            while self.translation:
                _, done = self.translation.popleft()
                if done is not None and not done.done():
                    done.set_result(False)
            self.translation_samples = 0
            self.gain = 1.0

    def add_original(self, samples: np.ndarray) -> None:
        samples = _resample(samples, TARGET_SAMPLE_RATE, self.rate)
        with self.lock:
            if self.enabled and (self.monitor or self.passthrough):
                # The capture and render clocks can drift. Keep the live monitor bounded.
                if len(self.original) >= 5:
                    self.original.popleft()
                self.original.append(samples)

    def add_translation(self, pcm: bytes, rate: int, channels: int, *, last: bool):
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32).reshape(-1, channels)
        mono = _resample(samples.mean(axis=1) / 32768, rate, self.rate) if samples.size else np.empty(0, np.float32)
        done = self.loop.create_future() if last else None
        with self.lock:
            if not self.enabled or self.passthrough:
                if done is not None:
                    done.set_result(False)
            else:
                if self.translation_samples + mono.size > 60 * self.rate:
                    raise BufferError("Meeting playback buffer is full")
                self.translation_samples += mono.size
                self.translation.append((mono, done))
        return done

    @staticmethod
    def _finish(done, played: bool) -> None:
        if not done.done():
            done.set_result(played)

    def _render(self, _data, frames: int, timing, _flags):
        original = np.zeros(frames, np.float32)
        translated = np.zeros(frames, np.float32)
        with self.lock:
            offset = 0
            while self.original and offset < frames:
                chunk = self.original[0]
                count = min(frames - offset, len(chunk))
                original[offset:offset + count] = chunk[:count]
                offset += count
                if count == len(chunk):
                    self.original.popleft()
                else:
                    self.original[0] = chunk[count:]
            offset = 0
            while self.translation:
                chunk, done = self.translation[0]
                count = min(frames - offset, len(chunk))
                if not count and len(chunk):
                    break
                translated[offset:offset + count] = chunk[:count]
                offset += count
                self.translation_samples -= count
                if count < len(chunk):
                    self.translation[0] = (chunk[count:], done)
                    break
                self.translation.popleft()
                if done is not None:
                    delay = max(0, timing["output_buffer_dac_time"] - timing["current_time"]) + offset / self.rate
                    self.loop.call_soon_threadsafe(self.loop.call_later, delay, self._finish, done, True)
            if self.monitor:
                self._apply_gain(original[:offset], self.duck_volume, 0.012)
                self._apply_gain(original[offset:], 1.0, 0.070)
        samples = np.clip(original + translated, -1.0, 1.0)
        return np.repeat(samples, self.channels).tobytes(), pyaudio.paContinue

    def _apply_gain(self, samples: np.ndarray, target: float, seconds: float) -> None:
        if not samples.size:
            return
        gain = target + (self.gain - target) * np.exp(-np.arange(1, samples.size + 1) / (self.rate * seconds))
        samples *= gain
        self.gain = float(gain[-1])

    def active(self) -> bool:
        return self.stream is not None and self.stream.is_active()

    def close(self) -> None:
        self.set_route(False)
        try:
            if self.stream is not None:
                self.stream.close()
        finally:
            self.stream = None
            self.backend.terminate()
