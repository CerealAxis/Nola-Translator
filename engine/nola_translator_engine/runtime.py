"""Wires protocol commands to real audio, ASR, and caption events."""

from __future__ import annotations

import asyncio
import base64
import json
import importlib
import os
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, asdict, replace
from pathlib import Path
from time import monotonic
from typing import TypeVar
from uuid import uuid4

from .audio.capture import AudioDeviceDisconnectedError, BrowserAudioCapture, PortAudioCapture, capture_audio_test
from . import debug_log
from .debug_log import exception_fields, write as write_debug
from .compute import ComputeDevice, choose_devices, model_memory_mb, probe_devices, resource_failure, cpu_threads, release_failed_load
from .audio.recorder import Mp3Recorder
from .hub import (
    HubRepoInfo,
    RuntimeVerdict,
    classify_hub_error,
    detect_runtime,
    inspect_repo,
    search_repos,
    search_formats,
)
from .model_capabilities import normalize, supports_translation
from .models.manager import ModelManager
from .models.registry import CustomFile
from .protocol import (
    TestAudioCommand,
    AudioTestedEvent,
    CaptionEvent,
    AudioAcceptedEvent,
    BrowserTimeline,
    PushAudioCommand,
    ResetStreamCommand,
    StreamResetEvent,
    FinishStreamCommand,
    StreamFinishedEvent,
    ComputeDevicesEvent,
    ListComputeDevicesCommand,
    CaptionSegment,
    DebugLogCommand,
    DebugLoggedEvent,
    EngineCommand,
    EngineEvent,
    ErrorEvent,
    HubCompatibility,
    HubInspectEvent,
    HubModelSummary,
    HubModelsEvent,
    InspectHubRepoCommand,
    InstallHubRepoCommand,
    ConfigureModelCommand,
    ListResourcesCommand,
    ManageResourceCommand,
    ModelSelection,
    ModelsPrewarmedEvent,
    ModelsReleasedEvent,
    PrewarmModelsCommand,
    ReleaseModelsCommand,
    HelloCommand,
    ResourceActionResultEvent,
    ResourcesEvent,
    SearchHubModelsCommand,
    ShutdownCommand,
    StartSessionCommand,
    StatusEvent,
    StopSessionCommand,
    SetSessionPausedCommand,
    SessionConfig,
    Translation,
)
from .recognition.llama_asr import LlamaAsrRuntime
from .recognition.crisp_asr import CrispAsrRuntime
from .recognition.streaming import StreamingRecognizer
from .translation.transformers_causal import CausalTranslationProvider, Seq2SeqTranslationProvider
from .translation.index_translate import IndexTranslateTransformersProvider
from .recognition.base import ModelUnavailable, RecognitionUpdate, Recognizer
from .recognition.aliyun import MODELS as ALIYUN_RECOGNITION_MODELS, AliyunRecognizer, CloudRecognitionError
from .recognition.minimax import MODELS as MINIMAX_RECOGNITION_MODELS, MiniMaxRecognizer
from .recognition.qwen_runtime import QwenRuntime, TransformersAsrRuntime, get_qwen_runtime
from .recognition.qwen_streaming import create_qwen_recognizer
from .recognition.sensevoice_runtime import SenseVoiceRuntime, FunAsrRuntime, get_sensevoice_runtime
from .recognition.sensevoice_streaming import create_sensevoice_recognizer
from .resources import (
    HYMT2_RESOURCE_ID,
    HYMT2_RESOURCE_IDS,
    HYMT2_7B_RESOURCE_ID,
    INDEX_TRANSLATE_RESOURCE_IDS,
    INDEX_TRANSLATE_TRANSFORMERS_IDS,
    M2M100_RESOURCE_ID,
    QWEN_RESOURCE_ID,
    ResourceActionError,
    ResourceManager,
)
from .service import EngineService
from .translation.base import ScheduledTranslation, TranslationProvider
from .translation.hymt2 import (
    HyMt2TranslationProvider,
    is_supported,
    validate_session_languages,
)
from .translation.llama_server import LlamaServerError, LlamaServerManager, resolve_llama_dir
from .translation.m2m100 import (
    M2M100TranslationProvider,
    is_supported as m2m100_is_supported,
    validate_session_languages as validate_m2m100_languages,
)
from .translation.network import (
    DEFAULT_ANTHROPIC_ENDPOINT,
    DEFAULT_CONTEXT_WINDOW,
    DEFAULT_MAX_OUTPUT_TOKENS,
    DEFAULT_MICROSOFT_ENDPOINT,
    DEFAULT_OLLAMA_ENDPOINT,
    DEFAULT_OPENAI_ENDPOINT,
    AnthropicMessagesProvider,
    MicrosoftTranslatorProvider,
    OllamaTranslationProvider,
    OpenAICompatibleProvider,
    OpenAIResponsesProvider,
)
from .translation.scheduler import TranslationScheduler
from .translation.mymemory import DEFAULT_MYMEMORY_ENDPOINT, MyMemoryTranslationProvider
from .translation.google_translate import DEFAULT_GOOGLE_TRANSLATE_ENDPOINT, GoogleTranslateProvider
from .translation.index_translate import IndexTranslateLocalProvider, IndexTranslatePublicProvider


EventSink = Callable[[EngineEvent], None]

#: Both commands name their models through a ``config`` and reach the same runtime resolution,
#: so the load path is shared rather than typed twice.
ModelSelectionCommand = StartSessionCommand | PrewarmModelsCommand
LoadResult = TypeVar('LoadResult')


#: Cloud recognition reasons retain provider-specific compatibility while mapping transport
#: and response failures to stable engine codes.
CLOUD_RECOGNITION_ERROR_CODES: dict[str, str] = {
    "recognitionUnauthorized": "cloudRecognitionCredentialMissing",
    "recognitionInsufficientBalance": "cloudRecognitionInsufficientBalance",
    "recognitionRateLimited": "cloudRecognitionRateLimited",
    "recognitionNetworkError": "recognitionNetworkUnavailable",
    "recognitionNetworkUnavailable": "recognitionNetworkUnavailable",
    "recognitionTimeout": "recognitionTimeout",
    "recognitionInvalidResponse": "recognitionInvalidResponse",
    "recognitionInvalidHandshake": "recognitionInvalidResponse",
    "recognitionRejected": "recognitionInvalidResponse",
    "recognitionClosed": "recognitionClosed",
    "recognitionBufferOverflow": "recognitionBufferOverflow",
}


def _model_load_error_code(error: Exception) -> str:
    text = f"{type(error).__name__} {error}".lower()
    if any(token in text for token in ("out of memory", "outofmemory", "cuda error", "memoryerror")) or isinstance(error, MemoryError):
        return "modelOutOfMemory"
    if isinstance(error, ModuleNotFoundError) or any(token in text for token in ("no module named", "importerror", "dependency", "missing package")):
        return "modelDependencyMissing"
    if any(token in text for token in ("weight", "checkpoint", "safetensors", "state_dict", "invalid model", "corrupt")):
        return "modelWeightsInvalid"
    return "modelLoadFailed"


class RemoteRecognitionRuntime:
    loaded = False

    def __init__(self, provider: str, model: str) -> None:
        self.provider, self.model = provider, model

    def describe(self) -> str:
        return f"{self.provider}:{self.model}"


class UnknownTranslationModel(ValueError):
    """A session named a translation model the engine has no llama-server tier for.
    """

    def __init__(self, model_id: str) -> None:
        super().__init__(
            f"未知的翻译模型 id：{model_id}。可用："
            + "、".join((*HYMT2_RESOURCE_IDS, M2M100_RESOURCE_ID, *INDEX_TRANSLATE_RESOURCE_IDS, *INDEX_TRANSLATE_TRANSFORMERS_IDS))
        )
        self.model_id = model_id


@dataclass(frozen=True, slots=True)
class TranslationRequest:
    update: RecognitionUpdate
    source: str
    targets: tuple[str, ...]
    allow_intermediate: bool
    previous_context: tuple[str, str] | None = None


def _compatibility(verdict: RuntimeVerdict, *, languages: bool = True) -> HubCompatibility:
    """A runtime verdict as the protocol shape both the search and the inspect event carry."""
    return HubCompatibility(
        compatible=verdict.compatible,
        reasonCode=verdict.reason_code,
        reason=verdict.reason,
        slot=verdict.slot,
        loader=verdict.loader,
        adapterId=verdict.adapter_id,
        languages=list(verdict.languages) if languages else [],
        evidence=verdict.evidence_map,
    )


def _custom_files(info: HubRepoInfo) -> tuple[CustomFile, ...]:
    """The repo's file list as registry entries, carrying whichever digest HF published.
    """
    files: list[CustomFile] = []
    selected_gguf = None
    if detect_runtime(info).adapter_id == "llama-asr":
        main = min((item for item in info.gguf_files if not Path(item.path).name.casefold().startswith("mmproj-")),
            key=lambda item: (item.size or 2**63, item.path))
        selected_gguf = {main.path, str(Path(main.path).with_name("mmproj-" + Path(main.path).name)).replace("\\", "/")}
    for item in info.files:
        if selected_gguf is not None and item.path.casefold().endswith(".gguf") and item.path not in selected_gguf:
            continue
        if item.size is None:
            continue
        if item.sha256 is None and item.blob_sha1 is None:
            # detect_runtime already refuses a repo with an undigested file, so reaching here
            # means every file has one; skipping is belt-and-braces, not a silent acceptance.
            continue
        files.append(
            CustomFile(
                path=item.path,
                size=item.size,
                sha256=item.sha256,
                blob_sha1=item.blob_sha1,
            )
        )
    return tuple(files)


class EngineRuntime:
    def __init__(self, model_root: Path, emit: EventSink) -> None:
        self.service = EngineService()
        self.models = ModelManager(model_root)
        self.emit = emit
        self.resources = ResourceManager(model_root, emit)
        self.capture: PortAudioCapture | BrowserAudioCapture | None = None
        self.recorder: Mp3Recorder | None = None
        self.recognizer: Recognizer | None = None
        self.session_task: asyncio.Task[None] | None = None
        self.session_request_id = ""
        self.session_started_at_ms = 0.0
        self.session_paused = False
        self.active_config = None
        self.llama_manager = LlamaServerManager(gguf_path=self.resources.hymt2_gguf_path)
        self.translation_provider = HyMt2TranslationProvider(self.llama_manager)
        self.translation_scheduler = TranslationScheduler(self.translation_provider)
        self.fallback_translation_provider = None
        self.fallback_translation_scheduler = None
        self.active_model_id = QWEN_RESOURCE_ID
        self.translation_tasks: dict[str, asyncio.Task[None]] = {}
        self.translation_jobs: dict[str, set[asyncio.Task[list[Translation]]]] = {}
        self.translation_display_revision: dict[tuple[str, str], int] = {}
        self.translation_requests: dict[str, TranslationRequest] = {}
        self.latest_updates: dict[str, RecognitionUpdate] = {}
        self.latest_translations: dict[str, list[Translation]] = {}
        self.caption_revisions: dict[str, int] = {}
        self.completed_segments: OrderedDict[str, None] = OrderedDict()
        self.completed_segment_limit = 512
        self.partial_translation_interval = 0.3
        self.translation_last_started: dict[str, float] = {}
        self._first_translation_timing_logged = False
        self.translation_wake: dict[str, asyncio.Event] = {}
        self._status_cache: str | None = None
        self._dropped_chunks = 0
        self._device_plan: dict[str, object] | None = None
        self._recognition_device = ComputeDevice("cpu", "CPU", "cpu", "cpu", recognition=True, translation=True)
        self._translation_device = self._recognition_device
        self._active_recognition_runtime = None
        self._stream_generation = 0
        self._stream_epoch: int | None = None
        self._timeline: BrowserTimeline | None = None
        self._timeline_origin_ms = 0.0
        self._last_audio_sequence = -1
        self._last_audio_end_ms = 0.0
        self._stream_anchored = False
        self._epoch_initialized = False
        self._pause_flush_task: asyncio.Task[None] | None = None
        self._finish_stream_task: asyncio.Task[None] | None = None
        self._stream_finishing = False
        self._last_frame_end_ms = 0.0
        # Cloud failures the session was already told about, so one failure is not
        # reported twice no matter which path reaches the engine first.
        self._reported_cloud_failures: set[CloudRecognitionError] = set()
        self._model_cleanup_task: asyncio.Task[None] | None = None
        self.model_cleanup_timeout = 2.0
        self._loaded_model_key: tuple[str, str | None, str] | None = None
        self._loaded_translation_model_id: str | None = None
        self._retain_models = False
        self._compute_inventory: tuple[list[ComputeDevice], list[str], str] | None = None
        self._compute_inventory_at = 0.0
        self._dependency_task: asyncio.Task[None] | None = None
        self._closing = False
        self._last_heartbeat_at: float | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._torch_threads = cpu_threads()
        self._llama_threads = cpu_threads()
        self._write_engine_status()


    async def handle(self, command: EngineCommand) -> list[EngineEvent]:
        if isinstance(command, TestAudioCommand):
            if self.service.session_id is not None:
                return [self._resource_error(command.requestId, "sessionAlreadyRunning")]
            source = command.audioSource
            try:
                device = self.service.device_registry.resolve(
                    "systemOutput" if source.kind == "defaultOutput" else source.kind,
                    None if source.kind == "defaultOutput" else source.deviceId,
                    request_id=command.requestId,
                )
                result = await capture_audio_test(PortAudioCapture(device, request_id=command.requestId))
                return [AudioTestedEvent(protocolVersion=1, type="audioTested", requestId=command.requestId, **result)]
            except AudioDeviceDisconnectedError:
                write_debug("engine", "audio.test.failed", {"requestId": command.requestId, "reason": "disconnected"})
                return [self._resource_error(command.requestId, "audioDeviceDisconnected", {"reason": "disconnected"})]
            except Exception as error:
                write_debug("engine", "audio.test.failed", {"requestId": command.requestId, **exception_fields(error)})
                return [self._resource_error(command.requestId, "audioDeviceUnavailable", {"reason": str(error)})]
        if isinstance(command, HelloCommand):
            # FunASR discovers many adapters on its first import. Do that once after the
            # handshake, while the UI is usable, without loading weights or running inference.
            model_id = os.environ.get('NOLA_TRANSLATOR_RECOGNITION_MODEL_ID')
            if model_id and self._dependency_task is None:
                self._dependency_task = asyncio.create_task(self._import_recognition_dependencies(model_id))
            return self.service.handle(command)
        if isinstance(command, ListComputeDevicesCommand):
            self._update_compute_plan()
            devices, notes, version = await self._probe_compute_inventory(refresh=True)
            return [ComputeDevicesEvent(
                protocolVersion=1, type="computeDevices", requestId=command.requestId,
                devices=[asdict(d) for d in devices], notes=notes, torchVersion=version,
                activePlan=self._device_plan,
            )]
        if isinstance(command, ListResourcesCommand):
            return [
                ResourcesEvent(
                    protocolVersion=1,
                    type="resources",
                    requestId=command.requestId,
                    storagePath=str(self.models.model_root),
                    resources=self.resources.list(),
                )
            ]
        if isinstance(command, ManageResourceCommand):
            if command.action == "remove":
                if self._model_cleanup_pending():
                    return [self._cleanup_busy_error(command.requestId)]
                if (
                    command.action == "remove"
                    and self.service.session_id is not None
                ):
                    return [self._resource_error(command.requestId, "resourceInUse")]
                if command.resourceId in (self.active_model_id, self._loaded_translation_model_id):
                    await self._unload_session_models()
            try:
                resource = await self.resources.manage(
                    command.resourceId, command.action, command.network, command.downloadSource
                )
            except ResourceActionError as error:
                return [self._resource_error(command.requestId, error.code, error.details)]
            return [
                ResourceActionResultEvent(
                    protocolVersion=1,
                    type="resourceActionResult",
                    requestId=command.requestId,
                    resource=resource,
                )
            ]
        if isinstance(command, ConfigureModelCommand):
            if self._model_cleanup_pending():
                return [self._cleanup_busy_error(command.requestId)]
            if self.service.session_id is not None:
                return [self._resource_error(command.requestId, "resourceInUse")]
            try:
                record = self.resources.configure(command.resourceId, command.configuration)
                return [ResourceActionResultEvent(protocolVersion=1, type="resourceActionResult", requestId=command.requestId, resource=record)]
            except ResourceActionError as error:
                return [self._resource_error(command.requestId, error.code, error.details)]
        if isinstance(command, StartSessionCommand):
            return await self._start(command)
        if isinstance(command, PrewarmModelsCommand):
            return await self._prewarm(command)
        if isinstance(command, ReleaseModelsCommand):
            if self.service.session_id is not None:
                return [self._resource_error(command.requestId, 'resourceInUse')]
            self._retain_models = False
            deferred = self._model_cleanup_pending()
            if not deferred:
                await self._unload_session_models()
            return [ModelsReleasedEvent(protocolVersion=1, type='modelsReleased', requestId=command.requestId, deferred=deferred)]
        if isinstance(command, InspectHubRepoCommand):
            return await self._inspect_hub_repo(command)
        if isinstance(command, SearchHubModelsCommand):
            return await self._search_hub_models(command)
        if isinstance(command, InstallHubRepoCommand):
            return await self._install_hub_repo(command)
        if isinstance(command, SetSessionPausedCommand):
            if self._timeline is not None or isinstance(self.capture, BrowserAudioCapture):
                return await self._set_browser_paused(command)
            return self._set_paused(command)
        if isinstance(command, PushAudioCommand):
            return self._push_audio(command)
        if isinstance(command, ResetStreamCommand):
            return await self._reset_stream(command)
        if isinstance(command, FinishStreamCommand):
            return await self._finish_stream(command)
        if isinstance(command, DebugLogCommand):
            debug_log.write(command.layer, command.event, command.data)
            return [DebugLoggedEvent(protocolVersion=1, type="debugLogged", requestId=command.requestId)]
        if isinstance(command, StopSessionCommand):
            return await self._stop(command)
        if isinstance(command, ShutdownCommand):
            if self.service.session_id is not None:
                await self._stop(
                    StopSessionCommand(
                        protocolVersion=1,
                        type="stopSession",
                        requestId=command.requestId,
                        sessionId=self.service.session_id,
                    )
                )
            return self.service.handle(command)
        return self.service.handle(command)

    async def _import_recognition_dependencies(self, model_id: str) -> None:
        if not model_id.strip():
            return
        started_at = monotonic()
        try:
            adapter = self.resources.adapter_for(model_id)
            module = 'funasr' if adapter in ('sensevoice', 'funasr') else 'transformers' if adapter in ('qwen3-asr', 'transformers-asr') else None
            if module:
                await asyncio.to_thread(importlib.import_module, module)
                write_debug('engine', 'recognition.dependencies.timing', {'adapter': adapter, 'elapsedMs': round((monotonic() - started_at) * 1000)})
        except Exception as error:
            # The actual loader remains the authority for errors and device fallback.
            write_debug('engine', 'recognition.dependencies.failed', {'modelId': model_id, **exception_fields(error)})

    async def _probe_compute_inventory(self, *, refresh: bool = False) -> tuple[list[ComputeDevice], list[str], str]:
        # Main-process device-intent resolution and model placement run back to back. Reuse
        # that inventory briefly; an explicit list request still refreshes live free memory.
        if refresh or self._compute_inventory is None or monotonic() - self._compute_inventory_at > 5:
            self._compute_inventory = await asyncio.to_thread(probe_devices, resolve_llama_dir())
            self._compute_inventory_at = monotonic()
        return self._compute_inventory

    async def _inspect_hub_repo(self, command: InspectHubRepoCommand) -> list[EngineEvent]:
        """Report what a Hugging Face repo declares about itself and whether the engine can run it.

        Read-only: it fetches the model index and config.json and nothing else, so a repo can be
        checked for installability long before anyone commits to downloading it. Failures keep
        hub's own meaning — a 404 stays "not found" instead of becoming "网络不可用".
        """
        try:
            info = await asyncio.to_thread(inspect_repo, command.repo, network=command.network)
        except ValueError as error:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {"field": "repo", "reason": str(error)},
                )
            ]
        except Exception as error:
            mapped = classify_hub_error(error)
            if mapped is None:
                return [
                    self._resource_error(
                        command.requestId,
                        "internalError",
                        {"reason": type(error).__name__},
                    )
                ]
            details: dict[str, object] = {
                "repo": command.repo,
                "reason": mapped.reason,
            }
            if mapped.status is not None:
                details["status"] = mapped.status
            return [self._resource_error(command.requestId, mapped.code, details)]

        verdict = detect_runtime(info)
        return [
            HubInspectEvent(
                protocolVersion=1,
                type="hubInspect",
                requestId=command.requestId,
                repo=info.repo,
                revision=info.revision,
                fileCount=len(info.files),
                downloadBytes=info.total_bytes,
                compatibility=_compatibility(verdict),
            )
        ]

    async def _search_hub_models(self, command: SearchHubModelsCommand) -> list[EngineEvent]:
        """Return format-filtered metadata without waiting for per-repo runtime checks."""
        try:
            result = await asyncio.to_thread(
                search_repos,
                command.query,
                slot=command.slot,
                limit=command.limit,
                network=command.network,
                weight_format=command.weightFormat,
                cursor=command.cursor,
            )
        except ValueError as error:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {"field": "query", "reason": str(error)},
                )
            ]
        except Exception as error:
            return [self._hub_error_event(command.requestId, error, command.query)]

        return [
            HubModelsEvent(
                protocolVersion=1,
                type="hubModels",
                requestId=command.requestId,
                query=result.query,
                models=[self._hub_summary(info) for info in result.repos],
                candidates=result.candidates,
                rateLimited=result.rate_limited,
                nextCursor=result.next_cursor,
            )
        ]

    def _hub_summary(self, info: HubRepoInfo) -> HubModelSummary:
        """A metadata search row. Runtime compatibility is checked when installing."""
        resource_id = f"hub:{info.repo}"
        return HubModelSummary(
            repo=info.repo,
            resourceId=resource_id,
            revision=info.revision,
            formats=list(search_formats(info)),
            author=info.author,
            pipelineTag=info.pipeline_tag,
            libraryName=info.library_name,
            downloads=info.downloads,
            lastModified=info.last_modified,
            hasGguf=bool(info.gguf_files),
            ggufArchitecture=info.gguf_architecture,
            fileCount=len(info.files),
            downloadBytes=info.total_bytes,
            installed=(
                self.resources.is_installed(resource_id)
                if self.resources.is_registered(resource_id)
                else False
            ),
        )

    async def _install_hub_repo(self, command: InstallHubRepoCommand) -> list[EngineEvent]:
        """Judge a repo, remember it, and hand it to the same installer the catalog uses.

        The verdict is taken *before* the download starts. A repo the engine cannot run is
        refused with the reason the adapter registry produced, and nothing is written to disk.
        """
        try:
            info = await asyncio.to_thread(inspect_repo, command.repo, network=command.network)
        except ValueError as error:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {"field": "repo", "reason": str(error)},
                )
            ]
        except Exception as error:
            return [self._hub_error_event(command.requestId, error, command.repo)]

        verdict = detect_runtime(info)
        if not verdict.compatible:
            return [
                self._resource_error(
                    command.requestId,
                    "modelUnavailable",
                    {
                        "repo": info.repo,
                        "reason": verdict.reason_code,
                        "reasonText": verdict.reason,
                        "evidence": verdict.evidence_map,
                    },
                )
            ]
        if command.slot is not None and verdict.slot is not None and command.slot != verdict.slot:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {
                        "field": "slot",
                        "repo": info.repo,
                        "reason": f"repoSlotMismatch:{verdict.slot}",
                        "reasonText": (
                            f"这个仓库被判为{'识别' if verdict.slot == 'recognition' else '翻译'}模型，"
                            f"与请求的{'识别' if command.slot == 'recognition' else '翻译'}类别不符。"
                        ),
                    },
                )
            ]

        resource_id = f"hub:{info.repo}"
        try:
            self.resources.register_hub_model(
                repo=info.repo,
                revision=info.revision or "",
                adapter_id=verdict.adapter_id or "",
                slot=verdict.slot or "",
                name=info.repo.split("/")[-1],
                files=_custom_files(info),
                languages=verdict.languages,
            )
        except ResourceActionError as error:
            return [
                self._resource_error(command.requestId, error.code, error.details)
            ]

        # From here the install is the built-in path: the same ModelManager.ensure, the same
        # progress/cancel/phase events, the same resourceChanged broadcast.
        return await self.handle(
            ManageResourceCommand(
                protocolVersion=1,
                type="manageResource",
                requestId=command.requestId,
                resourceId=resource_id,
                action="install",
                downloadSource=command.downloadSource,
                network=command.network,
            )
        )

    def _hub_error_event(self, request_id: str, error: Exception, subject: str) -> ErrorEvent:
        """A hub failure as an engine error, keeping 401/403/404/429 distinct from a dead network."""
        mapped = classify_hub_error(error)
        if mapped is None:
            return self._resource_error(
                request_id, "internalError", {"reason": type(error).__name__, "subject": subject}
            )
        details: dict[str, object] = {"subject": subject, "reason": mapped.reason}
        if mapped.status is not None:
            details["status"] = mapped.status
        return self._resource_error(request_id, mapped.code, details)

    async def _start(self, command: StartSessionCommand) -> list[EngineEvent]:
        if not await self._await_model_cleanup():
            return [self._cleanup_busy_error(command.requestId)]
        if self.service.session_id is not None:
            return self.service.handle(command)

        try:
            model_id, missing_resources = self._validate_model_selection(command.config)
        except ResourceActionError as error:
            # The model ids are free-form strings now, so an id the resource table has never heard
            # of arrives here as a lookup failure. It is a configuration problem, not a crash, and
            # the table is the only thing that knows which ids exist.
            return [self._resource_error(command.requestId, error.code, error.details)]
        except UnknownTranslationModel as error:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {"field": "translationModelId", "reason": str(error)},
                )
            ]
        if missing_resources:
            return [
                self._resource_error(
                    command.requestId,
                    "resourceUnavailable",
                    {"missingResourceIds": missing_resources},
                )
            ]

        try:
            recognizer = await self._prepare_models(command)
            self._update_compute_plan(self.llama_manager.fallback_reason)
        except ValueError as error:
            write_debug("engine", "model.prepare.failed", {"requestId": command.requestId, "operation": "startSession", **exception_fields(error)})
            await self._unload_session_models()
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="invalidConfiguration",
                    recoverable=True,
                    details={"reason": str(error)},
                )
            ]
        except Exception as error:
            write_debug("engine", "model.prepare.failed", {"requestId": command.requestId, "operation": "startSession", **exception_fields(error)})
            await self._unload_session_models()
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code=_model_load_error_code(error),
                    recoverable=True,
                    details={"reason": str(error)[:1024] or type(error).__name__},
                )
            ]

        events = self.service.handle(command)
        if events and events[0].type == "error":
            await recognizer.close()
            await self._unload_session_models()
            return events
        if command.config.audioSource.kind == "browserTab":
            capture = BrowserAudioCapture()
        else:
            assert self.service.active_device is not None
            capture = PortAudioCapture(self.service.active_device, request_id=command.requestId)
        try:
            capture.start()
        except Exception as error:
            await recognizer.close()
            await self._unload_session_models()
            session_id = self.service.session_id
            if session_id is not None:
                self.service.handle(
                    StopSessionCommand(
                        protocolVersion=1,
                        type="stopSession",
                        requestId=command.requestId,
                        sessionId=session_id,
                    )
                )
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="audioDeviceUnavailable",
                    recoverable=True,
                    details={"reason": type(error).__name__},
                )
            ]

        recording_capture = capture if isinstance(capture, PortAudioCapture) else None
        self.recorder = self._open_recorder(
            None if command.config.browserTimeline is not None or isinstance(capture, BrowserAudioCapture)
            else command.config.recordingPath,
            sample_rate=recording_capture.device.sample_rate if recording_capture is not None else 16_000,
            channels=recording_capture.device.channels if recording_capture is not None else 1,
        )
        if recording_capture is not None:
            recording_capture.recording_sink = self.recorder
        self.capture = capture
        self.recognizer = recognizer
        self.session_request_id = command.requestId
        self.session_started_at_ms = monotonic() * 1000
        self._first_translation_timing_logged = False
        self.session_paused = False
        self.active_config = command.config
        # The previous session's failures belong to a recognizer that is gone.
        self._reported_cloud_failures.clear()
        self._stream_generation += 1
        self._timeline = command.config.browserTimeline
        self._stream_epoch = self._timeline.epoch if self._timeline is not None else None
        self._timeline_origin_ms = 0.0 if isinstance(capture, BrowserAudioCapture) else monotonic() * 1000
        self._stream_anchored = False
        self._epoch_initialized = False
        self._stream_finishing = False
        self._last_audio_sequence = -1
        self._last_audio_end_ms = 0.0
        self._bind_recognizer(recognizer)
        self.session_task = asyncio.create_task(self._run_session())
        self._start_pipeline_heartbeat()
        self._write_engine_status()
        return events

    def _validate_model_selection(self, config: ModelSelection) -> tuple[str, list[str]]:
        """The recognition id a config names, and the required ids whose weights are absent.

        A prewarm runs this before loading, so a config it accepted is one the session start
        accepts, with the same error code and the same ``reason``.
        """
        remote = config.recognitionProvider != "local"
        if config.translationProvider == "recognition" and config.recognitionProvider != "aliyun":
            raise ResourceActionError("invalidConfiguration", {"reason": "nativeTranslationRequiresAliyun"})
        if config.translationProvider == "index-translate" or config.fallbackTranslationProvider == "index-translate":
            from .translation.index_translate import LANGUAGE_NAMES
            for target in config.targetLanguages:
                if normalize(target) not in LANGUAGE_NAMES:
                    raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedTranslationLanguage", "language": target})
        if remote:
            try:
                self._remote_recognizer(config)
            except ValueError as error:
                raise ResourceActionError("invalidConfiguration", {"reason": str(error)}) from None
        model_id = self._model_id_from_config(config)
        required_resources = [] if remote else [model_id]
        if config.targetLanguages and (config.translationProvider == "local" or config.fallbackTranslationProvider == "local"):
            # Resolved from the resource table, so a GGUF or a
            # transformers repo the user installed themselves is the thing that gets
            # checked for and loaded.
            required_resources.append(self._local_translation_model_id(config))
        for resource_id in required_resources:
            if self.resources.configuration(resource_id) is None:
                raise ResourceActionError("invalidConfiguration", {"resourceId": resource_id, "reason": "modelNeedsConfiguration"})
            capability = self.resources.configuration(resource_id)
            is_recognition = not remote and resource_id == model_id
            expected_slot = "recognition" if is_recognition else "translation"
            if capability.slot != expected_slot:
                raise ResourceActionError("invalidConfiguration", {"resourceId": resource_id, "reason": "modelLoaderMismatch"})
        source = normalize(config.sourceLanguage)
        if not remote:
            recognition = self.resources.configuration(model_id)
            supported = {normalize(code) for code in recognition.languages}
            recognition_source = "zh" if source == "zh-Hant" else source
            if recognition_source != "auto" and recognition_source not in supported:
                if recognition.supportsAutoDetection:
                    config.sourceLanguage = "auto"
                    source = "auto"
                else:
                    raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedRecognitionLanguage", "language": source})
            if source == "auto" and not recognition.supportsAutoDetection:
                raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedRecognitionLanguage", "language": source})
        if (config.translationProvider == "local" or config.fallbackTranslationProvider == "local") and config.targetLanguages:
            capability = self.resources.configuration(self._local_translation_model_id(config))
            if any(not supports_translation(capability, source, target) for target in config.targetLanguages):
                raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedTranslationLanguage", "language": source})
        return model_id, [
            resource_id for resource_id in required_resources
            if not self.resources.is_installed(resource_id)
        ]

    async def _prewarm(self, command: PrewarmModelsCommand) -> list[EngineEvent]:
        """Keep the wire name for compatibility; load both local models without inference."""
        if not await self._await_model_cleanup():
            return [self._cleanup_busy_error(command.requestId)]
        if self.service.session_id is not None:
            return [self._resource_error(command.requestId, "sessionAlreadyRunning")]

        config = command.config
        try:
            model_id, missing_resources = self._validate_model_selection(config)
            translation_model_id = (
                self._local_translation_model_id(config)
                if config.targetLanguages and (config.translationProvider == "local" or config.fallbackTranslationProvider == "local")
                else None
            )
        except ResourceActionError as error:
            return [self._resource_error(command.requestId, error.code, error.details)]
        except UnknownTranslationModel as error:
            return [
                self._resource_error(
                    command.requestId,
                    "invalidConfiguration",
                    {"field": "translationModelId", "reason": str(error)},
                )
            ]
        if missing_resources:
            return [
                self._resource_error(
                    command.requestId,
                    "resourceUnavailable",
                    {"missingResourceIds": missing_resources},
                )
            ]

        self.emit(ModelsPrewarmedEvent(
            protocolVersion=1, type="modelsPrewarmed", requestId=command.requestId,
            state="loading", recognitionModelId=model_id, translationModelId=translation_model_id,
        ))
        started_at = monotonic()
        try:
            recognizer = await self._prepare_models(command)
            await recognizer.close()
        except ValueError as error:
            write_debug("engine", "model.prepare.failed", {"requestId": command.requestId, "operation": "prewarmModels", **exception_fields(error)})
            await self._unload_session_models()
            return [
                self._resource_error(
                    command.requestId, "invalidConfiguration", {"reason": str(error)},
                )
            ]
        except Exception as error:
            write_debug("engine", "model.prepare.failed", {"requestId": command.requestId, "operation": "prewarmModels", **exception_fields(error)})
            await self._unload_session_models()
            return [
                self._resource_error(
                    command.requestId, _model_load_error_code(error),
                    {"reason": str(error)[:1024] or type(error).__name__},
                )
            ]
        self._update_compute_plan()
        return [ModelsPrewarmedEvent(
            protocolVersion=1, type="modelsPrewarmed", requestId=command.requestId,
            state="ready", recognitionModelId=model_id, translationModelId=translation_model_id,
            elapsedMs=(monotonic() - started_at) * 1000,
            device="cloud" if config.recognitionProvider != "local" else ("vulkan" if self._active_recognition_runtime.using_vulkan else "cpu") if self.resources.adapter_for(model_id) == "crisp-asr" else (
                self._recognition_device.llamaDevice or "cpu" if self.resources.adapter_for(model_id) == "llama-asr"
                else self._recognition_device.torchDevice),
            runtime=self._active_recognition_runtime.describe(),
        )]

    async def _prepare_models(self, command: ModelSelectionCommand) -> Recognizer:
        config = command.config
        if config.recognitionProvider != "local":
            return await self._prepare_remote_models(command)
        local_translation = bool(config.targetLanguages and (config.translationProvider == 'local' or config.fallbackTranslationProvider == 'local'))
        translation_id = self._local_translation_model_id(config) if local_translation else None
        key = (self._model_id(command), translation_id, json.dumps(config.compute.model_dump(), sort_keys=True))
        reuse = key == self._loaded_model_key
        if reuse:
            devices, _notes, _version = await self._probe_compute_inventory()
            available = {device.id for device in devices}
            reuse = self._recognition_device.id in available and (not local_translation or self._translation_device.id in available)
        if not reuse:
            if self._loaded_model_key is not None:
                await self._unload_session_models()
            await self._configure_device_plan(command)
        # Free VRAM already excludes resident models; keep their placement instead of
        # charging the same weights against the remaining budget a second time.
        if config.targetLanguages and (local_translation or isinstance(command, StartSessionCommand)):
            if config.translationProvider == "recognition":
                self.fallback_translation_provider = None
                self.fallback_translation_scheduler = None
                self._configure_translation(command, fallback=True)
            else:
                self._configure_translation(command)
        results = await asyncio.gather(
            self._timed_model_load('recognition', self._create_recognizer(command)),
            self._timed_model_load('translation', self._ensure_translation_server(command)),
            return_exceptions=True,
        )
        # Native loader threads cannot be cancelled safely. Join both loads before cleanup
        # so a failed translator cannot leave ASR allocating behind the error reply.
        errors = [result for result in results if isinstance(result, BaseException)]
        if errors:
            if not isinstance(results[0], BaseException):
                await results[0].close()
            raise errors[0]
        self._loaded_model_key = key
        self._loaded_translation_model_id = translation_id
        self._retain_models = True
        return results[0]

    @staticmethod
    def _remote_recognizer(config: ModelSelection) -> AliyunRecognizer | MiniMaxRecognizer:
        if config.recognitionProvider == "minimax":
            return MiniMaxRecognizer(config)
        return AliyunRecognizer(config)

    async def _prepare_remote_models(self, command: ModelSelectionCommand) -> Recognizer:
        config = command.config
        local_translation = bool(config.targetLanguages and (config.translationProvider == "local" or config.fallbackTranslationProvider == "local"))
        translation_id = self._local_translation_model_id(config) if local_translation else None
        options = config.recognitionOptions.model_dump(exclude={"apiKey"}) if config.recognitionOptions else {}
        key = (self._model_id(command), translation_id, json.dumps({"provider": config.recognitionProvider,
            "options": options, "compute": config.compute.model_dump()}, sort_keys=True))
        if key != self._loaded_model_key:
            if self._loaded_model_key is not None:
                await self._unload_session_models()
            await self._configure_device_plan(command)
        self.active_model_id = self._model_id(command)
        self._active_recognition_runtime = RemoteRecognitionRuntime(config.recognitionProvider, self.active_model_id)
        if config.targetLanguages and (local_translation or isinstance(command, StartSessionCommand)):
            if config.translationProvider == "recognition":
                self.fallback_translation_provider = None
                self.fallback_translation_scheduler = None
                self._configure_translation(command, fallback=True)
            else:
                self._configure_translation(command)
        recognizer = self._remote_recognizer(config)
        try:
            # Prewarm validates settings and may load the local translator. It must never
            # authenticate or open a billable remote recognition session.
            if isinstance(command, StartSessionCommand):
                recognizer.validate_credentials()
                await recognizer.start()
            await self._ensure_translation_server(command)
        except BaseException:
            await recognizer.close()
            raise
        self._loaded_model_key = key
        self._loaded_translation_model_id = translation_id
        self._retain_models = True
        return recognizer

    async def _timed_model_load(self, task: str, work: Awaitable[LoadResult]) -> LoadResult:
        started_at = monotonic()
        outcome = 'failed'
        try:
            result = await work
            outcome = 'ready'
            return result
        finally:
            write_debug('engine', 'model.load.timing', {'task': task, 'outcome': outcome, 'elapsedMs': round((monotonic() - started_at) * 1000)})

    def _open_recorder(self, path: str | None, *, sample_rate: int, channels: int) -> Mp3Recorder | None:
        """Record compressed device-rate audio, or stay silent when the host did not ask for one."""
        if not path:
            return None
        try:
            return Mp3Recorder(path, sample_rate=sample_rate, channels=channels)
        except (OSError, ImportError, ValueError) as error:
            # A full disk or a locked path must not cost the user their captions; the meeting
            # still records its transcript, just without an audio file.
            write_debug('engine', 'audio.recording.unavailable', {
                'path': path,
                'sampleRate': sample_rate,
                'channels': channels,
                **exception_fields(error),
            })
            return None

    def _close_recorder(self) -> int:
        """Finalize the MP3 stream and return its recorded duration in ms (0 when never opened)."""
        recorder, self.recorder = self.recorder, None
        if recorder is None:
            return 0
        recorder.close()
        return recorder.duration_ms

    async def _configure_device_plan(self, command: ModelSelectionCommand) -> None:
        self._device_plan = None
        config = command.config
        remote = config.recognitionProvider != "local"
        if remote and (not config.targetLanguages or config.translationProvider != "local" and config.fallbackTranslationProvider != "local"):
            self._device_plan = None
            return
        devices, notes, _version = await self._probe_compute_inventory()
        adapter = None if remote else self.resources.adapter_for(self._model_id(command))
        recognition_mb = 0.0 if remote else model_memory_mb(self.resources.model_path(self._model_id(command)), adapter, config.compute)
        translation_adapter = None
        translation_mb = 0.0
        if config.targetLanguages and (config.translationProvider == "local" or config.fallbackTranslationProvider == "local"):
            model_id = self._local_translation_model_id(config)
            translation_adapter = self.resources.adapter_for(model_id)
            path = self.resources.translation_gguf_path(model_id) if translation_adapter == "llama.cpp" else self.resources.model_path(model_id)
            translation_mb = model_memory_mb(path, translation_adapter, config.compute)
        a, b, reasons = choose_devices(devices, config.compute, recognition_mb, translation_mb, translation_adapter, adapter)
        self._recognition_device, self._translation_device = a, b
        total_threads = cpu_threads(config.compute.cpuThreads)
        # PyTorch shares one process-wide thread pool; llama is a separate CPU consumer.
        share_cpu = translation_adapter == "llama.cpp" or adapter == "llama-asr"
        self._torch_threads = max(1, total_threads // 2) if share_cpu else total_threads
        self._llama_threads = max(1, total_threads - self._torch_threads) if share_cpu else total_threads
        self._device_plan = {"recognition": asdict(a), "translation": asdict(b) if translation_adapter else None,
            "recognitionEstimateMb": round(recognition_mb), "translationEstimateMb": round(translation_mb),
            "reservedVramMb": config.compute.reservedVramMb, "reasons": reasons, "probeNotes": notes,
            "recognitionActual": "unloaded", "translationActual": "unloaded"}

    def _update_compute_plan(self, reason: str | None = None) -> None:
        if self._device_plan is None:
            return
        self._device_plan["recognition"] = asdict(self._recognition_device)
        self._device_plan["translation"] = asdict(self._translation_device) if self._device_plan.get("translation") else None
        runtime = self._active_recognition_runtime
        self._device_plan["recognitionActual"] = runtime.describe() if runtime else "unloaded"
        local_provider = next((provider for provider in (self.translation_provider, self.fallback_translation_provider)
            if isinstance(provider, (M2M100TranslationProvider, CausalTranslationProvider, IndexTranslateTransformersProvider))), None)
        if local_provider is not None:
            self._device_plan["translationActual"] = (local_provider.runtime.device or "unknown") if local_provider.runtime.loaded else "unloaded"
        else:
            self._device_plan["translationActual"] = self.llama_manager.device or "unloaded"
            self._device_plan["offloadedLayers"] = self.llama_manager.offloaded_layers
        if reason:
            self._device_plan["reasons"].append(reason)
        self._write_engine_status()

    def _configure_translation(self, command: ModelSelectionCommand, *, fallback: bool = False) -> None:
        config = command.config
        provider_name = config.fallbackTranslationProvider if fallback else config.translationProvider
        options = config.fallbackTranslationOptions if fallback else config.translationOptions
        if provider_name is None:
            return
        endpoint = options.endpoint if options else ""
        api_key = options.apiKey if options else ""
        region = options.region if options else ""
        model = options.model if options else ""
        # A missing `translationOptions` and an emptied field are different states, and only the
        # former earns a default: the settings default is non-empty, so "" can only mean the user
        # cleared the box. Empty passes through so the provider refuses it by naming the field.
        def resolved(value: str, default: str) -> str:
            """A default stands in for a session that sent no translationOptions at all."""

            return value if options is not None else default

        # The defaults mirror TranslationOptions, so a session that sends no translationOptions
        # at all lands on the same wire format and the same limits as one that sends them empty.
        api_format = options.apiFormat if options else "chat-completions"
        context_window = options.contextWindow if options else DEFAULT_CONTEXT_WINDOW
        max_output_tokens = options.maxOutputTokens if options else DEFAULT_MAX_OUTPUT_TOKENS
        if provider_name == "local":
            provider = self._local_translation_provider(config)
        elif provider_name == "microsoft":
            # The endpoint guard lives in `MicrosoftTranslatorProvider`, like the other four:
            # an empty address reaches the provider as an empty string and is refused there
            # with the message written for the user to read.
            provider = MicrosoftTranslatorProvider(
                api_key,
                endpoint=resolved(endpoint, DEFAULT_MICROSOFT_ENDPOINT),
                region=region,
            )
        elif provider_name == "mymemory":
            provider = MyMemoryTranslationProvider(endpoint=resolved(endpoint, DEFAULT_MYMEMORY_ENDPOINT),
                email=options.email if options else "")
        elif provider_name == "google":
            provider = GoogleTranslateProvider(
                api_key=api_key,
                endpoint=resolved(endpoint, DEFAULT_GOOGLE_TRANSLATE_ENDPOINT),
            )
        elif provider_name == "index-translate":
            # Public API configuration is fixed and never consumes a cloud credential.
            provider = IndexTranslatePublicProvider()
        elif provider_name == "cloud":
            limits = {
                "context_window": context_window,
                "max_output_tokens": max_output_tokens,
                "api_key": api_key,
            }
            # Same for `model`: the settings default is non-empty, so an empty value reaches the
            # provider, which refuses it by naming the field instead of substituting a model.
            if api_format == "chat-completions":
                provider = OpenAICompatibleProvider(
                    endpoint=resolved(endpoint, DEFAULT_OPENAI_ENDPOINT),
                    model=resolved(model, "gpt-4.1-mini"),
                    **limits,
                )
            elif api_format == "chat-responses":
                provider = OpenAIResponsesProvider(
                    endpoint=resolved(endpoint, DEFAULT_OPENAI_ENDPOINT),
                    model=resolved(model, "gpt-4.1-mini"),
                    **limits,
                )
            elif api_format == "anthropic":
                # Bare origin, not a versioned base: /v1/messages is appended by the provider.
                provider = AnthropicMessagesProvider(
                    endpoint=resolved(endpoint, DEFAULT_ANTHROPIC_ENDPOINT),
                    model=resolved(model, "claude-haiku-4-5"),
                    **limits,
                )
            elif api_format == "ollama":
                provider = OllamaTranslationProvider(
                    endpoint=resolved(endpoint, DEFAULT_OLLAMA_ENDPOINT),
                    model=resolved(model, "qwen3:4b"),
                    **limits,
                )
            else:
                raise ValueError(
                    f"未知的翻译接口格式 apiFormat：{api_format}。"
                    "可选：chat-completions、chat-responses、anthropic、ollama"
                )
        else:
            raise ValueError(
                f"未知翻译 Provider: {provider_name}"
            )
        scheduler = TranslationScheduler(
            provider,
            # One at a time for `local`: the model already owns the accelerator and its
            # tokenizer state is not re-entrant. The network formats are free to fan out.
            max_concurrency=1 if provider_name == "local" else 3,
        )
        if fallback:
            self.fallback_translation_provider = provider
            self.fallback_translation_scheduler = scheduler
        else:
            self.translation_provider = provider
            self.translation_scheduler = scheduler
            if config.fallbackTranslationProvider:
                self._configure_translation(command, fallback=True)

    def _local_translation_provider(self, config: ModelSelection) -> TranslationProvider:
        """Build the local provider for whichever translation model the session selected.
        """
        model_id = self._local_translation_model_id(config)
        source = (
            None
            if config.sourceLanguage == "auto"
            else self._language_code(config.sourceLanguage)
        )
        targets = [self._language_code(item) for item in config.targetLanguages]
        adapter = self.resources.adapter_for(model_id)
        if adapter in ("transformers-causal", "transformers-seq2seq", "index-translate-transformers"):
            provider = IndexTranslateTransformersProvider if adapter == "index-translate-transformers" else Seq2SeqTranslationProvider if adapter == "transformers-seq2seq" else CausalTranslationProvider
            return provider(self.resources.model_path(model_id), device=self._translation_device.torchDevice,
                precision="auto" if self._translation_device.id == "cpu" and config.compute.allowCpuFallback else config.compute.precision,
                threads=self._torch_threads, context_size=config.compute.contextSize)
        if adapter == "m2m100":
            unsupported = validate_m2m100_languages(source, targets)
            if unsupported:
                raise ValueError(
                    "unsupportedTranslationLanguage (m2m100): " + ", ".join(unsupported)
                )
            return M2M100TranslationProvider(self.resources.model_path(model_id),
                device=self._translation_device.torchDevice,
                precision="auto" if self._translation_device.id == "cpu" and config.compute.translationDevice != "cpu" and config.compute.allowCpuFallback else config.compute.precision,
                threads=self._torch_threads)
        if adapter == "llama.cpp":
            # Built-in and custom GGUF models share the same server and compute configuration.
            from .translation.hymt2 import HYMT2_7B_CHAT_TEMPLATE
            self.llama_manager.chat_template = HYMT2_7B_CHAT_TEMPLATE if model_id == HYMT2_7B_RESOURCE_ID else self.resources.translation_chat_template(model_id)
            self.llama_manager.switch_gguf(self.resources.translation_gguf_path(model_id))
            reserved_mb = config.compute.reservedVramMb
            if (self._recognition_device.id != 'cpu' and
                    (self._recognition_device.id == self._translation_device.id or
                     self._recognition_device.name == self._translation_device.name)):
                # Concurrent loading requires llama's automatic fitting to leave ASR room
                # even before the recognition loader has allocated its own weights.
                reserved_mb = min(65536, reserved_mb + int(self._device_plan['recognitionEstimateMb']))
            self.llama_manager.configure_compute(self._translation_device,
                config.compute.model_copy(update={"cpuThreads": self._llama_threads, "reservedVramMb": reserved_mb}))
            if model_id in INDEX_TRANSLATE_RESOURCE_IDS:
                return IndexTranslateLocalProvider(self.llama_manager)
            capability = self.resources.configuration(model_id)
            languages = {code: self._language_name(code) for code in set(capability.sourceLanguages + capability.targetLanguages)}
            return HyMt2TranslationProvider(self.llama_manager, languages=languages)
        raise UnknownTranslationModel(model_id)

    @staticmethod
    def _language_name(code: str) -> str:
        from .hub import HYMT2_LANGUAGES
        from .recognition.qwen_runtime import CODE_TO_NAME
        return HYMT2_LANGUAGES.get(code) or CODE_TO_NAME.get(code) or CODE_TO_NAME.get("fil" if code == "tl" else code) or code

    async def _ensure_translation_server(self, command: ModelSelectionCommand) -> None:
        """A selected local translator must load successfully before reporting readiness."""
        config = command.config
        if not config.targetLanguages or not (config.translationProvider == "local" or config.fallbackTranslationProvider == "local"):
            return
        model_id = self._local_translation_model_id(config)
        if not self.resources.is_installed(model_id):
            raise ModelUnavailable(f"翻译模型不可用：{model_id}")
        if self.resources.adapter_for(model_id) in ("m2m100", "transformers-causal", "transformers-seq2seq", "index-translate-transformers"):
            local_providers = [provider for provider in (self.translation_provider, self.fallback_translation_provider)
                if isinstance(provider, (M2M100TranslationProvider, CausalTranslationProvider, IndexTranslateTransformersProvider))]
            for local_provider in local_providers:
                try:
                    await asyncio.to_thread(local_provider.runtime.load)
                except Exception as error:
                    if not (command.config.compute.allowCpuFallback and
                            self._translation_device.id != "cpu" and resource_failure(error)):
                        raise
                    release_failed_load(error)
                    await asyncio.to_thread(local_provider.runtime.unload)
                    self._translation_device = ComputeDevice("cpu", "CPU", "cpu", "cpu", translation=True)
                    replacement = (IndexTranslateTransformersProvider(self.resources.model_path(model_id), context_size=config.compute.contextSize, device="cpu", precision="auto", threads=self._torch_threads)
                        if isinstance(local_provider, IndexTranslateTransformersProvider) else Seq2SeqTranslationProvider(self.resources.model_path(model_id), context_size=config.compute.contextSize, device="cpu", precision="auto", threads=self._torch_threads)
                        if isinstance(local_provider, Seq2SeqTranslationProvider) else CausalTranslationProvider(self.resources.model_path(model_id), context_size=config.compute.contextSize, device="cpu", precision="auto", threads=self._torch_threads)
                        if isinstance(local_provider, CausalTranslationProvider) else M2M100TranslationProvider(self.resources.model_path(model_id), device="cpu", precision="auto", threads=self._torch_threads))
                    await asyncio.to_thread(replacement.runtime.load)
                    if local_provider is self.translation_provider:
                        self.translation_provider = replacement
                        self.translation_scheduler = TranslationScheduler(replacement, max_concurrency=1)
                    else:
                        self.fallback_translation_provider = replacement
                        self.fallback_translation_scheduler = TranslationScheduler(replacement, max_concurrency=1)
                    self._update_compute_plan("翻译 GPU 加载失败，回退 CPU")
            return
        try:
            await self.llama_manager.start()
        except LlamaServerError as error:
            self._update_compute_plan(f"翻译运行时启动失败：{str(error)[:256]}")
            raise

    async def _create_recognizer(self, command: ModelSelectionCommand) -> Recognizer:
        language = (
            None
            if command.config.sourceLanguage == "auto"
            else self._recognition_language_code(command.config.sourceLanguage)
        )
        if language == "tl":
            language = "fil"
        model_id = self._model_id(command)
        self.active_model_id = model_id
        model_path = self.resources.model_path(model_id)
        # Dispatch on the adapter the model's own metadata selected.
        # A self-installed Qwen3-ASR repo has to reach the same loader as the
        # shipped one, and the recognition guard in qwen_runtime.py stays the thing that decides
        # whether the checkpoint layout actually fits.
        compute = command.config.compute
        if self.resources.adapter_for(model_id) == "crisp-asr":
            backend = None if self.resources.registry.get(model_id) else self._crisp_backend(model_id)
            runtime = CrispAsrRuntime(self.resources.recognition_weight_path(model_id), backend=backend, threads=self._torch_threads,
                use_vulkan=compute.recognitionDevice != "cpu", allow_cpu_fallback=compute.allowCpuFallback)
            await asyncio.to_thread(runtime.load)
            self._active_recognition_runtime = runtime
            return StreamingRecognizer(runtime, source_language=language, on_update=self._emit_update)
        if self.resources.adapter_for(model_id) == "llama-asr":
            runtime = self._active_recognition_runtime
            if not isinstance(runtime, LlamaAsrRuntime):
                runtime = LlamaAsrRuntime(LlamaServerManager())
            manager = runtime.manager
            manager.switch_gguf(self.resources.translation_gguf_path(model_id))
            manager.mmproj_path = self.resources.audio_projector_path(model_id)
            if self.resources.registry.get(model_id):
                from .local_models import _gguf_metadata
                runtime.qwen_format = _gguf_metadata(manager.mmproj_path).get('clip.audio.projector_type') == 'qwen3a'
            manager.chat_template = self.resources.translation_chat_template(model_id)
            reserved = compute.reservedVramMb
            if self._translation_device.id != "cpu" and self._recognition_device.name == self._translation_device.name and self._device_plan:
                reserved = min(65536, reserved + int(self._device_plan['translationEstimateMb']))
            manager.configure_compute(self._recognition_device, compute.model_copy(update={"cpuThreads": self._llama_threads, "reservedVramMb": reserved}))
            self._active_recognition_runtime = runtime
            await manager.start(timeout_s=120)
            return StreamingRecognizer(runtime, source_language=language, on_update=self._emit_update)
        if self._recognition_device.id == "cpu" and compute.recognitionDevice != "cpu" and compute.allowCpuFallback:
            compute = compute.model_copy(update={"precision": "auto", "quantization": "none"})
        for attempt in range(2):
            options = {"device": self._recognition_device.torchDevice, "threads": self._torch_threads}
            adapter = self.resources.adapter_for(model_id)
            if adapter in ('transformers-asr', 'funasr'):
                runtime_class = TransformersAsrRuntime if adapter == 'transformers-asr' else FunAsrRuntime
                runtime = runtime_class(model_path, **options)
                factory = None
            elif adapter == "sensevoice":
                runtime = get_sensevoice_runtime(model_path, **options)
                factory = create_sensevoice_recognizer
            else:
                quant = None if compute.quantization == "auto" else compute.quantization
                runtime = get_qwen_runtime(model_path, **options, quant=quant, precision=compute.precision)
                factory = create_qwen_recognizer
            self._active_recognition_runtime = runtime
            try:
                await asyncio.to_thread(runtime.load)
                recognizer = (factory(model_path, source_language=language, runtime=runtime) if factory
                    else StreamingRecognizer(runtime, source_language=language))
                break
            except Exception as error:
                release_failed_load(error)
                await asyncio.to_thread(runtime.unload)
                if attempt or self._recognition_device.id == "cpu" or not compute.allowCpuFallback or not resource_failure(error):
                    raise
                self._recognition_device = ComputeDevice("cpu", "CPU", "cpu", "cpu", recognition=True)
                compute = compute.model_copy(update={"precision": "auto", "quantization": "none"})
                self._update_compute_plan("识别 GPU 加载失败，回退 CPU / FP32")
        recognizer.on_update = self._emit_update
        return recognizer

    def _recognition_runtime(self) -> QwenRuntime | SenseVoiceRuntime | TransformersAsrRuntime | LlamaAsrRuntime | CrispAsrRuntime | RemoteRecognitionRuntime:
        """Runtime of the currently selected recognition model."""
        if self._active_recognition_runtime is not None:
            return self._active_recognition_runtime
        model_path = self.resources.model_path(self.active_model_id)
        if self.resources.adapter_for(self.active_model_id) == "crisp-asr":
            backend = None if self.resources.registry.get(self.active_model_id) else self._crisp_backend(self.active_model_id)
            return CrispAsrRuntime(self.resources.recognition_weight_path(self.active_model_id), backend=backend)
        if self.resources.adapter_for(self.active_model_id) == "llama-asr":
            return LlamaAsrRuntime(LlamaServerManager())
        if self.resources.adapter_for(self.active_model_id) == "sensevoice":
            return get_sensevoice_runtime(model_path)
        if self.resources.adapter_for(self.active_model_id) == 'funasr':
            return FunAsrRuntime(model_path)
        if self.resources.adapter_for(self.active_model_id) == 'transformers-asr':
            return TransformersAsrRuntime(model_path)
        return get_qwen_runtime(model_path)

    @staticmethod
    def _crisp_backend(model_id: str) -> str:
        if model_id.startswith("fun-"):
            return "funasr"
        if model_id.startswith("vibevoice-"):
            return "vibevoice"
        if model_id.startswith("mimo-"):
            return "mimo-asr"
        if model_id.startswith("sensevoice-"):
            return "sensevoice"
        if model_id.startswith("qwen3-asr-"):
            return "qwen3"
        raise ValueError(f"Unsupported CrispASR model: {model_id}")

    @staticmethod
    def _model_id(command: ModelSelectionCommand) -> str:
        return EngineRuntime._model_id_from_config(command.config)

    @staticmethod
    def _model_id_from_config(config: ModelSelection) -> str:
        if config.recognitionProvider != "local":
            # The reported id and `RemoteRecognitionRuntime.describe()` name the provider's own
            # model, so an unset field falls back to that provider's default rather than Aliyun's.
            default = MINIMAX_RECOGNITION_MODELS[0] if config.recognitionProvider == "minimax" else ALIYUN_RECOGNITION_MODELS[0]
            return (config.recognitionOptions.model if config.recognitionOptions else "") or default
        return config.recognitionModelId or QWEN_RESOURCE_ID

    def _local_translation_model_id(self, config: ModelSelection) -> str:
        """The local translation model the session selected, whichever loader owns it.

        An absent field is still the Hy-MT2 Q4_K_M baseline — that is an older client, not a
        mistake — while a *present* field has to resolve in the resource table, so a GGUF or a
        transformers repo the user installed from the hub is accepted here and reaches the
        runtime its own metadata selected. An id that resolves to neither translation adapter
        is refused outright rather than silently replaced by the baseline.
        """
        requested = config.translationModelId
        if requested is None:
            return HYMT2_RESOURCE_ID
        if self.resources.adapter_for(requested) in ("llama.cpp", "m2m100", "transformers-causal", "transformers-seq2seq", "index-translate-transformers"):
            return requested
        raise UnknownTranslationModel(requested)

    async def _run_session(self) -> None:
        capture = self.capture
        recognizer = self.recognizer
        if capture is None or recognizer is None:
            return
        session_id = self.service.session_id
        generation = self._stream_generation
        last_ended_at = self.session_started_at_ms
        try:
            async for frame in capture.frames():
                # A superseded consumer must release the queue, not drain the next timeline.
                if generation != self._stream_generation:
                    return
                if (self.session_paused or self._timeline is not None and not self._stream_anchored):
                    continue
                last_ended_at = frame.started_at_ms + 20
                self._last_frame_end_ms = last_ended_at
                for update in await recognizer.accept(frame):
                    await self._emit_stream_update(update, session_id, generation)
            for update in await recognizer.flush(last_ended_at):
                await self._emit_stream_update(update, session_id, generation)
        except AudioDeviceDisconnectedError:
            # a disconnected device still gets its captured tail flushed (best effort —
            # a failure here must not mask the disconnect).
            try:
                for update in await recognizer.flush(last_ended_at):
                    await self._emit_stream_update(update, session_id, generation)
            except Exception:
                pass
            self.emit(
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=self.session_request_id,
                    code="audioDeviceDisconnected",
                    recoverable=True,
                    details={"reason": "disconnected"},
                )
            )
        except ModelUnavailable as error:
            # A cloud recognizer reports its failure on the error channel and re-raises
            # the same instance here, so the instance tells whether the session has
            # already heard about it.
            if isinstance(error, CloudRecognitionError) and not self._claim_cloud_failure(error):
                return
            # stop the capture loop after a load failure, otherwise every frame re-reports it.
            self.emit(
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=self.session_request_id,
                    code=CLOUD_RECOGNITION_ERROR_CODES.get(error.reason, "recognitionNetworkUnavailable")
                    if isinstance(error, CloudRecognitionError) else "modelUnavailable",
                    recoverable=True,
                    details={"reason": str(error)[:512]},
                )
            )
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self.emit(
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=self.session_request_id,
                    code="internalError",
                    recoverable=True,
                    details={"reason": type(error).__name__},
                )
            )

    def _claim_cloud_failure(self, error: CloudRecognitionError) -> bool:
        """Whether the session still has to hear about this cloud failure.

        A remote recognizer reports a failure on its error channel and re-raises the
        same instance from the audio loop, so whichever path arrives first owns the
        report and the other one stays quiet.
        """
        if error in self._reported_cloud_failures:
            return False
        self._reported_cloud_failures.add(error)
        return True

    def _bind_recognizer(self, recognizer: Recognizer) -> None:
        session_id, generation = self.service.session_id, self._stream_generation

        async def on_update(update: RecognitionUpdate) -> None:
            await self._emit_stream_update(update, session_id, generation)

        recognizer.on_update = on_update
        # Any remote recognizer owns a background connection, so the error channel is what tells
        # the session its captions stopped arriving; keying off the capability keeps a new cloud
        # provider from silently losing it.
        if hasattr(recognizer, "on_error"):
            def on_error(error: CloudRecognitionError) -> None:
                if session_id == self.service.session_id and generation == self._stream_generation:
                    # The recognizer re-raises this instance from its audio loop, so the
                    # instance itself records that the session has already been told.
                    if not self._claim_cloud_failure(error):
                        return
                    # `details.reason` stays the launch-log diagnostic, but it is the code the
                    # session reads to pick user-facing copy, so the meaning rides on the code.
                    self.emit(self._resource_error(
                        self.session_request_id,
                        CLOUD_RECOGNITION_ERROR_CODES.get(error.reason, "recognitionNetworkUnavailable"),
                        {"reason": error.reason},
                    ))
            recognizer.on_error = on_error

    async def _emit_stream_update(
        self, update: RecognitionUpdate, session_id: str | None, generation: int,
    ) -> None:
        if session_id != self.service.session_id or generation != self._stream_generation:
            return
        write_debug("engine", "engine.update", {
            "segmentId": update.segment_id, "isFinal": update.is_final,
            "startedAtMs": round(update.started_at_ms, 1),
            "endedAtMs": round(update.ended_at_ms, 1) if update.ended_at_ms is not None else None,
        })
        if self._stream_epoch is not None:
            update = replace(update, segment_id=f"e{self._stream_epoch}-{update.segment_id}")
        await self._emit_update(update)

    async def _emit_update(self, update: RecognitionUpdate) -> None:
        if self.service.session_id is None:
            return
        self._write_engine_status()
        config = self.active_config
        targets = [] if config is None else [self._language_code(item) for item in config.targetLanguages]
        source = self._language_code(update.language or self._detect_language(update.source_text))
        provider = getattr(config, "translationProvider", None)
        # Cloud transcripts can switch languages mid-sentence, so the recognizer's single
        # language label must not suppress translation when it happens to match the target.
        targets = list(dict.fromkeys(targets))
        if config is not None and getattr(config, "translationProvider", None) == "local" and targets:
            capability = self.resources.configuration(self._local_translation_model_id(config))
            # Automatic language detection is allowed to retain untranslated speech silently.
            targets = [target for target in targets if supports_translation(capability, source, target)]
        previous_update = self.latest_updates.get(update.segment_id)
        self.latest_updates[update.segment_id] = update
        if provider == "recognition":
            native = update.native_translation
            # The caption names the connection the text came from, which is the recognition
            # provider rather than the translation one this branch is keyed on.
            recognition_provider = getattr(config, "recognitionProvider", "local")
            use_fallback = bool(update.is_final and native is not None and native.state == "failed"
                and self.fallback_translation_scheduler is not None)
            visible = [Translation(targetLanguage=target, text=native.text if native else None,
                state="pending" if use_fallback else native.state if native else "pending",
                provider=self.fallback_translation_scheduler.provider.name if use_fallback else recognition_provider,
                errorCode=None if use_fallback else native.error_code if native else None)
                for target in targets]
            self.latest_translations[update.segment_id] = visible
            self.emit(self._caption_event(update, visible))
            if use_fallback and native is not None:
                request = TranslationRequest(update=update, source=source, targets=tuple(targets), allow_intermediate=False)
                asyncio.create_task(self._run_native_translation_fallback(request, self.service.session_id, self._stream_generation))
            if update.is_final and (not visible or all(item.state != "pending" for item in visible)):
                self._retire_completed(update)
            return
        if not targets:
            self.translation_requests.pop(update.segment_id, None)
            self.latest_translations.pop(update.segment_id, None)
            task = self.translation_tasks.get(update.segment_id)
            if task is not None:
                task.cancel()
            # A language revision can remove every supported target while inference is
            # already running. Drop its job; native runtime locks still retain ownership.
            for job in tuple(self.translation_jobs.get(update.segment_id, ())):
                job.cancel()
            self.emit(self._caption_event(update, []))
            self._retire_completed(update)
            return

        previous = {
            item.targetLanguage: item
            for item in self.latest_translations.get(update.segment_id, [])
        }
        previous_context = None
        if (provider == "cloud" and len(targets) == 1 and previous_update is not None
                and previous_update.source_text
                and update.source_text.startswith(previous_update.source_text)):
            draft = previous.get(targets[0])
            if (draft is not None and draft.state == "complete" and draft.text
                    and len(previous_update.source_text) <= 1200 and len(draft.text) <= 1200):
                previous_context = (previous_update.source_text, draft.text)
        visible = [
            (previous.get(target) if previous.get(target) is not None
             and previous[target].text else None)
            or Translation(
                targetLanguage=target,
                state="pending",
                provider=self.translation_scheduler.provider.name,
            )
            for target in targets
        ]
        self.emit(self._caption_event(update, visible))
        self.latest_translations[update.segment_id] = visible
        self.translation_requests[update.segment_id] = TranslationRequest(
            update=update,
            source=source,
            targets=tuple(targets),
            allow_intermediate=bool(
                getattr(config, "allowIntermediateTranslation", False)
            ),
            previous_context=previous_context,
        )
        self.translation_wake.setdefault(update.segment_id, asyncio.Event()).set()
        task = self.translation_tasks.get(update.segment_id)
        if task is None or task.done():
            self.translation_tasks[update.segment_id] = asyncio.create_task(
                self._translation_worker(update.segment_id)
            )

    async def _run_native_translation_fallback(
        self, request: TranslationRequest, session_id: str | None, generation: int,
    ) -> None:
        scheduler = self.fallback_translation_scheduler
        if scheduler is None:
            return
        results = await scheduler.translate(
            request.update.segment_id, request.update.revision, request.update.source_text,
            request.source, list(request.targets),
            on_result=lambda result: self._publish_translation_result(request, result, session_id, generation),
        )
        if self.service.session_id == session_id and self._stream_generation == generation:
            for result in results:
                self._publish_translation_result(request, result, session_id, generation)
            self._retire_completed(request.update)

    async def _translation_worker(self, segment_id: str) -> None:
        session_id, generation = self.service.session_id, self._stream_generation
        try:
            while segment_id in self.translation_requests:
                request = self.translation_requests[segment_id]
                if not request.update.is_final and (not request.allow_intermediate
                        or self.translation_scheduler.provider.name == "mymemory"):
                    # only final captions get translated by default; intermediates need the user to opt in.
                    self.translation_requests.pop(segment_id, None)
                    continue
                jobs = self.translation_jobs.get(segment_id, set())
                if (not request.update.is_final
                        and len(jobs) >= self.translation_scheduler.max_concurrency):
                    wake = self.translation_wake[segment_id]
                    wake.clear()
                    try:
                        await wake.wait()
                    except asyncio.CancelledError:
                        raise
                    continue
                delay = self.partial_translation_interval - (
                    monotonic() - self.translation_last_started.get(segment_id, 0)
                )
                if not request.update.is_final and delay > 0:
                    wake = self.translation_wake[segment_id]
                    wake.clear()
                    try:
                        await asyncio.wait_for(wake.wait(), timeout=delay)
                    except TimeoutError:
                        pass
                    continue
                self.translation_requests.pop(segment_id)
                self.translation_last_started[segment_id] = monotonic()
                work = asyncio.create_task(
                    self._run_translation_job(request, session_id, generation)
                )
                jobs = self.translation_jobs.setdefault(segment_id, set())
                jobs.add(work)
                work.add_done_callback(lambda done, sid=segment_id: self._translation_job_done(sid, done))
        except asyncio.CancelledError:
            raise
        finally:
            self.translation_tasks.pop(segment_id, None)
            latest = self.latest_updates.get(segment_id)
            if latest is not None and latest.is_final:
                self._retire_completed(latest)
            if (segment_id in self.translation_requests and self.service.session_id == session_id
                    and self._stream_generation == generation):
                self.translation_tasks[segment_id] = asyncio.create_task(
                    self._translation_worker(segment_id)
                )

    async def _run_translation_job(
        self, request: TranslationRequest, session_id: str | None, generation: int,
    ) -> None:
        started_at = monotonic()
        outcome = 'failed'
        translations: list[Translation] | None = None
        try:
            translations = await self._translate_request(request)
            outcome = 'returned'
        finally:
            if request.update.is_final and not self._first_translation_timing_logged:
                self._first_translation_timing_logged = True
                write_debug('engine', 'translation.first_request.timing', {
                    'provider': self.translation_scheduler.provider.name,
                    'outcome': outcome,
                    'elapsedMs': round((monotonic() - started_at) * 1000),
                    'sinceSessionStartMs': round(monotonic() * 1000 - self.session_started_at_ms),
                    'targetCount': len(request.targets),
                    'resultStates': [item.state for item in translations] if translations is not None else [],
                })
        for item in translations:
            self._publish_translation_result(
                request,
                ScheduledTranslation(
                    item.targetLanguage, item.state, item.provider, text=item.text,
                    error_code=item.errorCode,
                ),
                session_id,
                generation,
            )
        latest = self.latest_updates.get(request.update.segment_id)
        if (latest is not None and self.service.session_id == session_id
                and self._stream_generation == generation):
            self._retire_completed(latest)

    def _translation_job_done(
        self, segment_id: str, task: asyncio.Task[list[Translation]],
    ) -> None:
        if not task.cancelled():
            task.exception()
        jobs = self.translation_jobs.get(segment_id)
        if jobs is not None:
            jobs.discard(task)
            if not jobs:
                self.translation_jobs.pop(segment_id, None)
        latest = self.latest_updates.get(segment_id)
        if latest is not None:
            self._retire_completed(latest)
        wake = self.translation_wake.get(segment_id)
        if wake is not None:
            wake.set()

    def _publish_translation_result(
        self, request: TranslationRequest, result: ScheduledTranslation,
        session_id: str | None, generation: int,
    ) -> None:
        latest = self.latest_updates.get(request.update.segment_id)
        if (latest is None or self.service.session_id != session_id
                or self._stream_generation != generation):
            return
        display_key = (request.update.segment_id, result.target_language)
        displayed_revision = self.translation_display_revision.get(display_key, -1)
        if request.update.revision < displayed_revision:
            return
        # Keep an intermediate failure out of the caption; a later recognition revision can retry it.
        if not request.update.is_final and result.state == "failed":
            return
        if result.state != "pending" or result.text:
            self.translation_display_revision[display_key] = request.update.revision
        replacement = Translation(
            targetLanguage=result.target_language, state=result.state,
            provider=result.provider, text=result.text, errorCode=result.error_code,
        )
        visible = [
            replacement if item.targetLanguage == result.target_language else item
            for item in self.latest_translations.get(request.update.segment_id, [])
        ]
        self.latest_translations[request.update.segment_id] = visible
        self.emit(self._caption_event(latest, visible))

    async def _translate_request(
        self, request: TranslationRequest
    ) -> list[Translation]:
        targets = list(request.targets)
        provider_name = self.translation_scheduler.provider.name
        text = request.update.source_text
        cloud_providers = {"openai", "openai-responses", "anthropic", "ollama"}
        if provider_name in cloud_providers and request.previous_context:
            previous_source, previous_translation = request.previous_context
            text = json.dumps({
                "previousSource": previous_source,
                "previousTranslation": previous_translation,
                "currentSource": text,
            }, ensure_ascii=False)
        session_id, generation = self.service.session_id, self._stream_generation
        retry_codes = {"URLError", "HTTPError", "translationRateLimited", "translationTimeout", "RuntimeError"}
        retry_enabled = request.update.is_final and provider_name not in {"hymt2", "index-translate-local", "index-translate-transformers", "m2m100", "transformers-causal", "transformers-seq2seq"}
        max_attempts = 3 if retry_enabled else 1
        attempt = 0

        def publish(result: ScheduledTranslation) -> None:
            # Preserve visible text while a final network translation still has retries remaining.
            if (result.state == "failed" and result.error_code in retry_codes
                    and attempt < max_attempts):
                return
            # Keep a final caption pending while the configured backup service gets its turn.
            if result.state == "failed" and request.update.is_final and self.fallback_translation_scheduler is not None:
                return
            self._publish_translation_result(request, result, session_id, generation)

        target_errors: dict[str, str] = {}
        if provider_name in {"hymt2", "index-translate-local"}:
            active = self.active_config
            try:
                model_id = self._local_translation_model_id(active) if active else HYMT2_RESOURCE_ID
            except UnknownTranslationModel:
                # _start refuses an unknown id before a session exists, so this is unreachable in
                # practice. It is caught anyway: an exception here runs on a background task, and
                # an unretrieved task exception would leave the caption waiting on a translation
                # that is never coming.
                model_id = ""
            if not model_id or not self.resources.is_installed(model_id):
                target_errors = dict.fromkeys(targets, "resourceUnavailable")
            else:
                capability = self.resources.configuration(model_id)
                target_errors = {target: "unsupportedLanguagePair" for target in targets if not supports_translation(capability, request.source, target)}
                if not target_errors and not self.llama_manager.ready:
                    target_errors = dict.fromkeys(targets, "llamaServerUnavailable")
        elif provider_name in {"transformers-causal", "transformers-seq2seq", "index-translate-transformers"}:
            model_id = self._local_translation_model_id(self.active_config) if self.active_config else ""
            capability = self.resources.configuration(model_id) if model_id else None
            target_errors = {target: "unsupportedLanguagePair" for target in targets if not supports_translation(capability, request.source, target)}
            if not model_id or not self.resources.is_installed(model_id):
                target_errors = dict.fromkeys(targets, "resourceUnavailable")
        elif provider_name == "m2m100":
            model_id = self._local_translation_model_id(self.active_config) if self.active_config else M2M100_RESOURCE_ID
            if not self.resources.is_installed(model_id):
                target_errors = dict.fromkeys(targets, "resourceUnavailable")
            elif not m2m100_is_supported(request.source):
                target_errors = dict.fromkeys(targets, "unsupportedLanguagePair")
            else:
                for target in targets:
                    if not m2m100_is_supported(target):
                        target_errors[target] = "unsupportedLanguagePair"

        retry_targets = [target for target in targets if target not in target_errors]
        completed_by_target: dict[str, ScheduledTranslation] = {}
        while retry_targets and attempt < max_attempts:
            if (self.service.session_id != session_id
                    or self._stream_generation != generation):
                return []
            attempt += 1
            scheduled = await self.translation_scheduler.translate(
                request.update.segment_id,
                request.update.revision,
                text,
                request.source,
                retry_targets,
                on_result=publish,
            )
            failed_targets: list[str] = []
            for result in scheduled:
                completed_by_target[result.target_language] = result
                if (result.state == "failed" and result.error_code in retry_codes
                        and attempt < max_attempts):
                    failed_targets.append(result.target_language)
            retry_targets = failed_targets
            if retry_targets:
                await asyncio.sleep(0.5 if attempt == 1 else 1.0)

        if request.update.is_final and self.fallback_translation_scheduler is not None:
            failed_targets = [target for target in targets
                if target_errors.get(target) or target not in completed_by_target
                or completed_by_target[target].state == "failed"]
            if failed_targets:
                backup_results = await self.fallback_translation_scheduler.translate(
                    request.update.segment_id, request.update.revision,
                    request.update.source_text, request.source, failed_targets,
                    on_result=lambda result: self._publish_translation_result(request, result, session_id, generation),
                )
                for result in backup_results:
                    completed_by_target[result.target_language] = result

        translations = []
        for target in targets:
            result = completed_by_target.get(target)
            if result is None:
                translations.append(
                    Translation(
                        targetLanguage=target,
                        state="failed",
                        provider=provider_name,
                        errorCode=target_errors.get(target, "translationUnavailable"),
                    )
                )
            else:
                translations.append(
                    Translation(
                        targetLanguage=target,
                        text=result.text,
                        state=result.state,
                        provider=result.provider,
                        errorCode=result.error_code,
                    )
                )
        return translations

    def _retire_completed(self, update: RecognitionUpdate) -> None:
        if not update.is_final:
            return
        self.completed_segments[update.segment_id] = None
        for segment_id in list(self.completed_segments):
            if len(self.completed_segments) <= self.completed_segment_limit:
                break
            if (segment_id in self.translation_tasks or segment_id in self.translation_requests
                    or segment_id in self.translation_jobs):
                continue
            self.completed_segments.pop(segment_id, None)
            for mapping in (self.latest_updates, self.latest_translations, self.caption_revisions,
                            self.translation_last_started, self.translation_wake):
                mapping.pop(segment_id, None)
            for key in [key for key in self.translation_display_revision if key[0] == segment_id]:
                self.translation_display_revision.pop(key, None)

    def _caption_event(
        self,
        update: RecognitionUpdate,
        translations: list[Translation],
    ) -> CaptionEvent:
        session_id = self.service.session_id
        if session_id is None:
            raise RuntimeError("字幕会话已经结束")
        origin = 0.0 if isinstance(self.capture, BrowserAudioCapture) else self.session_started_at_ms
        started = max(0.0, update.started_at_ms - origin)
        ended = (
            max(started, update.ended_at_ms - origin)
            if update.ended_at_ms is not None
            else None
        )
        revision = self.caption_revisions.get(update.segment_id, -1) + 1
        self.caption_revisions[update.segment_id] = revision
        write_debug("engine", "engine.caption", {
            "segmentId": update.segment_id, "revision": revision, "isFinal": update.is_final,
            "videoStartedAtMs": self._timeline.videoTimeMs + (update.started_at_ms - self._timeline_origin_ms) * self._timeline.playbackRate if self._timeline is not None else None,
        })
        return CaptionEvent(
            protocolVersion=1,
            type="caption",
            requestId=f"caption-{uuid4()}",
            sessionId=session_id,
            streamEpoch=self._stream_epoch,
            videoStartedAtMs=(max(0.0, self._timeline.videoTimeMs +
                (update.started_at_ms - self._timeline_origin_ms) * self._timeline.playbackRate)
                if self._timeline is not None else None),
            videoEndedAtMs=(max(0.0, self._timeline.videoTimeMs +
                (update.ended_at_ms - self._timeline_origin_ms) * self._timeline.playbackRate)
                if self._timeline is not None and update.ended_at_ms is not None else None),
            segment=CaptionSegment(
                segmentId=update.segment_id,
                revision=revision,
                startedAtMs=started,
                endedAtMs=ended,
                sourceLanguage=self._language_code(
                    update.language or self._detect_language(update.source_text)
                ),
                sourceText=update.source_text,
                isFinal=update.is_final,
                translations=translations,
            ),
        )

    @staticmethod
    def _language_code(language: str) -> str:
        normalized = normalize(language)
        return "en" if normalized == "auto" else normalized if normalized == "zh-Hant" else normalized.split("-")[0]

    @staticmethod
    def _recognition_language_code(language: str) -> str:
        normalized = normalize(language)
        return "zh" if normalized == "zh-Hant" else EngineRuntime._language_code(language)

    @staticmethod
    def _detect_language(text: str) -> str:
        if any("\uac00" <= character <= "\ud7af" or "\u1100" <= character <= "\u11ff"
               or "\u3130" <= character <= "\u318f" for character in text):
            return "ko"
        if any("\u3040" <= character <= "\u30ff" for character in text):
            return "ja"
        if any("\u3400" <= character <= "\u9fff" for character in text):
            return "zh"
        return "en"

    def _push_audio(self, command: PushAudioCommand) -> list[EngineEvent]:
        if command.sessionId != self.service.session_id:
            write_debug("engine", "engine.pushAudio.reject", {"reason": "sessionNotRunning"})
            return [self._resource_error(command.requestId, "sessionNotRunning")]
        config, capture = self.active_config, self.capture
        if (config is None or config.audioSource.kind != "browserTab"
                or not isinstance(capture, BrowserAudioCapture)):
            write_debug("engine", "engine.pushAudio.reject", {"reason": "notBrowserAudio"})
            return [self._resource_error(command.requestId, "invalidConfiguration", {"reason": "notBrowserAudio"})]
        if (command.streamId != config.audioSource.streamId or command.epoch != self._stream_epoch
                or not self._stream_anchored or self.session_paused or self._stream_finishing):
            write_debug("engine", "engine.pushAudio.reject", {
                "reason": "inactiveStream", "streamIdMatches": command.streamId == config.audioSource.streamId,
                "epoch": command.epoch, "streamEpoch": self._stream_epoch,
                "anchored": self._stream_anchored, "paused": self.session_paused,
                "finishing": self._stream_finishing, "capturePaused": capture.paused,
            })
            return [self._resource_error(command.requestId, "invalidConfiguration", {"reason": "inactiveStream"})]
        if (command.sequence <= self._last_audio_sequence
                or self._last_audio_sequence >= 0 and command.sequence != self._last_audio_sequence + 1
                or command.capturedAtMs + 2 < self._last_audio_end_ms):
            write_debug("engine", "engine.pushAudio.reject", {
                "reason": "audioOutOfOrder", "sequence": command.sequence,
                "lastAudioSequence": self._last_audio_sequence, "capturedAtMs": command.capturedAtMs,
                "lastAudioEndMs": self._last_audio_end_ms,
            })
            return [self._resource_error(command.requestId, "sessionAudioOutOfOrder", {"reason": "audioOutOfOrder"})]
        data = base64.b64decode(command.pcmBase64, validate=True)
        if not capture.push(data, command.sampleRate, command.capturedAtMs):
            write_debug("engine", "engine.pushAudio.reject", {
                "reason": "pushRefused", "bytes": len(data), "sampleRate": command.sampleRate,
                "bufferedMs": round(capture.buffered_ms, 1), "capturePaused": capture.paused,
                "captureRunning": capture.running, "captureFinishing": capture._finishing,
            })
            return [self._resource_error(command.requestId, "audioBufferOverflow")]
        self._last_audio_sequence = command.sequence
        self._last_audio_end_ms = command.capturedAtMs + len(data) * 500 / command.sampleRate
        return [AudioAcceptedEvent(protocolVersion=1, type="audioAccepted", requestId=command.requestId,
            sessionId=command.sessionId, epoch=command.epoch, sequence=command.sequence)]

    async def _cancel_stream_tasks(self) -> None:
        tasks = [task for task in (self.session_task, self._pause_flush_task, self._finish_stream_task)
                 if task is not None]
        self.session_task = None
        self._pause_flush_task = None
        self._finish_stream_task = None
        self.translation_requests.clear()
        tasks.extend(self.translation_tasks.values())
        tasks.extend(task for jobs in self.translation_jobs.values() for task in jobs)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.translation_scheduler.close()
        if self.fallback_translation_scheduler is not None:
            await self.fallback_translation_scheduler.close()
        self.translation_tasks.clear()
        self.translation_jobs.clear()
        self.translation_display_revision.clear()
        for mapping in (self.translation_last_started, self.translation_wake,
                        self.completed_segments,
                        self.latest_updates, self.latest_translations, self.caption_revisions):
            mapping.clear()

    def _fresh_recognizer(self) -> Recognizer:
        config = self.active_config
        assert config is not None
        language = None if config.sourceLanguage == "auto" else self._recognition_language_code(config.sourceLanguage)
        if language == "tl":
            language = "fil"
        model_path = self.resources.model_path(self.active_model_id)
        if self.resources.adapter_for(self.active_model_id) in ("crisp-asr", "llama-asr", "transformers-asr", "funasr"):
            return StreamingRecognizer(self._recognition_runtime(), source_language=language, on_update=self._emit_update)
        factory = (create_sensevoice_recognizer if self.resources.adapter_for(self.active_model_id) == "sensevoice"
                   else create_qwen_recognizer)
        # Seek changes sentence state, not weights or the capability-validated model selection.
        return factory(model_path, source_language=language, runtime=self._recognition_runtime())

    async def _reset_stream(self, command: ResetStreamCommand) -> list[EngineEvent]:
        if command.sessionId != self.service.session_id:
            return [self._resource_error(command.requestId, "sessionNotRunning")]
        config = self.active_config
        if config is None or config.audioSource.kind != "browserTab" and self._timeline is None:
            return [self._resource_error(command.requestId, "invalidConfiguration", {"reason": "notBrowserTimeline"})]
        if self._stream_epoch is not None and (command.epoch < self._stream_epoch
                or command.epoch == self._stream_epoch and self._epoch_initialized):
            return [self._resource_error(command.requestId, "sessionStaleEpoch", {"reason": "staleEpoch"})]
        # The epoch and the timeline are the identity a browser replays its audio against,
        # so a reset that cannot start its recognizer hands the previous ones back: an
        # epoch that was written but never anchored cannot be requested again.
        previous_epoch = self._stream_epoch
        previous_epoch_initialized = self._epoch_initialized
        previous_timeline = self._timeline
        previous_timeline_origin_ms = self._timeline_origin_ms
        previous_last_frame_end_ms = self._last_frame_end_ms
        previous_last_audio_sequence = self._last_audio_sequence
        previous_last_audio_end_ms = self._last_audio_end_ms
        capture = self.capture
        self._stream_generation += 1
        if capture is not None:
            capture.pause()
        await self._cancel_stream_tasks()
        if self.recognizer is not None:
            await self.recognizer.close()
        if isinstance(capture, PortAudioCapture):
            # Old callback packets carry pre-seek wall time and must never cross the anchor.
            capture.reset_stream()
        self._stream_epoch = command.epoch
        self._timeline = BrowserTimeline(epoch=command.epoch, videoTimeMs=command.videoTimeMs,
            playbackRate=command.playbackRate)
        self._timeline_origin_ms = 0.0 if isinstance(capture, BrowserAudioCapture) else monotonic() * 1000
        self._last_frame_end_ms = self._timeline_origin_ms
        self._last_audio_sequence = -1
        self._last_audio_end_ms = 0.0
        self._stream_anchored = True
        self._epoch_initialized = True
        self._stream_finishing = False
        if config.recognitionProvider != "local":
            self.recognizer = self._remote_recognizer(config)
            try:
                await self.recognizer.start()
            except Exception as error:
                await self.recognizer.close()
                # The recognizer never ran, so the stream is not anchored; the epoch and
                # the timeline go back to the ones the browser still knows.
                self._stream_epoch = previous_epoch
                self._epoch_initialized = previous_epoch_initialized
                self._timeline = previous_timeline
                self._timeline_origin_ms = previous_timeline_origin_ms
                self._last_frame_end_ms = previous_last_frame_end_ms
                self._last_audio_sequence = previous_last_audio_sequence
                self._last_audio_end_ms = previous_last_audio_end_ms
                self._stream_anchored = False
                # The finish drain was cancelled with the other stream tasks, so nothing is
                # finishing any more and the session must not stay locked in that state.
                self._stream_finishing = False
                # The capture stays paused: the consumer that drained it is gone, and a
                # running capture would record into a queue nobody reads.
                return [self._resource_error(command.requestId, CLOUD_RECOGNITION_ERROR_CODES.get(
                    getattr(error, "reason", ""), "recognitionNetworkUnavailable"), {"reason": str(error)[:256]})]
        else:
            self.recognizer = self._fresh_recognizer()
        self._bind_recognizer(self.recognizer)
        if capture is not None and not self.session_paused:
            capture.resume()
        # Resume owns creation while paused; otherwise it would overwrite a waiting consumer.
        if not self.session_paused:
            self.session_task = asyncio.create_task(self._run_session())
        return [StreamResetEvent(protocolVersion=1, type="streamReset", requestId=command.requestId,
            sessionId=command.sessionId, epoch=command.epoch)]

    async def _set_browser_paused(self, command: SetSessionPausedCommand) -> list[EngineEvent]:
        if command.sessionId != self.service.session_id:
            return [self._resource_error(command.requestId, "sessionNotRunning")]
        if self._stream_finishing:
            if not command.paused:
                return [self._resource_error(command.requestId, "invalidConfiguration", {"reason": "streamFinishing"})]
            # EOF already froze input; cancelling its consumer would also cancel the finish acknowledgement.
            return [StatusEvent(protocolVersion=1, type="status", requestId=command.requestId, code="paused")]
        if command.paused == self.session_paused:
            return [self._listening_status(command.requestId)]
        was_anchored = self._stream_anchored
        self.session_paused = command.paused
        self._stream_anchored = False
        if command.paused:
            if self.capture is not None:
                self.capture.pause()
            if self.session_task is not None:
                self.session_task.cancel()
                await asyncio.gather(self.session_task, return_exceptions=True)
                self.session_task = None
            recognizer = self.recognizer
            session_id, generation = self.service.session_id, self._stream_generation

            async def flush_sentence() -> None:
                if recognizer is not None:
                    try:
                        for update in await recognizer.flush(self._last_frame_end_ms):
                            await self._emit_stream_update(update, session_id, generation)
                    except asyncio.CancelledError:
                        raise
                    except Exception as error:
                        if (generation == self._stream_generation and session_id == self.service.session_id
                                and (not isinstance(error, CloudRecognitionError)
                                     or self._claim_cloud_failure(error))):
                            self.emit(self._resource_error(command.requestId, CLOUD_RECOGNITION_ERROR_CODES.get(
                                getattr(error, "reason", ""), "recognitionNetworkUnavailable"),
                                {"reason": type(error).__name__}))

            # Final inference may take seconds; seek/reset remains available while it runs.
            if self._pause_flush_task is None or self._pause_flush_task.done():
                self._pause_flush_task = asyncio.create_task(flush_sentence())
        elif was_anchored and self._timeline is not None:
            # The mirror of the branch above: pausing stops the capture and its consumer, so
            # resuming has to start both again. Re-anchoring reopens the input gate that pausing
            # closed, and the consumer is what drains the queue into the recognizer at all.
            if self.capture is not None:
                self.capture.resume()
            self._stream_anchored = True
            if self.session_task is None or self.session_task.done():
                self.session_task = asyncio.create_task(self._run_session())
        return [self._listening_status(command.requestId)]

    async def _finish_stream(self, command: FinishStreamCommand) -> list[EngineEvent]:
        if command.sessionId != self.service.session_id:
            return [self._resource_error(command.requestId, "sessionNotRunning")]
        if self._timeline is None or command.epoch != self._stream_epoch or not self._epoch_initialized:
            return [self._resource_error(command.requestId, "invalidConfiguration", {"reason": "inactiveStream"})]
        if self._finish_stream_task is not None and not self._finish_stream_task.done():
            return [self._resource_error(command.requestId, "resourceBusy", {"reason": "streamFinishing"})]
        self._stream_finishing = True
        if self.capture is not None and not self.session_paused:
            self.capture.finish()
        drain_task = self._pause_flush_task if self.session_paused else self.session_task
        generation = self._stream_generation

        async def finish() -> None:
            if drain_task is not None:
                await drain_task
            dispatchers = list(self.translation_tasks.values())
            if dispatchers:
                await asyncio.gather(*dispatchers, return_exceptions=True)
            jobs = [task for segment_jobs in self.translation_jobs.values() for task in segment_jobs]
            if jobs:
                await asyncio.gather(*jobs, return_exceptions=True)
            if generation == self._stream_generation and command.sessionId == self.service.session_id:
                self.session_paused = True
                self.emit(StreamFinishedEvent(protocolVersion=1, type="streamFinished", requestId=command.requestId,
                    sessionId=command.sessionId, epoch=command.epoch))

        # End-of-video draining can take model latency; the command loop must stay available.
        self._finish_stream_task = asyncio.create_task(finish())
        return []

    def _set_paused(self, command: SetSessionPausedCommand) -> list[EngineEvent]:
        """Pause or resume the live capture without tearing the session down.

        Pausing stops the PortAudio stream itself, so the microphone is genuinely
        released, nothing is written to the recorder, and the recognizer keeps the
        in-flight sentence it was building. The normalizer timestamps frames from
        delivered audio samples, so paused wall-clock time is already absent from
        the capture timeline. Keeping ``session_started_at_ms`` fixed makes caption
        timestamps continuous without creating a negative offset after resume.
        """
        if self.service.session_id is None or command.sessionId != self.service.session_id:
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="sessionNotRunning",
                    recoverable=True,
                )
            ]
        if self.capture is None:
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="internalError",
                    recoverable=True,
                    details={"reason": "captureUnavailable"},
                )
            ]
        if command.paused == self.session_paused:
            # Already in the requested state. Answer with the authoritative status so a
            # double-tap cannot leave the UI believing the engine is somewhere else.
            return [self._listening_status(command.requestId)]
        if command.paused:
            self.capture.pause()
            self.session_paused = True
        else:
            self.capture.resume()
            self.session_paused = False
        return [self._listening_status(command.requestId)]

    def _listening_status(self, request_id: str) -> StatusEvent:
        return StatusEvent(
            protocolVersion=1,
            type="status",
            requestId=request_id,
            code="paused" if self.session_paused else "listening",
        )

    async def _stop(self, command: StopSessionCommand) -> list[EngineEvent]:
        if self.service.session_id is None or command.sessionId != self.service.session_id:
            return self.service.handle(command)
        browser_session = self._timeline is not None or isinstance(self.capture, BrowserAudioCapture)
        remote = hasattr(self.recognizer, "on_error")
        if browser_session or remote:
            self._finalize_browser_partials()
            self._stream_generation += 1
            await self._cancel_stream_tasks()
        if self.capture is not None:
            self.capture.stop()
        if self.session_task is not None:
            try:
                await asyncio.wait_for(self.session_task, timeout=5)
            except TimeoutError:
                self.session_task.cancel()
                await asyncio.gather(self.session_task, return_exceptions=True)
            except asyncio.CancelledError:
                pass
        if self.recognizer is not None:
            await self.recognizer.close()
        self.translation_requests.clear()
        tasks = list(self.translation_tasks.values())
        tasks.extend(task for jobs in self.translation_jobs.values() for task in jobs)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.translation_scheduler.close()
        if self.fallback_translation_scheduler is not None:
            await self.fallback_translation_scheduler.close()
        if browser_session or remote:
            # Cancelling native ASR or local translation cannot release its inference lock.
            # Remote recognition must also acknowledge stop before a local translator idles.
            self._model_cleanup_task = asyncio.create_task(self._cleanup_browser_models(command.requestId))
        else:
            await self._settle_session_models()
        self.translation_tasks.clear()
        self.translation_jobs.clear()
        self.translation_display_revision.clear()
        self.translation_last_started.clear()
        self.translation_wake.clear()
        self.completed_segments.clear()
        self.latest_updates.clear()
        self.latest_translations.clear()
        self.caption_revisions.clear()
        self._close_recorder()
        if self.capture is not None:
            self._dropped_chunks = self.capture.dropped_chunks
        self.capture = None
        self.recognizer = None
        self.session_task = None
        self.active_config = None
        self.session_paused = False
        self._timeline = None
        self._stream_epoch = None
        self._stream_anchored = False
        self._epoch_initialized = False
        self._stream_finishing = False
        self._stop_pipeline_heartbeat()
        self._write_engine_status()
        return self.service.handle(command)

    def _finalize_browser_partials(self) -> None:
        """Retain already recognized stop tails without waiting for uninterruptible inference."""
        for update in list(self.latest_updates.values()):
            visible = self.latest_translations.get(update.segment_id, [])
            if update.is_final and not any(item.state == "pending" for item in visible):
                continue
            final = update if update.is_final else replace(update, is_final=True,
                ended_at_ms=max(update.started_at_ms, self._last_frame_end_ms))
            translations = [
                item.model_copy(update={"state": "failed", "errorCode": "translationCancelled"})
                if item.state == "pending" else item
                for item in visible
            ]
            self.emit(self._caption_event(final, translations))

    async def _await_model_cleanup(self) -> bool:
        """Wait out a detached browser unload so an immediate restart is not refused.

        The deferral exists because the unload can be stuck behind native inference that cannot
        be cancelled, so the wait is bounded and the caller reports the reservation when it
        expires. The bound is the one ``close()`` already applies to this same task: a start
        tolerates a stuck unload exactly as long as a shutdown does, and an unload that is not
        stuck — the common case, since the lock is usually free — finishes inside it.
        """
        task = self._model_cleanup_task
        if task is None or task.done():
            return True
        # asyncio.wait leaves the task running when the timeout expires, which is what the
        # reservation requires: the native thread still holds the lock either way.
        done, _pending = await asyncio.wait({task}, timeout=self.model_cleanup_timeout)
        return task in done and not task.cancelled()

    def _model_cleanup_pending(self) -> bool:
        return self._model_cleanup_task is not None and not self._model_cleanup_task.done()

    def _cleanup_busy_error(self, request_id: str) -> ErrorEvent:
        return self._resource_error(request_id, "resourceBusy", {"reason": "modelCleanupPending"})

    async def _cleanup_browser_models(self, request_id: str) -> None:
        try:
            await self._settle_session_models()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if not self._closing:
                self.emit(self._resource_error(request_id, "internalError",
                    {"reason": "modelCleanupFailed", "error": type(error).__name__}))

    async def _settle_session_models(self) -> None:
        runtimes = [self._recognition_runtime(), self.llama_manager]
        for provider in (self.translation_provider, self.fallback_translation_provider):
            if isinstance(provider, (M2M100TranslationProvider, CausalTranslationProvider, IndexTranslateTransformersProvider)):
                runtimes.append(provider.runtime)
        waits = [asyncio.to_thread(runtime.wait_idle) for runtime in runtimes if hasattr(runtime, 'wait_idle')]
        if waits:
            await asyncio.gather(*waits)
        if not self._retain_models or self._closing:
            await self._unload_session_models()

    async def _unload_session_models(self) -> None:
        """Release the selected models on service close, failure, removal or configuration change."""
        self._retain_models = False
        self._loaded_model_key = None
        self._loaded_translation_model_id = None
        await self.llama_manager.stop()
        runtimes = [self._recognition_runtime()]
        for provider in (self.translation_provider, self.fallback_translation_provider):
            if isinstance(provider, (M2M100TranslationProvider, CausalTranslationProvider, IndexTranslateTransformersProvider)):
                runtimes.append(provider.runtime)
        for runtime in runtimes:
            if getattr(runtime, "loaded", False):
                if isinstance(runtime, LlamaAsrRuntime):
                    await runtime.unload()
                else:
                    await asyncio.to_thread(runtime.unload)
        self._active_recognition_runtime = None
        self._update_compute_plan()

    async def close(self) -> None:
        self._closing = True
        self._retain_models = False
        if self._dependency_task is not None:
            self._dependency_task.cancel()
        if self.service.session_id is not None:
            await self._stop(
                StopSessionCommand(
                    protocolVersion=1,
                    type="stopSession",
                    requestId="runtime-close",
                    sessionId=self.service.session_id,
                )
            )
        if self._model_cleanup_pending():
            # Keep the reservation alive after a timeout; native work still owns its lock.
            try:
                await asyncio.wait_for(asyncio.shield(self._model_cleanup_task), self.model_cleanup_timeout)
            except TimeoutError:
                pass
        else:
            await self._unload_session_models()
        self._remove_engine_status()

    def _write_pipeline_heartbeat(self) -> None:
        """One `engine.pipeline` line per second, holding every counter the chain exposes.

        Driven by its own task rather than by the status writer: the failing case this exists to
        diagnose recognizes nothing at all, and a heartbeat that only ran on a recognition update
        would stay silent exactly when it is needed. The numbers are cumulative per capture and
        recognizer, so consecutive lines read as deltas.
        """
        if not debug_log.is_enabled():
            return
        now = monotonic()
        if self._last_heartbeat_at is not None and now - self._last_heartbeat_at < 1.0:
            return
        self._last_heartbeat_at = now
        capture = self.capture
        recognizer = self.recognizer
        data: dict[str, object] = {
            "sessionId": self.service.session_id,
            "sessionPaused": self.session_paused,
            "streamAnchored": self._stream_anchored,
            "streamEpoch": self._stream_epoch,
            "epochInitialized": self._epoch_initialized,
            "streamFinishing": self._stream_finishing,
            "sessionTaskAlive": self.session_task is not None and not self.session_task.done(),
            "lastAudioSequence": self._last_audio_sequence,
            "lastAudioEndMs": round(self._last_audio_end_ms, 1),
            "timelineOriginMs": round(self._timeline_origin_ms, 1),
        }
        if isinstance(capture, BrowserAudioCapture):
            data["capture"] = {
                "kind": "browserTab",
                "pushedChunks": capture.pushed_chunks,
                "pushedSamples": capture.pushed_samples,
                "framesOut": capture.frames_out,
                "framesOutSamples": capture.frames_out_samples,
                "bufferedMs": round(capture.buffered_ms, 1),
                "queued": len(capture._queue),
                "pushRejects": capture.push_rejects,
                "paused": capture.paused,
                "running": capture.running,
                "finishing": capture._finishing,
                "lastSampleRate": capture.last_sample_rate,
                "peakDbfs": round(capture.peak_dbfs, 2),
                "rmsDbfs": round(capture.rms_dbfs, 2),
            }
        if hasattr(recognizer, "stats"):
            try:
                data["asr"] = recognizer.stats()
            except Exception as error:  # a stats call must never break a session
                data["asr"] = {"error": type(error).__name__}
        debug_log.write("engine", "engine.pipeline", data)

    def _start_pipeline_heartbeat(self) -> None:
        """Run the heartbeat on its own task for as long as a session lasts."""
        if not debug_log.is_enabled() or self._heartbeat_task is not None:
            return
        self._last_heartbeat_at = None

        async def beat() -> None:
            try:
                while True:
                    await asyncio.sleep(1.0)
                    self._write_pipeline_heartbeat()
            except asyncio.CancelledError:
                raise
            except Exception:
                return

        self._heartbeat_task = asyncio.create_task(beat())

    def _stop_pipeline_heartbeat(self) -> None:
        task = self._heartbeat_task
        self._heartbeat_task = None
        if task is not None and not task.done():
            task.cancel()

    def _engine_status_payload(self) -> dict[str, object]:
        recognition = self._recognition_runtime()
        device = self.llama_manager.device
        dropped = (
            self.capture.dropped_chunks
            if self.capture is not None
            else self._dropped_chunks
        )
        self._write_pipeline_heartbeat()
        return {
            "compute": self._device_plan,
            "recognition": {
                "modelId": self.active_model_id,
                "loaded": bool(recognition.loaded),
                "runtime": recognition.describe(),
            },
            "hymt2": {
                "device": device or "unknown",
                "ready": bool(self.llama_manager.ready),
                "offloadedLayers": self.llama_manager.offloaded_layers,
                "fallbackReason": self.llama_manager.fallback_reason,
            },
            "audio": {"droppedChunks": int(dropped)},
        }

    def _write_engine_status(self) -> None:
        """Maintain the .runtime/engine-status.json diagnostic file atomically; a write
        failure never affects the session.
        """
        if self._closing:
            return
        try:
            text = json.dumps(
                self._engine_status_payload(),
                ensure_ascii=False,
                separators=(",", ":"),
            )
            if text == self._status_cache:
                return
            target_dir = self.models.model_root / ".runtime"
            target_dir.mkdir(parents=True, exist_ok=True)
            tmp_path = target_dir / "engine-status.json.tmp"
            tmp_path.write_text(text, encoding="utf-8")
            tmp_path.replace(target_dir / "engine-status.json")
        except OSError:
            return
        self._status_cache = text

    def _remove_engine_status(self) -> None:
        status_dir = self.models.model_root / ".runtime"
        for name in ("engine-status.json", "engine-status.json.tmp"):
            try:
                (status_dir / name).unlink(missing_ok=True)
            except OSError:
                pass
        self._status_cache = None

    @staticmethod
    def _resource_error(
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
