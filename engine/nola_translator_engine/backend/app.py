"""FastAPI application factory, lifespan and private bootstrap auth.

The Electron supervisor launches one control process (single uvicorn worker)
on a loopback dynamic port and injects a per-boot random control token via a
private inherited channel (environment). The token never reaches logs or the
renderer; REST and WS calls carry it as a Bearer header.
"""

from __future__ import annotations

import asyncio
import os
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, Request, WebSocket
from fastapi.responses import JSONResponse

from .contracts import SCHEMA_VERSION
from .events import SessionJournal
from .sessions import SessionManager

CONTROL_TOKEN_ENV = "NOLA_BACKEND_CONTROL_TOKEN"
INSTANCE_ID_ENV = "NOLA_BACKEND_INSTANCE_ID"
JOURNAL_DIR_ENV = "NOLA_BACKEND_JOURNAL_DIR"


@dataclass
class BackendContext:
    """Everything lifespan owns; api.py reads it from app.state."""

    server_instance_id: str
    control_token: str
    session_manager: SessionManager
    journal: SessionJournal | None
    accepting_sessions: bool = True
    #: Realtime session orchestrator, absent in protocol-only apps.
    pipeline_registry: object | None = None
    #: Unified model gateway (M02). Owned for the process lifetime; None when
    #: the app runs in protocol-only mode (M01 tests) without model access.
    gateway: object | None = None
    realtime_enabled: bool = False
    refresh_installed_models: bool = False
    language_model_leases: dict = field(default_factory=dict)
    language_model_openings: dict = field(default_factory=dict)
    #: Per-session audio ingestion (M03). Keyed by session_id; the input WS
    #: delegates frame validation/continuity here and the M04 pipeline consumes
    #: normalized frames + VAD windows from the same instance.
    ingestions: dict = field(default_factory=dict)
    meetings: dict = field(default_factory=dict)
    meeting_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class AuthError(Exception):
    pass


def require_control_token(request: Request) -> None:
    """Bearer auth for the private management/realtime API.

    localhost is never a reason to skip auth: every request must present the
    per-boot token unless it targets /health/*.
    """

    ctx: BackendContext = request.app.state.backend
    if request.url.path in ("/api/v2/health/live", "/api/v2/health/ready"):
        return
    if request.headers.get("authorization", "") != f"Bearer {ctx.control_token}":
        raise AuthError()


def create_app(
    *,
    control_token: str | None = None,
    instance_id: str | None = None,
    journal_dir: str | Path | None = None,
    command_effect=None,
    gateway=None,
    enable_gateway: bool = False,
    screen_ocr=None,
) -> FastAPI:
    token = control_token or os.environ.get(CONTROL_TOKEN_ENV) or secrets.token_urlsafe(32)
    server_instance_id = instance_id or os.environ.get(INSTANCE_ID_ENV) or str(uuid4())
    if screen_ocr is None and os.environ.get("NOLA_TRANSLATOR_MODEL_DIR"):
        from .screen_ocr import ScreenOcr

        screen_ocr = ScreenOcr(Path(os.environ["NOLA_TRANSLATOR_MODEL_DIR"]))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        journal: SessionJournal | None = None
        journal_path = journal_dir or os.environ.get(JOURNAL_DIR_ENV)
        if journal_path:
            journal = SessionJournal(Path(journal_path) / "session-journal.jsonl")

        effect = command_effect
        registry = None
        # The gateway is built only for the real backend (enable_gateway) or when
        # a caller injects one; protocol-only tests skip the device probe and
        # never start a model worker.
        active_gateway = gateway
        if active_gateway is None and enable_gateway:
            from .gateway.bootstrap import build_default_gateway

            active_gateway = build_default_gateway()

        if effect is None and enable_gateway:
            from .realtime import RealtimePipelines

            registry = RealtimePipelines(
                active_gateway, lambda session: api._session_ingestion(ctx, session),
                playback_db=Path(journal_path) / "playback.sqlite3" if journal_path else ":memory:",
            )
            effect = registry.effect

        ctx = BackendContext(
            server_instance_id=server_instance_id,
            control_token=token,
            session_manager=SessionManager(server_instance_id, journal=journal, command_effect=effect),
            journal=journal,
            pipeline_registry=registry,
            gateway=active_gateway,
            realtime_enabled=registry is not None,
            refresh_installed_models=enable_gateway and gateway is None,
        )
        if registry is not None:
            registry.manager = ctx.session_manager
        app.state.backend = ctx
        try:
            yield
        finally:
            # Shutdown order (doc 09 §10): refuse new sessions, fence outputs,
            # stop inputs, cancel/drain, close providers, terminate workers,
            # journal terminal state, flush diagnostics.
            ctx.accepting_sessions = False
            if screen_ocr is not None:
                await screen_ocr.close()
            await asyncio.gather(*(meeting.close() for meeting in ctx.meetings.values()), return_exceptions=True)
            if registry is not None:
                await registry.shutdown()
            openings = tuple(ctx.language_model_openings.values())
            for opening in openings:
                opening.cancel()
            await asyncio.gather(*openings, return_exceptions=True)
            for lease in ctx.language_model_leases.values():
                await lease.release()
            ctx.language_model_leases.clear()
            if active_gateway is not None:
                await active_gateway.shutdown()
            for session in ctx.session_manager.list_sessions():
                session._log.close_all()
            if ctx.journal is not None:
                ctx.journal.close()

    app = FastAPI(
        title="Nola Translator realtime backend",
        version=str(SCHEMA_VERSION),
        lifespan=lifespan,
    )

    from . import api

    # Auth lives on the REST router (Request-scoped); the WS endpoints verify
    # the same token during their handshake because a WebSocket scope has no
    # injectable Request.
    app.include_router(api.build_router(), dependencies=[Depends(_auth_dependency)])
    if screen_ocr is not None:
        from .screen_ocr import build_screen_ocr_router

        app.include_router(build_screen_ocr_router(screen_ocr), prefix=api.API_PREFIX,
                           dependencies=[Depends(_auth_dependency)])

    def _ws_authorized(websocket: WebSocket) -> bool:
        """WS handshake auth uses the Electron-held bearer token."""

        auth = websocket.headers.get("authorization", "")
        if auth == f"Bearer {token}":
            return True
        return False

    @app.websocket(api.API_PREFIX + "/sessions/{session_id}/events")
    async def ws_events(websocket: WebSocket, session_id: UUID) -> None:
        if not _ws_authorized(websocket):
            await websocket.close(code=1008, reason="auth required")
            return
        await api.events_ws(websocket, session_id, app.state.backend)

    @app.websocket(api.API_PREFIX + "/gateway/asr-stream")
    async def ws_gateway_asr(websocket: WebSocket, model: str) -> None:
        if not _ws_authorized(websocket):
            await websocket.close(code=1008, reason="auth required")
            return
        await api.gateway_asr_ws(websocket, app.state.backend.gateway, model)

    @app.websocket(api.API_PREFIX + "/sessions/{session_id}/input")
    async def ws_input(websocket: WebSocket, session_id: UUID) -> None:
        if not _ws_authorized(websocket):
            await websocket.close(code=1008, reason="auth required")
            return
        await api.input_ws(websocket, session_id, app.state.backend)

    @app.websocket(api.API_PREFIX + "/sessions/{session_id}/audio")
    async def ws_audio(websocket: WebSocket, session_id: UUID) -> None:
        if not _ws_authorized(websocket):
            await websocket.close(code=1008, reason="auth required")
            return
        await api.audio_ws(websocket, session_id, app.state.backend)

    @app.exception_handler(AuthError)
    async def _auth_handler(request: Request, exc: AuthError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content={
                "code": "AUTH_REQUIRED",
                "stage": "auth",
                "message_key": "backend.authRequired",
                "schema_version": SCHEMA_VERSION,
                "server_instance_id": server_instance_id,
            },
        )

    return app


async def _auth_dependency(request: Request) -> None:
    require_control_token(request)
