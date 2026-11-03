"""Bridge normalized desktop capture into the realtime ingestion timeline."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Callable
from contextlib import suppress
from uuid import uuid4

from ..audio.resample import TARGET_SAMPLE_RATE
from .contracts import InputConfig
from .ingestion import AudioIngestion, InputAudioFrame, StreamFormat
from .routing import (
    CaptureBackend,
    DeviceCaptureBackend,
    ProcessExcludeCaptureBackend,
    ProcessIncludeCaptureBackend,
    VirtualInputCaptureBackend,
    route_from_input_config,
)

_CAPTURE_FORMAT = StreamFormat(TARGET_SAMPLE_RATE, encoding="pcm_f32le")


def _desktop_backend(config: InputConfig) -> CaptureBackend | None:
    route = route_from_input_config(config)
    if route.input_mode == "browser_tab":
        return None
    if route.input_mode == "process_include":
        return ProcessIncludeCaptureBackend(config.process_selection_id)
    if route.input_mode == "process_exclude":
        if not route.excluded_process_tree:
            raise ValueError("process exclusion requires the Electron main PID")
        pid = route.excluded_process_tree[0]
        if pid <= 0 or pid == os.getpid():
            raise ValueError("process exclusion requires the Electron main PID")
        return ProcessExcludeCaptureBackend(pid)

    if config.kind == "microphone" and not (config.device_id or config.capture_backend):
        return None
    if route.input_mode == "virtual_input" and not route.input_endpoint_id:
        raise ValueError("virtual capture requires an explicit recording endpoint")

    def device_capture():
        from ..audio.capture import PortAudioCapture
        from ..audio.devices import AudioDeviceRegistry

        kind = "systemOutput" if config.kind == "system_audio" and route.input_mode == "endpoint_loopback" else "microphone"
        device = AudioDeviceRegistry().resolve(kind, route.input_endpoint_id or None)
        return PortAudioCapture(device)

    backend = VirtualInputCaptureBackend if route.input_mode == "virtual_input" else DeviceCaptureBackend
    return backend(device_capture)


class DesktopCapture:
    def __init__(self, backend: CaptureBackend, ingestion: AudioIngestion, epoch: int) -> None:
        self._backend = backend
        self._ingestion = ingestion
        self._epoch = epoch
        self._stream_id = f"desktop-{uuid4().hex}"
        self._stopped = False

    async def pump(self) -> None:
        sample_start = 0
        seq = 0
        try:
            async for frame in self._backend.frames():
                if self._stopped:
                    return
                samples = frame.samples.astype("<f4", copy=False)
                sample_start += frame.lost_samples_before
                outcome = self._ingestion.accept(InputAudioFrame(
                    session_id=self._ingestion.session_id,
                    stream_id=self._stream_id,
                    epoch=self._epoch,
                    audio_seq=seq,
                    sample_start=sample_start,
                    sample_count=samples.size,
                    format=_CAPTURE_FORMAT,
                    payload=samples.tobytes(),
                ))
                if outcome.status == "rejected":
                    raise RuntimeError(f"desktop audio rejected: {outcome.reason}")
                seq += 1
                sample_start += samples.size
            if not self._stopped:
                raise RuntimeError("desktop audio capture ended unexpectedly")
        finally:
            await self.stop()

    async def stop(self, *, eof: bool = False) -> None:
        if self._stopped:
            return
        self._stopped = True
        try:
            self._backend.stop()
        finally:
            self._ingestion.close_stream(self._stream_id, eof=eof)


async def start_desktop_capture(
    config: InputConfig,
    ingestion: AudioIngestion,
    epoch: int,
    *,
    backend_factory: Callable[[InputConfig], CaptureBackend | None] = _desktop_backend,
) -> DesktopCapture | None:
    backend = backend_factory(config)
    if backend is None:
        return None
    capture = DesktopCapture(backend, ingestion, epoch)
    startup = asyncio.create_task(backend.start())
    try:
        # A native activation running in a thread may outlive a cancelled await.
        await asyncio.shield(startup)
        ingestion.open_stream(capture._stream_id, epoch, _CAPTURE_FORMAT)
    except BaseException:
        with suppress(Exception):
            await startup
        await capture.stop()
        raise
    return capture
