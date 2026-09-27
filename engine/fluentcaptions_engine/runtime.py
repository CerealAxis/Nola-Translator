"""把协议命令连接到真实音频、ASR 和字幕事件。"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from time import monotonic
from uuid import uuid4

from .audio.capture import AudioDeviceDisconnectedError, PortAudioCapture
from .models.catalog import SENSEVOICE_SMALL, STREAMING_ZH_EN_SMALL, streaming_config
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
from .recognition.accurate import (
    AccurateRecognizer,
    SenseVoiceBackend,
    SileroVadSegmenter,
    StreamingSenseVoiceRecognizer,
    create_faster_whisper_backend,
)
from .recognition.base import RecognitionUpdate, Recognizer
from .recognition.sherpa_streaming import SherpaOnnxDecoder, SherpaStreamingRecognizer
from .resources import (
    ACCURATE_RESOURCE_ID,
    REALTIME_RESOURCE_ID,
    SENSEVOICE_RESOURCE_ID,
    ResourceActionError,
    ResourceManager,
)
from .service import EngineService
from .translation.argos import ArgosTranslationProvider
from .translation.packages import ArgosPackageManager
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
        self.translation_provider = ArgosTranslationProvider(allow_intermediate=False)
        self.translation_scheduler = TranslationScheduler(self.translation_provider)
        self.argos_packages: ArgosPackageManager | None = None
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
        self.argos_path_cache: dict[tuple[str, str, bool], bool] = {}
        self.argos_path_lock = asyncio.Lock()


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
        return events

    def _configure_translation(self, command: StartSessionCommand) -> None:
        config = command.config
        options = config.translationOptions
        endpoint = options.endpoint if options and options.endpoint else ""
        api_key = options.apiKey if options and options.apiKey else ""
        region = options.region if options and options.region else ""
        model = options.model if options and options.model else ""
        if config.translationProvider == "argos":
            provider = ArgosTranslationProvider(
                allow_intermediate=config.allowIntermediateTranslation
            )
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
        else:
            provider = OllamaTranslationProvider(
                endpoint=endpoint or "http://127.0.0.1:11434",
                model=model or "qwen3:4b",
            )
        self.argos_path_cache.clear()
        self.argos_packages = None
        self.translation_provider = provider
        self.translation_scheduler = TranslationScheduler(provider)

    async def _create_recognizer(self, command: StartSessionCommand) -> Recognizer:
        language = None if command.config.sourceLanguage == "auto" else command.config.sourceLanguage
        model_id = self._model_id(command)
        if model_id == REALTIME_RESOURCE_ID:
            if language not in (None, "zh", "en"):
                raise ValueError("实时模型当前只支持中文和英文")
            directory = self.models.model_path(STREAMING_ZH_EN_SMALL)
            decoder = await asyncio.to_thread(
                SherpaOnnxDecoder.from_transducer, streaming_config(directory)
            )
            return SherpaStreamingRecognizer(decoder, language=language)

        if model_id == SENSEVOICE_RESOURCE_ID:
            if language not in (None, "zh", "yue", "en", "ja", "ko"):
                raise ValueError("SenseVoice 当前支持中文、粤语、英文、日文和韩文")
            directory = self.models.model_path(SENSEVOICE_SMALL)
            backend = await asyncio.to_thread(
                SenseVoiceBackend,
                str(directory / "model.int8.onnx"),
                str(directory / "tokens.txt"),
                language=language,
            )
            return StreamingSenseVoiceRecognizer(
                SileroVadSegmenter(), backend, source_language=language
            )

        backend = await asyncio.to_thread(
            create_faster_whisper_backend,
            str(self.resources.whisper_path),
        )
        return AccurateRecognizer(
            SileroVadSegmenter(), backend, source_language=language
        )

    @staticmethod
    def _model_id(command: StartSessionCommand) -> str:
        configured = getattr(command.config, "recognitionModelId", None)
        if configured:
            return configured
        return (
            REALTIME_RESOURCE_ID
            if command.config.recognitionMode == "realtime"
            else ACCURATE_RESOURCE_ID
        )

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
        config = self.active_config
        targets = [] if config is None else [self._language_code(item) for item in config.targetLanguages]
        source = self._language_code(update.language or self._detect_language(update.source_text))
        targets = list(dict.fromkeys(item for item in targets if item != source))
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
            previous.get(target)
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

        package_errors: dict[str, str] = {}
        if self.translation_scheduler.provider.name == "argos":
            async with self.argos_path_lock:
                if self.argos_packages is None:
                    self.argos_packages = await asyncio.to_thread(ArgosPackageManager)
                for target in targets:
                    key = (request.source, target, request.allow_intermediate)
                    if key not in self.argos_path_cache:
                        path = await asyncio.to_thread(
                            self.argos_packages.installed_path,
                            request.source, target,
                            allow_intermediate=request.allow_intermediate,
                        )
                        self.argos_path_cache[key] = path is not None
                    if not self.argos_path_cache[key]:
                        package_errors[target] = "resourceUnavailable"

        available_targets = [target for target in targets if target not in package_errors]
        scheduled = await self.translation_scheduler.translate(
            request.update.segment_id,
            request.update.revision,
            request.update.source_text,
            request.source,
            available_targets,
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
                        provider="argos",
                        errorCode=package_errors.get(target, "translationUnavailable"),
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
        self.translation_tasks.clear()
        self.translation_last_started.clear()
        self.translation_wake.clear()
        self.completed_segments.clear()
        self.argos_path_cache.clear()
        self.latest_updates.clear()
        self.latest_translations.clear()
        self.caption_revisions.clear()
        self.capture = None
        self.recognizer = None
        self.session_task = None
        self.active_config = None
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
