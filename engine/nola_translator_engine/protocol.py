"""The versioned JSONL protocol between Electron and the local engine."""

from __future__ import annotations
from .compute import ComputeOptions

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
    #: A field of its own, separate from the provider name, so one `cloud` provider covers all
    #: four wire shapes. `endpoint` means something different per format: the two OpenAI
    #: formats take a versioned base (`https://api.openai.com/v1`), while `anthropic` and
    #: `ollama` take a bare origin, and the provider appends the path its format needs.
    #: No `min_length`: an empty endpoint is the legitimate "not configured yet" state, and a
    #: missing one is reported by the provider as a usable message, not as a schema error.
    endpoint: str = Field(default="", max_length=2048)
    region: str = Field(default="", max_length=128)
    model: str = Field(default="", max_length=256)
    apiFormat: Literal["chat-completions", "chat-responses", "anthropic", "ollama"] = "chat-completions"
    #: Ceiling the engine fits a request into, reserving room for the reply and splitting the
    #: source text when it does not fit. Nothing downstream clips this to what a vendor
    #: documents, so 10M is a fat-finger guard rather than a real model's window, and it
    #: matches the TypeScript bound so the settings UI cannot accept what the engine refuses.
    contextWindow: int = Field(default=128000, ge=256, le=10_000_000)
    #: Sent as each API's own output-limit field (`max_tokens`, `max_output_tokens`,
    #: `options.num_predict`). The window never leaves the engine, so this ceiling is the only
    #: thing between a pasted 1e9 and a reply the user pays for.
    maxOutputTokens: int = Field(default=4096, ge=1, le=10_000_000)
    #: 4096 is far above any issued key — real ones run a few hundred bytes — but self-hosted
    #: gateways mint signed tokens well past 1 KiB, and the TS schema agrees on the same number.
    apiKey: str = Field(default="", max_length=4096)


class SessionConfig(ProtocolModel):
    compute: ComputeOptions = Field(default_factory=ComputeOptions)
    audioSource: AudioSource
    recognitionMode: Literal["realtime", "accurate"]
    # A session may name any model the engine has a loader for, and the resource table is
    # where "is this id real" is decided.
    recognitionModelId: str | None = Field(default=None, min_length=1, max_length=256)
    sourceLanguage: str = Field(min_length=1, max_length=32)
    targetLanguages: list[str] = Field(max_length=8)
    allowIntermediateTranslation: bool = False
    # `local` and `cloud` are provider names, not wire formats. `local` dispatches on the adapter
    # the selected model's own metadata resolved to, so a hub GGUF and the bundled transformers
    # model are both "local"; `cloud` dispatches on `translationOptions.apiFormat`.
    translationProvider: Literal["local", "cloud", "microsoft"] = "local"
    translationModelId: str | None = Field(default=None, min_length=1, max_length=256)
    translationOptions: TranslationOptions | None = None
    """Absolute path the engine records the meeting audio to; omitted means no audio file."""
    recordingPath: str | None = Field(default=None, min_length=1, max_length=4096)


class HelloCommand(Envelope):
    type: Literal["hello"]
    clientVersion: str = Field(min_length=1, max_length=64)


class ListDevicesCommand(Envelope):
    type: Literal["listDevices"]


class ListComputeDevicesCommand(Envelope):
    type: Literal["listComputeDevices"]


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
    # Empty is meaningful, not invalid: `search_url` always sends `search=`, and paired with
    # `sort=downloads` that is how an empty box browses the most popular models.
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
        ListComputeDevicesCommand,
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
    # See `resources.py` for the values.
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
    """Whether a repo can be installed, and the model-derived facts the call was made on."""

    compatible: bool
    reasonCode: str = Field(min_length=1, max_length=64)
    reason: str = Field(min_length=1, max_length=1024)
    slot: Literal["recognition", "translation"] | None = None
    loader: Literal["llama.cpp", "transformers", "funasr"] | None = None
    adapterId: str | None = Field(default=None, max_length=64)
    # Empty whenever no table was enumerated for this verdict - an adapter that declares none,
    # or a rejection - so it must never be read as "this model supports no languages".
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


class ComputeDevicesEvent(Envelope):
    type: Literal["computeDevices"]
    devices: list[dict[str, object]] = Field(max_length=64)
    notes: list[str] = Field(max_length=32)
    torchVersion: str = Field(max_length=64)
    activePlan: dict[str, object] | None = None


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
  # Hub and install failures. classify_hub_error() raises these from a genuine
  # transport failure or an install that could not complete; they never come from
  # session handling.
  "networkUnavailable",
  "integrityCheckFailed",
  "installFailed",
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
        ComputeDevicesEvent,
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
