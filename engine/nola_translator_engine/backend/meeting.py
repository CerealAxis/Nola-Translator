"""A pair of realtime pipelines with native, independently routed audio."""

from __future__ import annotations

import asyncio
import ctypes
import re
from contextlib import suppress
from time import monotonic, time
from traceback import extract_tb
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from ..debug_log import write as write_debug
from .contracts import ErrorPayload, SessionCommand, SessionConfig
from .desktop_capture import _CAPTURE_FORMAT, _desktop_backend
from .ingestion import InputAudioFrame
from .sessions import SessionError
from .s2s_audio import S2SAudioOutput
from .tts_pipeline import TtsPipeline


class MeetingRequest(BaseModel):
    command_id: UUID
    uplink: SessionConfig | None = None
    downlink: SessionConfig | None = None
    uplink_output_id: str = Field(default="", max_length=512)
    downlink_output_id: str = Field(default="", max_length=512)

    @model_validator(mode="after")
    def require_direction(self):
        if self.uplink is None and self.downlink is None:
            raise ValueError("At least one meeting direction is required")
        return self
    duck_volume: float = Field(ge=0, le=1)
    passthrough_key: str = Field(max_length=100)

    @field_validator("passthrough_key")
    @classmethod
    def validate_passthrough_key(cls, value):
        _shortcut_keys(value)
        return value


class MeetingPauseRequest(BaseModel):
    paused: bool


class MeetingAudioTestRequest(BaseModel):
    kind: Literal["microphone", "headphones", "cable", "application"]
    device_id: str = Field(min_length=1, max_length=512)
    playback_device_id: str | None = Field(default=None, min_length=1, max_length=512)
    recording_device_id: str | None = Field(default=None, min_length=1, max_length=512)


def _error(code, stage, key, direction=None):
    return ErrorPayload(
        code=code, stage=stage, message_key=f"meeting.{key}",
        safe_details={"direction": direction} if direction else {},
    )


def _unexpected(exc: Exception, key: str):
    write_debug("engine", "meeting.unexpected", {
        "type": type(exc).__name__, "frames": [f"{frame.name}:{frame.lineno}" for frame in extract_tb(exc.__traceback__)],
    })
    return _error("INTERNAL_ERROR", "session", key)


def _vb_pair(name: str, end: str) -> str | None:
    if re.search(r"\bVB[- ]?Audio\b", name, re.IGNORECASE):
        match = re.search(rf"\bCABLE(?:[- ]([A-D]))?\s+{end}\b", name, re.IGNORECASE)
        if match:
            return (match[1] or "standard").casefold()
    return None


def _shortcut_keys(key: str):
    if not key:
        return None, set()
    parts = key.split("+")
    name = parts.pop()
    modifiers = {"control": 0x11, "ctrl": 0x11, "commandorcontrol": 0x11, "cmdorctrl": 0x11,
                 "alt": 0x12, "option": 0x12, "shift": 0x10, "super": 0x5B, "meta": 0x5B, "command": 0x5B, "cmd": 0x5B}
    keys = {"Space": 0x20, "Tab": 0x09, "Enter": 0x0D, "Escape": 0x1B, "Backspace": 0x08,
            "Delete": 0x2E, "Insert": 0x2D, "Home": 0x24, "End": 0x23, "PageUp": 0x21, "PageDown": 0x22,
            "Left": 0x25, "Up": 0x26, "Right": 0x27, "Down": 0x28, "Plus": 0xBB, "Equal": 0xBB,
            "Minus": 0xBD, "Comma": 0xBC, "Period": 0xBE, "Slash": 0xBF, "Backslash": 0xDC,
            "Semicolon": 0xBA, "Quote": 0xDE, "BracketLeft": 0xDB, "BracketRight": 0xDD, "Backquote": 0xC0}
    virtual_key = 0x70 + int(name[1:]) - 1 if re.fullmatch(r"F([1-9]|1\d|2[0-4])", name) else ord(name) if re.fullmatch(r"[A-Z0-9]", name) else keys.get(name)
    if virtual_key is None or any(part.lower() not in modifiers for part in parts):
        raise ValueError("Invalid keyboard shortcut")
    required = {modifiers[part.lower()] for part in parts}
    if len(required) != len(parts):
        raise ValueError("Duplicate shortcut modifier")
    return virtual_key, required


def _key_reader(key: str):
    virtual_key, required = _shortcut_keys(key)
    if virtual_key is None:
        return lambda: False
    read = ctypes.windll.user32.GetAsyncKeyState
    read.argtypes = (ctypes.c_int,)
    read.restype = ctypes.c_short
    def pressed():
        active = {code for code in (0x11, 0x12, 0x10) if read(code) & 0x8000}
        if read(0x5B) & 0x8000 or read(0x5C) & 0x8000:
            active.add(0x5B)
        return active == required and bool(read(virtual_key) & 0x8000)
    return pressed


class _Route:
    def __init__(self, session, registry, name: str, output_id: str):
        self.session, self.registry, self.name, self.output_id = session, registry, name, output_id
        self.owner = str(uuid4())
        self.stream = f"meeting-{self.owner}"
        self.capture = self.output = self.capture_task = None
        self.input_since = self.original_since = float("inf")
        self.sequence = self.sample = 0
        self.input_peak = 0.0
        self.input_at = None
        self.playback = "idle"
        self.rows = {}
        self.speaker_numbers = {}
        self.transcript_seq = 0
        self.started_at_ms = int(time() * 1000)
        self.epoch_offsets = {}

    def error(self, code, stage, key):
        return _error(code, stage, key, self.name)

    async def open(self, duck_volume: float) -> None:
        from .meeting_audio import MeetingOutput

        try:
            self.output = MeetingOutput(self.output_id, duck_volume, monitor=self.name == "downlink" and self.session.config.input.kind == "virtual_input")
        except (OSError, RuntimeError, ValueError) as exc:
            raise SessionError(self.error("PLAYBACK_DEVICE_LOST", "playback", "audioOutputUnavailable")) from exc
        try:
            self.capture = _desktop_backend(self.session.config.input)
            if self.capture is None:
                raise ValueError("Meeting requires native input")
            startup = asyncio.create_task(self.capture.start())
            try:
                await asyncio.shield(startup)
            except BaseException:
                # Native activation must finish before meeting cleanup releases its handles.
                with suppress(Exception):
                    await startup
                raise
        except (OSError, RuntimeError, ValueError) as exc:
            raise SessionError(self.error("AUDIO_SOURCE_UNAVAILABLE", "capture", "audioInputUnavailable")) from exc
        self.capture_task = asyncio.create_task(self._capture())

    async def _capture(self) -> None:
        ingestion = self.registry.ingestion(self.session)
        async for frame in self.capture.frames():
            self.input_peak = float(max(abs(frame.samples.min()), abs(frame.samples.max()))) if frame.samples.size else 0.0
            self.input_at = monotonic()
            if frame.started_at_ms >= self.original_since:
                self.output.add_original(frame.samples)
            if frame.started_at_ms < self.input_since:
                continue
            self.sample += frame.lost_samples_before
            result = ingestion.accept(InputAudioFrame(
                session_id=ingestion.session_id, stream_id=self.stream, epoch=self.session.epoch,
                audio_seq=self.sequence, sample_start=self.sample, sample_count=frame.samples.size,
                format=_CAPTURE_FORMAT, payload=frame.samples.astype("<f4", copy=False).tobytes(),
            ))
            if result.status == "rejected":
                raise RuntimeError(f"Meeting capture rejected: {result.reason}")
            self.sequence += 1
            self.sample += frame.samples.size

    def update_transcript(self) -> None:
        for event in self.session._log._ring:
            if event.event_seq <= self.transcript_seq:
                continue
            self.transcript_seq = event.event_seq
            payload = event.payload
            segment_id = payload.get("segment_id")
            if event.event_type in ("translated_text", "translation_committed") and "source_refs" in payload:
                refs = payload["source_refs"]
                if len(refs) != 1:
                    continue
                segment_id = refs[0]
            if not segment_id:
                continue
            key = f"{self.session.session_id}:{event.epoch}:{segment_id}"
            if event.event_type not in ("source_text", "source_committed", "translated_text", "translation_committed", "speaker_changed"):
                continue
            row = self.rows.setdefault(key, {
                "segmentId": key, "direction": self.name, "revision": 0, "sourceText": "", "isFinal": False,
                "startedAtMs": max(0, event.emitted_at_unix_ms - self.started_at_ms), "translations": [], "_epoch": event.epoch, "_source_revision": 0, "_targets": {},
            })
            if event.event_type in ("source_text", "source_committed"):
                revision = payload.get("source_revision", 0)
                if revision < row["_source_revision"] or row["isFinal"] and revision == row["_source_revision"] and event.event_type == "source_text":
                    continue
                if revision > row["_source_revision"]:
                    row["translations"] = []
                    row["_targets"] = {}
                row.update(sourceText=payload.get("text", ""), sourceLanguage=payload.get("language", "auto"),
                           isFinal=event.event_type == "source_committed", _source_revision=revision)
                if span := payload.get("audio_span"):
                    row["startedAtMs"] = self.epoch_offsets.get(event.epoch, 0) + span["start_sample"] / 16
            elif event.event_type in ("translated_text", "translation_committed"):
                revision = payload.get("based_on_source_revision", payload.get("source_revision", 0))
                if revision != row["_source_revision"]:
                    continue
                language = payload.get("target_language", "")
                target_revision = payload.get("target_revision", 0)
                previous = row["_targets"].get(language)
                final = event.event_type == "translation_committed"
                if previous and (target_revision < previous[0] or target_revision == previous[0] and (previous[1] or not final)):
                    continue
                row["_targets"][language] = (target_revision, final)
                row["translations"] = [item for item in row["translations"] if item["targetLanguage"] != language] + [{
                    "targetLanguage": language, "text": payload.get("text", ""), "provider": "meeting",
                    "state": "complete" if event.event_type == "translation_committed" else "pending",
                }]
            if payload.get("speaker_id") and payload.get("speaker_metadata_revision", 0) >= row.get("speakerMetadataRevision", 0):
                speaker = str(payload["speaker_id"])
                if speaker not in self.speaker_numbers:
                    self.speaker_numbers[speaker] = len(self.speaker_numbers) + 1
                row.update(speakerId=speaker, speakerNumber=self.speaker_numbers[speaker],
                           speakerMetadataRevision=payload.get("speaker_metadata_revision", 0))
            row["revision"] += 1
            while len(self.rows) > 2048:
                del self.rows[next(iter(self.rows))]

    def transcript(self) -> list[dict]:
        self.update_transcript()
        return [{key: value for key, value in row.items() if not key.startswith("_")} for row in self.rows.values() if row["sourceText"]]

    def telemetry(self) -> dict:
        self.update_transcript()
        rows = [row for row in self.rows.values() if row["_epoch"] == self.session.epoch and row["sourceText"]]
        latest = rows[-1] if rows else {}
        return {
            "input_peak": self.input_peak,
            "input_age_ms": max(0, round((monotonic() - self.input_at) * 1000)) if self.input_at is not None else None,
            "playback": self.playback, **({"source_text": latest["sourceText"]} if latest else {}),
            **({"translated_text": translated} if (translated := next((item["text"] for item in latest.get("translations", ())
                if item.get("text") and item["targetLanguage"] == self.session.config.speech_target_language), None)) else {}),
        }

    def attach(self) -> None:
        playback = self.registry.playbacks.get(self.session.session_id)

        async def tts(grant):
            claim, chunks = grant.claim, grant.synthesis.chunks
            if playback.ack(claim.job_id, self.owner, claim.claim_id, claim.generation, "started"):
                self.playback = "playing"
            for i, chunk in enumerate(chunks):
                done = self.output.add_translation(chunk.pcm, chunk.sample_rate, chunk.channels, last=i + 1 == len(chunks))
            if await done:
                if playback.ack(claim.job_id, self.owner, claim.claim_id, claim.generation, "finished", claim.sample_count):
                    self.playback = "finished"

        async def s2s(packet):
            if packet.chunk_seq == 0:
                if playback.ack(packet.audio_stream_id, self.owner, packet.claim_id, packet.generation, "started"):
                    self.playback = "playing"
            done = self.output.add_translation(packet.pcm, packet.sample_rate, packet.channels, last=packet.is_last)
            if done is not None:
                def finish(future):
                    if future.result():
                        if playback.ack(
                            packet.audio_stream_id, self.owner, packet.claim_id, packet.generation,
                            "finished", packet.sample_start + len(packet.pcm) // (2 * packet.channels),
                        ):
                            self.playback = "finished"

                done.add_done_callback(finish)

        sink = tts if isinstance(playback, TtsPipeline) else s2s
        if not isinstance(playback, (TtsPipeline, S2SAudioOutput)) or not playback.attach(self.owner, sink):
            raise SessionError(self.error("PLAYBACK_DEVICE_LOST", "playback", "audioOutputUnavailable"))

    def start_input(self) -> None:
        self.epoch_offsets[self.session.epoch] = max(0, int(time() * 1000) - self.started_at_ms)
        self.sequence = self.sample = 0
        self.registry.ingestion(self.session).open_stream(self.stream, self.session.epoch, _CAPTURE_FORMAT)
        self.input_since = monotonic() * 1000

    def begin_passthrough(self) -> None:
        self.playback = "idle"
        self.input_since = float("inf")
        self.output.set_route(True, passthrough=True)
        self.original_since = monotonic() * 1000
        playback = self.registry.playbacks.get(self.session.session_id)
        if playback is not None:
            self.session.playback_generation = playback.stop()

    def end_passthrough(self) -> None:
        self.original_since = float("inf")
        self.output.set_route(False)

    def check(self) -> None:
        try:
            if self.capture_task.done():
                self.capture_task.result()
                raise RuntimeError("Capture ended")
        except Exception as exc:
            raise SessionError(self.error("AUDIO_SOURCE_UNAVAILABLE", "capture", "audioInputUnavailable")) from exc
        try:
            if not self.output.active():
                raise RuntimeError("Playback ended")
        except (OSError, RuntimeError) as exc:
            raise SessionError(self.error("PLAYBACK_DEVICE_LOST", "playback", "audioOutputUnavailable")) from exc
        if self.session.state in ("failed", "closed") or (
            self.session.last_error is not None and self.session.last_error.code == "SYNTHESIS_FAILED"
        ):
            self.raise_pipeline_error()

    def raise_pipeline_error(self) -> None:
        error = self.session.last_error or self.error("INTERNAL_ERROR", "pipeline", "startFailed")
        raise SessionError(error.model_copy(update={"safe_details": {**error.safe_details, "direction": self.name}}))

    def mute(self) -> None:
        self.playback = "idle"
        if self.output is not None:
            self.output.set_route(False)

    async def close(self) -> None:
        try:
            if self.capture_task is not None:
                self.capture_task.cancel()
                await asyncio.gather(self.capture_task, return_exceptions=True)
        finally:
            try:
                if self.capture is not None:
                    self.capture.stop()
            finally:
                if self.output is not None:
                    self.output.close()


class Meeting:
    def __init__(self, ctx, config: MeetingRequest, sessions, read_key):
        self.ctx, self.config = ctx, config
        self.read_key = read_key
        enabled = [name for name in ("uplink", "downlink") if getattr(config, name) is not None]
        self.routes = tuple(_Route(session, ctx.pipeline_registry, name, getattr(config, f"{name}_output_id"))
                            for name, session in zip(enabled, sessions))
        self.uplink = next((route for route in self.routes if route.name == "uplink"), None)
        self.state = "preparing"
        self.last_error = None
        self.passthrough = False
        self.paused = False
        self.startup = self.watch = self.restore = None
        self.lock = asyncio.Lock()

    def snapshot(self) -> dict:
        server = self.ctx.server_instance_id
        last_error = self.last_error or next((route.session.last_error.model_copy(update={"safe_details": {"direction": route.name}})
            for route in self.routes if route.session.last_error and route.session.last_error.scope == "task"), None)
        return {
            "meeting_id": str(self.config.command_id), "state": self.state, "passthrough_active": self.passthrough, "paused": self.paused,
            "last_error": last_error.model_dump(mode="json") if last_error else None,
            "telemetry": {route.name: route.telemetry() for route in self.routes},
            "segments": sorted((row for route in self.routes for row in route.transcript()), key=lambda row: row["startedAtMs"]),
            **{route.name: route.session.snapshot(server).model_dump(mode="json") for route in self.routes},
        }

    async def start(self) -> None:
        async with self.lock:
            if self.state != "preparing":
                return
            self.startup = asyncio.current_task()
            try:
                async with asyncio.timeout(160):
                    for route in self.routes:
                        await route.open(self.config.duck_volume)
                    for route in self.routes:
                        await self._command(route, "start")
                        route.attach()
                    started_at_ms = int(time() * 1000)
                    for route in self.routes:
                        route.started_at_ms = started_at_ms
                        route.check()
                        route.output.set_route(True)
                        route.start_input()
                    for route in self.routes:
                        if route.name == "downlink" and route.session.config.input.kind == "virtual_input":
                            route.original_since = monotonic() * 1000
                    self.watch = asyncio.create_task(self._watch(self.read_key()))
                    self.state = "running"
            except asyncio.CancelledError:
                await self._close("closed")
                raise
            except Exception as exc:
                self.last_error = exc.payload if isinstance(exc, SessionError) else _unexpected(exc, "startFailed")
                await self._close("failed")
                if isinstance(exc, SessionError):
                    raise
                raise SessionError(self.last_error, status=503) from exc
            finally:
                self.startup = None

    async def _command(self, route, kind):
        ack = await self.ctx.session_manager.command(
            route.session.session_id, SessionCommand(command_id=str(uuid4()), type=kind),
        )
        if kind != "stop" and ack.result_state != ("paused" if kind == "pause" else "running"):
            route.raise_pipeline_error()

    async def _restore_uplink(self) -> None:
        route = self.uplink
        if route is None:
            return
        async with asyncio.timeout(30):
            await self._command(route, "reset_stream")
        if not self.passthrough:
            route.attach()
            route.output.set_route(True)
            route.start_input()

    async def _watch(self, key_down: bool) -> None:
        try:
            while True:
                await asyncio.sleep(0.01)
                for route in self.routes:
                    route.check()
                    route.update_transcript()
                if self.restore is not None and self.restore.done():
                    self.restore.result()
                    self.restore = None
                try:
                    down = self.read_key()
                except (OSError, RuntimeError) as exc:
                    raise SessionError(_error("INVALID_CONFIG", "input", "shortcutUnavailable")) from exc
                if self.paused or self.uplink is None or down == key_down:
                    continue
                key_down = down
                if down:
                    self.passthrough = True
                    self.uplink.begin_passthrough()
                elif self.passthrough:
                    self.passthrough = False
                    self.uplink.end_passthrough()
                    if self.restore is None:
                        self.restore = asyncio.create_task(self._restore_uplink())
        except Exception as exc:
            self.last_error = exc.payload if isinstance(exc, SessionError) else _unexpected(exc, "backendUnavailable")
            async with self.lock:
                await self._close("failed")

    async def set_paused(self, paused: bool) -> None:
        async with self.lock:
            if self.state != "running" or self.paused == paused:
                return
            try:
                self.paused = paused
                self.passthrough = False
                if self.restore is not None:
                    self.restore.cancel()
                    await asyncio.gather(self.restore, return_exceptions=True)
                    self.restore = None
                for route in self.routes:
                    route.input_since = route.original_since = float("inf")
                    route.mute()
                for route in self.routes:
                    await self._command(route, "pause" if paused else "resume")
                    if not paused:
                        # S2S replaces its playback owner on resume; TTS retains its owner.
                        playback = self.ctx.pipeline_registry.playbacks.get(route.session.session_id)
                        if isinstance(playback, S2SAudioOutput):
                            route.attach()
                        route.output.set_route(True)
                        route.start_input()
                        if route.name == "downlink" and route.session.config.input.kind == "virtual_input":
                            route.original_since = monotonic() * 1000
            except Exception as exc:
                self.last_error = exc.payload if isinstance(exc, SessionError) else _unexpected(exc, "pipelineFailed")
                await self._close("failed")
                raise SessionError(self.last_error) from exc

    async def close(self) -> None:
        if self.startup is not None and not self.startup.cancelling():
            self.startup.cancel()
        async with self.lock:
            await self._close("closed")

    async def _close(self, state) -> None:
        if self.state in ("closed", "failed"):
            return
        for route in self.routes:
            route.update_transcript()
            route.mute()
        self.passthrough = False
        tasks = [task for task in (self.watch, self.restore) if task is not None and task is not asyncio.current_task()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            await asyncio.gather(*(route.close() for route in self.routes), return_exceptions=True)
            await asyncio.gather(*(
                self._command(route, "stop") for route in self.routes if route.session.state != "closed"
            ), return_exceptions=True)
        finally:
            for route in self.routes:
                key = route.session.session_id
                self.ctx.ingestions.pop(key, None)
                self.ctx.pipeline_registry.provider_connections.pop(key, None)
                route.session._log.close_all()
            await self.ctx.session_manager.release_meeting(self.routes[0].session.session_id)
            self.state = state


def validate_route(config: MeetingRequest, gateway) -> None:
    from ..audio.devices import AudioDeviceRegistry

    up, down = config.uplink, config.downlink
    lanes = [lane for lane in (up, down) if lane is not None]
    invalid = any("audio" not in lane.required_outputs or lane.recording_path for lane in lanes)
    invalid |= bool(up and (up.input.kind != "microphone" or up.input.capture_backend not in (None, "device") or not config.uplink_output_id))
    invalid |= bool(down and (down.input.kind not in ("virtual_input", "process_audio") or not config.downlink_output_id
        or down.input.kind == "virtual_input" and down.input.capture_backend not in (None, "virtual_input")))
    invalid |= bool(up and down and (up.input.device_id == down.input.device_id and down.input.kind != "process_audio"
                                    or config.uplink_output_id == config.downlink_output_id))
    if invalid:
        raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute"), status=400)
    try:
        devices = AudioDeviceRegistry().refresh()
    except (OSError, RuntimeError) as exc:
        raise SessionError(_error("AUDIO_SOURCE_UNAVAILABLE", "capture", "audioInputUnavailable")) from exc
    by_id = {device.device_id: device for device in devices}
    for name, lane, output in (("uplink", up, config.uplink_output_id), ("downlink", down, config.downlink_output_id)):
        if lane is None:
            continue
        selected = by_id.get(output)
        if selected is None or getattr(selected, "kind", "systemOutput") != "systemOutput":
            raise SessionError(_error("PLAYBACK_DEVICE_LOST", "playback", "audioOutputUnavailable", name), status=400)
        if lane.input.kind != "process_audio":
            selected = by_id.get(lane.input.device_id)
            if selected is None or getattr(selected, "kind", "microphone") != "microphone":
                raise SessionError(_error("AUDIO_SOURCE_UNAVAILABLE", "capture", "audioInputUnavailable", name), status=400)
        elif lane.input.capture_backend != "windows_process_include" or not lane.input.process_selection_id:
            raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute", name), status=400)
    if up and down:
        up_name = by_id[config.uplink_output_id].name
        down_name = by_id[down.input.device_id].name if down.input.kind == "virtual_input" else ""
        if _vb_pair(up_name, "Input") and _vb_pair(up_name, "Input") == _vb_pair(down_name, "Output"):
            raise SessionError(_error("INVALID_CONFIG", "routing", "invalidRoute"), status=400)
    if up and down and up.pipeline.kind == down.pipeline.kind == "cascade" and up.pipeline.asr_model == down.pipeline.asr_model:
        model = up.pipeline.asr_model
        registry = getattr(gateway, "registry", None)
        entry = registry.get(model) if registry and model in ("aliyun", "minimax") else None
        if entry and entry.definition.capabilities.concurrency.max_active_requests < 2:
            raise SessionError(_error("RESOURCE_BUSY", "asr", "asrConcurrencyUnavailable"))
