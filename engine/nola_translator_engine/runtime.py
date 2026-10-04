"""Wires protocol commands to real audio, ASR, and caption events."""

from __future__ import annotations

import asyncio
import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass, asdict
from pathlib import Path
from time import monotonic
from uuid import uuid4

from .audio.capture import AudioDeviceDisconnectedError, PortAudioCapture
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
from .models.manager import ModelManager
from .models.registry import CustomFile
from .protocol import (
    CaptionEvent,
    ComputeDevicesEvent,
    ListComputeDevicesCommand,
    CaptionSegment,
    EngineCommand,
    EngineEvent,
    ErrorEvent,
    HubCompatibility,
    HubInspectEvent,
    HubModelSummary,
    HubModelsEvent,
    InspectHubRepoCommand,
    InstallHubRepoCommand,
    ListResourcesCommand,
    ManageResourceCommand,
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
from .translation.base import TranslationProvider
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


class UnknownTranslationModel(ValueError):
    """A session named a translation model the engine has no llama-server tier for.

    Raised instead of falling back to the baseline quantization: a silent fallback loads a model
    the user did not pick, and the discrepancy only surfaces as mysteriously worse output much
    later, when nobody is looking at the config that caused it.
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

    Every file is kept, not just the weights: a transformers repo is unusable without
    config.json and the tokenizer files, and dropping them here would produce a model that
    downloads successfully and then fails to load.
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
        self.capture: PortAudioCapture | None = None
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
            if (
                command.action == "remove"
                and self.service.session_id is not None
            ):
                return [self._resource_error(command.requestId, "resourceInUse")]
            try:
                resource = await self.resources.manage(command.resourceId, command.action)
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
        if isinstance(command, StartSessionCommand):
            return await self._start(command)
        if isinstance(command, InspectHubRepoCommand):
            return await self._inspect_hub_repo(command)
        if isinstance(command, SearchHubModelsCommand):
            return await self._search_hub_models(command)
        if isinstance(command, InstallHubRepoCommand):
            return await self._install_hub_repo(command)
        if isinstance(command, SetSessionPausedCommand):
            return self._set_paused(command)
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
            info = await asyncio.to_thread(inspect_repo, command.repo)
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
        refused with the reason the adapter registry produced, and nothing is written to disk —
        the alternative is discovering the model is unloadable after moving several gigabytes.
        """
        try:
            info = await asyncio.to_thread(inspect_repo, command.repo)
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
        if self.service.session_id is not None:
            return self.service.handle(command)

        try:
            model_id = self._model_id(command)
            required_resources = [model_id]
            if command.config.targetLanguages:
                if command.config.translationProvider == "local":
                    # Resolved from the resource table rather than hardcoded, so a GGUF or a
                    # transformers repo the user installed themselves is the thing that gets
                    # checked for and loaded.
                    required_resources.append(self._local_translation_model_id(command.config))
            missing_resources = [
                resource_id for resource_id in required_resources
                if not self.resources.is_installed(resource_id)
            ]
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

        self.recorder = self._open_recorder(command.config.recordingPath)
        self.capture = capture
        self.recognizer = recognizer
        self.session_request_id = command.requestId
        self.session_started_at_ms = monotonic() * 1000
        self.session_paused = False
        self.paused_at_ms = 0.0
        self.active_config = command.config
        self.session_task = asyncio.create_task(self._run_session())
        self._write_engine_status()
        return events

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

    async def _configure_device_plan(self, command: StartSessionCommand) -> None:
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
        # 「整个 translationOptions 缺席」和「用户把接口地址清空了」是两件事，只有前者配得上默认地址：
        # 设置项的默认值本来非空（`DEFAULT_SETTINGS.translation.cloudEndpoint`），所以空串只可能是
        # 用户刚清空输入框，不是「没配过」。这里曾经的 `or DEFAULT_*` 会把请求静默发去官方地址 ——
        # 用户清空的是 DeepSeek／硅基流动的网关地址，得到的却是一个跟真正原因无关的鉴权失败。所以
        # 下面 cloud 的四条分支把空串原样交给 provider，由 network.py 里已有的 `if not endpoint:
        # raise` 报出那句本来就写给用户看的话；**不要**再在这里补 `or DEFAULT_*`。
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
            # with the message written for the user to read. Don't re-check it here.
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
            # `model` 同理：设置里的 `cloudModel` 默认非空，清空就是明确的操作，所以把它原样
            # 传下去，由 provider 报「模型名为空（translationOptions.model）」，而不是偷偷换一个
            # 模型名让用户以为自己配的模型在工作。
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

        The choice is the model's *adapter*, not its id and not a provider name. `local` no
        longer tells llama.cpp apart from transformers, so the same resource table the
        recognition path already asks decides which runtime gets the weights — which is what
        keeps a GGUF installed from the hub on llama-server.
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
            unsupported = validate_session_languages(source, targets)
            if unsupported:
                raise ValueError(
                    "unsupportedTranslationLanguage (hymt2): " + ", ".join(unsupported)
                )
            # all three quantization tiers share one llama-server; load whichever the session picked.
            self.llama_manager.switch_gguf(self.resources.translation_gguf_path(model_id))
            self.llama_manager.configure_compute(self._translation_device,
                config.compute.model_copy(update={"cpuThreads": self._llama_threads}))
            return HyMt2TranslationProvider(self.llama_manager)
        raise UnknownTranslationModel(model_id)

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

    async def _create_recognizer(self, command: StartSessionCommand) -> Recognizer:
        language = (
            None
            if command.config.sourceLanguage == "auto"
            else self._language_code(command.config.sourceLanguage)
        )
        model_id = self._model_id(command)
        self.active_model_id = model_id
        model_path = self.resources.model_path(model_id)
        # Dispatch on the adapter the model's own metadata selected, not on a comparison against
        # the built-in ids. A self-installed Qwen3-ASR repo has to reach the same loader as the
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
    def _model_id(command: StartSessionCommand) -> str:
        return command.config.recognitionModelId or QWEN_RESOURCE_ID

    def _local_translation_model_id(self, config: SessionConfig) -> str:
        """The local translation model the session selected, whichever loader owns it.

        Replaces a pair of per-provider resolvers that could only each see their own tier.
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
        last_ended_at = self.session_started_at_ms
        try:
            async for frame in capture.frames():
                last_ended_at = frame.started_at_ms + 20
                if self.recorder is not None:
                    self.recorder.write(frame.samples)
                for update in await recognizer.accept(frame):
                    await self._emit_update(update)
            for update in await recognizer.flush(last_ended_at):
                await self._emit_update(update)
        except AudioDeviceDisconnectedError:
            # a disconnected device still gets its captured tail flushed (best effort —
            # a failure here must not mask the disconnect).
            try:
                for update in await recognizer.flush(last_ended_at):
                    await self._emit_update(update)
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

    async def _emit_update(self, update: RecognitionUpdate) -> None:
        self._write_engine_status()
        config = self.active_config
        targets = [] if config is None else [self._language_code(item) for item in config.targetLanguages]
        source = self._language_code(update.language or self._detect_language(update.source_text))
        targets = list(dict.fromkeys(item for item in targets if item != source))
        previous_update = self.latest_updates.get(update.segment_id)
        self.latest_updates[update.segment_id] = update
        if not targets:
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
                translations = await self._translate_request(request)
                latest = self.latest_updates.get(segment_id)
                if (
                    latest is None
                    or latest.revision != request.update.revision
                    or self.service.session_id is None
                ):
                    continue
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
            if segment_id in self.translation_requests and self.service.session_id is not None:
                self.translation_tasks[segment_id] = asyncio.create_task(
                    self._translation_worker(segment_id)
                )

    async def _translate_request(
        self, request: TranslationRequest
    ) -> list[Translation]:
        targets = list(request.targets)
        provider_name = self.translation_scheduler.provider.name

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
            elif not is_supported(request.source):
                target_errors = dict.fromkeys(targets, "unsupportedLanguagePair")
            else:
                for target in targets:
                    if not is_supported(target):
                        target_errors[target] = "unsupportedLanguagePair"
                if not target_errors and not self.llama_manager.ready:
                    target_errors = dict.fromkeys(targets, "llamaServerUnavailable")
        elif provider_name == "m2m100":
            if not self.resources.is_installed(M2M100_RESOURCE_ID):
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
        started = max(0.0, update.started_at_ms - self.session_started_at_ms)
        ended = (
            max(started, update.ended_at_ms - self.session_started_at_ms)
            if update.ended_at_ms is not None
            else None
        )
        revision = self.caption_revisions.get(update.segment_id, -1) + 1
        self.caption_revisions[update.segment_id] = revision
        return CaptionEvent(
            protocolVersion=1,
            type="caption",
            requestId=f"caption-{uuid4()}",
            sessionId=session_id,
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
        aliases = {"zh-CN": "zh", "zh-Hans": "zh", "en-US": "en", "ja-JP": "ja", "auto": "en"}
        return aliases.get(language, language.split("-")[0])

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
        if self.service.session_id is None:
            return self.service.handle(command)
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
        self._write_engine_status()
        return self.service.handle(command)

    async def _unload_session_models(self) -> None:
        """Release the ASR and local translation weights once the session ends."""
        await self.llama_manager.stop()
        runtimes = [self._recognition_runtime()]
        if isinstance(self.translation_provider, M2M100TranslationProvider):
            runtimes.append(self.translation_provider.runtime)
        for runtime in runtimes:
            if getattr(runtime, "loaded", False):
                await asyncio.to_thread(runtime.unload)
        self._update_compute_plan()

    async def close(self) -> None:
        if self.service.session_id is not None:
            await self._stop(
                StopSessionCommand(
                    protocolVersion=1,
                    type="stopSession",
                    requestId="runtime-close",
                    sessionId=self.service.session_id,
                )
            )
        await self.llama_manager.stop()
        self._remove_engine_status()

    def _engine_status_payload(self) -> dict[str, object]:
        recognition = self._recognition_runtime()
        device = self.llama_manager.device
        dropped = (
            self.capture.dropped_chunks
            if self.capture is not None
            else self._dropped_chunks
        )
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
