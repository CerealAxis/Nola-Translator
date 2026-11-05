"""Native playback and original-audio mixing for the meeting routes."""

from __future__ import annotations

import asyncio
from collections import deque
from math import gcd
from threading import Lock

import numpy as np
import pyaudiowpatch as pyaudio
from scipy.signal import correlate, resample_poly

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


def _test_signal() -> np.ndarray:
    time = np.arange(round(TARGET_SAMPLE_RATE * 0.65)) / TARGET_SAMPLE_RATE
    phase = 2 * np.pi * (440 * time + 880 / (2 * 0.65) * time ** 2)
    envelope = np.minimum(1, np.minimum(time, 0.65 - time) / 0.025)
    return (0.12 * envelope * np.sin(phase)).astype(np.float32)


def _signal_correlation(samples: np.ndarray, reference: np.ndarray) -> float:
    if samples.size < reference.size:
        return 0.0
    # Normalize at each offset so endpoint gain and driver latency do not decide the result.
    matched = correlate(samples, reference, mode="valid", method="fft")
    energy = np.cumsum(np.r_[0.0, samples.astype(np.float64) ** 2])
    energy = energy[reference.size:] - energy[:-reference.size]
    denominator = np.sqrt(np.maximum(energy, 1e-12) * float(np.dot(reference, reference)))
    return float(np.clip(np.max(np.abs(matched) / denominator), 0, 1))


async def _collect_test_audio(capture) -> np.ndarray:
    chunks, count = [], 0
    async with asyncio.timeout(3):
        async for frame in capture.frames():
            chunk = frame.samples[:TARGET_SAMPLE_RATE * 2 - count]
            chunks.append(chunk)
            count += chunk.size
            if count >= TARGET_SAMPLE_RATE * 2:
                return np.concatenate(chunks)
    raise RuntimeError("Audio test capture ended")


async def _play_test_audio(device_id: str, samples: np.ndarray) -> None:
    output = MeetingOutput(device_id, 1, monitor=False)
    try:
        output.set_route(True)
        pcm = np.rint(np.clip(samples, -1, 32767 / 32768) * 32768).astype("<i2").tobytes()
        done = output.add_translation(pcm, TARGET_SAMPLE_RATE, 1, last=True)
        if not await asyncio.wait_for(done, 4):
            raise RuntimeError("Audio test playback interrupted")
    finally:
        output.close()


async def test_meeting_audio(request) -> dict:
    from ..audio.devices import AudioDeviceRegistry
    from .contracts import InputConfig
    from .desktop_capture import _desktop_backend
    from .meeting import _error, _vb_pair
    from .sessions import SessionError

    capture = None
    collecting = None
    stage = "capture"
    try:
        devices = AudioDeviceRegistry().refresh()
        if request.kind == "application":
            capture = _desktop_backend(InputConfig(kind="process_audio", capture_backend="windows_process_include",
                                                   process_selection_id=request.device_id.removeprefix("process:")))
            await capture.start()
            samples = await _collect_test_audio(capture)
            return {"kind": request.kind, "has_signal": bool(np.sqrt(np.mean(samples ** 2)) >= 0.002),
                    "peak": float(np.max(np.abs(samples))), "playback_sent": False}
        selected = next((device for device in devices if device.device_id == request.device_id), None)
        if selected is None:
            output = request.kind in ("headphones", "cable")
            raise SessionError(_error("PLAYBACK_DEVICE_LOST" if output else "AUDIO_SOURCE_UNAVAILABLE",
                                      "playback" if output else "capture",
                                      "audioOutputUnavailable" if output else "audioInputUnavailable"))
        playback_id = request.playback_device_id if request.kind == "microphone" else None
        if playback_id:
            headphones = next((device for device in devices if device.device_id == playback_id), None)
            if (headphones is None or headphones.kind != "systemOutput"):
                raise SessionError(_error("PLAYBACK_DEVICE_LOST", "playback", "audioOutputUnavailable"))
        if request.kind == "headphones":
            if selected.kind != "systemOutput":
                raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute"), status=400)
            stage = "playback"
            await _play_test_audio(selected.device_id, _test_signal())
            return {"kind": request.kind, "has_signal": False, "peak": 0, "playback_sent": True}
        reference = None
        input_id = selected.device_id
        if request.kind == "cable":
            pair = _vb_pair(selected.name, "Input") if selected.kind == "systemOutput" else None
            partner = next((device for device in devices if device.kind == "microphone"
                            and _vb_pair(device.name, "Output") == pair), None) if pair else None
            if request.recording_device_id:
                partner = next((device for device in devices if device.kind == "microphone"
                                and device.device_id == request.recording_device_id), None)
            if selected.kind != "systemOutput" or partner is None:
                raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute"), status=400)
            input_id = partner.device_id
            reference = _test_signal()
        elif selected.kind != "microphone":
            raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute"), status=400)
        capture = _desktop_backend(InputConfig(kind="microphone", device_id=input_id, capture_backend="device"))
        await capture.start()
        collecting = asyncio.create_task(_collect_test_audio(capture))
        if reference is not None:
            await asyncio.sleep(0.1)
            stage = "playback"
            await _play_test_audio(selected.device_id, reference)
            stage = "capture"
        samples = await collecting
        capture.stop()
        capture = None
        peak = float(np.max(np.abs(samples)))
        result = {"kind": request.kind, "peak": peak, "has_signal": bool(np.sqrt(np.mean(samples ** 2)) >= 0.002),
                  "playback_sent": False}
        if reference is not None:
            result["correlation"] = _signal_correlation(samples, reference)
            # Unrelated speech or ambient noise must not pass a cable loopback test.
            result["has_signal"] = peak >= 0.01 and result["correlation"] >= 0.65
        if playback_id:
            stage = "playback"
            await _play_test_audio(playback_id, samples)
            result["playback_sent"] = True
        return result
    except SessionError:
        raise
    except (OSError, RuntimeError, ValueError, TimeoutError) as exc:
        key = "audioOutputUnavailable" if stage == "playback" else "audioInputUnavailable"
        code = "PLAYBACK_DEVICE_LOST" if stage == "playback" else "AUDIO_SOURCE_UNAVAILABLE"
        raise SessionError(_error(code, stage, key)) from exc
    finally:
        if collecting is not None:
            collecting.cancel()
            await asyncio.gather(collecting, return_exceptions=True)
        if capture is not None:
            capture.stop()
