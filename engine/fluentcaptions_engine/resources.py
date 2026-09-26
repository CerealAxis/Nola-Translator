"""显式管理语音模型与 Argos 语言包；查询和字幕启动均不会联网。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import tempfile
import threading
from typing import Literal
from uuid import uuid4

from .models.catalog import SENSEVOICE_SMALL, STREAMING_ZH_EN_SMALL
from .models.manager import ModelManager
from .protocol import ResourceChangedEvent, ResourceRecord
from .translation.packages import ArgosPackageManager


REALTIME_RESOURCE_ID = STREAMING_ZH_EN_SMALL.model_id
SENSEVOICE_RESOURCE_ID = SENSEVOICE_SMALL.model_id
ACCURATE_RESOURCE_ID = "faster-whisper-small"
WHISPER_REQUIRED_FILES = ("config.json", "model.bin", "tokenizer.json")


class ResourceActionError(RuntimeError):
    def __init__(self, code: str, details: dict[str, object] | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.details = details


class ResourceOperationCancelled(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ResourceDefinition:
    resource_id: str
    kind: Literal["recognitionModel", "translationPackage"]
    provider: Literal["sherpa-onnx", "faster-whisper", "argos"]
    name: str
    description: str
    languages: tuple[str, ...]
    download_bytes: int | None = None
    source_language: str | None = None
    target_language: str | None = None


@dataclass(slots=True)
class Operation:
    action: Literal["install", "remove"]
    state: Literal["running", "cancelling", "failed"] = "running"
    phase: Literal["resolve", "download", "verify", "install", "remove", "cleanup"] = "resolve"
    progress: float | None = None
    cancellable: bool = False
    error_code: str | None = None
    cancel_event: threading.Event | None = None


LANGUAGE_NAMES = {
    "zh": "简体中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "ru": "Русский",
}


def _definitions() -> tuple[ResourceDefinition, ...]:
    recognition = (
        ResourceDefinition(
            REALTIME_RESOURCE_ID,
            "recognitionModel",
            "sherpa-onnx",
            "实时识别 · 中文 / English",
            "低延迟流式模型，可输出中间结果；适合会议、视频和直播。",
            ("zh", "en"),
            STREAMING_ZH_EN_SMALL.archive_size,
        ),
        ResourceDefinition(
            SENSEVOICE_RESOURCE_ID,
            "recognitionModel",
            "sherpa-onnx",
            "推荐 · SenseVoiceSmall · 流式中英日韩粤",
            "VAD 期间持续输出中间结果，支持中文、粤语、English、日本語、한국어，并启用标点恢复。",
            ("zh", "yue", "en", "ja", "ko"),
            SENSEVOICE_SMALL.archive_size,
        ),
        ResourceDefinition(
            ACCURATE_RESOURCE_ID,
            "recognitionModel",
            "faster-whisper",
            "高精度识别 · Whisper Small",
            "完整语音片段识别，支持自动识别和多语言，可自动尝试 GPU。",
            tuple(LANGUAGE_NAMES),
        ),
    )
    packages: list[ResourceDefinition] = []
    for language in ("zh", "ja", "ko", "fr", "de", "es", "ru"):
        for source, target in (("en", language), (language, "en")):
            packages.append(
                ResourceDefinition(
                    f"argos-{source}-{target}",
                    "translationPackage",
                    "argos",
                    f"{LANGUAGE_NAMES[source]} → {LANGUAGE_NAMES[target]}",
                    "Argos Translate 有向离线语言包；安装后翻译过程不联网。",
                    (source, target),
                    source_language=source,
                    target_language=target,
                )
            )
    return recognition + tuple(packages)


RESOURCE_DEFINITIONS = _definitions()
RESOURCE_BY_ID = {item.resource_id: item for item in RESOURCE_DEFINITIONS}


def _directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


class ResourceManager:
    def __init__(self, model_root: Path, emit) -> None:
        self.model_root = model_root.resolve()
        self.models = ModelManager(self.model_root)
        self.emit = emit
        self.operations: dict[str, Operation] = {}
        self.tasks: dict[str, asyncio.Task[None]] = {}
        self.argos: ArgosPackageManager | None = None

    @property
    def whisper_path(self) -> Path:
        return self.model_root / ACCURATE_RESOURCE_ID

    def list(self) -> list[ResourceRecord]:
        return [self.record(item.resource_id) for item in RESOURCE_DEFINITIONS]

    def is_installed(self, resource_id: str) -> bool:
        definition = self._definition(resource_id)
        if resource_id == REALTIME_RESOURCE_ID:
            return self.models.is_installed(STREAMING_ZH_EN_SMALL)
        if resource_id == SENSEVOICE_RESOURCE_ID:
            return self.models.is_installed(SENSEVOICE_SMALL)
        if resource_id == ACCURATE_RESOURCE_ID:
            return all((self.whisper_path / name).is_file() for name in WHISPER_REQUIRED_FILES)
        assert definition.source_language and definition.target_language
        return self._argos().installed_package(
            definition.source_language, definition.target_language
        ) is not None

    def record(self, resource_id: str) -> ResourceRecord:
        definition = self._definition(resource_id)
        installed = self.is_installed(resource_id)
        installed_bytes = 0
        if resource_id == REALTIME_RESOURCE_ID:
            installed_bytes = _directory_size(self.models.model_path(STREAMING_ZH_EN_SMALL))
        elif resource_id == SENSEVOICE_RESOURCE_ID:
            installed_bytes = _directory_size(self.models.model_path(SENSEVOICE_SMALL))
        elif resource_id == ACCURATE_RESOURCE_ID:
            installed_bytes = _directory_size(self.whisper_path)
        elif installed:
            assert definition.source_language and definition.target_language
            package = self._argos().installed_package(
                definition.source_language, definition.target_language
            )
            package_path = getattr(package, "package_path", None)
            if package_path is not None:
                installed_bytes = _directory_size(Path(package_path))

        operation = self.operations.get(resource_id)
        return ResourceRecord(
            resourceId=resource_id,
            kind=definition.kind,
            provider=definition.provider,
            name=definition.name,
            description=definition.description,
            languages=list(definition.languages),
            sourceLanguage=definition.source_language,
            targetLanguage=definition.target_language,
            installed=installed,
            installedBytes=installed_bytes,
            downloadBytes=definition.download_bytes,
            state=operation.state if operation else "idle",
            phase=operation.phase if operation else None,
            progress=operation.progress if operation else None,
            cancellable=operation.cancellable if operation else False,
            errorCode=operation.error_code if operation else None,
        )

    async def manage(
        self, resource_id: str, action: Literal["install", "remove", "cancel"]
    ) -> ResourceRecord:
        self._definition(resource_id)
        if action == "cancel":
            operation = self.operations.get(resource_id)
            if operation is None or not operation.cancellable or operation.cancel_event is None:
                raise ResourceActionError("resourceBusy", {"reason": "operationNotCancellable"})
            operation.state = "cancelling"
            operation.phase = "cleanup"
            operation.cancel_event.set()
            self._emit_changed(resource_id)
            return self.record(resource_id)

        if resource_id in self.tasks:
            raise ResourceActionError("resourceBusy")
        if action == "install" and self.is_installed(resource_id):
            return self.record(resource_id)
        if action == "remove" and not self.is_installed(resource_id):
            return self.record(resource_id)

        cancellable = action == "install" and resource_id == REALTIME_RESOURCE_ID
        operation = Operation(
            action=action,
            phase="download" if action == "install" else "remove",
            progress=0.0 if resource_id == REALTIME_RESOURCE_ID else None,
            cancellable=cancellable,
            cancel_event=threading.Event() if cancellable else None,
        )
        self.operations[resource_id] = operation
        task = asyncio.create_task(self._run(resource_id, action, operation))
        self.tasks[resource_id] = task
        self._emit_changed(resource_id)
        return self.record(resource_id)

    async def _run(
        self,
        resource_id: str,
        action: Literal["install", "remove"],
        operation: Operation,
    ) -> None:
        try:
            if action == "install":
                await self._install(resource_id, operation)
            else:
                await self._remove(resource_id)
        except ResourceOperationCancelled:
            self.operations.pop(resource_id, None)
        except Exception as error:
            operation.state = "failed"
            operation.cancellable = False
            operation.error_code = self._error_code(error)
        else:
            self.operations.pop(resource_id, None)
        finally:
            self.tasks.pop(resource_id, None)
            self._emit_changed(resource_id)

    async def _install(self, resource_id: str, operation: Operation) -> None:
        definition = self._definition(resource_id)
        if resource_id == REALTIME_RESOURCE_ID:
            loop = asyncio.get_running_loop()

            def progress(current: int, total: int) -> None:
                if operation.cancel_event and operation.cancel_event.is_set():
                    raise ResourceOperationCancelled()
                ratio = current / total if total else 0.0
                loop.call_soon_threadsafe(self._set_progress, resource_id, ratio)

            await asyncio.to_thread(
                self.models.ensure_archive, STREAMING_ZH_EN_SMALL, progress
            )
            return
        if resource_id == SENSEVOICE_RESOURCE_ID:
            await asyncio.to_thread(self.models.ensure_archive, SENSEVOICE_SMALL)
            return
        if resource_id == ACCURATE_RESOURCE_ID:
            await asyncio.to_thread(self._install_whisper)
            return
        assert definition.source_language and definition.target_language
        await asyncio.to_thread(
            self._argos().install,
            definition.source_language,
            definition.target_language,
        )

    def _install_whisper(self) -> None:
        if self.is_installed(ACCURATE_RESOURCE_ID):
            return
        from faster_whisper.utils import download_model

        self.model_root.mkdir(parents=True, exist_ok=True)
        temporary = Path(
            tempfile.mkdtemp(prefix=f".{ACCURATE_RESOURCE_ID}-", dir=self.model_root)
        )
        try:
            download_model("small", output_dir=str(temporary), local_files_only=False)
            if not all((temporary / name).is_file() for name in WHISPER_REQUIRED_FILES):
                raise RuntimeError("downloadIntegrityFailed")
            if self.whisper_path.exists():
                shutil.rmtree(self.whisper_path)
            os.replace(temporary, self.whisper_path)
        finally:
            shutil.rmtree(temporary, ignore_errors=True)

    async def _remove(self, resource_id: str) -> None:
        definition = self._definition(resource_id)
        if resource_id == REALTIME_RESOURCE_ID:
            await asyncio.to_thread(
                shutil.rmtree,
                self.models.model_path(STREAMING_ZH_EN_SMALL),
                True,
            )
        elif resource_id == SENSEVOICE_RESOURCE_ID:
            await asyncio.to_thread(
                shutil.rmtree,
                self.models.model_path(SENSEVOICE_SMALL),
                True,
            )
        elif resource_id == ACCURATE_RESOURCE_ID:
            await asyncio.to_thread(shutil.rmtree, self.whisper_path, True)
        else:
            assert definition.source_language and definition.target_language
            await asyncio.to_thread(
                self._argos().remove,
                definition.source_language,
                definition.target_language,
            )

    def _set_progress(self, resource_id: str, progress: float) -> None:
        operation = self.operations.get(resource_id)
        if operation is None:
            return
        operation.progress = max(0.0, min(1.0, progress))
        self._emit_changed(resource_id)

    def _emit_changed(self, resource_id: str) -> None:
        self.emit(
            ResourceChangedEvent(
                protocolVersion=1,
                type="resourceChanged",
                requestId=f"resource-{uuid4()}",
                resource=self.record(resource_id),
            )
        )

    def _definition(self, resource_id: str) -> ResourceDefinition:
        definition = RESOURCE_BY_ID.get(resource_id)
        if definition is None:
            raise ResourceActionError("resourceNotFound", {"resourceId": resource_id})
        return definition

    def _argos(self) -> ArgosPackageManager:
        if self.argos is None:
            self.argos = ArgosPackageManager()
        return self.argos

    @staticmethod
    def _error_code(error: Exception) -> str:
        name = type(error).__name__
        if name in {"URLError", "HTTPError", "ConnectionError", "TimeoutError"}:
            return "networkUnavailable"
        if str(error) == "downloadIntegrityFailed" or "Integrity" in name:
            return "integrityCheckFailed"
        return "installFailed"
