"""Wires protocol commands to real audio, ASR, and caption events."""

from __future__ import annotations

import asyncio
import base64
import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, asdict, replace
from pathlib import Path
from time import monotonic
from uuid import uuid4

from .audio.capture import AudioDeviceDisconnectedError, BrowserAudioCapture, PortAudioCapture
from . import debug_log
from .debug_log import write as write_debug
from .compute import ComputeDevice, choose_devices, model_memory_mb, probe_devices, resource_failure, cpu_threads, release_failed_load
from .audio.recorder import WavRecorder
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
    PrewarmModelsCommand,
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
from .recognition.base import ModelUnavailable, RecognitionUpdate, Recognizer
from .recognition.qwen_runtime import QwenRuntime, get_qwen_runtime
from .recognition.qwen_streaming import create_qwen_recognizer
from .recognition.sensevoice_runtime import SenseVoiceRuntime, get_sensevoice_runtime
from .recognition.sensevoice_streaming import create_sensevoice_recognizer
from .resources import (
    HYMT2_RESOURCE_ID,
    HYMT2_RESOURCE_IDS,
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


EventSink = Callable[[EngineEvent], None]

#: Both commands name their models through a ``config`` and reach the same runtime resolution,
#: so the load path is shared rather than typed twice.
ModelSelectionCommand = StartSessionCommand | PrewarmModelsCommand


class UnknownTranslationModel(ValueError):
    """A session named a translation model the engine has no llama-server tier for.
    """

    def __init__(self, model_id: str) -> None:
        super().__init__(
            f"未知的翻译模型 id：{model_id}。可用："
            + "、".join((*HYMT2_RESOURCE_IDS, M2M100_RESOURCE_ID))
        )
        self.model_id = model_id


@dataclass(frozen=True, slots=True)
class TranslationRequest:
    update: RecognitionUpdate
    source: str
    targets: tuple[str, ...]
    allow_intermediate: bool


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
    for item in info.files:
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
        self.recorder: WavRecorder | None = None
        self.recognizer: Recognizer | None = None
        self.session_task: asyncio.Task[None] | None = None
        self.session_request_id = ""
        self.session_started_at_ms = 0.0
        self.session_paused = False
        self.paused_at_ms = 0.0
        self.active_config = None
        self.llama_manager = LlamaServerManager(gguf_path=self.resources.hymt2_gguf_path)
        self.translation_provider = HyMt2TranslationProvider(self.llama_manager)
        self.translation_scheduler = TranslationScheduler(self.translation_provider)
        self.active_model_id = QWEN_RESOURCE_ID
        self.translation_tasks: dict[str, asyncio.Task[None]] = {}
        self.translation_requests: dict[str, TranslationRequest] = {}
        self.latest_updates: dict[str, RecognitionUpdate] = {}
        self.latest_translations: dict[str, list[Translation]] = {}
        self.caption_revisions: dict[str, int] = {}
        self.completed_segments: OrderedDict[str, None] = OrderedDict()
        self.completed_segment_limit = 512
        self.partial_translation_interval = 0.3
        self.translation_last_started: dict[str, float] = {}
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
        self._model_cleanup_task: asyncio.Task[None] | None = None
        self.model_cleanup_timeout = 2.0
        #: Recognition runtimes a prewarm brought in, keyed by resource id. The engine holds the
        #: cache entry, so nothing else would free it once a session that merely reused it ends.
        self._prewarmed_runtimes: dict[str, list[QwenRuntime | SenseVoiceRuntime]] = {}
        self._closing = False
        self._last_heartbeat_at: float | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._torch_threads = cpu_threads()
        self._llama_threads = cpu_threads()
        self._write_engine_status()


    async def handle(self, command: EngineCommand) -> list[EngineEvent]:
        if isinstance(command, ListComputeDevicesCommand):
            self._update_compute_plan()
            devices, notes, version = await asyncio.to_thread(probe_devices, resolve_llama_dir())
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
                # The weights are about to be deleted, so a warm copy of them is no longer the
                # model the user is keeping; it stops being protected from the next unload.
                self._prewarmed_runtimes.pop(command.resourceId, None)
                if self._model_cleanup_pending():
                    return [self._cleanup_busy_error(command.requestId)]
                if (
                    command.action == "remove"
                    and self.service.session_id is not None
                ):
                    return [self._resource_error(command.requestId, "resourceInUse")]
            try:
                resource = await self.resources.manage(
                    command.resourceId, command.action, command.network
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
            await self._configure_device_plan(command)
            if command.config.targetLanguages:
                self._configure_translation(command)
            recognizer = await self._create_recognizer(command)
            if command.config.targetLanguages:
                await self._ensure_translation_server(command)
            self._update_compute_plan(self.llama_manager.fallback_reason)
        except ValueError as error:
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
            await self._unload_session_models()
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="modelUnavailable",
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
            capture = PortAudioCapture(self.service.active_device)
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

        self.recorder = self._open_recorder(
            None if command.config.browserTimeline is not None or isinstance(capture, BrowserAudioCapture)
            else command.config.recordingPath
        )
        self.capture = capture
        self.recognizer = recognizer
        self.session_request_id = command.requestId
        self.session_started_at_ms = monotonic() * 1000
        self.session_paused = False
        self.paused_at_ms = 0.0
        self.active_config = command.config
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
        model_id = config.recognitionModelId or QWEN_RESOURCE_ID
        required_resources = [model_id]
        if config.targetLanguages and config.translationProvider == "local":
            # Resolved from the resource table, so a GGUF or a
            # transformers repo the user installed themselves is the thing that gets
            # checked for and loaded.
            required_resources.append(self._local_translation_model_id(config))
        for resource_id in required_resources:
            if self.resources.configuration(resource_id) is None:
                raise ResourceActionError("invalidConfiguration", {"resourceId": resource_id, "reason": "modelNeedsConfiguration"})
        recognition = self.resources.configuration(model_id)
        source = normalize(config.sourceLanguage)
        if source == "auto" and not recognition.supportsAutoDetection or source != "auto" and source not in {normalize(code) for code in recognition.languages}:
            raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedRecognitionLanguage", "language": source})
        if config.translationProvider == "local" and config.targetLanguages:
            capability = self.resources.configuration(self._local_translation_model_id(config))
            if any(not supports_translation(capability, source, target) for target in config.targetLanguages):
                raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedTranslationLanguage", "language": source})
        return model_id, [
            resource_id for resource_id in required_resources
            if not self.resources.is_installed(resource_id)
        ]

    async def _prewarm(self, command: PrewarmModelsCommand) -> list[EngineEvent]:
        """Load the recognition weights now, leaving the loaded runtime cached for the next start.

        The placement and the runtime resolution are the session start's own calls, so the
        warmed entry is the one a later ``startSession`` resolves and reuses instead of loading
        a second copy. Nothing is captured, no session exists, and the translation side is only
        resolved: bringing up the translation runtime means starting a separate llama-server
        process, which is a resident resource in its own right rather than a warm cache entry.
        """
        if not await self._await_model_cleanup():
            return [self._cleanup_busy_error(command.requestId)]
        if self.service.session_id is not None:
            return [self._resource_error(command.requestId, "sessionAlreadyRunning")]

        config = command.config
        try:
            model_id, missing_resources = self._validate_model_selection(config)
            translation_model_id = (
                self._local_translation_model_id(config)
                if config.targetLanguages and config.translationProvider == "local"
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
            await self._configure_device_plan(command)
            recognizer = await self._create_recognizer(command)
            await recognizer.close()
            self._pin_prewarmed(model_id, self._active_recognition_runtime)
        except ValueError as error:
            await self._unload_session_models()
            return [
                self._resource_error(
                    command.requestId, "invalidConfiguration", {"reason": str(error)},
                )
            ]
        except Exception as error:
            await self._unload_session_models()
            return [
                self._resource_error(
                    command.requestId, "modelUnavailable",
                    {"reason": str(error)[:1024] or type(error).__name__},
                )
            ]
        self._update_compute_plan()
        return [ModelsPrewarmedEvent(
            protocolVersion=1, type="modelsPrewarmed", requestId=command.requestId,
            state="ready", recognitionModelId=model_id, translationModelId=translation_model_id,
            elapsedMs=(monotonic() - started_at) * 1000,
            device=self._recognition_device.torchDevice,
            runtime=self._active_recognition_runtime.describe(),
        )]

    def _pin_prewarmed(self, model_id: str, runtime: QwenRuntime | SenseVoiceRuntime) -> None:
        """Mark a runtime as held for a prewarm, so a session stop leaves it loaded."""
        pinned = self._prewarmed_runtimes.setdefault(model_id, [])
        if not any(item is runtime for item in pinned):
            pinned.append(runtime)

    def _is_prewarmed(self, runtime: object) -> bool:
        return any(
            item is runtime
            for pinned in self._prewarmed_runtimes.values()
            for item in pinned
        )

    def _open_recorder(self, path: str | None) -> WavRecorder | None:
        """Start recording the meeting audio, or stay silent when the host did not ask for one."""
        if not path:
            return None
        try:
            return WavRecorder(path)
        except OSError:
            # A full disk or a locked path must not cost the user their captions; the meeting
            # still records its transcript, just without an audio file.
            return None

    def _close_recorder(self) -> int:
        """Finalize the WAV header and return the recorded duration in ms (0 when never opened)."""
        recorder, self.recorder = self.recorder, None
        if recorder is None:
            return 0
        recorder.close()
        return recorder.duration_ms

    async def _configure_device_plan(self, command: ModelSelectionCommand) -> None:
        self._device_plan = None
        config = command.config
        devices, notes, _version = await asyncio.to_thread(probe_devices, resolve_llama_dir())
        adapter = self.resources.adapter_for(self._model_id(command))
        recognition_mb = model_memory_mb(self.resources.model_path(self._model_id(command)), adapter, config.compute)
        translation_adapter = None
        translation_mb = 0.0
        if config.targetLanguages and config.translationProvider == "local":
            model_id = self._local_translation_model_id(config)
            translation_adapter = self.resources.adapter_for(model_id)
            path = self.resources.translation_gguf_path(model_id) if translation_adapter == "llama.cpp" else self.resources.model_path(model_id)
            translation_mb = model_memory_mb(path, translation_adapter, config.compute)
        a, b, reasons = choose_devices(devices, config.compute, recognition_mb, translation_mb, translation_adapter)
        self._recognition_device, self._translation_device = a, b
        total_threads = cpu_threads(config.compute.cpuThreads)
        # PyTorch shares one process-wide thread pool; llama is a separate CPU consumer.
        share_cpu = translation_adapter == "llama.cpp"
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
        if isinstance(self.translation_provider, M2M100TranslationProvider):
            self._device_plan["translationActual"] = (self.translation_provider.runtime.device or "unknown") if self.translation_provider.runtime.loaded else "unloaded"
        else:
            self._device_plan["translationActual"] = self.llama_manager.device or "unloaded"
            self._device_plan["offloadedLayers"] = self.llama_manager.offloaded_layers
        if reason:
            self._device_plan["reasons"].append(reason)
        self._write_engine_status()

    def _configure_translation(self, command: StartSessionCommand) -> None:
        config = command.config
        options = config.translationOptions
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
        if config.translationProvider == "local":
            provider = self._local_translation_provider(config)
        elif config.translationProvider == "microsoft":
            # The endpoint guard lives in `MicrosoftTranslatorProvider`, like the other four:
            # an empty address reaches the provider as an empty string and is refused there
            # with the message written for the user to read.
            provider = MicrosoftTranslatorProvider(
                api_key,
                endpoint=resolved(endpoint, DEFAULT_MICROSOFT_ENDPOINT),
                region=region,
            )
        elif config.translationProvider == "cloud":
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
                f"未知翻译 Provider: {config.translationProvider}。可选：local、cloud、microsoft"
            )
        self.translation_provider = provider
        self.translation_scheduler = TranslationScheduler(
            provider,
            # One at a time for `local`: the model already owns the accelerator and its
            # tokenizer state is not re-entrant. The network formats are free to fan out.
            max_concurrency=1 if config.translationProvider == "local" else 3,
        )

    def _local_translation_provider(self, config: SessionConfig) -> TranslationProvider:
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
            # all three quantization tiers share one llama-server; load whichever the session picked.
            self.llama_manager.switch_gguf(self.resources.translation_gguf_path(model_id))
            self.llama_manager.configure_compute(self._translation_device,
                config.compute.model_copy(update={"cpuThreads": self._llama_threads}))
            capability = self.resources.configuration(model_id)
            languages = {code: self._language_name(code) for code in set(capability.sourceLanguages + capability.targetLanguages)}
            return HyMt2TranslationProvider(self.llama_manager, languages=languages)
        raise UnknownTranslationModel(model_id)

    @staticmethod
    def _language_name(code: str) -> str:
        from .hub import HYMT2_LANGUAGES
        from .recognition.qwen_runtime import CODE_TO_NAME
        return HYMT2_LANGUAGES.get(code) or CODE_TO_NAME.get(code) or CODE_TO_NAME.get("fil" if code == "tl" else code) or code

    async def _ensure_translation_server(self, command: StartSessionCommand) -> None:
        """Bring up the local translation runtime at session start; a missing model or a failed
        start never blocks recognition.
        """
        if command.config.translationProvider != "local":
            return
        model_id = self._local_translation_model_id(command.config)
        if self.resources.adapter_for(model_id) == "m2m100":
            if isinstance(self.translation_provider, M2M100TranslationProvider):
                try:
                    await asyncio.to_thread(self.translation_provider.runtime.load)
                except Exception as error:
                    if not (command.config.compute.allowCpuFallback and
                            self._translation_device.id != "cpu" and resource_failure(error)):
                        raise
                    release_failed_load(error)
                    await asyncio.to_thread(self.translation_provider.runtime.unload)
                    self._translation_device = ComputeDevice("cpu", "CPU", "cpu", "cpu", translation=True)
                    self.translation_provider = M2M100TranslationProvider(self.resources.model_path(model_id),
                        device="cpu", precision="auto", threads=self._torch_threads)
                    await asyncio.to_thread(self.translation_provider.runtime.load)
                    self._update_compute_plan("翻译 GPU 加载失败，回退 CPU")
            return
        if not self.resources.is_installed(model_id):
            return
        try:
            await self.llama_manager.start()
        except LlamaServerError as error:
            # the session continues when the server is unavailable; translations just
            # fail per target (llamaServerUnavailable).
            self._update_compute_plan(f"翻译运行时启动失败：{str(error)[:256]}")

    async def _create_recognizer(self, command: ModelSelectionCommand) -> Recognizer:
        language = (
            None
            if command.config.sourceLanguage == "auto"
            else self._language_code(command.config.sourceLanguage)
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
        if self._recognition_device.id == "cpu" and compute.recognitionDevice != "cpu" and compute.allowCpuFallback:
            compute = compute.model_copy(update={"precision": "auto", "quantization": "none"})
        for attempt in range(2):
            options = {"device": self._recognition_device.torchDevice, "threads": self._torch_threads}
            if self.resources.adapter_for(model_id) == "sensevoice":
                runtime = get_sensevoice_runtime(model_path, **options)
                factory = create_sensevoice_recognizer
            else:
                quant = None if compute.quantization == "auto" else compute.quantization
                runtime = get_qwen_runtime(model_path, **options, quant=quant, precision=compute.precision)
                factory = create_qwen_recognizer
            self._active_recognition_runtime = runtime
            try:
                await asyncio.to_thread(runtime.load)
                if isinstance(runtime, SenseVoiceRuntime):
                    await asyncio.to_thread(runtime.warmup)
                recognizer = factory(model_path, source_language=language, runtime=runtime)
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

    def _recognition_runtime(self) -> QwenRuntime | SenseVoiceRuntime:
        """Runtime of the currently selected recognition model."""
        if self._active_recognition_runtime is not None:
            return self._active_recognition_runtime
        model_path = self.resources.model_path(self.active_model_id)
        if self.resources.adapter_for(self.active_model_id) == "sensevoice":
            return get_sensevoice_runtime(model_path)
        return get_qwen_runtime(model_path)

    @staticmethod
    def _model_id(command: ModelSelectionCommand) -> str:
        return command.config.recognitionModelId or QWEN_RESOURCE_ID

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
        if self.resources.adapter_for(requested) in ("llama.cpp", "m2m100"):
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
                if (self.session_paused or generation != self._stream_generation
                        or self._timeline is not None and not self._stream_anchored):
                    continue
                last_ended_at = frame.started_at_ms + 20
                self._last_frame_end_ms = last_ended_at
                if self.recorder is not None:
                    self.recorder.write(frame.samples)
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
                    code="audioDeviceUnavailable",
                    recoverable=True,
                    details={"reason": "disconnected"},
                )
            )
        except ModelUnavailable as error:
            # stop the capture loop after a load failure, otherwise every frame re-reports it.
            self.emit(
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=self.session_request_id,
                    code="modelUnavailable",
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

    def _bind_recognizer(self, recognizer: Recognizer) -> None:
        session_id, generation = self.service.session_id, self._stream_generation

        async def on_update(update: RecognitionUpdate) -> None:
            await self._emit_stream_update(update, session_id, generation)

        recognizer.on_update = on_update

    async def _emit_stream_update(
        self, update: RecognitionUpdate, session_id: str | None, generation: int,
    ) -> None:
        if session_id != self.service.session_id or generation != self._stream_generation:
            return
        write_debug("engine", "engine.update", {
            "segmentId": update.segment_id, "isFinal": update.is_final,
            "startedAtMs": round(update.started_at_ms, 1),
            "endedAtMs": round(update.ended_at_ms, 1) if update.ended_at_ms is not None else None,
            "text": update.source_text[:120],
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
        targets = list(dict.fromkeys(item for item in targets if item != source))
        if config is not None and getattr(config, "translationProvider", None) == "local" and targets:
            capability = self.resources.configuration(self._local_translation_model_id(config))
            # Automatic language detection is allowed to retain untranslated speech silently.
            targets = [target for target in targets if supports_translation(capability, source, target)]
        previous_update = self.latest_updates.get(update.segment_id)
        self.latest_updates[update.segment_id] = update
        if not targets:
            self.translation_requests.pop(update.segment_id, None)
            self.latest_translations.pop(update.segment_id, None)
            task = self.translation_tasks.get(update.segment_id)
            if task is not None:
                task.cancel()
            self.emit(self._caption_event(update, []))
            self._retire_completed(update)
            return

        previous = {
            item.targetLanguage: item
            for item in self.latest_translations.get(update.segment_id, [])
        }
        visible = [
            (previous.get(target) if previous_update and previous_update.source_text == update.source_text else None)
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
        )
        self.translation_wake.setdefault(update.segment_id, asyncio.Event()).set()
        task = self.translation_tasks.get(update.segment_id)
        if task is None or task.done():
            self.translation_tasks[update.segment_id] = asyncio.create_task(
                self._translation_worker(update.segment_id)
            )

    async def _translation_worker(self, segment_id: str) -> None:
        session_id, generation = self.service.session_id, self._stream_generation
        try:
            while segment_id in self.translation_requests:
                request = self.translation_requests[segment_id]
                if not request.update.is_final and not request.allow_intermediate:
                    # only final captions get translated by default; intermediates need the user to opt in.
                    self.translation_requests.pop(segment_id, None)
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
                work = asyncio.create_task(self._translate_request(request))
                wake = self.translation_wake[segment_id]
                try:
                    while not work.done():
                        wake.clear()
                        changed = asyncio.create_task(wake.wait())
                        try:
                            await asyncio.wait((work, changed), return_when=asyncio.FIRST_COMPLETED)
                        finally:
                            changed.cancel()
                            await asyncio.gather(changed, return_exceptions=True)
                        newer = self.translation_requests.get(segment_id)
                        if (newer is not None and newer.update.is_final
                                and newer.update.source_text != request.update.source_text
                                and getattr(self.active_config, 'translationProvider', None) in ('cloud', 'microsoft')):
                            # Network IO is cancellable; local native inference must keep its reservation.
                            work.cancel()
                            await asyncio.gather(work, return_exceptions=True)
                            break
                    if work.cancelled():
                        continue
                    translations = await work
                finally:
                    if not work.done():
                        work.cancel()
                        await asyncio.gather(work, return_exceptions=True)
                latest = self.latest_updates.get(segment_id)
                if (
                    latest is None
                    or latest.revision != request.update.revision
                    or self.service.session_id != session_id
                    or self._stream_generation != generation
                ):
                    continue
                if self.latest_translations.get(segment_id) != translations:
                    self.latest_translations[segment_id] = translations
                    self.emit(self._caption_event(latest, translations))
                self._retire_completed(latest)
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

    async def _translate_request(
        self, request: TranslationRequest
    ) -> list[Translation]:
        targets = list(request.targets)
        provider_name = self.translation_scheduler.provider.name
        session_id, generation = self.service.session_id, self._stream_generation
        def publish(result: ScheduledTranslation) -> None:
            latest = self.latest_updates.get(request.update.segment_id)
            if (latest is None or latest.revision != request.update.revision
                    or self.service.session_id != session_id or self._stream_generation != generation):
                return
            replacement = Translation(targetLanguage=result.target_language, state=result.state,
                                      provider=result.provider, text=result.text, errorCode=result.error_code)
            visible = [replacement if item.targetLanguage == result.target_language else item
                       for item in self.latest_translations.get(request.update.segment_id, [])]
            self.latest_translations[request.update.segment_id] = visible
            self.emit(self._caption_event(latest, visible))

        target_errors: dict[str, str] = {}
        if provider_name == "hymt2":
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

        available_targets = [target for target in targets if target not in target_errors]
        scheduled = (
            await self.translation_scheduler.translate(
                request.update.segment_id,
                request.update.revision,
                request.update.source_text,
                request.source,
                available_targets,
                on_result=publish,
            )
            if available_targets
            else []
        )
        completed_by_target = {item.target_language: item for item in scheduled}
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
            if segment_id in self.translation_tasks or segment_id in self.translation_requests:
                continue
            self.completed_segments.pop(segment_id, None)
            for mapping in (self.latest_updates, self.latest_translations, self.caption_revisions,
                            self.translation_last_started, self.translation_wake):
                mapping.pop(segment_id, None)

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
            "text": update.source_text[:120],
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
            return [self._resource_error(command.requestId, "invalidMessage", {"reason": "audioOutOfOrder"})]
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
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.translation_scheduler.close()
        self.translation_tasks.clear()
        for mapping in (self.translation_last_started, self.translation_wake, self.completed_segments,
                        self.latest_updates, self.latest_translations, self.caption_revisions):
            mapping.clear()

    def _fresh_recognizer(self) -> Recognizer:
        config = self.active_config
        assert config is not None
        language = None if config.sourceLanguage == "auto" else self._language_code(config.sourceLanguage)
        if language == "tl":
            language = "fil"
        model_path = self.resources.model_path(self.active_model_id)
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
            return [self._resource_error(command.requestId, "invalidMessage", {"reason": "staleEpoch"})]
        self._stream_generation += 1
        capture = self.capture
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
        self.recognizer = self._fresh_recognizer()
        self._bind_recognizer(self.recognizer)
        if capture is not None and not self.session_paused:
            capture.resume()
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
                        if generation == self._stream_generation and session_id == self.service.session_id:
                            self.emit(self._resource_error(command.requestId, "modelUnavailable",
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
            translations = list(self.translation_tasks.values())
            if translations:
                await asyncio.gather(*translations, return_exceptions=True)
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
        in-flight sentence it was building. Resuming shifts ``session_started_at_ms``
        forward by the paused duration: caption timestamps are derived as
        ``frame.started_at_ms - session_started_at_ms`` (see ``_emit_update``), so
        absorbing the gap here is what keeps the exported SRT timeline continuous
        instead of leaving a hole the length of the pause.
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
            self.paused_at_ms = monotonic() * 1000
            self.capture.pause()
            self.session_paused = True
        else:
            self.capture.resume()
            self.session_started_at_ms += monotonic() * 1000 - self.paused_at_ms
            self.paused_at_ms = 0.0
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
        if browser_session:
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
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        await self.translation_scheduler.close()
        if browser_session:
            # Cancelling a to_thread ASR job cannot release its native inference lock.
            # Reserve its models until deferred unloading finishes, without delaying stop.
            self._model_cleanup_task = asyncio.create_task(self._cleanup_browser_models(command.requestId))
        else:
            await self.llama_manager.stop()
            await self._unload_session_models()
        self.translation_tasks.clear()
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
        self.paused_at_ms = 0.0
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
            if update.is_final:
                continue
            final = replace(update, is_final=True,
                ended_at_ms=max(update.started_at_ms, self._last_frame_end_ms))
            translations = [
                item.model_copy(update={"state": "failed", "errorCode": "translationCancelled"})
                if item.state == "pending" else item
                for item in self.latest_translations.get(update.segment_id, [])
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
            await self._unload_session_models()
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if not self._closing:
                self.emit(self._resource_error(request_id, "internalError",
                    {"reason": "modelCleanupFailed", "error": type(error).__name__}))

    async def _unload_session_models(self) -> None:
        """Release the ASR and local translation weights once the session ends.

        A runtime a prewarm brought in stays loaded: the warm service outlives the session that
        used it, and the engine holds the only cache entry that can release those weights.
        """
        await self.llama_manager.stop()
        runtimes = [self._recognition_runtime()]
        if isinstance(self.translation_provider, M2M100TranslationProvider):
            runtimes.append(self.translation_provider.runtime)
        for runtime in runtimes:
            if self._is_prewarmed(runtime):
                continue
            if getattr(runtime, "loaded", False):
                await asyncio.to_thread(runtime.unload)
        self._update_compute_plan()

    async def close(self) -> None:
        self._closing = True
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
            await self.llama_manager.stop()
        self._remove_engine_status()

    def _write_pipeline_heartbeat(self) -> None:
        """One `engine.pipeline` line per second, holding every counter the chain exposes.

        Driven by its own task rather than by the status writer: the failing case this exists to
        diagnose recognizes nothing at all, and a heartbeat that only ran on a recognition update
        would stay silent exactly when it is needed. The numbers are cumulative per capture and
        recognizer, so consecutive lines read as deltas.
        """
        if debug_log.resolve_path() is None:
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
        if debug_log.resolve_path() is None or self._heartbeat_task is not None:
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
