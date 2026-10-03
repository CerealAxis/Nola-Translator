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
    # A free-form id rather than a fixed union: a session may name any model the engine has a
    # loader for, and the resource table is where "is this id real" is decided. Narrowing it here
    # only made an unknown id fail as an opaque protocol error instead of a useful one.
    recognitionModelId: str | None = Field(default=None, min_length=1, max_length=256)
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


class SetSessionPausedCommand(Envelope):
    type: Literal["setSessionPaused"]
    sessionId: str = Field(min_length=1, max_length=128)
    paused: bool


class ShutdownCommand(Envelope):
    type: Literal["shutdown"]


class ListResourcesCommand(Envelope):
    type: Literal["listResources"]


class ManageResourceCommand(Envelope):
    type: Literal["manageResource"]
    resourceId: str = Field(min_length=1, max_length=256)
    action: Literal["install", "remove", "cancel"]


class SearchHubModelsCommand(Envelope):
    """Find candidate repos on Hugging Face. Read-only, and it installs nothing."""

    type: Literal["searchHubModels"]
    # Empty is meaningful, not invalid: the hub's list endpoint reads `search=` as "most
    # downloaded", which is how the app browses popular models with an empty search box.
    query: str = Field(max_length=256)
    slot: Literal["recognition", "translation"] | None = None
    weightFormat: Literal["gguf"] | None = None
    cursor: str | None = Field(default=None, min_length=1, max_length=2048)
    limit: int = Field(default=20, ge=1, le=50)


class InspectHubRepoCommand(Envelope):
    """Ask what a repo declares about itself and whether the engine can run it. Read-only."""

    type: Literal["inspectHubRepo"]
    repo: str = Field(min_length=3, max_length=256)


class InstallHubRepoCommand(Envelope):
    """Judge a repo, remember it, and start its download.

    Separate from ``manageResource`` on purpose. A repo that is not installed yet has no
    ``resourceId`` in the engine's table, so ``manageResource`` cannot name it, and the
    compatibility verdict has to be produced *before* anything is downloaded — refusing a model
    the engine cannot run only after committing the user to a multi-gigabyte transfer is the
    failure this command exists to prevent.
    """

    type: Literal["installHubRepo"]
    repo: str = Field(min_length=3, max_length=256)
    #: The slot the caller expects. Mismatched against the repo's own verdict so a click on the
    #: wrong filter cannot install a translation model into the recognition list.
    slot: Literal["recognition", "translation"] | None = None


EngineCommand = Annotated[
    Union[
        HelloCommand,
        ListDevicesCommand,
        StartSessionCommand,
        StopSessionCommand,
        SetSessionPausedCommand,
        ShutdownCommand,
        ListResourcesCommand,
        ManageResourceCommand,
        SearchHubModelsCommand,
        InspectHubRepoCommand,
        InstallHubRepoCommand,
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
    # Names a loader rather than a fixed enum, so a new runtime adapter does not require a
    # protocol bump on both sides just to be listed.
    provider: str = Field(min_length=1, max_length=64)
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


class HubCompatibility(ProtocolModel):
    """Whether a repo can be installed, and the model-derived facts the call was made on.

    ``reason`` is written for the user and always explains a refusal in terms of what the repo
    actually declares (``modelType``, ``ggufArchitecture``); ``evidence`` carries the raw values
    so a support conversation never has to go back to the network to explain a verdict.
    """

    compatible: bool
    reasonCode: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=1024)
    slot: Literal["recognition", "translation"] | None = None
    loader: Literal["llama.cpp", "transformers", "funasr"] | None = None
    adapterId: str | None = Field(default=None, max_length=64)
    # Empty when the loader declares no static table, not when the model supports nothing: the
    # evidence map says which, and conflating the two would read as "no languages supported".
    languages: list[str] = Field(default_factory=list, max_length=128)
    evidence: dict[str, str] = Field(default_factory=dict)


class HubModelSummary(ProtocolModel):
    """One metadata search hit; runtime compatibility is optional and separate."""

    repo: str = Field(min_length=1, max_length=256)
    #: The id this repo would get once installed (``hub:owner/name``), so the UI can name the
    #: install action before the install has happened.
    resourceId: str = Field(min_length=1, max_length=256)
    revision: str | None = Field(default=None, max_length=64)
    formats: list[Literal["pytorch", "gguf"]] = Field(default_factory=list, max_length=2)
    description: str | None = Field(default=None, max_length=600)
    author: str | None = Field(default=None, max_length=256)
    pipelineTag: str | None = Field(default=None, max_length=64)
    libraryName: str | None = Field(default=None, max_length=64)
    downloads: int | None = Field(default=None, ge=0)
    lastModified: str | None = Field(default=None, max_length=64)
    hasGguf: bool = False
    ggufArchitecture: str | None = Field(default=None, max_length=64)
    fileCount: int = Field(default=0, ge=0)
    downloadBytes: int | None = Field(default=None, ge=0)
    #: Already present in the engine's resource table, so the UI can show it as installed.
    installed: bool = False
    compatibility: HubCompatibility | None = None
    """``languages`` is left empty in search results on purpose: the full table is up to 39 codes
    per model, and a 20-row comparison list would spend most of the 32 KiB protocol line on
    language codes the user is not choosing between. ``inspectHubRepo`` carries the full table."""


class HubModelsEvent(Envelope):
    type: Literal["hubModels"]
    # Mirrors SearchHubModelsCommand: a browse request echoes an empty query back.
    query: str = Field(max_length=256)
    models: list[HubModelSummary] = Field(max_length=20)
    #: Number of metadata candidates fetched before format filtering and the page limit.
    candidates: int = Field(default=0, ge=0)
    rateLimited: bool = False
    nextCursor: str | None = Field(default=None, min_length=1, max_length=2048)


class HubInspectEvent(Envelope):
    """The answer to ``inspectHubRepo``: what the repo is, and whether the engine can run it."""

    type: Literal["hubInspect"]
    repo: str = Field(min_length=1, max_length=256)
    revision: str | None = Field(default=None, max_length=64)
    fileCount: int = Field(default=0, ge=0)
    downloadBytes: int | None = Field(default=None, ge=0)
    compatibility: HubCompatibility


class StatusEvent(Envelope):
    type: Literal["status"]
    code: Literal["idle", "starting", "ready", "listening", "paused", "stopping"]
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
        HubModelsEvent,
        HubInspectEvent,
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
