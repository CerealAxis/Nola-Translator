"""Lightweight session orchestration for the engine service; recognition and translation plug in from later modules."""

from __future__ import annotations

from collections.abc import Callable
from uuid import uuid4

from . import __version__
from .audio.devices import (
    AudioDeviceRecord,
    AudioDeviceRegistry,
    AudioDeviceUnavailableError,
    enumerate_wasapi_devices,
)
from .protocol import (
    AudioDevice,
    DevicesEvent,
    EngineCommand,
    EngineEvent,
    ErrorEvent,
    HelloCommand,
    ListDevicesCommand,
    ReadyEvent,
    SearchHubModelsCommand,
    SessionStartedEvent,
    SessionStoppedEvent,
    ShutdownCommand,
    ShutdownCompleteEvent,
    StartSessionCommand,
    StatusEvent,
    StopSessionCommand,
)


class EngineService:
    """Handle a command that already passed protocol validation, returning zero or more events."""

    def __init__(
        self,
        device_enumerator: Callable[[], list[AudioDeviceRecord]] = enumerate_wasapi_devices,
    ) -> None:
        self.session_id: str | None = None
        self.should_exit = False
        self.device_enumerator = device_enumerator
        self.device_registry = AudioDeviceRegistry(device_enumerator)
        self.active_device: AudioDeviceRecord | None = None

    def handle(self, command: EngineCommand) -> list[EngineEvent]:
        if isinstance(command, HelloCommand):
            return [
                ReadyEvent(
                    protocolVersion=1,
                    type="ready",
                    requestId=command.requestId,
                    engineVersion=__version__,
                    capabilities=[
                        "devices", "captions", "translation", "resources", "pause", "hubInspect", "browserAudio",
                        "prewarmModels",
                    ],
                )
            ]

        if isinstance(command, ListDevicesCommand):
            try:
                devices = self.device_enumerator()
            except Exception as error:
                return [
                    self._error(
                        command.requestId,
                        "audioDeviceUnavailable",
                        {"reason": type(error).__name__},
                    )
                ]
            return [
                DevicesEvent(
                    protocolVersion=1,
                    type="devices",
                    requestId=command.requestId,
                    devices=[
                        AudioDevice(
                            deviceId=device.device_id,
                            name=device.name,
                            kind=device.kind,
                            isDefault=device.is_default,
                        )
                        for device in devices
                    ],
                )
            ]

        if isinstance(command, StartSessionCommand):
            if self.session_id is not None:
                return [self._error(command.requestId, "sessionAlreadyRunning")]
            source = command.config.audioSource
            try:
                if source.kind == "browserTab":
                    self.active_device = None
                elif source.kind == "defaultOutput":
                    self.active_device = self.device_registry.resolve("systemOutput")
                else:
                    self.active_device = self.device_registry.resolve(source.kind, source.deviceId)
            except (AudioDeviceUnavailableError, OSError) as error:
                return [
                    self._error(
                        command.requestId,
                        "audioDeviceUnavailable",
                        {"kind": source.kind, "reason": type(error).__name__},
                    )
                ]
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
            self.active_device = None
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

        if isinstance(command, SearchHubModelsCommand):
            # The search half of the hub feature is not built yet, and saying so is the whole
            # point of this module: an empty result list would read as "the hub has nothing",
            # which is a different and much more misleading answer.
            return [
                self._error(
                    command.requestId,
                    "resourceUnavailable",
                    {"reason": "hubSearchNotImplemented", "query": command.query},
                )
            ]

        if isinstance(command, ShutdownCommand):
            self.session_id = None
            self.active_device = None
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
    def _error(
        request_id: str,
        code: str,
        details: dict[str, object] | None = None,
    ) -> ErrorEvent:
        return ErrorEvent(
            protocolVersion=1,
            type="error",
            requestId=request_id,
            code=code,
            recoverable=True,
            details=details,
        )
