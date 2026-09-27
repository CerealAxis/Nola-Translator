"""把协议命令连接到真实音频、ASR 和字幕事件。"""

from __future__ import annotations

import asyncio
import json
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from uuid import uuid4

from .audio.capture import AudioDeviceDisconnectedError, PortAudioCapture
from .models.manager import ModelManager
from .protocol import (
    CaptionEvent,
    CaptionSegment,
    EngineCommand,
    EngineEvent,
    ErrorEvent,
    ListResourcesCommand,
    ManageResourceCommand,
    ResourceActionResultEvent,
    ResourcesEvent,
    ShutdownCommand,
    StartSessionCommand,
    StopSessionCommand,
    Translation,
)
from .recognition.base import RecognitionUpdate, Recognizer
from .recognition.qwen_runtime import QwenModelUnavailable, get_qwen_runtime
from .recognition.qwen_streaming import create_qwen_recognizer
from .resources import (
    HYMT2_RESOURCE_ID,
    QWEN_RESOURCE_ID,
    ResourceActionError,
    ResourceManager,
)
from .service import EngineService
from .translation.hymt2 import (
    HyMt2TranslationProvider,
    is_supported,
    validate_session_languages,
)
from .translation.llama_server import LlamaServerError, LlamaServerManager
from .translation.network import (
    MicrosoftTranslatorProvider,
    OllamaTranslationProvider,
    OpenAICompatibleProvider,
)
from .translation.scheduler import TranslationScheduler


EventSink = Callable[[EngineEvent], None]


@dataclass(frozen=True, slots=True)
class TranslationRequest:
    update: RecognitionUpdate
    source: str
    targets: tuple[str, ...]
    allow_intermediate: bool


class EngineRuntime:
    def __init__(self, model_root: Path, emit: EventSink) -> None:
        self.service = EngineService()
        self.models = ModelManager(model_root)
        self.emit = emit
        self.resources = ResourceManager(model_root, emit)
        self.capture: PortAudioCapture | None = None
        self.recognizer: Recognizer | None = None
        self.session_task: asyncio.Task[None] | None = None
        self.session_request_id = ""
        self.session_started_at_ms = 0.0
        self.active_config = None
        self.llama_manager = LlamaServerManager(gguf_path=self.resources.hymt2_gguf_path)
        self.translation_provider = HyMt2TranslationProvider(self.llama_manager)
        self.translation_scheduler = TranslationScheduler(self.translation_provider)
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
        self._write_engine_status()


    async def handle(self, command: EngineCommand) -> list[EngineEvent]:
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

    async def _start(self, command: StartSessionCommand) -> list[EngineEvent]:
        if self.service.session_id is not None:
            return self.service.handle(command)

        model_id = self._model_id(command)
        required_resource = model_id
        if not self.resources.is_installed(required_resource):
            return [
                self._resource_error(
                    command.requestId,
                    "resourceUnavailable",
                    {"missingResourceIds": [required_resource]},
                )
            ]

        try:
            self._configure_translation(command)
            await self._ensure_translation_server(command)
            recognizer = await self._create_recognizer(command)
        except ValueError as error:
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
            return [
                ErrorEvent(
                    protocolVersion=1,
                    type="error",
                    requestId=command.requestId,
                    code="modelUnavailable",
                    recoverable=True,
                    details={"reason": type(error).__name__},
                )
            ]

        events = self.service.handle(command)
        if events and events[0].type == "error":
            await recognizer.close()
            return events
        assert self.service.active_device is not None

        capture = PortAudioCapture(self.service.active_device)
        try:
            capture.start()
        except Exception as error:
            await recognizer.close()
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

        self.capture = capture
        self.recognizer = recognizer
        self.session_request_id = command.requestId
        self.session_started_at_ms = monotonic() * 1000
        self.active_config = command.config
        self.session_task = asyncio.create_task(self._run_session())
        self._write_engine_status()
        return events

    def _configure_translation(self, command: StartSessionCommand) -> None:
        config = command.config
        options = config.translationOptions
        endpoint = options.endpoint if options and options.endpoint else ""
        api_key = options.apiKey if options and options.apiKey else ""
        region = options.region if options and options.region else ""
        model = options.model if options and options.model else ""
        if config.translationProvider == "hymt2":
            source = (
                None
                if config.sourceLanguage == "auto"
                else self._language_code(config.sourceLanguage)
            )
            targets = [self._language_code(item) for item in config.targetLanguages]
            unsupported = validate_session_languages(source, targets)
            if unsupported:
                raise ValueError(
                    "unsupportedTranslationLanguage (hymt2): "
                    + ", ".join(unsupported)
                )
            provider = HyMt2TranslationProvider(self.llama_manager)
        elif config.translationProvider == "microsoft":
            provider = MicrosoftTranslatorProvider(
                api_key,
                endpoint=endpoint or "https://api.cognitive.microsofttranslator.com",
                region=region,
            )
        elif config.translationProvider == "openai":
            provider = OpenAICompatibleProvider(
                endpoint=endpoint or "https://api.openai.com/v1",
                model=model or "gpt-4.1-mini",
                api_key=api_key,
            )
        elif config.translationProvider == "ollama":
            provider = OllamaTranslationProvider(
                endpoint=endpoint or "http://127.0.0.1:11434",
                model=model or "qwen3:4b",
            )
        else:
            raise ValueError(f"未知翻译 Provider: {config.translationProvider}")
        self.translation_provider = provider
        self.translation_scheduler = TranslationScheduler(provider)

    async def _ensure_translation_server(self, command: StartSessionCommand) -> None:
        """会话启动时拉起 Hy-MT2 的 llama-server；缺模型或启动失败都不阻断识别。"""
        if command.config.translationProvider != "hymt2":
            return
        if not self.resources.is_installed(HYMT2_RESOURCE_ID):
            return
        try:
            await self.llama_manager.start()
        except LlamaServerError:
            # 服务不可用时会话继续，译文按目标标记失败（llamaServerUnavailable）。
            pass

    async def _create_recognizer(self, command: StartSessionCommand) -> Recognizer:
        language = (
            None
            if command.config.sourceLanguage == "auto"
            else self._language_code(command.config.sourceLanguage)
        )
        return create_qwen_recognizer(self.resources.qwen_path, source_language=language)

    @staticmethod
    def _model_id(command: StartSessionCommand) -> str:
        return command.config.recognitionModelId or QWEN_RESOURCE_ID

    async def _run_session(self) -> None:
        capture = self.capture
        recognizer = self.recognizer
        if capture is None or recognizer is None:
            return
        last_ended_at = self.session_started_at_ms
        try:
            async for frame in capture.frames():
                last_ended_at = frame.started_at_ms + 20
                for update in await recognizer.accept(frame):
                    await self._emit_update(update)
            for update in await recognizer.flush(last_ended_at):
                await self._emit_update(update)
        except AudioDeviceDisconnectedError:
            # 设备断开同样要提交已采集的尾音（尽力而为，失败不掩盖断开错误）。
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
        except QwenModelUnavailable as error:
            # 模型加载失败后不再继续采集循环，避免每帧重复报错。
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
                    # 默认只翻译最终字幕；中间结果翻译需用户显式开启。
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
            if not self.resources.is_installed(HYMT2_RESOURCE_ID):
                target_errors = dict.fromkeys(targets, "resourceUnavailable")
            elif not is_supported(request.source):
                target_errors = dict.fromkeys(targets, "unsupportedLanguagePair")
            else:
                for target in targets:
                    if not is_supported(target):
                        target_errors[target] = "unsupportedLanguagePair"
                if not target_errors and not self.llama_manager.ready:
                    target_errors = dict.fromkeys(targets, "llamaServerUnavailable")

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
        self.translation_tasks.clear()
        self.translation_last_started.clear()
        self.translation_wake.clear()
        self.completed_segments.clear()
        self.latest_updates.clear()
        self.latest_translations.clear()
        self.caption_revisions.clear()
        self.capture = None
        self.recognizer = None
        self.session_task = None
        self.active_config = None
        self._write_engine_status()
        return self.service.handle(command)

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
        qwen_runtime = get_qwen_runtime(self.resources.qwen_path)
        device = self.llama_manager.device
        return {
            "qwen": {
                "quant": qwen_runtime.quant or "unloaded",
                "loaded": bool(qwen_runtime.loaded),
            },
            "hymt2": {
                "device": device or "unknown",
                "ready": bool(self.llama_manager.ready),
            },
        }

    def _write_engine_status(self) -> None:
        """原子维护诊断状态文件（.runtime/engine-status.json）；写失败绝不影响会话。"""
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
