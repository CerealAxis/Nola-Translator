"""REST routers and WebSocket endpoints for /api/v2.

REST is control-plane only: create/inspect/command sessions, manage
subscriptions, health. The three WS endpoints split input audio, event
stream and playback audio so large binary frames can never block stop/error
delivery. Every connection performs one writer coroutine; other tasks push
into a per-connection outbound queue.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import AsyncExitStack, suppress
from typing import Annotated, Literal
from time import monotonic
from uuid import UUID, uuid4

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from .contracts import (
    AUDIO_KIND_OUTPUT,
    AudioFrameHeader,
    CommandAck,
    ConflictResponse,
    CreateSessionRequest,
    CreateSessionResponse,
    ErrorPayload,
    EventEnvelope,
    SCHEMA_VERSION,
    SessionCommand,
    SubscriptionRequest,
    SubscriptionResponse,
    WsAudioAck,
    WsClientFrame,
    WsHello,
    WsHelloAck,
    WsPong,
    WsStreamClose,
    WsStreamOpen,
    WsStreamOpened,
    WsPlaybackAck,
    pack_audio_frame,
)


class PlaybackResolution(BaseModel):
    owner_id: str = Field(min_length=1, max_length=128)
from .sessions import Session, SessionError
from .direct_inference import PUBLIC_PROVIDER_CODES, DirectInferenceRequest, DirectInferenceResult, run_direct_inference
from .glossary import RealtimeGlossaryUpdate
from .gateway.adapters import MIMO_TTS_MODEL
from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.gateway import MatchRequest
from .meeting import Meeting, MeetingRequest, MeetingAudioTestRequest, MeetingPauseRequest, _error as meeting_error, _key_reader, validate_route

#: WsClientFrame is an Annotated union alias, not a model class.
_CLIENT_FRAME = TypeAdapter(WsClientFrame)
_DIRECT_REQUEST = TypeAdapter(DirectInferenceRequest)

API_PREFIX = "/api/v2"


class LanguageModelOpenRequest(BaseModel):
    lease_id: UUID
    model: str = Field(min_length=1, max_length=256)
    max_concurrency: int = Field(default=1, ge=1, le=5)


def cloud_asr_options(headers):
    options = {}
    for name, limit in (("key", 4096), ("region", 32), ("endpoint", 2048), ("model", 256), ("workspace", 256)):
        value = headers.get(f"x-nola-asr-{name}", "")
        if 0 < len(value) <= limit:
            options["api_key" if name == "key" else name] = value
    return options


def cloud_mt_options(headers, prefix="x-nola-provider-"):
    options = {}
    for name, limit in (("api-key", 4096), ("region", 32), ("endpoint", 2048), ("email", 256),
                        ("model", 256), ("api-format", 32), ("context-window", 8), ("max-output-tokens", 8)):
        header = prefix + ("key" if name == "api-key" else name)
        value = headers.get(header, "")
        if 0 < len(value) <= limit:
            options[name.replace("-", "_")] = value
    return options


def _configure_realtime_provider(registry, session, headers):
    pipeline = session.config.pipeline
    if pipeline.kind == "s2s":
        api_key = headers.get("x-nola-provider-key", "")
        workspace = headers.get("x-nola-provider-workspace", "")
        region = headers.get("x-nola-provider-region", "")
        if 0 < len(api_key) <= 4096 and 0 < len(workspace) <= 128 and len(region) <= 32:
            registry.provider_connections.setdefault(session.session_id, {
                "provider": "aliyun", "api_key": api_key, "workspace_id": workspace, "region": region,
            })
        return
    connection = registry.provider_connections.setdefault(session.session_id, {})
    if pipeline.translation_model in ("google", "microsoft", "mymemory", "custom-mt"):
        connection.setdefault("mt_options", cloud_mt_options(headers))
    if pipeline.fallback_translation_model in ("google", "microsoft", "mymemory", "custom-mt"):
        connection.setdefault("fallback_mt_options", cloud_mt_options(headers, "x-nola-fallback-"))
    if pipeline.asr_model in ("aliyun", "minimax"):
        connection.setdefault("asr_options", cloud_asr_options(headers))
    if pipeline.tts_model == MIMO_TTS_MODEL:
        tts_key = headers.get("x-nola-tts-key", "")
        if 0 < len(tts_key) <= 4096:
            connection["tts_api_key"] = tts_key


async def _run_while_connected(request: Request, operation):
    async def disconnected():
        while (await request.receive())["type"] != "http.disconnect":
            pass

    task = asyncio.ensure_future(operation)
    disconnect = asyncio.create_task(disconnected())
    try:
        await asyncio.wait((task, disconnect), return_when=asyncio.FIRST_COMPLETED)
        return await task if task.done() else None
    finally:
        disconnect.cancel()
        if not task.done() and not task.cancelling():
            task.cancel()
        with suppress(asyncio.CancelledError):
            await disconnect
        with suppress(asyncio.CancelledError, GatewayError):
            await task

#: Heartbeat engineering initials (doc 09 §3): ping every 5s, connection is
#: considered lost after 15s without a response.
WS_PING_INTERVAL_S = 5.0
WS_PONG_TIMEOUT_S = 15.0


class AudioPreflightRequest(BaseModel):
    """Route description the setup wizard submits for a safety preflight.

    Mirrors routing.AudioRoute; kept as a private management model so the core
    session contract in contracts.py is untouched. `excluded_process_tree` MUST
    carry the real Electron playback tree (not just the backend PID) for
    process_exclude, or preflight reports missing_exclude_tree.
    """

    input_mode: str
    input_endpoint_id: str = ""
    excluded_process_tree: list[int] = Field(default_factory=list)
    speech_output_endpoint_id: str = ""
    speech_output_endpoint_is_opaque: bool = False
    monitor_original: bool = False
    monitor_output_endpoint_id: str = ""
    #: PID passed to the process-loopback capability probe; None probes the
    #: default render endpoint capability only.
    probe_target_pid: int | None = None
    process_selection_id: str = Field(default="", max_length=64)


class AudioProcess(BaseModel):
    pid: int
    name: str
    active: bool
    selection_id: str | None
    reason: str | None


class AudioProcessesResponse(BaseModel):
    available: bool
    reason: str | None = None
    processes: list[AudioProcess]


def build_router() -> APIRouter:
    router = APIRouter(prefix=API_PREFIX)

    def backend(request: Request):
        return request.app.state.backend

    # -- health ---------------------------------------------------------------

    @router.get("/health/live")
    async def health_live(request: Request) -> dict:
        ctx = backend(request)
        return {
            "status": "ok",
            "server_instance_id": ctx.server_instance_id,
            "schema_version": SCHEMA_VERSION,
        }

    @router.get("/health/ready")
    async def health_ready(request: Request) -> dict:
        ctx = backend(request)
        return {
            "status": "ok",
            "server_instance_id": ctx.server_instance_id,
            "schema_version": SCHEMA_VERSION,
            "ready": ctx.accepting_sessions,
        }

    # -- sessions ---------------------------------------------------------------

    @router.put("/realtime/glossary")
    async def update_realtime_glossary(request: Request, body: RealtimeGlossaryUpdate):
        ctx = backend(request)
        if not ctx.realtime_enabled:
            return _error_response(503, meeting_error("RESOURCE_BUSY", "session", "backendUnavailable"), ctx.server_instance_id)
        await ctx.pipeline_registry.update_glossary(body)
        return {"revision": ctx.pipeline_registry.desktop_glossary.revision}

    @router.post("/sessions", status_code=201)
    async def create_session(request: Request, body: CreateSessionRequest):
        ctx = backend(request)
        if not ctx.accepting_sessions:
            return _error_response(
                503,
                ErrorPayload(
                    code="RESOURCE_BUSY",
                    stage="session",
                    message_key="backend.shuttingDown",
                ),
                ctx.server_instance_id,
            )
        try:
            session = await ctx.session_manager.create(body)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        return CreateSessionResponse(
            session_id=session.session_id,
            pipeline_id=session.pipeline_id,
            config_revision=session.config_revision,
            state=session.state,
            snapshot=session.snapshot(ctx.server_instance_id),
        ).model_dump(mode="json")

    @router.get("/sessions/{session_id}")
    async def get_session(request: Request, session_id: UUID):
        ctx = backend(request)
        try:
            session = ctx.session_manager.get(session_id)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        return session.snapshot(ctx.server_instance_id).model_dump(mode="json")

    @router.post("/sessions/{session_id}/commands", status_code=202)
    async def session_command(request: Request, session_id: UUID, body: SessionCommand):
        ctx = backend(request)
        try:
            session = ctx.session_manager.get(session_id)
            if session.owner == "meeting":
                return _error_response(400, meeting_error("INVALID_CONFIG", "routing", "invalidRoute"), ctx.server_instance_id)
            if ctx.realtime_enabled and body.type == "start" and session.state == "created":
                _configure_realtime_provider(ctx.pipeline_registry, session, request.headers)
            ack = await ctx.session_manager.command(session_id, body)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        if ctx.realtime_enabled and ack.result_state in ("closed", "failed"):
            ctx.pipeline_registry.provider_connections.pop(session_id, None)
        return JSONResponse(status_code=202, content=ack.model_dump(mode="json"))

    @router.post("/meetings/audio-test")
    async def meeting_audio_test(request: Request, body: MeetingAudioTestRequest):
        from .meeting_audio import test_meeting_audio

        ctx = backend(request)
        if not ctx.accepting_sessions:
            return _error_response(503, meeting_error("RESOURCE_BUSY", "session", "backendUnavailable"), ctx.server_instance_id)
        try:
            async with ctx.meeting_lock, ctx.session_manager.audio_test_slot():
                return await _run_while_connected(request, test_meeting_audio(body))
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)

    @router.post("/meetings", status_code=201)
    async def create_meeting(request: Request, body: MeetingRequest):
        ctx = backend(request)
        if not ctx.realtime_enabled or not ctx.accepting_sessions:
            return _error_response(503, meeting_error("RESOURCE_BUSY", "session", "backendUnavailable"), ctx.server_instance_id)
        try:
            async with ctx.meeting_lock:
                meeting = ctx.meetings.get(body.command_id)
                if meeting is None:
                    validate_route(body, ctx.gateway)
                    try:
                        read_key = _key_reader(body.passthrough_key) if body.uplink is not None else lambda: False
                    except (AttributeError, OSError) as exc:
                        raise SessionError(meeting_error("INVALID_CONFIG", "input", "shortcutUnavailable")) from exc
                    sessions = await ctx.session_manager.reserve_meeting(body.uplink, body.downlink)
                    meeting = ctx.meetings[body.command_id] = Meeting(ctx, body, sessions, read_key)
                    for session in sessions:
                        _configure_realtime_provider(ctx.pipeline_registry, session, request.headers)
                    while len(ctx.meetings) > 32:
                        expired_id = next(
                            (key for key, value in ctx.meetings.items() if value.state in ("closed", "failed")), None,
                        )
                        if expired_id is None:
                            break
                        expired = ctx.meetings.pop(expired_id)
                        ctx.session_manager.forget_meeting(tuple(route.session for route in expired.routes))
                elif meeting.config != body:
                    raise SessionError(ErrorPayload(
                        code="COMMAND_CONFLICT", stage="session", message_key="session.commandIdReuse",
                        correlation_id=str(body.command_id),
                    ))
            try:
                await _run_while_connected(request, meeting.start())
            except asyncio.CancelledError:
                if meeting.state != "closed":
                    raise
            if meeting.last_error is not None:
                raise SessionError(meeting.last_error)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        return meeting.snapshot()

    @router.get("/meetings/{meeting_id}")
    async def get_meeting(request: Request, meeting_id: UUID):
        ctx = backend(request)
        meeting = ctx.meetings.get(meeting_id)
        if meeting is None:
            return _error_response(404, meeting_error("SESSION_NOT_FOUND", "session", "notFound"), ctx.server_instance_id)
        return meeting.snapshot()

    @router.patch("/meetings/{meeting_id}")
    async def pause_meeting(request: Request, meeting_id: UUID, body: MeetingPauseRequest):
        ctx = backend(request)
        meeting = ctx.meetings.get(meeting_id)
        if meeting is None:
            return _error_response(404, meeting_error("SESSION_NOT_FOUND", "session", "notFound"), ctx.server_instance_id)
        try:
            await meeting.set_paused(body.paused)
        except SessionError as exc:
            return _error_response(exc.status, exc.payload, ctx.server_instance_id)
        return meeting.snapshot()

    @router.delete("/meetings/{meeting_id}")
    async def stop_meeting(request: Request, meeting_id: UUID):
        ctx = backend(request)
        meeting = ctx.meetings.get(meeting_id)
        if meeting is None:
            return _error_response(404, meeting_error("SESSION_NOT_FOUND", "session", "notFound"), ctx.server_instance_id)
        await meeting.close()
        return meeting.snapshot()

    @router.post("/sessions/{session_id}/playback/{job_id}/{action}", status_code=202)
    async def resolve_playback(request: Request, session_id: UUID, job_id: str, action: Literal["retry", "skip"], body: PlaybackResolution):
        from .tts_pipeline import TtsPipeline

        ctx = backend(request)
        playback = ctx.pipeline_registry.playbacks.get(session_id) if ctx.realtime_enabled else None
        try:
            session = ctx.session_manager.get(session_id)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        if not isinstance(playback, TtsPipeline) or body.owner_id != _owner_id(session) or not playback.resolve_failure(job_id, retry=action == "retry"):
            return _error_response(409, ErrorPayload(
                code="INVALID_CONFIG", stage="playback", message_key="playback.actionUnavailable",
            ), ctx.server_instance_id)
        return {"accepted": True}

    @router.post("/sessions/{session_id}/input/end", status_code=202)
    async def finish_native_input(request: Request, session_id: UUID):
        ctx = backend(request)
        try:
            session = ctx.session_manager.get(session_id)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        capture = ctx.pipeline_registry.captures.get(session_id) if ctx.realtime_enabled else None
        if session.owner != "browser_captions" or session.state != "running" or capture is None:
            return _error_response(409, ErrorPayload(
                code="INVALID_CONFIG", stage="input", message_key="audio.nativeEndUnavailable",
            ), ctx.server_instance_id)
        await capture.stop(eof=True)
        return {"accepted": True}

    # -- subscriptions ----------------------------------------------------------

    @router.post("/sessions/{session_id}/subscriptions", status_code=201)
    async def create_subscription(request: Request, session_id: UUID, body: SubscriptionRequest):
        ctx = backend(request)
        try:
            session = ctx.session_manager.get(session_id)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        try:
            session._log.subscribe(body.consumer_id, body.outputs)
        except ValueError:
            return _error_response(
                409,
                ErrorPayload(
                    code="COMMAND_CONFLICT",
                    stage="session",
                    scope="consumer",
                    message_key="session.consumerExists",
                ),
                ctx.server_instance_id,
            )
        return SubscriptionResponse(
            session_id=session.session_id,
            consumer_id=body.consumer_id,
            outputs=body.outputs,
        ).model_dump(mode="json")

    @router.delete("/sessions/{session_id}/subscriptions/{consumer_id}")
    async def delete_subscription(request: Request, session_id: UUID, consumer_id: str):
        ctx = backend(request)
        try:
            session = ctx.session_manager.get(session_id)
        except SessionError as error:
            return _error_response(error.status, error.payload, ctx.server_instance_id)
        # Unsubscribing never stops the session or other consumers.
        session._log.unsubscribe(consumer_id, reason="consumer_left")
        return {"ok": True, "consumer_id": consumer_id}

    # -- gateway management (private, control-token only; doc 08 §9) ----------

    @router.post("/gateway/infer", response_model=DirectInferenceResult, response_model_exclude_none=True)
    async def gateway_infer(request: Request):
        ctx = backend(request)
        body = bytearray()
        async for block in request.stream():
            if len(body) + len(block) > 32 * 1024 * 1024 + 4096:
                return _error_response(413, ErrorPayload(
                    code="INVALID_CONFIG", stage="gateway", message_key="gateway.inputTooLarge",
                ), ctx.server_instance_id)
            body.extend(block)
        try:
            parsed = _DIRECT_REQUEST.validate_json(body)
        except ValidationError:
            return _error_response(422, ErrorPayload(
                code="INVALID_CONFIG", stage="gateway", message_key="gateway.invalidInference",
            ), ctx.server_instance_id)
        if ctx.gateway is None:
            return _error_response(503, ErrorPayload(
                code="RESOURCE_BUSY", stage="gateway", message_key="backend.gatewayDisabled",
            ), ctx.server_instance_id)

        try:
            tts_key = request.headers.get("x-nola-tts-key", "") if parsed.model == MIMO_TTS_MODEL and parsed.kind in ("tts", "tts-voices") else ""
            options = {"api_key": tts_key} if 0 < len(tts_key) <= 4096 else {}
            if parsed.kind == "asr" and parsed.model in ("aliyun", "minimax"):
                options = cloud_asr_options(request.headers)
            if parsed.kind == "mt" and parsed.model in ("google", "microsoft", "mymemory", "index-translate", "custom-mt"):
                options = cloud_mt_options(request.headers)
            result = await _run_while_connected(request, run_direct_inference(
                ctx.gateway, parsed, provider_options=options or None,
            ))
            return result if result is not None else JSONResponse(status_code=499, content={})
        except GatewayError as error:
            return _gateway_error_response(error, ctx.server_instance_id)

    @router.post("/gateway/language-models")
    async def open_language_model(request: Request, body: LanguageModelOpenRequest):
        from .direct_language_model import open_direct_language_model

        ctx = backend(request)
        if ctx.gateway is None:
            return _error_response(503, ErrorPayload(
                code="RESOURCE_BUSY", stage="gateway", message_key="backend.gatewayDisabled",
            ), ctx.server_instance_id)
        token = body.lease_id
        if token in ctx.language_model_leases or token in ctx.language_model_openings:
            return _error_response(409, ErrorPayload(
                code="COMMAND_CONFLICT", stage="gateway", message_key="gateway.languageModelLeaseConflict",
            ), ctx.server_instance_id)

        async def acquire():
            lease = await open_direct_language_model(ctx.gateway, body.model, max_concurrency=body.max_concurrency)
            ctx.language_model_leases[token] = lease
            return lease

        opening = asyncio.create_task(acquire())
        ctx.language_model_openings[token] = opening
        try:
            lease = await _run_while_connected(request, opening)
        except asyncio.CancelledError:
            if opening.cancelled():
                return JSONResponse(status_code=499, content={})
            raise
        except GatewayError as error:
            return _gateway_error_response(error, ctx.server_instance_id)
        finally:
            ctx.language_model_openings.pop(token, None)
        if lease is None:
            return JSONResponse(status_code=499, content={})
        return {"lease_id": str(token), "endpoint": lease.endpoint, "context_window": lease.context_window}

    @router.delete("/gateway/language-models/{lease_id}")
    async def close_language_model(request: Request, lease_id: UUID):
        ctx = backend(request)
        opening = ctx.language_model_openings.get(lease_id)
        if opening is not None:
            opening.cancel()
            with suppress(asyncio.CancelledError, GatewayError):
                await opening
        lease = ctx.language_model_leases.pop(lease_id, None)
        if lease is not None:
            await lease.release()
        return {"ok": True}

    @router.get("/gateway/instances")
    async def gateway_instances(request: Request) -> dict:
        """Live instance states for the desktop model page. This is a private
        management surface: it is behind the same control token as the realtime
        API and is never exposed on the public /v2 listener."""

        ctx = backend(request)
        if ctx.gateway is None:
            return _error_response(
                503,
                ErrorPayload(code="RESOURCE_BUSY", stage="gateway", message_key="backend.gatewayDisabled"),
                ctx.server_instance_id,
            )
        instances = [
            {
                "instance_id": item.instance_id,
                "model_id": item.definition.model_id,
                "state": item.state.value,
                "config_revision": item.config_revision,
                "active_leases": item.active_leases,
                "resident_memory_mb": item.resident_memory_mb,
            }
            for item in ctx.gateway.manager.instances()
        ]
        return {"schema_version": SCHEMA_VERSION, "instances": instances}

    @router.get("/gateway/capabilities")
    async def gateway_capabilities(request: Request) -> dict:
        from .gateway.bootstrap import refresh_local_models

        ctx = backend(request)
        if ctx.gateway is None:
            return _error_response(
                503,
                ErrorPayload(code="RESOURCE_BUSY", stage="gateway", message_key="backend.gatewayDisabled"),
                ctx.server_instance_id,
            )
        if ctx.refresh_installed_models:
            refresh_local_models(ctx.gateway.registry)
        entries = []
        for entry in ctx.gateway.registry.entries():
            caps = entry.definition.capabilities
            entries.append(
                {
                    "model_id": entry.definition.model_id,
                    "enabled": entry.enabled,
                    "kinds": [kind.value for kind in caps.kinds],
                    "operations": [op.value for op in caps.operations],
                }
            )
        return {"schema_version": SCHEMA_VERSION, "models": entries}

    # -- audio route preflight (private; doc 11 M03 wiring) -------------------

    @router.get("/audio/processes", response_model=AudioProcessesResponse)
    async def audio_processes():
        from .process_sources import list_process_sources

        return await asyncio.to_thread(list_process_sources)

    @router.post("/audio/preflight")
    async def audio_preflight(request: Request, body: AudioPreflightRequest):
        """Run routing.preflight_route against the real local topology so the
        setup wizard can prove a route is loop-safe before a session starts.

        The process-loopback capability probe activates COM off the event loop.
        Virtual input must resolve to a recording endpoint. Chromium playback
        IDs cannot identify the corresponding Windows endpoint.
        """

        ctx = backend(request)
        from .routing import AudioRoute, ProcessExcludeCaptureBackend, preflight_route

        valid_modes = {"microphone", "endpoint_loopback", "process_include", "process_exclude", "virtual_input", "browser_tab"}
        if body.input_mode not in valid_modes:
            return _error_response(
                422,
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="routing",
                    message_key="routing.unknownInputMode",
                    safe_details={"input_mode": body.input_mode[:64]},
                ),
                ctx.server_instance_id,
            )
        route = AudioRoute(
            input_mode=body.input_mode,  # type: ignore[arg-type]
            input_endpoint_id=body.input_endpoint_id,
            excluded_process_tree=tuple(body.excluded_process_tree),
            speech_output_endpoint_id="" if body.speech_output_endpoint_is_opaque else body.speech_output_endpoint_id,
            monitor_original=body.monitor_original,
            monitor_output_endpoint_id=body.monitor_output_endpoint_id,
        )

        def probe():
            if body.input_mode == "process_include":
                from .capture_process_loopback import ProcessLoopbackCapability, ProcessLoopbackCapture
                from .process_sources import ProcessSourceError, open_selection

                try:
                    with open_selection(body.process_selection_id) as (pid, _):
                        return ProcessLoopbackCapture.probe(pid, mode="include")
                except ProcessSourceError as error:
                    return ProcessLoopbackCapability(False, error.reason)
            return ProcessExcludeCaptureBackend.probe(body.probe_target_pid)

        recording_device_name = None

        def known_virtual_input() -> set[str]:
            nonlocal recording_device_name
            from ..audio.devices import AudioDeviceRegistry, AudioDeviceUnavailableError

            try:
                recording_device_name = AudioDeviceRegistry().resolve("microphone", body.input_endpoint_id).name
            except (AudioDeviceUnavailableError, OSError):
                return set()
            return {body.input_endpoint_id}

        result = await asyncio.to_thread(
            preflight_route, route, probe_process_loopback=probe,
            known_endpoint_ids=known_virtual_input if body.input_mode == "virtual_input" else None,
        )
        opaque_virtual_output = result.safe and body.input_mode == "virtual_input" and body.speech_output_endpoint_is_opaque
        feedback_status = "unknown" if opaque_virtual_output else result.feedback_status
        return {
            "schema_version": SCHEMA_VERSION,
            "feedback_status": feedback_status,
            "safe": result.safe and not opaque_virtual_output,
            "recording_device_name": recording_device_name,
            "issues": [{"code": issue.code, "message": issue.message} for issue in result.issues],
            "route": {
                "input_mode": result.route.input_mode,
                "feedback_status": feedback_status,
                "feedback_reason": "playback endpoint is managed by Chromium" if opaque_virtual_output else result.route.feedback_reason,
                "excluded_process_tree": list(result.route.excluded_process_tree),
            },
        }

    return router


_GATEWAY_FAILURES = {
    GatewayErrorCode.INVALID_INPUT: (400, "INVALID_CONFIG"),
    GatewayErrorCode.CAPABILITY_MISMATCH: (422, "CAPABILITY_MISMATCH"),
    GatewayErrorCode.NOT_SUPPORTED: (422, "CAPABILITY_MISMATCH"),
    GatewayErrorCode.MODEL_NOT_INSTALLED: (404, "MODEL_NOT_READY"),
    GatewayErrorCode.MODEL_INTEGRITY: (409, "MODEL_NOT_READY"),
    GatewayErrorCode.LOAD_FAILED: (503, "MODEL_NOT_READY"),
    GatewayErrorCode.RESOURCE_EXHAUSTED: (429, "RESOURCE_EXHAUSTED"),
    GatewayErrorCode.LEASE_CONFLICT: (409, "RESOURCE_BUSY"),
    GatewayErrorCode.WORKER_EXITED: (503, "INTERNAL_ERROR"),
    GatewayErrorCode.WORKER_OOM: (503, "RESOURCE_EXHAUSTED"),
    GatewayErrorCode.TIMEOUT: (504, "INTERNAL_ERROR"),
    GatewayErrorCode.PROVIDER_ERROR: (502, "PROVIDER_DISCONNECTED"),
    GatewayErrorCode.CANCELLED: (409, "COMMAND_CONFLICT"),
}


def _gateway_failure(error: GatewayError) -> tuple[int, ErrorPayload]:
    status, code = _GATEWAY_FAILURES.get(error.code, (500, "INTERNAL_ERROR"))
    return status, ErrorPayload(
        code=code, stage=error.stage, message_key=f"gateway.{error.code.value}",
        retryable=error.retryable, correlation_id=error.correlation_id,
        provider_code=error.provider_code if error.provider_code in PUBLIC_PROVIDER_CODES else None,
    )


def _gateway_error_response(error: GatewayError, server_instance_id: str) -> JSONResponse:
    status, payload = _gateway_failure(error)
    return _error_response(status, payload, server_instance_id)


def _error_response(status: int, payload: ErrorPayload, server_instance_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "schema_version": SCHEMA_VERSION,
            "server_instance_id": server_instance_id,
            "error": payload.model_dump(mode="json"),
        },
    )


# ---------------------------------------------------------------------------
# WebSocket endpoints

async def gateway_asr_ws(ws: WebSocket, gateway, model: str) -> None:
    """Keep the public PCM protocol's segmentation while using gateway leases."""
    import numpy as np

    from ..gateway_worker import GatewayWorker

    if gateway is None or not model or len(model) > 512:
        await ws.close(code=1008)
        return
    await ws.accept()
    session_id = uuid4()
    inbound = asyncio.Queue(maxsize=4)
    outbound = asyncio.Queue(maxsize=32)
    worker = GatewayWorker(lambda event: outbound.put_nowait({"event": event["event"]}))
    lease = AsyncExitStack()

    async def infer(samples, language, _prefix=None, **_options):
        language = language or "auto"
        request = MatchRequest(Operation.TRANSCRIBE, model_id=model, source_language=language)
        pcm = np.rint(np.clip(samples, -1, 32767 / 32768) * 32768).astype("<i2").tobytes()
        deadline = monotonic() + 60
        ctx = CallContext(Operation.TRANSCRIBE, str(uuid4()), session_id=session_id, deadline=deadline)
        async with asyncio.timeout(60):
            observation = await gateway.transcribe(ctx, audio=pcm, language=language, request=request)
        return observation.text, observation.language

    async def receive():
        while True:
            message = await ws.receive_text()
            if len(message) > 1024 * 1024 + 256:
                raise ValueError("ASR frame is too large")
            inbound.put_nowait(json.loads(message))

    async def dispatch():
        while True:
            message = await inbound.get()
            op = message.get("op")
            request = {"op": op, "session": str(session_id)}
            if op == "session.open":
                language = message.get("language", "auto")
                silence = message.get("silenceMs", 800)
                duration = message.get("maxSegmentMs", 10000)
                if (worker.sessions or not isinstance(language, str) or not 0 < len(language) <= 32
                        or not 300 <= silence <= 2000 or not 3000 <= duration <= 30000):
                    raise ValueError("Invalid ASR session options")
                match = MatchRequest(Operation.TRANSCRIBE, model_id=model, source_language=language)
                gateway.match(match)
                if model in ("aliyun", "minimax"):
                    worker.config = await lease.enter_async_context(gateway.cloud_asr_session(match, cloud_asr_options(ws.headers)))
                    worker.config = worker.config.model_copy(update={"max_segment_ms": duration, "silence_end_ms": silence})
                request.update(language=language, silenceMs=silence, maxSegmentMs=duration, manual=message.get("manual") is True)
            elif op == "session.append":
                request["audio"] = message["audio"]
            elif op not in ("session.commit", "session.finish"):
                raise ValueError("Invalid ASR operation")
            await worker.realtime(request, infer=infer)
            await outbound.put({"ack": op})

    async def send():
        while True:
            await ws.send_json(await outbound.get())

    tasks = [asyncio.create_task(fn()) for fn in (receive, dispatch, send)]
    failure = None
    try:
        completed, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        failure = next((task.exception() for task in completed if not task.cancelled() and task.exception()), None)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            if isinstance(failure, GatewayError):
                status, payload = _gateway_failure(failure)
                with suppress(OSError, RuntimeError, WebSocketDisconnect):
                    await ws.send_json({"error": payload.model_dump(mode="json"), "status": status})
            await worker.close()
        finally:
            await lease.aclose()
            with suppress(RuntimeError, WebSocketDisconnect):
                await ws.close(code=1011, reason="ASR session closed")
# ---------------------------------------------------------------------------


class _ConnectionWriter:
    """Single-writer outbound queue for one WS connection (doc 09 §3).

    All producers push here; only this coroutine calls send_*, keeping JSON
    envelopes and binary frames ordered on the wire.
    """

    def __init__(self, ws: WebSocket) -> None:
        self._ws = ws
        self._queue: asyncio.Queue[bytes | str | None] = asyncio.Queue(maxsize=1024)
        self._task: asyncio.Task | None = None
        self.dropped = False

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while True:
            item = await self._queue.get()
            if item is None:
                return
            try:
                if isinstance(item, bytes):
                    await self._ws.send_bytes(item)
                else:
                    await self._ws.send_text(item)
            except Exception:
                return

    def push_json(self, payload: dict) -> bool:
        text = json.dumps(payload, ensure_ascii=False)
        try:
            self._queue.put_nowait(text)
            return True
        except asyncio.QueueFull:
            self.dropped = True
            return False

    def push_bytes(self, payload: bytes) -> bool:
        if self._task is None or self._task.done():
            return False
        try:
            self._queue.put_nowait(payload)
            return True
        except asyncio.QueueFull:
            self.dropped = True
            return False

    def discard_pending(self) -> None:
        while not self._queue.empty():
            self._queue.get_nowait()

    async def close(self) -> None:
        try:
            self._queue.put_nowait(None)
        except asyncio.QueueFull:
            pass
        if self._task is not None:
            await asyncio.wait_for(self._task, timeout=2.0)


async def _hello(ws: WebSocket, session: Session, server_instance_id: str, *, want_owner: bool = False) -> WsHelloAck | None:
    """Read and validate the hello frame; reply hello_ack or close."""

    raw = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
    try:
        frame = WsHello.model_validate_json(raw)
    except ValidationError:
        await ws.close(code=1002, reason="invalid hello")
        return None
    if frame.schema_version != SCHEMA_VERSION:
        await ws.close(code=1002, reason="unsupported schema_version")
        return None
    outputs = frame.outputs or (("audio",) if want_owner else ("source_text", "translated_text"))
    owner = _owner_id(session)
    if owner is not None and (want_owner or owner == frame.consumer_id):
        await ws.close(code=1008, reason="playback owner already connected")
        return None
    # A reconnecting consumer replaces its stale subscription; playback owner
    # status is re-elected on the new connection (old owner is gone by
    # definition, since its WS died with the subscription).
    if session._log.get_subscription(frame.consumer_id) is not None:
        session._log.unsubscribe(frame.consumer_id, reason="replaced_by_reconnect")
    is_owner = want_owner
    sub = session._log.subscribe(
        frame.consumer_id, outputs, is_playback_owner=is_owner
    )
    replay = session._log.replay_from(frame.resume_cursor) if frame.resume_cursor and not want_owner else []
    resync = replay is None
    ack = WsHelloAck(
        server_instance_id=server_instance_id,
        session_id=session.session_id,
        consumer_id=frame.consumer_id,
        snapshot=session.snapshot(server_instance_id),
        replay_from_seq=(replay[0].event_seq if replay else 0) if not resync else -1,
        resync_required=resync,
        playback_owner_id=_owner_id(session),
    )
    await ws.send_text(ack.model_dump_json())
    if not resync:
        for envelope in replay or []:
            await ws.send_text(envelope.model_dump_json())
    # Bind the subscription queue to this connection via the caller.
    return ack


def _owner_id(session: Session) -> str | None:
    for cid, sub in session._log._subscriptions.items():
        if sub.is_playback_owner:
            return cid
    return None


async def events_ws(ws: WebSocket, session_id: UUID, ctx) -> None:
    """Text/state/commit events for one session with snapshot+tail recovery."""

    await ws.accept()
    try:
        session = ctx.session_manager.get(session_id)
    except SessionError:
        await ws.close(code=1008, reason="session not found")
        return

    ack = await _hello(ws, session, ctx.server_instance_id)
    if ack is None:
        return
    sub = session._log.get_subscription(ack.consumer_id)
    if sub is None:
        await ws.close(code=1008, reason="subscription closed")
        return
    writer = _ConnectionWriter(ws)
    await writer.start()

    async def forward() -> None:
        while True:
            item = await sub.queue.get()
            if item is None:
                if session.state not in ("closed", "failed"):
                    await ws.close(code=1013, reason="event subscription replaced or backlogged")
                break
            if not writer.push_json(json.loads(item.model_dump_json())):
                await ws.close(code=1013, reason="event output backlogged")
                break

    forward_task = asyncio.create_task(forward())
    try:
        while True:
            raw = await ws.receive_text()
            try:
                frame = _CLIENT_FRAME.validate_json(raw)
            except ValidationError:
                writer.push_json(
                    {
                        "frame": "error",
                        "error": ErrorPayload(
                            code="PROTOCOL_ERROR",
                            stage="events",
                            message_key="ws.invalidFrame",
                        ).model_dump(mode="json"),
                    }
                )
                continue
            if frame.frame == "ping":
                writer.push_json(WsPong().model_dump(mode="json"))
    except WebSocketDisconnect:
        pass
    finally:
        forward_task.cancel()
        if session._log.get_subscription(ack.consumer_id) is sub:
            session._log.unsubscribe(ack.consumer_id, reason="ws_closed")
        await writer.close()


def _session_ingestion(ctx, session):
    """Get or create the session's AudioIngestion (M03 wiring).

    Frame validation, continuous resampling, seq/epoch/gap continuity, dedup and
    Silero VAD windowing all live in AudioIngestion; the input WS is only the
    transport. Gap events are published to the session's single-writer event log
    so subscribers see them, while the transport ack/error stays on this socket.
    The M04 pipeline consumes normalized frames/windows from the same instance.
    """

    from .ingestion import AudioIngestion

    key = session.session_id
    ingestion = ctx.ingestions.get(key)
    if ingestion is None:
        log = session._log

        def on_event(event_type: str, payload: dict) -> None:
            if event_type == "audio_gap":
                # AudioGapPayload carries no stream_id; strip transport-only keys.
                log.submit("audio_gap", {k: v for k, v in payload.items() if k != "stream_id"})

        ingestion = AudioIngestion(str(key), realtime=True, on_event=on_event)
        ctx.ingestions[key] = ingestion
    return ingestion


async def input_ws(ws: WebSocket, session_id: UUID, ctx) -> None:
    """External audio input: JSON control + binary PCM frames.

    Continuity, resampling and VAD windowing are delegated to the session's
    AudioIngestion (M03). This handler negotiates streams, frames each chunk and
    maps the IngestOutcome onto audio_accepted / AUDIO_GAP / PROTOCOL_ERROR.
    """

    await ws.accept()
    try:
        session = ctx.session_manager.get(session_id)
    except SessionError:
        await ws.close(code=1008, reason="session not found")
        return
    if session.owner == "meeting":
        await ws.close(code=1008, reason="meeting uses native capture")
        return

    writer = _ConnectionWriter(ws)
    await writer.start()
    ingestion = _session_ingestion(ctx, session)
    opened: dict[int, object] = {}  # stream_handle -> StreamFormat

    from .contracts import AudioFrameError, parse_audio_frame
    from .ingestion import InputAudioFrame, StreamFormat

    def push_error(code: str, message_key: str, **safe_details) -> None:
        writer.push_json(
            {
                "frame": "error",
                "error": ErrorPayload(
                    code=code,
                    stage="ingestion",
                    message_key=message_key,
                    safe_details={k: v for k, v in safe_details.items() if v is not None},
                ).model_dump(mode="json"),
            }
        )

    try:
        while True:
            message = await ws.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if (text := message.get("text")) is not None:
                try:
                    frame = _CLIENT_FRAME.validate_json(text)
                except ValidationError:
                    writer.push_json(
                        {
                            "frame": "error",
                            "error": ErrorPayload(
                                code="PROTOCOL_ERROR",
                                stage="input",
                                message_key="ws.invalidFrame",
                            ).model_dump(mode="json"),
                        }
                    )
                    continue
                if frame.frame == "ping":
                    writer.push_json(WsPong().model_dump(mode="json"))
                elif frame.frame == "stream_open":
                    if ctx.realtime_enabled and (
                        session.state != "running" or frame.epoch != session.epoch or opened
                        or session_id in ctx.pipeline_registry.captures
                    ):
                        push_error("PROTOCOL_ERROR", "audio.invalidStreamState")
                        continue
                    fmt = StreamFormat(
                        sample_rate=frame.sample_rate,
                        channels=frame.channels,
                        encoding=frame.encoding,
                    )
                    opened[frame.stream_handle] = fmt
                    ingestion.open_stream(str(frame.stream_handle), frame.epoch, fmt)
                    writer.push_json(
                        WsStreamOpened(
                            stream_handle=frame.stream_handle,
                            epoch=frame.epoch,
                            server_instance_id=ctx.server_instance_id,
                        ).model_dump(mode="json")
                    )
                elif frame.frame == "stream_close":
                    if opened.pop(frame.stream_handle, None) is not None:
                        ingestion.close_stream(str(frame.stream_handle), eof=frame.eof)
            elif (data := message.get("bytes")) is not None:
                # Validate against the negotiated format before any allocation,
                # then delegate continuity/dedup/gap to AudioIngestion.
                matched = False
                for handle, fmt in opened.items():
                    try:
                        header, payload = parse_audio_frame(
                            data,
                            bytes_per_sample=fmt.bytes_per_sample,
                            channels=fmt.channels,
                        )
                    except AudioFrameError as error:
                        push_error("PROTOCOL_ERROR", "audio.badFrame", reason=str(error)[:128])
                        matched = True
                        break
                    if header.stream_handle != handle:
                        continue
                    matched = True
                    if ctx.realtime_enabled and (
                        session.state != "running" or header.epoch != session.epoch
                    ):
                        push_error("PROTOCOL_ERROR", "audio.invalidStreamState")
                        break
                    outcome = ingestion.accept(
                        InputAudioFrame(
                            session_id=str(session_id),
                            stream_id=str(handle),
                            epoch=header.epoch,
                            audio_seq=header.chunk_seq,
                            sample_start=header.sample_start,
                            sample_count=header.sample_count,
                            format=fmt,
                            payload=payload,
                        )
                    )
                    if outcome.status == "accepted":
                        writer.push_json(
                            WsAudioAck(
                                stream_handle=handle,
                                epoch=header.epoch,
                                through_chunk_seq=outcome.ack.through_chunk_seq,
                                through_sample=outcome.ack.through_sample,
                            ).model_dump(mode="json")
                        )
                    elif outcome.status == "duplicate":
                        # Already-accepted frame retransmitted: idempotent ignore
                        # (no ack, no error) so a retry never double-advances.
                        pass
                    elif outcome.status == "gap":
                        gap = outcome.gap
                        push_error(
                            "AUDIO_GAP",
                            "audio.seqGap",
                            reason=gap.reason if gap is not None else outcome.reason,
                            lost_start_sample=gap.lost_start_sample if gap is not None else None,
                            lost_end_sample=gap.lost_end_sample if gap is not None else None,
                        )
                    else:  # rejected
                        push_error("PROTOCOL_ERROR", "audio.rejected", reason=outcome.reason)
                    break
                if not matched:
                    push_error("PROTOCOL_ERROR", "audio.unknownStreamHandle")
    except WebSocketDisconnect:
        pass
    finally:
        await writer.close()


async def audio_ws(ws: WebSocket, session_id: UUID, ctx) -> None:
    """Playback owner channel: audio metadata and PCM out, device ACKs in."""

    await ws.accept()
    try:
        session = ctx.session_manager.get(session_id)
    except SessionError:
        await ws.close(code=1008, reason="session not found")
        return
    if session.owner == "meeting":
        await ws.close(code=1008, reason="meeting uses native playback")
        return

    ack = await _hello(ws, session, ctx.server_instance_id, want_owner=True)
    if ack is None:
        return
    sub = session._log.get_subscription(ack.consumer_id)
    if sub is None:
        await ws.close(code=1008, reason="subscription closed")
        return
    writer = _ConnectionWriter(ws)
    await writer.start()
    playback = ctx.pipeline_registry.playbacks.get(session_id) if ctx.realtime_enabled else None
    stream_handle = 0

    def publish(kind, payload):
        event = session._log.submit(kind, payload)
        if not writer.push_json(event.model_dump(mode="json")):
            raise ConnectionError("Playback socket output is full")

    def open_stream(stream_id, claim_id, owner_id, generation, sample_rate, channels, origin, **metadata):
        nonlocal stream_handle
        stream_handle += 1
        publish("audio_stream_opened", {
            "audio_stream_id": stream_id, "stream_handle": stream_handle, "origin": origin,
            "sample_rate": sample_rate, "channels": channels,
            "playback_generation": generation, **metadata,
        })
        publish("playback_state", {
            "job_id": metadata.get("job_id"), "audio_stream_id": stream_id, "claim_id": claim_id,
            "playback_generation": generation, "owner_id": owner_id, "state": "claimed",
        })

    def send_pcm(stream_id, generation, seq, offset, pcm, channels, is_last):
        samples = len(pcm) // (2 * channels)
        publish("audio_chunk", {
            "audio_stream_id": stream_id, "chunk_seq": seq, "sample_start": offset,
            "sample_count": samples, "payload_bytes": len(pcm), "is_last": is_last,
        })
        binary = pack_audio_frame(AudioFrameHeader(
            kind=AUDIO_KIND_OUTPUT, stream_handle=stream_handle, epoch=generation,
            chunk_seq=seq, sample_start=offset, sample_count=samples, payload_bytes=len(pcm),
        ), pcm)
        if not writer.push_bytes(binary):
            raise ConnectionError("Playback socket output is full")
        return samples

    async def deliver(grant):
        job, claim, synthesis = grant.job, grant.claim, grant.synthesis
        stream_id = claim.job_id
        chunks = synthesis.chunks
        sample_rate, channels = chunks[0].sample_rate, chunks[0].channels
        if not 1 <= channels <= 2 or any(
            chunk.sample_rate != sample_rate or chunk.channels != channels or len(chunk.pcm) % (2 * channels)
            for chunk in chunks
        ):
            raise ValueError("Inconsistent playback PCM format")
        open_stream(stream_id, claim.claim_id, claim.owner_id, claim.generation, sample_rate, channels, "synthesis",
                    job_id=job.job_id, translation_id=job.translation_id, target_language=job.target_language)
        offset, seq = 0, 0
        for chunk in chunks:
            stride = 16_384 * 2 * channels
            for start in range(0, len(chunk.pcm), stride):
                pcm = chunk.pcm[start:start + stride]
                offset += send_pcm(stream_id, claim.generation, seq, offset, pcm, channels,
                                   offset + len(pcm) // (2 * channels) == claim.sample_count)
                seq += 1

    async def deliver_s2s(packet):
        if packet.chunk_seq == 0:
            open_stream(packet.audio_stream_id, packet.claim_id, packet.owner_id, packet.generation,
                        packet.sample_rate, packet.channels, "s2s", translation_id=packet.translation_id,
                        response_id=packet.response_id, irreversible_audio=True)
        send_pcm(packet.audio_stream_id, packet.generation, packet.chunk_seq, packet.sample_start,
                 packet.pcm, packet.channels, packet.is_last)

    async def forward() -> None:
        while True:
            item = await sub.queue.get()
            if item is None:
                break
            if playback is not None and (
                item.event_type in ("audio_stream_opened", "audio_chunk")
                or item.event_type == "playback_state" and item.payload["state"] == "claimed"
            ):
                continue
            if item.event_type == "playback_state" and not item.payload.get("claim_id") and (
                item.payload["state"] in ("interrupted", "cancelled")
            ):
                writer.discard_pending()
            if not writer.push_json(json.loads(item.model_dump_json())):
                break

    forward_task = asyncio.create_task(forward())
    if playback is not None:
        playback.attach(ack.consumer_id, deliver_s2s if session.config.pipeline.kind == "s2s" else deliver)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                frame = _CLIENT_FRAME.validate_json(raw)
            except ValidationError:
                writer.push_json(
                    {
                        "frame": "error",
                        "error": ErrorPayload(
                            code="PROTOCOL_ERROR",
                            stage="playback",
                            message_key="ws.invalidFrame",
                        ).model_dump(mode="json"),
                    }
                )
                continue
            if frame.frame == "ping":
                writer.push_json(WsPong().model_dump(mode="json"))
            elif frame.frame == "playback_ack":
                # Fencing: only the current owner with the live generation may
                # ACK; stale ACKs never mark a new session complete.
                if frame.owner_id != ack.consumer_id or not sub.is_playback_owner:
                    continue
                if playback is not None:
                    if not playback.ack(frame.audio_stream_id, frame.owner_id, frame.claim_id,
                                        frame.playback_generation, frame.state, frame.played_sample_offset):
                        continue
                elif ctx.realtime_enabled:
                    continue
                if frame.playback_generation != session.playback_generation:
                    continue
                session._log.submit(
                    "playback_state",
                    {
                        "job_id": None,
                        "audio_stream_id": frame.audio_stream_id,
                        "claim_id": frame.claim_id,
                        "playback_generation": frame.playback_generation,
                        "owner_id": frame.owner_id,
                        "state": {
                            "started": "playing",
                            "progress": "playing",
                            "finished": "finished",
                            "interrupted": "interrupted",
                            "unknown": "unknown",
                        }[frame.state],
                        "played_sample_offset": frame.played_sample_offset,
                    },
                )
    except WebSocketDisconnect:
        pass
    finally:
        if playback is not None:
            playback.detach(ack.consumer_id)
        forward_task.cancel()
        session._log.unsubscribe(ack.consumer_id, reason="ws_closed")
        await writer.close()
