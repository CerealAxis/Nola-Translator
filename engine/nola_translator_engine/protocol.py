"""The versioned JSONL protocol between Electron and the local engine."""

from __future__ import annotations

import json
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


PROTOCOL_VERSION = 1
MAX_PROTOCOL_LINE_BYTES = 32 * 1024


class ProtocolModel(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class Envelope(ProtocolModel):
    protocolVersion: Literal[1]
    requestId: str = Field(min_length=1, max_length=128)


class DefaultOutputSource(ProtocolModel):
    kind: Literal["defaultOutput"]


class DeviceSource(ProtocolModel):
    kind: Literal["systemOutput", "microphone"]
    deviceId: str = Field(min_length=1, max_length=512)


AudioSource = Annotated[Union[DefaultOutputSource, DeviceSource], Field(discriminator="kind")]


class TranslationOptions(ProtocolModel):
    endpoint: str | None = Field(default=None, min_length=1, max_length=2048)
    apiKey: str | None = Field(default=None, max_length=4096)
    region: str | None = Field(default=None, max_length=128)
    model: str | None = Field(default=None, max_length=256)


class SessionConfig(ProtocolModel):
    audioSource: AudioSource
    recognitionMode: Literal["realtime", "accurate"]
    recognitionModelId: Literal["qwen3-asr-1.7b-hf", "qwen3-asr-0.6b-hf", "sensevoice-small"] | None = None
    sourceLanguage: str = Field(min_length=1, max_length=32)
    targetLanguages: list[str] = Field(max_length=8)
    allowIntermediateTranslation: bool = False
    translationProvider: Literal["hymt2", "m2m100", "microsoft", "openai", "ollama"] = "hymt2"
    translationModelId: str | None = Field(default=None, min_length=1, max_length=256)
    translationOptions: TranslationOptions | None = None
    """Absolute path the engine records the meeting audio to; omitted means no audio file."""
    recordingPath: str | None = Field(default=None, min_length=1, max_length=4096)


class HelloCommand(Envelope):
    type: Literal["hello"]
    clientVersion: str = Field(min_length=1, max_length=64)


class ListDevicesCommand(Envelope):
    type: Literal["listDevices"]


class StartSessionCommand(Envelope):
    type: Literal["startSession"]
    config: SessionConfig


class StopSessionCommand(Envelope):
    type: Literal["stopSession"]
    sessionId: str = Field(min_length=1, max_length=128)


class ShutdownCommand(Envelope):
    type: Literal["shutdown"]


class ListResourcesCommand(Envelope):
    type: Literal["listResources"]


class ManageResourceCommand(Envelope):
    type: Literal["manageResource"]
    resourceId: str = Field(min_length=1, max_length=256)
    action: Literal["install", "remove", "cancel"]


EngineCommand = Annotated[
    Union[
        HelloCommand,
        ListDevicesCommand,
        StartSessionCommand,
        StopSessionCommand,
        ShutdownCommand,
        ListResourcesCommand,
        ManageResourceCommand,
    ],
    Field(discriminator="type"),
]


class Translation(ProtocolModel):
    targetLanguage: str = Field(min_length=1, max_length=32)
    text: str | None = Field(default=None, max_length=16_384)
    state: Literal["pending", "complete", "failed"]
    provider: str = Field(min_length=1, max_length=64)
    errorCode: str | None = Field(default=None, min_length=1, max_length=128)


class CaptionSegment(ProtocolModel):
    segmentId: str = Field(min_length=1, max_length=128)
    revision: int = Field(ge=0)
    startedAtMs: float = Field(ge=0)
    endedAtMs: float | None = Field(default=None, ge=0)
    sourceLanguage: str | None = Field(default=None, min_length=1, max_length=32)
    sourceText: str = Field(max_length=16_384)
    isFinal: bool
    translations: list[Translation] = Field(max_length=8)


class ReadyEvent(Envelope):
    type: Literal["ready"]
    engineVersion: str = Field(min_length=1, max_length=64)
    capabilities: list[str] = Field(max_length=32)


class AudioDevice(ProtocolModel):
    deviceId: str = Field(min_length=1, max_length=512)
    name: str = Field(min_length=1, max_length=512)
    kind: Literal["systemOutput", "microphone"]
    isDefault: bool


class DevicesEvent(Envelope):
    type: Literal["devices"]
    devices: list[AudioDevice] = Field(max_length=256)


class SessionStartedEvent(Envelope):
    type: Literal["sessionStarted"]
    sessionId: str = Field(min_length=1, max_length=128)


class SessionStoppedEvent(Envelope):
    type: Literal["sessionStopped"]
    sessionId: str = Field(min_length=1, max_length=128)


class CaptionEvent(Envelope):
    type: Literal["caption"]
    sessionId: str = Field(min_length=1, max_length=128)
    segment: CaptionSegment


class ModelProgressEvent(Envelope):
    type: Literal["modelProgress"]
    modelId: str = Field(min_length=1, max_length=256)
    operation: Literal["download", "install", "remove"]
    progress: float = Field(ge=0, le=1)
    state: Literal["running", "complete", "failed"]


class ResourceRecord(ProtocolModel):
    resourceId: str = Field(min_length=1, max_length=256)
    kind: Literal["recognitionModel", "translationModel"]
    provider: Literal["qwen3-asr", "sensevoice", "hymt2", "m2m100"]
    name: str = Field(min_length=1, max_length=256)
    description: str = Field(min_length=1, max_length=1024)
    languages: list[str] = Field(max_length=16)
    sourceLanguage: str | None = Field(default=None, max_length=32)
    targetLanguage: str | None = Field(default=None, max_length=32)
    installed: bool
    installedBytes: int = Field(ge=0)
    downloadBytes: int | None = Field(default=None, ge=0)
    state: Literal["idle", "running", "cancelling", "failed"] = "idle"
    phase: Literal["resolve", "download", "verify", "install", "remove", "cleanup"] | None = None
    progress: float | None = Field(default=None, ge=0, le=1)
    cancellable: bool = False
    errorCode: str | None = Field(default=None, min_length=1, max_length=128)


class ResourcesEvent(Envelope):
    type: Literal["resources"]
    storagePath: str = Field(min_length=1, max_length=2048)
    resources: list[ResourceRecord] = Field(max_length=64)


class ResourceActionResultEvent(Envelope):
    type: Literal["resourceActionResult"]
    resource: ResourceRecord


class ResourceChangedEvent(Envelope):
    type: Literal["resourceChanged"]
    resource: ResourceRecord


class StatusEvent(Envelope):
    type: Literal["status"]
    code: Literal["idle", "starting", "ready", "listening", "stopping"]
    details: dict[str, object] | None = None


ErrorCode = Literal[
    "invalidMessage",
    "unsupportedProtocol",
    "invalidConfiguration",
    "sessionNotRunning",
    "sessionAlreadyRunning",
    "audioDeviceUnavailable",
    "modelUnavailable",
    "resourceUnavailable",
    "resourceNotFound",
    "resourceBusy",
    "resourceInUse",
    "lineTooLarge",
    "internalError",
]


class ErrorEvent(Envelope):
    type: Literal["error"]
    code: ErrorCode
    recoverable: bool
    details: dict[str, object] | None = None


class ShutdownCompleteEvent(Envelope):
    type: Literal["shutdownComplete"]


EngineEvent = Annotated[
    Union[
        ReadyEvent,
        DevicesEvent,
        SessionStartedEvent,
        SessionStoppedEvent,
        CaptionEvent,
        ModelProgressEvent,
        ResourcesEvent,
        ResourceActionResultEvent,
        ResourceChangedEvent,
        StatusEvent,
        ErrorEvent,
        ShutdownCompleteEvent,
    ],
    Field(discriminator="type"),
]

_COMMAND_ADAPTER = TypeAdapter(EngineCommand)
_EVENT_ADAPTER = TypeAdapter(EngineEvent)


def _load_line(line: str) -> object:
    if len(line.encode("utf-8")) > MAX_PROTOCOL_LINE_BYTES:
        raise ValueError("协议单行不能超过 32 KiB")
    return json.loads(line)


def parse_command_line(line: str) -> EngineCommand:
    return _COMMAND_ADAPTER.validate_python(_load_line(line))


def parse_event_line(line: str) -> EngineEvent:
    return _EVENT_ADAPTER.validate_python(_load_line(line))


def serialize_event(event: EngineEvent) -> str:
    return json.dumps(
        _EVENT_ADAPTER.dump_python(event, mode="json", exclude_none=True),
        ensure_ascii=False,
        separators=(",", ":"),
    )
