"""引擎服务的轻量会话编排；识别与翻译能力在后续模块中接入。"""

from __future__ import annotations

from uuid import uuid4

from . import __version__
from .protocol import (
    DevicesEvent,
    EngineCommand,
    EngineEvent,
    ErrorEvent,
    HelloCommand,
    ListDevicesCommand,
    ReadyEvent,
    SessionStartedEvent,
    SessionStoppedEvent,
    ShutdownCommand,
    ShutdownCompleteEvent,
    StartSessionCommand,
    StatusEvent,
    StopSessionCommand,
)


class EngineService:
    """处理已经通过协议校验的命令，并返回零个或多个事件。"""

    def __init__(self) -> None:
        self.session_id: str | None = None
        self.should_exit = False

    def handle(self, command: EngineCommand) -> list[EngineEvent]:
        if isinstance(command, HelloCommand):
            return [
                ReadyEvent(
                    protocolVersion=1,
                    type="ready",
                    requestId=command.requestId,
                    engineVersion=__version__,
                    capabilities=["devices", "captions", "translation"],
                )
            ]

        if isinstance(command, ListDevicesCommand):
            return [
                DevicesEvent(
                    protocolVersion=1,
                    type="devices",
                    requestId=command.requestId,
                    devices=[],
                )
            ]

        if isinstance(command, StartSessionCommand):
            if self.session_id is not None:
                return [self._error(command.requestId, "sessionAlreadyRunning")]
            self.session_id = f"session-{uuid4()}"
            return [
                SessionStartedEvent(
                    protocolVersion=1,
                    type="sessionStarted",
                    requestId=command.requestId,
                    sessionId=self.session_id,
                ),
                StatusEvent(
                    protocolVersion=1,
                    type="status",
                    requestId=command.requestId,
                    code="listening",
                ),
            ]

        if isinstance(command, StopSessionCommand):
            if self.session_id is None or command.sessionId != self.session_id:
                return [self._error(command.requestId, "sessionNotRunning")]
            stopped_session = self.session_id
            self.session_id = None
            return [
                SessionStoppedEvent(
                    protocolVersion=1,
                    type="sessionStopped",
                    requestId=command.requestId,
                    sessionId=stopped_session,
                ),
                StatusEvent(
                    protocolVersion=1,
                    type="status",
                    requestId=command.requestId,
                    code="idle",
                ),
            ]

        if isinstance(command, ShutdownCommand):
            self.session_id = None
            self.should_exit = True
            return [
                ShutdownCompleteEvent(
                    protocolVersion=1,
                    type="shutdownComplete",
                    requestId=command.requestId,
                )
            ]

        return [self._error(command.requestId, "invalidMessage")]

    @staticmethod
    def _error(request_id: str, code: str) -> ErrorEvent:
        return ErrorEvent(
            protocolVersion=1,
            type="error",
            requestId=request_id,
            code=code,
            recoverable=True,
        )
