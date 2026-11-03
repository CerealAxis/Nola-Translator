"""SessionManager: owns realtime session state, epochs, command idempotency
and the single realtime slot shared by quick-interpret and browser captions.

Commands are serialized per session and keyed by command_id: same id + same
body replays the same result, same id + different body is a 409 conflict.
REST acceptance (202) never implies the target state was reached.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass, field
from typing import Callable
from uuid import UUID, uuid4

from .contracts import (
    CommandAck,
    CreateSessionRequest,
    ErrorPayload,
    PipelineConfig,
    SCHEMA_VERSION,
    SessionCommand,
    SessionConfig,
    SessionOwner,
    SessionSnapshot,
    SessionState,
)
from .events import SessionEventLog, SessionJournal

#: Legal transitions of the session state machine (doc 03 §6).
_TRANSITIONS: dict[SessionState, frozenset[SessionState]] = {
    "created": frozenset({"preparing", "stopping"}),
    "preparing": frozenset({"running", "failed", "stopping"}),
    "running": frozenset({"pausing", "recovering", "draining", "stopping", "failed"}),
    "pausing": frozenset({"paused", "stopping", "failed"}),
    "paused": frozenset({"running", "stopping"}),
    "recovering": frozenset({"running", "failed", "stopping"}),
    "draining": frozenset({"closed", "stopping", "failed"}),
    "stopping": frozenset({"closed"}),
    "failed": frozenset({"closed", "stopping"}),
    "closed": frozenset(),
}


class SessionError(Exception):
    """Structured rejection carrying an ErrorPayload for the REST/WS layer."""

    def __init__(self, payload: ErrorPayload, *, status: int = 409) -> None:
        super().__init__(payload.message_key)
        self.payload = payload
        self.status = status


def _body_fingerprint(command: SessionCommand) -> str:
    return hashlib.sha256(
        command.model_dump_json(exclude={"command_id"}).encode("utf-8")
    ).hexdigest()[:32]


def _create_fingerprint(request: CreateSessionRequest) -> str:
    return hashlib.sha256(request.model_dump_json().encode("utf-8")).hexdigest()[:32]


@dataclass
class _CommandRecord:
    fingerprint: str
    ack: CommandAck


@dataclass
class Session:
    session_id: UUID
    owner: SessionOwner
    config: SessionConfig
    pipeline_id: UUID
    config_revision: int = 0
    state: SessionState = "created"
    epoch: int = 0
    playback_generation: int = 0
    source_revision_watermark: int = 0
    target_revision_watermark: int = 0
    last_error: ErrorPayload | None = None
    updated_at_unix_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    #: Pipeline handle owned by the orchestrator (M01 fake, real from M04+).
    pipeline_handle: object | None = None

    _log: SessionEventLog = field(default=None)  # type: ignore[assignment]
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    _commands: dict[str, _CommandRecord] = field(default_factory=dict)

    def snapshot(self, server_instance_id: str) -> SessionSnapshot:
        from .contracts import SubscriptionInfo

        return SessionSnapshot(
            server_instance_id=server_instance_id,
            session_id=self.session_id,
            pipeline_id=self.pipeline_id,
            config_revision=self.config_revision,
            state=self.state,
            epoch=self.epoch,
            owner=self.owner,
            snapshot_seq=self._log.seq,
            source_revision_watermark=self.source_revision_watermark,
            target_revision_watermark=self.target_revision_watermark,
            playback_generation=self.playback_generation,
            subscriptions=tuple(
                SubscriptionInfo(consumer_id=cid, outputs=tuple(sub.outputs))
                for cid, sub in self._log._subscriptions.items()
            ),
            last_error=self.last_error,
            updated_at_unix_ms=self.updated_at_unix_ms,
        )

    def transition(self, new_state: SessionState) -> None:
        if new_state == self.state:
            return
        allowed = _TRANSITIONS.get(self.state, frozenset())
        if new_state not in allowed:
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.illegalTransition",
                    safe_details={"from": self.state, "to": new_state},
                ),
                status=409,
            )
        self.state = new_state
        self.updated_at_unix_ms = int(time.time() * 1000)


#: Hook the orchestrator installs to run pipeline side effects for a command.
#: Returns the state the session lands in (may be intermediate, e.g. pausing).
CommandEffect = Callable[[Session, SessionCommand], "asyncio.Future[SessionState] | SessionState"]


class SessionManager:
    """Atomic single-slot owner for realtime sessions plus per-session command
    serialization. Workbench one-shot tasks never pass through here."""

    def __init__(
        self,
        server_instance_id: str,
        *,
        journal: SessionJournal | None = None,
        command_effect: CommandEffect | None = None,
        clock: Callable[[], int] | None = None,
    ) -> None:
        self.server_instance_id = server_instance_id
        self._journal = journal
        self._command_effect = command_effect
        self._clock = clock or (lambda: int(time.time() * 1000))
        self._sessions: dict[UUID, Session] = {}
        #: The single realtime slot: held from create (preparing counts) until
        #: closed/failed release.
        self._slot_session_id: UUID | None = None
        self._slot_lock = asyncio.Lock()

    # -- creation -----------------------------------------------------------

    async def create(self, request: CreateSessionRequest) -> Session:
        async with self._slot_lock:
            fingerprint = _create_fingerprint(request)
            existing = self._find_by_command_id(request.command_id)
            if existing is not None:
                record = existing._commands[request.command_id]
                if record.fingerprint != fingerprint:
                    raise SessionError(
                        ErrorPayload(
                            code="COMMAND_CONFLICT",
                            stage="session",
                            message_key="session.commandIdReuse",
                            correlation_id=request.command_id,
                        ),
                        status=409,
                    )
                return existing

            if self._slot_session_id is not None:
                holder = self._sessions.get(self._slot_session_id)
                raise SessionError(
                    ErrorPayload(
                        code="SESSION_SLOT_BUSY",
                        stage="session",
                        scope="session",
                        message_key="session.slotBusy",
                        message_args={"owner": holder.owner if holder else "unknown"},
                        safe_details={
                            "current_owner": holder.owner if holder else "unknown",
                        },
                    ),
                    status=409,
                )

            session_id = uuid4()
            pipeline_id = uuid4()
            session = Session(
                session_id=session_id,
                owner=request.owner,
                config=request.config,
                pipeline_id=pipeline_id,
                _log=SessionEventLog(  # type: ignore[arg-type]
                    session_id=session_id,
                    server_instance_id=self.server_instance_id,
                    pipeline_id=pipeline_id,
                    journal=self._journal if request.owner == "quick_interpret" else None,
                ),
            )
            self._sessions[session.session_id] = session
            self._slot_session_id = session.session_id
            session._commands[request.command_id] = _CommandRecord(
                fingerprint=fingerprint,
                ack=CommandAck(
                    accepted=True,
                    command_id=request.command_id,
                    session_id=session.session_id,
                    result_state=session.state,
                ),
            )
            session._log.submit(
                "pipeline_state",
                {"state": "created", "reason": "", "required_actions": []},
            )
        return session

    def _find_by_command_id(self, command_id: str) -> Session | None:
        for session in self._sessions.values():
            if command_id in session._commands:
                return session
        return None

    # -- queries ------------------------------------------------------------

    def get(self, session_id: UUID) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise SessionError(
                ErrorPayload(
                    code="SESSION_NOT_FOUND",
                    stage="session",
                    message_key="session.notFound",
                ),
                status=404,
            )
        return session

    def list_sessions(self) -> list[Session]:
        return list(self._sessions.values())

    @property
    def slot_holder(self) -> UUID | None:
        return self._slot_session_id

    # -- commands -----------------------------------------------------------

    async def command(self, session_id: UUID, command: SessionCommand) -> CommandAck:
        session = self.get(session_id)
        async with session._lock:
            record = session._commands.get(command.command_id)
            fingerprint = _body_fingerprint(command)
            if record is not None:
                if record.fingerprint != fingerprint:
                    raise SessionError(
                        ErrorPayload(
                            code="COMMAND_CONFLICT",
                            stage="session",
                            message_key="session.commandIdReuse",
                            correlation_id=command.command_id,
                        ),
                        status=409,
                    )
                return record.ack  # idempotent replay

            target = _command_target_state(session, command)
            session.transition(target)
            session._log.set_pipeline(session.pipeline_id, session.epoch)
            session.updated_at_unix_ms = self._clock()

            effect_result: SessionState | None = None
            if self._command_effect is not None:
                outcome = self._command_effect(session, command)
                if asyncio.isfuture(outcome):
                    effect_result = await outcome
                else:
                    effect_result = outcome

            final_state = effect_result or target
            if final_state != session.state:
                session.transition(final_state)
                session.updated_at_unix_ms = self._clock()

            ack = CommandAck(
                accepted=True,
                command_id=command.command_id,
                session_id=session.session_id,
                result_state=session.state,
            )
            session._commands[command.command_id] = _CommandRecord(fingerprint, ack)

            session._log.submit(
                "pipeline_state",
                {
                    "state": session.state,
                    "reason": f"command:{command.type}",
                    "required_actions": [],
                },
            )
            if self._journal is not None and command.type in ("stop", "pause", "resume"):
                self._journal.append(
                    "session_command",
                    str(session.session_id),
                    session._log.seq,
                    {"command": command.model_dump(mode="json"), "state": session.state},
                )

            if session.state in ("closed", "failed"):
                await self._release_slot(session.session_id)
            return ack

    # -- state transitions ----------------------------------------------------

    def fail_session(self, session_id: UUID, error: ErrorPayload, *, new_state: SessionState = "failed") -> None:
        """Reducer-side failure injection (provider/worker death, preflight)."""

        session = self.get(session_id)
        session.last_error = error
        session.transition(new_state)
        session.updated_at_unix_ms = self._clock()
        session._log.submit(
            "error",
            {"error": error.model_dump(mode="json")},
        )
        session._log.submit("pipeline_state", {"state": session.state, "reason": "pipeline_failure"})
        if new_state in ("closed", "failed"):
            asyncio.get_running_loop().create_task(self._release_slot(session_id))

    def drain_session(self, session_id: UUID) -> None:
        """Natural EOF: internal lifecycle event, never a user command."""

        session = self.get(session_id)
        session.transition("draining")
        session.updated_at_unix_ms = self._clock()
        session._log.submit("pipeline_state", {"state": session.state, "reason": "input_eof"})

    def recover_session(self, session_id: UUID, error: ErrorPayload) -> None:
        session = self.get(session_id)
        session.transition("recovering")
        session.last_error = error
        session.updated_at_unix_ms = self._clock()
        session._log.submit("error", {"error": error.model_dump(mode="json")})
        session._log.submit("pipeline_state", {"state": session.state, "reason": "provider_reconnect"})

    def complete_drain(self, session_id: UUID) -> None:
        session = self.get(session_id)
        session.transition("closed")
        session.updated_at_unix_ms = self._clock()
        session._log.submit("pipeline_state", {"state": session.state, "reason": "input_eof"})
        session._log.close_all()
        asyncio.get_running_loop().create_task(self._release_slot(session_id))

    async def _release_slot(self, session_id: UUID) -> None:
        async with self._slot_lock:
            if self._slot_session_id == session_id:
                self._slot_session_id = None


def _command_target_state(session: Session, command: SessionCommand) -> SessionState:
    """Map a user command to the immediate state transition it requests.

    start: created→preparing→running (fake effect lands running immediately
    in M01; real prepare happens in M02+), pause→pausing→paused, resume→running
    with a new epoch, stop→stopping→closed.
    """

    kind = command.type
    if kind == "start":
        if session.state not in ("created", "failed"):
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.cannotStart",
                    safe_details={"state": session.state},
                ),
                status=409,
            )
        return "preparing"
    if kind == "pause":
        if session.state != "running":
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.cannotPause",
                    safe_details={"state": session.state},
                ),
                status=409,
            )
        return "pausing"
    if kind == "resume":
        if session.state != "paused":
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.cannotResume",
                    safe_details={"state": session.state},
                ),
                status=409,
            )
        session.epoch += 1
        return "running"
    if kind == "stop":
        if session.state in ("closed",):
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.alreadyClosed",
                ),
                status=409,
            )
        session.playback_generation += 1  # fence all playback grants
        return "stopping"
    if kind == "reset_stream":
        if session.state not in ("running", "paused", "recovering"):
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.cannotReset",
                    safe_details={"state": session.state},
                ),
                status=409,
            )
        session.epoch += 1
        session.playback_generation += 1  # old timeline audio is invalidated
        return session.state
    if kind == "switch_pipeline":
        if session.state not in ("paused", "running"):
            raise SessionError(
                ErrorPayload(
                    code="INVALID_CONFIG",
                    stage="session",
                    message_key="session.cannotSwitch",
                    safe_details={"state": session.state},
                ),
                status=409,
            )
        assert command.params is not None
        session.pipeline_id = uuid4()
        session.config_revision += 1
        session.epoch += 1
        session.playback_generation += 1  # old queue cancelled, never drained
        session.config = _config_with_pipeline(session.config, command.params.pipeline)
        return session.state
    raise SessionError(
        ErrorPayload(
            code="INVALID_CONFIG",
            stage="session",
            message_key="session.unknownCommand",
            safe_details={"type": kind},
        ),
        status=400,
    )


def _config_with_pipeline(config: SessionConfig, pipeline: PipelineConfig) -> SessionConfig:
    data = config.model_dump(mode="python")
    data["pipeline"] = pipeline.model_dump(mode="python")
    return SessionConfig.model_validate(data)
