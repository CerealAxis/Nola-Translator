"""Audio routing: route description, safety preflight, and capture backends.

Implements the AudioRoute structure from research-audio-routing.md §7 and the
two system-audio routes from target-architecture 03 §6:

  * windows_process_include — capture the application selected by the user;
  * R2 virtual_input — user-installed virtual cable recording endpoint;

plus the pre-existing device (PortAudio mic/loopback) and browser_tab inputs.
All backends emit the SAME normalized AudioFrame stream (16 kHz mono float32,
20 ms frames) so ingestion/ASR never branches on the input kind.

Safety rules enforced here (doc 03 §6, research §7):
  * a route whose capture input and speech output form a feedback loop is
    rejected as `unsafe` — never silently accepted;
  * process-exclude without a real excluded process tree is unsafe (it would
    re-capture Nola's own translated speech);
  * capability/endpoint probes are injected so preflight is testable without
    audio hardware, and unsupported capability yields an explicit reason
    instead of a fallback to plain loopback.
"""

from __future__ import annotations

import asyncio
from abc import ABC, abstractmethod
from dataclasses import dataclass, replace
from typing import AsyncIterator, Callable, Literal

import numpy as np

from ..audio.resample import (
    FRAME_DURATION_MS,
    AudioFrame,
    StreamingAudioNormalizer,
)
from .capture_process_loopback import (
    LoopbackMode,
    ProcessLoopbackCapability,
    ProcessLoopbackCapture,
    ProcessLoopbackError,
)
from .process_sources import open_selection

InputMode = Literal[
    "microphone",
    "endpoint_loopback",
    "process_include",
    "process_exclude",
    "virtual_input",
    "browser_tab",
]

FeedbackStatus = Literal["validated", "unsafe", "unknown"]

#: Map from session InputKind/capture_backend (contracts.py) to route input
#: modes. Kept here so contracts.py stays untouched.
BACKEND_TO_INPUT_MODE: dict[str, InputMode] = {
    "device": "endpoint_loopback",
    "windows_process_exclude": "process_exclude",
    "windows_process_include": "process_include",
    "virtual_input": "virtual_input",
    "browser_tab": "browser_tab",
}


@dataclass(frozen=True, slots=True)
class AudioRoute:
    """Full route description per research-audio-routing.md §7.

    Endpoint ids are stable OS identities (audio.devices `_stable_device_id`),
    never PortAudio indices or display names. `route_revision` increments on
    any revalidation (hot-plug, default-device change).
    """

    input_mode: InputMode
    #: Stable id of the capture endpoint (microphone / loopback / virtual
    #: recording end). Empty for process_include/process_exclude (the VAD
    #: virtual device has no endpoint identity) and browser_tab.
    input_endpoint_id: str = ""
    #: Root PIDs of process trees for process_include/process_exclude. For
    #: exclude this MUST contain the Electron main process (the real playback
    #: tree), not just the Python backend PID.
    excluded_process_tree: tuple[int, ...] = ()
    speech_output_endpoint_id: str = ""
    monitor_original: bool = False
    monitor_output_endpoint_id: str = ""
    route_revision: int = 0
    feedback_status: FeedbackStatus = "unknown"
    #: Human/machine-readable reason when feedback_status != validated.
    feedback_reason: str = ""


@dataclass(frozen=True, slots=True)
class RouteIssue:
    code: str
    message: str


@dataclass(frozen=True, slots=True)
class RoutePreflightResult:
    route: AudioRoute
    issues: tuple[RouteIssue, ...] = ()

    @property
    def feedback_status(self) -> FeedbackStatus:
        return self.route.feedback_status

    @property
    def safe(self) -> bool:
        return self.route.feedback_status == "validated"


def preflight_route(
    route: AudioRoute,
    *,
    probe_process_loopback: Callable[[], ProcessLoopbackCapability] | None = None,
    known_endpoint_ids: Callable[[], set[str]] | None = None,
) -> RoutePreflightResult:
    """Validate a route against locally visible topology.

    Topology checks run first (cheap, deterministic); capability probes run
    only for modes that need them. Returns a NEW AudioRoute with
    feedback_status/feedback_reason filled in; the input route is unchanged.

    This only judges what Nola can see: Windows "listen to this device",
    Voicemeeter/OBS monitoring and conferencing loopbacks can re-introduce
    loops externally (research §7) — those stay `unknown` territory for the
    setup wizard, not something preflight can prove safe.
    """
    issues: list[RouteIssue] = []

    def unsafe(code: str, message: str) -> RoutePreflightResult:
        issues.append(RouteIssue(code, message))
        return _finalize(route, issues, "unsafe")

    # 1. Feedback loop: capturing the same endpoint the translated speech is
    #    played to re-records Nola itself.
    if route.input_endpoint_id and route.input_endpoint_id == route.speech_output_endpoint_id:
        return unsafe(
            "feedback_loop",
            "capture input endpoint is the same as the speech output endpoint",
        )

    # 2. Process-exclude must actually exclude the playback tree; an empty
    #    tree degenerates to full-system loopback that captures Nola's TTS.
    if route.input_mode == "process_exclude" and not route.excluded_process_tree:
        return unsafe(
            "missing_exclude_tree",
            "process_exclude requires the real playback process tree (Electron main PID)",
        )

    # 3. process_include of Nola's own tree would capture only Nola — always
    #    a wiring mistake; and monitor replay through Nola on top of a
    #    full-endpoint process capture can double the source (research §6 R2).
    if (
        route.input_mode == "process_exclude"
        and route.monitor_original
        and route.monitor_output_endpoint_id
        and route.monitor_output_endpoint_id == route.speech_output_endpoint_id
        and not route.excluded_process_tree
    ):
        return unsafe(
            "monitor_loop",
            "monitor output shares the speech output endpoint without an exclude tree",
        )

    # 4. Endpoint existence for modes bound to a stable endpoint id.
    if route.input_mode in ("microphone", "endpoint_loopback", "virtual_input"):
        if not route.input_endpoint_id:
            return unsafe("missing_input_endpoint", f"{route.input_mode} requires an input endpoint id")
        if known_endpoint_ids is not None:
            known = known_endpoint_ids()
            if route.input_endpoint_id not in known:
                return unsafe(
                    "input_endpoint_missing",
                    f"capture endpoint {route.input_endpoint_id} is not present",
                )
        if (
            route.input_mode == "virtual_input"
            and route.speech_output_endpoint_id
            and known_endpoint_ids is not None
        ):
            known = known_endpoint_ids()
            if known and route.speech_output_endpoint_id not in known:
                return unsafe(
                    "output_endpoint_missing",
                    f"speech output endpoint {route.speech_output_endpoint_id} is not present",
                )

    # 5. Capability probe for the driverless system-audio route.
    if route.input_mode in ("process_exclude", "process_include"):
        if probe_process_loopback is None:
            return _finalize(route, issues, "unknown", "capability probe unavailable")
        capability = probe_process_loopback()
        if not capability.supported:
            issues.append(
                RouteIssue(
                    f"process_loopback_{capability.reason}",
                    capability.detail or capability.reason,
                )
            )
            return _finalize(route, issues, "unsafe")

    return _finalize(route, issues, "validated")


def _finalize(
    route: AudioRoute, issues: list[RouteIssue], status: FeedbackStatus, reason: str = ""
) -> RoutePreflightResult:
    final_reason = reason or ("; ".join(issue.message for issue in issues) if status != "validated" else "")
    updated = replace(route, feedback_status=status, feedback_reason=final_reason)
    return RoutePreflightResult(route=updated, issues=tuple(issues))


# ---------------------------------------------------------------------------
# Capture backends: four front doors, one AudioFrame stream
# ---------------------------------------------------------------------------


class CaptureBackend(ABC):
    """Produces normalized 16 kHz mono float32 AudioFrames regardless of the
    physical input. Ingestion consumes this interface only."""

    #: Which contracts.CaptureBackend literal this class implements.
    backend_kind: str = ""

    @abstractmethod
    async def start(self) -> None:
        """Acquire the device/COM resources; raise on failure (no silent
        fallback to a different capture path)."""

    @abstractmethod
    def stop(self) -> None:
        """Release resources; idempotent."""

    @abstractmethod
    def frames(self) -> AsyncIterator[AudioFrame]:
        """Yield continuous 20 ms frames until stopped."""

    def silence_pad(self, gap_ms: float) -> list[AudioFrame]:
        """Explicit capture silence (e.g. WASAPI loopback idle). Distinct from
        a transport gap, which ingestion reports as audio_gap instead."""
        return []


class DeviceCaptureBackend(CaptureBackend):
    """Existing PortAudio path: microphones and selected-endpoint loopback.

    Thin delegation to audio.capture.PortAudioCapture (which already owns the
    WASAPI silence padding and device-lost detection); this class exists so
    ingestion sees one interface for all four backends.
    """

    backend_kind = "device"

    def __init__(self, capture_factory: Callable[[], object]) -> None:
        # The factory returns a started-or-startable PortAudioCapture-like
        # object (start/stop/frames); injected so tests never touch hardware.
        self._capture_factory = capture_factory
        self._capture: object | None = None

    async def start(self) -> None:
        capture = self._capture_factory()
        capture.start()  # type: ignore[attr-defined]
        self._capture = capture

    def stop(self) -> None:
        capture, self._capture = self._capture, None
        if capture is not None:
            capture.stop()  # type: ignore[attr-defined]

    async def frames(self) -> AsyncIterator[AudioFrame]:
        if self._capture is None:
            raise RuntimeError("backend not started")
        async for frame in self._capture.frames():  # type: ignore[attr-defined]
            yield frame


class VirtualInputCaptureBackend(DeviceCaptureBackend):
    """R2: capture the recording end of a user-installed virtual cable.

    Identical mechanics to a device capture (it IS a recording endpoint);
    the distinct class keeps backend_kind honest for diagnostics and stops
    callers from confusing it with the microphone/loopback default path.
    """

    backend_kind = "virtual_input"


class ProcessExcludeCaptureBackend(CaptureBackend):
    """R1: driverless system-audio capture excluding Nola's playback tree.

    Runs ProcessLoopbackCapture's COM reader thread and normalizes its raw
    chunks (default render mix format, usually 48 kHz stereo float32) to the
    canonical frame stream. Device loss / activation failure raise
    ProcessLoopbackError — never a downgrade to plain loopback.
    """

    backend_kind = "windows_process_exclude"

    #: Loopback delivers nothing while the excluded set plays nothing; pad
    #: explicit silence past this idle window so downstream VAD sees quiet
    #: rather than a frozen timeline (same policy as PortAudioCapture).
    SILENCE_PAD_AFTER_MS = FRAME_DURATION_MS

    def __init__(self, target_pid: int, *, mode: LoopbackMode = "exclude", queue_capacity: int = 200, target_alive=None) -> None:
        self._capture = ProcessLoopbackCapture(target_pid, mode=mode, queue_capacity=queue_capacity, target_alive=target_alive)
        self._normalizer: StreamingAudioNormalizer | None = None
        self._task: asyncio.Task | None = None
        self._reader_error: Exception | None = None
        self._out_queue: asyncio.Queue[list[AudioFrame] | None] = asyncio.Queue(maxsize=64)
        self._last_chunk_monotonic = 0.0

    @classmethod
    def probe(cls, target_pid: int | None = None) -> ProcessLoopbackCapability:
        return ProcessLoopbackCapture.probe(target_pid)

    async def start(self) -> None:
        fmt = await asyncio.to_thread(self._capture.start)
        self._normalizer = StreamingAudioNormalizer(fmt.sample_rate, fmt.channels)
        self._last_chunk_monotonic = asyncio.get_running_loop().time() * 1000.0
        self._task = asyncio.create_task(self._reader(fmt))

    async def _reader(self, fmt) -> None:
        capture = self._capture
        assert self._normalizer is not None
        seen_drops = pending_gap = 0
        received_audio = False
        try:
            while True:
                chunk = await asyncio.to_thread(capture.get_chunk, 0.1)
                now = asyncio.get_running_loop().time() * 1000.0
                if chunk is None:
                    if not capture.running:
                        if capture.failure is not None:
                            raise capture.failure
                        break
                    # Idle loopback: pad explicit capture silence so the VAD
                    # timeline keeps advancing (never a transport gap).
                    gap = now - self._last_chunk_monotonic
                    if self._last_chunk_monotonic and gap >= self.SILENCE_PAD_AFTER_MS * 2:
                        frames = self._normalizer.silence(gap)
                        self._last_chunk_monotonic = now
                        if frames:
                            await self._out_queue.put(frames)
                    continue
                self._last_chunk_monotonic = now
                drops = capture.dropped_frames
                if drops != seen_drops or (received_audio and chunk.discontinuity):
                    pending_gap += max(1, round((drops - seen_drops) * 16_000 / fmt.sample_rate))
                    seen_drops = drops
                    self._normalizer = StreamingAudioNormalizer(fmt.sample_rate, fmt.channels)
                received_audio = True
                if fmt.encoding == "pcm_f32le":
                    samples = np.frombuffer(chunk.data, dtype="<f4")
                    frames = self._normalizer.accept_float32(samples, chunk.captured_at_ms)
                else:
                    frames = self._normalizer.accept_int16(chunk.data, chunk.captured_at_ms)
                if frames:
                    if pending_gap:
                        frames[0] = replace(frames[0], lost_samples_before=pending_gap)
                        pending_gap = 0
                    await self._out_queue.put(frames)
        except asyncio.CancelledError:
            return
        except Exception as error:
            self._reader_error = error
        await self._out_queue.put(None)

    async def frames(self) -> AsyncIterator[AudioFrame]:
        while True:
            batch = await self._out_queue.get()
            if batch is None:
                break
            for frame in batch:
                yield frame
        # Reader terminated: surface device loss/activation failure instead of
        # ending the stream as if it were a clean EOF.
        if self._reader_error is not None:
            raise self._reader_error

    def stop(self) -> None:
        self._capture.stop()
        task, self._task = self._task, None
        if task is not None and not task.done():
            task.cancel()
        # Unblock frames() consumers waiting on the queue after a clean stop
        # (the reader task may have been cancelled before emitting a sentinel).
        try:
            self._out_queue.put_nowait(None)
        except asyncio.QueueFull:
            pass


class ProcessIncludeCaptureBackend(ProcessExcludeCaptureBackend):
    backend_kind = "windows_process_include"

    def __init__(self, selection_id: str) -> None:
        self._selection = open_selection(selection_id)
        self._opened = False

    async def start(self) -> None:
        pid, alive = self._selection.__enter__()
        self._opened = True
        super().__init__(pid, mode="include", target_alive=alive)
        await super().start()

    def stop(self) -> None:
        if self._opened:
            self._opened = False
            try:
                super().stop()
            finally:
                self._selection.__exit__(None, None, None)


class BrowserTabCaptureBackend(CaptureBackend):
    """Browser-tab input: PCM pushed by the extension transport.

    The extension keeps its own epoch/media-time anchoring (doc 04 §2); this
    backend only normalizes pushed chunks to frames. Pushing blocks nothing:
    a bounded backlog evicts the oldest chunk and counts the drop, which
    ingestion later surfaces as an explicit gap, never as silence.
    """

    backend_kind = "browser_tab"

    def __init__(self, sample_rate: int, channels: int = 1, *, max_backlog_chunks: int = 100) -> None:
        self._normalizer = StreamingAudioNormalizer(sample_rate, channels)
        self._queue: asyncio.Queue[list[AudioFrame] | None] = asyncio.Queue(maxsize=max_backlog_chunks)
        self._running = False
        self.dropped_chunks = 0

    async def start(self) -> None:
        self._running = True

    def push(self, data: bytes, captured_at_ms: float) -> bool:
        """Accept one PCM16 chunk from the extension transport."""
        if not self._running:
            return False
        frames = self._normalizer.accept_int16(data, captured_at_ms)
        if not frames:
            return True
        try:
            self._queue.put_nowait(frames)
            return True
        except asyncio.QueueFull:
            # Bounded backlog: evict oldest, count, keep newest.
            try:
                self._queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.dropped_chunks += 1
            try:
                self._queue.put_nowait(frames)
            except asyncio.QueueFull:
                return False
            return True

    async def frames(self) -> AsyncIterator[AudioFrame]:
        while self._running or not self._queue.empty():
            try:
                batch = await asyncio.wait_for(self._queue.get(), timeout=0.1)
            except (asyncio.TimeoutError, TimeoutError):
                continue
            if batch is None:
                break
            for frame in batch:
                yield frame

    def stop(self) -> None:
        self._running = False
        try:
            self._queue.put_nowait(None)
        except asyncio.QueueFull:
            pass


_KIND_TO_INPUT_MODE: dict[str, InputMode] = {
    "microphone": "microphone",
    "system_audio": "endpoint_loopback",
    "process_audio": "process_include",
    "virtual_input": "virtual_input",
    "browser_tab": "browser_tab",
}


def route_from_input_config(
    input_config,
    *,
    speech_output_endpoint_id: str = "",
    monitor_original: bool = False,
    monitor_output_endpoint_id: str = "",
) -> AudioRoute:
    """Build an AudioRoute from a session InputConfig (contracts.InputConfig).

    Duck-typed to avoid a circular import with contracts.py. The excluded
    process tree is taken verbatim from Electron and is NEVER auto-filled with
    the backend PID: translated speech is played by the renderer tree, so a
    backend-only tree would re-capture Nola (doc 08 §6, research R02). An empty
    tree for process_exclude stays empty so preflight_route reports
    missing_exclude_tree instead of silently capturing Nola's own output.
    """

    backend = getattr(input_config, "capture_backend", None)
    if backend is not None:
        input_mode = BACKEND_TO_INPUT_MODE[backend]
    else:
        input_mode = _KIND_TO_INPUT_MODE[input_config.kind]
    endpoint_bound = input_mode in ("microphone", "endpoint_loopback", "virtual_input")
    return AudioRoute(
        input_mode=input_mode,
        input_endpoint_id=input_config.device_id if endpoint_bound else "",
        excluded_process_tree=tuple(getattr(input_config, "excluded_process_tree", ()) or ()),
        speech_output_endpoint_id=speech_output_endpoint_id,
        monitor_original=monitor_original,
        monitor_output_endpoint_id=monitor_output_endpoint_id,
    )
