"""显式管理本地识别与翻译模型；查询和字幕启动均不会联网。"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import threading
from typing import Literal
from uuid import uuid4

from .models.catalog import HYMT2_1_8B_Q4_K_M, QWEN3_ASR_1_7B_HF
from .models.manager import ModelManager, ModelSpec
from .protocol import ResourceChangedEvent, ResourceRecord


QWEN_RESOURCE_ID = QWEN3_ASR_1_7B_HF.model_id
HYMT2_RESOURCE_ID = HYMT2_1_8B_Q4_K_M.model_id

# S2.6：仅按精确已知名称清理的旧识别模型目录与残留文件。
_LEGACY_ASR_DIRS = (
    "sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16",
    "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    "faster-whisper-small",
)
_LEGACY_ASR_LEFTOVERS = (
    ".sherpa-zh-en-small.part",
    ".sensevoice-small.part",
    ".faster-whisper-small.part",
    ".sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16.corrupt",
    ".sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.corrupt",
    ".faster-whisper-small.corrupt",
)


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
    kind: Literal["recognitionModel", "translationModel"]
    provider: Literal["qwen3-asr", "hy-mt2"]
    name: str
    description: str
    languages: tuple[str, ...]
    download_bytes: int | None = None


@dataclass(slots=True)
class Operation:
    action: Literal["install", "remove"]
    state: Literal["running", "cancelling", "failed"] = "running"
    phase: Literal["resolve", "download", "verify", "install", "remove", "cleanup"] = "resolve"
    progress: float | None = None
    cancellable: bool = False
    error_code: str | None = None
    cancel_event: threading.Event | None = None


def _definitions() -> tuple[ResourceDefinition, ...]:
    return (
        ResourceDefinition(
            QWEN_RESOURCE_ID,
            "recognitionModel",
            "qwen3-asr",
            "Qwen3-ASR 1.7B · 本地流式识别",
            "下载约 4GB 的 BF16 原始权重，加载时以 NF4 4-bit 量化运行；支持多语言流式字幕。",
            (
                "zh", "en", "yue", "ar", "de", "fr", "es", "pt",
                "id", "it", "ko", "ru", "th", "vi", "ja", "tr",
            ),
            4_087_646_324,
        ),
        ResourceDefinition(
            HYMT2_RESOURCE_ID,
            "translationModel",
            "hy-mt2",
            "Hy-MT2 1.8B · 本地翻译模型",
            "预量化 Q4_K_M 文件（约 1.13GB），由内置 llama.cpp 在本机运行。",
            (
                "zh", "en", "fr", "pt", "es", "ja", "tr", "ru",
                "ar", "ko", "th", "it", "de", "vi", "ms", "id",
            ),
            1_133_080_448,
        ),
    )


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

    @property
    def qwen_path(self) -> Path:
        return self.model_root / QWEN_RESOURCE_ID

    @property
    def hymt2_gguf_path(self) -> Path:
        return self.model_root / HYMT2_RESOURCE_ID / "Hy-MT2-1.8B-Q4_K_M.gguf"

    def list(self) -> list[ResourceRecord]:
        return [self.record(item.resource_id) for item in RESOURCE_DEFINITIONS]

    def is_installed(self, resource_id: str) -> bool:
        self._definition(resource_id)
        return self.models.is_installed(self._spec(resource_id))

    def record(self, resource_id: str) -> ResourceRecord:
        definition = self._definition(resource_id)
        spec = self._spec(resource_id)
        installed = self.models.is_installed(spec)
        installed_bytes = _directory_size(self.models.model_path(spec))

        operation = self.operations.get(resource_id)
        return ResourceRecord(
            resourceId=resource_id,
            kind=definition.kind,
            provider=definition.provider,
            name=definition.name,
            description=definition.description,
            languages=list(definition.languages),
            sourceLanguage=None,
            targetLanguage=None,
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

        cancellable = action == "install"
        operation = Operation(
            action=action,
            phase="download" if action == "install" else "remove",
            progress=0.0 if action == "install" else None,
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
        spec = self._spec(resource_id)
        loop = asyncio.get_running_loop()

        def progress(current: int, total: int) -> None:
            if operation.cancel_event and operation.cancel_event.is_set():
                raise ResourceOperationCancelled()
            ratio = current / total if total else 0.0
            loop.call_soon_threadsafe(self._set_progress, resource_id, ratio)

        def on_phase(phase: str) -> None:
            if operation.cancel_event and operation.cancel_event.is_set():
                raise ResourceOperationCancelled()
            if phase not in ("download", "verify", "install"):
                return
            loop.call_soon_threadsafe(self._set_phase, resource_id, phase)

        await asyncio.to_thread(self.models.ensure, spec, progress, on_phase)
        # 安装成功后清理旧资源（S2.6）；清理失败不影响安装结果。
        await asyncio.to_thread(self._cleanup_after_install, resource_id)

    def _cleanup_after_install(self, resource_id: str) -> None:
        """按精确已知名称清理旧资源；不扫描、不触碰未知目录与 Ollama。"""
        try:
            if resource_id == QWEN_RESOURCE_ID:
                for name in _LEGACY_ASR_DIRS:
                    shutil.rmtree(self.model_root / name, ignore_errors=True)
                for name in _LEGACY_ASR_LEFTOVERS:
                    path = self.model_root / name
                    if path.is_dir():
                        shutil.rmtree(path, ignore_errors=True)
                    else:
                        path.unlink(missing_ok=True)
            else:
                for variable in ("XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME"):
                    value = os.environ.get(variable)
                    if not value:
                        continue
                    path = Path(value)
                    if path.exists():
                        shutil.rmtree(path, ignore_errors=True)
        except Exception:
            pass

    async def _remove(self, resource_id: str) -> None:
        spec = self._spec(resource_id)
        await asyncio.to_thread(shutil.rmtree, self.models.model_path(spec), True)

    def _set_progress(self, resource_id: str, progress: float) -> None:
        operation = self.operations.get(resource_id)
        if operation is None:
            return
        operation.progress = max(0.0, min(1.0, progress))
        self._emit_changed(resource_id)

    def _set_phase(self, resource_id: str, phase: Literal["download", "verify", "install"]) -> None:
        operation = self.operations.get(resource_id)
        if operation is None:
            return
        operation.phase = phase
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

    def _spec(self, resource_id: str) -> ModelSpec:
        self._definition(resource_id)
        return QWEN3_ASR_1_7B_HF if resource_id == QWEN_RESOURCE_ID else HYMT2_1_8B_Q4_K_M

    @staticmethod
    def _error_code(error: Exception) -> str:
        name = type(error).__name__
        if name in {"URLError", "HTTPError", "ConnectionError", "TimeoutError"}:
            return "networkUnavailable"
        if str(error) == "downloadIntegrityFailed" or "Integrity" in name:
            return "integrityCheckFailed"
        return "installFailed"
