"""Explicit management of local recognition and translation models; neither queries nor
caption startup touch the network.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import os
from pathlib import Path
import shutil
import threading
from typing import Literal
from uuid import uuid4

from .models.catalog import (
    HYMT2_1_8B_IQ2_M,
    HYMT2_1_8B_Q3_K_M,
    HYMT2_1_8B_Q4_K_M,
    M2M100_418M,
    QWEN3_ASR_0_6B_HF,
    QWEN3_ASR_1_7B_HF,
    SENSEVOICE_SMALL,
)
from .models.manager import ModelManager, ModelSpec
from .protocol import ResourceChangedEvent, ResourceRecord


QWEN_RESOURCE_ID = QWEN3_ASR_1_7B_HF.model_id
QWEN_06B_RESOURCE_ID = QWEN3_ASR_0_6B_HF.model_id
SENSEVOICE_RESOURCE_ID = SENSEVOICE_SMALL.model_id
HYMT2_RESOURCE_ID = HYMT2_1_8B_Q4_K_M.model_id
HYMT2_Q3_RESOURCE_ID = HYMT2_1_8B_Q3_K_M.model_id
HYMT2_IQ2_RESOURCE_ID = HYMT2_1_8B_IQ2_M.model_id
M2M100_RESOURCE_ID = M2M100_418M.model_id

# all three quantization tiers share one llama-server path; the resource id picks which GGUF to load.
HYMT2_RESOURCE_IDS = (HYMT2_RESOURCE_ID, HYMT2_Q3_RESOURCE_ID, HYMT2_IQ2_RESOURCE_ID)

# Legacy recognition model directories and leftover files, only ever removed by exact known name.
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
    provider: Literal["qwen3-asr", "sensevoice", "hy-mt2", "m2m100"]
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
            QWEN_06B_RESOURCE_ID,
            "recognitionModel",
            "qwen3-asr",
            "Qwen3-ASR 0.6B · 本地流式识别",
            "约 1.5GB 的 BF16 原始权重，加载时以 NF4 4-bit 量化运行；与 1.7B 同系列，体积更小。",
            (
                "zh", "en", "yue", "ar", "de", "fr", "es", "pt",
                "id", "it", "ko", "ru", "th", "vi", "ja", "tr",
            ),
            1_576_381_331,
        ),
        ResourceDefinition(
            SENSEVOICE_RESOURCE_ID,
            "recognitionModel",
            "sensevoice",
            "SenseVoiceSmall · 本地流式识别",
            "约 936MB 的非自回归权重，由内置 funasr 在本机运行；支持中日韩粤英五种语言，"
            "其余源语言自动回落到模型自判。",
            ("zh", "en", "yue", "ja", "ko"),
            936_694_116,
        ),
        ResourceDefinition(
            HYMT2_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B Q4_K_M · 本地翻译模型",
            "预量化 Q4_K_M 文件（约 1.13GB），由内置 llama.cpp 在本机运行；质量基准档。",
            (
                "zh", "en", "fr", "pt", "es", "ja", "tr", "ru",
                "ar", "ko", "th", "it", "de", "vi", "ms", "id",
            ),
            1_133_080_448,
        ),
        ResourceDefinition(
            HYMT2_Q3_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B Q3_K_M · 本地翻译模型",
            "约 951MB，比 Q4_K_M 更小；实测专有名词（品牌、型号）保持得最好。",
            (
                "zh", "en", "fr", "pt", "es", "ja", "tr", "ru",
                "ar", "ko", "th", "it", "de", "vi", "ms", "id",
            ),
            951_022_560,
        ),
        ResourceDefinition(
            HYMT2_IQ2_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B UD-IQ2_M · 本地翻译模型",
            "约 723MB，体积最小；位宽很低，专有名词可能被译成字面意思。",
            (
                "zh", "en", "fr", "pt", "es", "ja", "tr", "ru",
                "ar", "ko", "th", "it", "de", "vi", "ms", "id",
            ),
            722_666_176,
        ),
        ResourceDefinition(
            M2M100_RESOURCE_ID,
            "translationModel",
            "m2m100",
            "M2M100 418M · 本地翻译模型",
            "约 1.9GB 的 pytorch_model.bin，由 transformers 在本机运行；支持 100 种语言互译。",
            (
                "zh", "en", "fr", "pt", "es", "ja", "tr", "ru",
                "ar", "ko", "th", "it", "de", "vi", "ms", "id",
            ),
            1_941_936_305,
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

    def hymt2_gguf_path(self, resource_id: str = HYMT2_RESOURCE_ID) -> Path:
        """Absolute GGUF path for one Hy-MT2 quantization tier (the filename comes from the catalog spec)."""
        spec = self._spec(resource_id)
        entry = spec.files[0]
        return self.model_root / spec.directory / entry.path

    def model_path(self, resource_id: str) -> Path:
        """Resource id → local model directory; unknown ids fail the definition lookup before reaching here."""
        return self.models.model_path(self._spec(resource_id))

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
        # clean up legacy resources once the install succeeds; a cleanup failure doesn't change the result.
        await asyncio.to_thread(self._cleanup_after_install, resource_id)

    def _cleanup_after_install(self, resource_id: str) -> None:
        """Remove legacy resources by exact known name; never scans, never touches unknown directories or Ollama."""
        try:
            # reinstalling under a new layout moves the old weights to .<dir>.corrupt,
            # so drop them as soon as the install succeeds.
            shutil.rmtree(
                self.model_root / f".{self._spec(resource_id).directory}.corrupt",
                ignore_errors=True,
            )
            if resource_id == QWEN_RESOURCE_ID:
                for name in _LEGACY_ASR_DIRS:
                    shutil.rmtree(self.model_root / name, ignore_errors=True)
                for name in _LEGACY_ASR_LEFTOVERS:
                    path = self.model_root / name
                    if path.is_dir():
                        shutil.rmtree(path, ignore_errors=True)
                    else:
                        path.unlink(missing_ok=True)
            elif resource_id in HYMT2_RESOURCE_IDS:
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
        # read from the module-level constants at call time so tests can swap the catalog spec.
        return {
            QWEN_RESOURCE_ID: QWEN3_ASR_1_7B_HF,
            QWEN_06B_RESOURCE_ID: QWEN3_ASR_0_6B_HF,
            SENSEVOICE_RESOURCE_ID: SENSEVOICE_SMALL,
            HYMT2_RESOURCE_ID: HYMT2_1_8B_Q4_K_M,
            HYMT2_Q3_RESOURCE_ID: HYMT2_1_8B_Q3_K_M,
            HYMT2_IQ2_RESOURCE_ID: HYMT2_1_8B_IQ2_M,
            M2M100_RESOURCE_ID: M2M100_418M,
        }[resource_id]

    @staticmethod
    def _error_code(error: Exception) -> str:
        name = type(error).__name__
        if name in {"URLError", "HTTPError", "ConnectionError", "TimeoutError"}:
            return "networkUnavailable"
        if str(error) == "downloadIntegrityFailed" or "Integrity" in name:
            return "integrityCheckFailed"
        return "installFailed"
