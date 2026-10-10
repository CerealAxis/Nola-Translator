"""Explicit management of local recognition and translation models; neither queries nor
caption startup touch the network.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
import os
from pathlib import Path
import shutil
import threading
from typing import Literal
from uuid import uuid4

from .hub import adapter_by_id, classify_hub_error
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
from .models.registry import CustomFile, CustomModelEntry, CustomModelRegistry
from .protocol import ResourceChangedEvent, ResourceRecord, ModelConfiguration, NetworkSettings
from .model_capabilities import QWEN_LANGUAGES, normalize, recognition_configuration, translation_configuration, supports_translation
from .hub import HYMT2_LANGUAGES
from .translation.m2m100 import FLORES_LANGUAGES


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
    # Free-form, because a hub-installed model passes its adapter id straight through: the
    # built-ins below write `qwen3-asr`/`sensevoice`/`hymt2`/`m2m100`, and `llama.cpp` joins them
    # for a GGUF installed from the hub.
    provider: str
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
            "Qwen3-ASR 1.7B",
            "支持中文、英语、粤语等 30 种语言及 22 种中文方言语音识别。",
            tuple(normalize(code) for code in QWEN_LANGUAGES),
            4_087_646_324,
        ),
        ResourceDefinition(
            QWEN_06B_RESOURCE_ID,
            "recognitionModel",
            "qwen3-asr",
            "Qwen3-ASR 0.6B",
            "支持中文、英语、粤语等 30 种语言及 22 种中文方言语音识别。",
            tuple(normalize(code) for code in QWEN_LANGUAGES),
            1_576_381_331,
        ),
        ResourceDefinition(
            SENSEVOICE_RESOURCE_ID,
            "recognitionModel",
            "sensevoice",
            "SenseVoiceSmall",
            "支持普通话、粤语、英语、日语和韩语语音识别与语言检测。",
            ("zh", "en", "yue", "ja", "ko"),
            936_694_116,
        ),
        ResourceDefinition(
            HYMT2_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B Q4_K_M",
            "Q4_K_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。",
            tuple(HYMT2_LANGUAGES),
            1_133_080_448,
        ),
        ResourceDefinition(
            HYMT2_Q3_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B Q3_K_M",
            "Q3_K_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。",
            tuple(HYMT2_LANGUAGES),
            951_022_560,
        ),
        ResourceDefinition(
            HYMT2_IQ2_RESOURCE_ID,
            "translationModel",
            "hymt2",
            "Hy-MT2 1.8B UD-IQ2_M",
            "UD-IQ2_M 量化版本；支持 33 种语言互译，另含藏语、哈萨克语、蒙古语、维吾尔语和粤语。",
            tuple(HYMT2_LANGUAGES),
            722_666_176,
        ),
        ResourceDefinition(
            M2M100_RESOURCE_ID,
            "translationModel",
            "m2m100",
            "M2M100 418M",
            "支持中文、英语等 100 种语言互译。",
            tuple(sorted(FLORES_LANGUAGES)),
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
        # Self-installed models live beside the built-in table, not inside it: the table is a
        # hand-maintained list of models the app ships with, and a user's own download is not
        # something it should have to learn about at build time.
        self.registry = CustomModelRegistry(self.model_root)

    @property
    def qwen_path(self) -> Path:
        return self.model_root / QWEN_RESOURCE_ID

    def hymt2_gguf_path(self, resource_id: str = HYMT2_RESOURCE_ID) -> Path:
        """Absolute GGUF path for one Hy-MT2 quantization tier (the filename comes from the catalog spec)."""
        spec = self._spec(resource_id)
        entry = spec.files[0]
        return self.model_root / spec.directory / entry.path

    def translation_gguf_path(self, resource_id: str) -> Path:
        """Absolute path of the single GGUF a llama.cpp translation resource loads.
        """
        spec = self._spec(resource_id)
        ggufs = [entry for entry in spec.files if entry.path.casefold().endswith(".gguf")]
        if not ggufs:
            raise ResourceActionError("invalidConfiguration", {"reason": "翻译模型资源里没有 GGUF 权重"})
        return self.model_root / spec.directory / ggufs[0].path

    def model_path(self, resource_id: str) -> Path:
        """Resource id → local model directory; unknown ids fail the definition lookup before reaching here."""
        return self.models.model_path(self._spec(resource_id))

    def adapter_for(self, resource_id: str) -> str | None:
        """The runtime adapter id a resource is loaded by, or ``None`` for a built-in id.

        Everything downstream now asks here instead, so a
        self-installed repo is dispatched by the adapter its own metadata selected.
        """
        entry = self.registry.get(resource_id)
        if entry is not None:
            return entry.adapter_id
        if resource_id == SENSEVOICE_RESOURCE_ID:
            return "sensevoice"
        if resource_id in (QWEN_RESOURCE_ID, QWEN_06B_RESOURCE_ID):
            return "qwen3-asr"
        if resource_id == M2M100_RESOURCE_ID:
            return "m2m100"
        if resource_id in HYMT2_RESOURCE_IDS:
            return "llama.cpp"
        return None

    def list(self) -> list[ResourceRecord]:
        return [self.record(item.resource_id) for item in RESOURCE_DEFINITIONS] + [
            self.record(entry.resource_id) for entry in self.registry.all()
        ]

    def is_installed(self, resource_id: str) -> bool:
        self._definition(resource_id)
        return self.models.is_installed(self._spec(resource_id))

    def is_registered(self, resource_id: str) -> bool:
        """Whether the id names a resource at all, without raising for one that does not.

        Search needs this: a repo that is not installed yet has no entry in the resource table,
        and asking whether its weights are on disk must answer "no", not fail the whole search.
        """
        return resource_id in RESOURCE_BY_ID or self.registry.get(resource_id) is not None

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
            configuration=self.configuration(resource_id),
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
        self, resource_id: str, action: Literal["install", "remove", "cancel"],
        network: NetworkSettings | None = None,
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
        task = asyncio.create_task(self._run(resource_id, action, operation, network))
        self.tasks[resource_id] = task
        self._emit_changed(resource_id)
        return self.record(resource_id)

    async def _run(
        self,
        resource_id: str,
        action: Literal["install", "remove"],
        operation: Operation,
        network: NetworkSettings | None,
    ) -> None:
        try:
            if action == "install":
                await self._install(resource_id, operation, network)
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

    async def _install(
        self, resource_id: str, operation: Operation, network: NetworkSettings | None
    ) -> None:
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

        await asyncio.to_thread(self.models.ensure, spec, progress, on_phase, network)
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
        # A self-installed model is also an identity, not just a directory: keeping the registry
        # entry after the weights are gone would leave a row in the resource list that can never
        # become installed again and that nothing can install. Removing the weights without
        # removing the entry is the reverse mistake, so both happen together, and only for ids
        # the registry actually owns.
        if self.registry.get(resource_id) is not None:
            self.registry.remove(resource_id)

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
        if definition is not None:
            return definition
        entry = self.registry.get(resource_id)
        if entry is not None:
            return self._custom_definition(entry)
        raise ResourceActionError("resourceNotFound", {"resourceId": resource_id})

    def _custom_definition(self, entry: CustomModelEntry) -> ResourceDefinition:
        """A self-installed repo presented exactly like a built-in resource.

        The provider is the adapter id, which is the same value the loader dispatch keys on, so a
        record's ``provider`` and the runtime's actual choice cannot drift apart.
        """
        adapter = adapter_by_id(entry.adapter_id)
        label = adapter.label if adapter is not None else entry.adapter_id
        kind: Literal["recognitionModel", "translationModel"] = (
            "recognitionModel" if entry.slot == "recognition" else "translationModel"
        )
        if entry.adapter_id == "llama.cpp":
            description = (
                f"自 Hugging Face 安装：{entry.repo}，由 {label} 运行。"
                "翻译语言与方向以保存的模型配置为准。"
            )
        else:
            description = f"自 Hugging Face 安装：{entry.repo}，由 {label} 运行。"
        return ResourceDefinition(
            resource_id=entry.resource_id,
            kind=kind,
            provider=entry.adapter_id,
            name=entry.name,
            description=description,
            languages=tuple(dict.fromkeys((entry.configuration.languages + entry.configuration.sourceLanguages + entry.configuration.targetLanguages) if entry.configuration else entry.languages)),
            download_bytes=entry.total_bytes,
        )

    def configuration(self, resource_id: str) -> ModelConfiguration | None:
        definition = RESOURCE_BY_ID.get(resource_id)
        if definition is None:
            entry = self.registry.get(resource_id)
            return entry.configuration if entry else None
        languages = list(definition.languages)
        if definition.kind == "recognitionModel":
            return recognition_configuration(languages)
        return translation_configuration(languages, "pytorch" if definition.provider == "m2m100" else "llama")

    def configure(self, resource_id: str, configuration: ModelConfiguration) -> ResourceRecord:
        entry = self.registry.get(resource_id)
        if entry is None:
            raise ResourceActionError("invalidConfiguration", {"reason": "recommendedConfigurationIsFixed"})
        expected_engine = "llama" if entry.adapter_id == "llama.cpp" else "pytorch"
        if configuration.slot != entry.slot or configuration.engine != expected_engine:
            raise ResourceActionError("invalidConfiguration", {"reason": "modelLoaderMismatch"})
        required = [configuration.languages] if entry.slot == "recognition" else [configuration.sourceLanguages, configuration.targetLanguages]
        from .model_capabilities import LANGUAGE_CODES
        if any(normalize(code) not in LANGUAGE_CODES for codes in required for code in codes):
            raise ResourceActionError("invalidConfiguration", {"reason": "unknownLanguage"})
        if any(not codes for codes in required):
            raise ResourceActionError("invalidConfiguration", {"reason": "missingLanguages"})
        # Specialized tokenizers cannot accept language codes outside their vocabularies.
        canonical = {normalize(code) for code in (QWEN_LANGUAGES if entry.adapter_id == "qwen3-asr" else ["zh", "en", "yue", "ja", "ko"] if entry.adapter_id == "sensevoice" else FLORES_LANGUAGES)}
        if entry.adapter_id != "llama.cpp" and any(normalize(code) not in canonical for codes in required for code in codes):
            raise ResourceActionError("invalidConfiguration", {"reason": "unsupportedLanguage"})
        if configuration.translationPairs is not None and (not configuration.translationPairs or any(not supports_translation(configuration, pair.source, pair.target) for pair in configuration.translationPairs)):
            raise ResourceActionError("invalidConfiguration", {"reason": "invalidPair"})
        self.registry.put(replace(entry, configuration=configuration))
        record = self.record(resource_id)
        self.emit(ResourceChangedEvent(protocolVersion=1, type="resourceChanged", requestId="configure", resource=record))
        return record

    def register_hub_model(
        self, repo: str, revision: str, adapter_id: str, slot: str, name: str,
        files: tuple[CustomFile, ...], languages: tuple[str, ...],
    ) -> CustomModelEntry:
        """Remember a judged repo as an addressable resource, before anything is downloaded.

        Registering first is what lets the install reuse ``ModelManager.ensure`` unchanged: the
        download is driven by a ``ModelSpec`` built from this entry, and the same spec is what
        ``is_installed`` and ``model_path`` will consult afterwards. Nothing here downloads, so an
        entry that was written and then failed to install is still removable and still listed.
        """
        if adapter_id not in ("qwen3-asr", "sensevoice", "m2m100", "llama.cpp"):
            raise ResourceActionError(
                "invalidConfiguration", {"reason": f"没有可运行的加载器：{adapter_id}"}
            )
        if slot not in ("recognition", "translation"):
            raise ResourceActionError("invalidConfiguration", {"reason": f"未知模型槽位：{slot}"})
        if not files:
            raise ResourceActionError("invalidConfiguration", {"reason": "仓库没有可安装的文件"})
        previous = self.registry.get(f"hub:{repo}")
        same_model = previous is not None and (previous.revision, previous.adapter_id, previous.slot, previous.files) == (revision, adapter_id, slot, files)
        entry = CustomModelEntry(
            repo=repo,
            revision=revision,
            adapter_id=adapter_id,
            slot=slot,  # type: ignore[arg-type]
            name=name,
            files=files,
            languages=languages,
            configuration=previous.configuration if same_model else None,
        )
        return self.registry.put(entry)

    def _spec(self, resource_id: str) -> ModelSpec:
        self._definition(resource_id)
        # read from the module-level constants at call time so tests can swap the catalog spec.
        builtin = {
            QWEN_RESOURCE_ID: QWEN3_ASR_1_7B_HF,
            QWEN_06B_RESOURCE_ID: QWEN3_ASR_0_6B_HF,
            SENSEVOICE_RESOURCE_ID: SENSEVOICE_SMALL,
            HYMT2_RESOURCE_ID: HYMT2_1_8B_Q4_K_M,
            HYMT2_Q3_RESOURCE_ID: HYMT2_1_8B_Q3_K_M,
            HYMT2_IQ2_RESOURCE_ID: HYMT2_1_8B_IQ2_M,
            M2M100_RESOURCE_ID: M2M100_418M,
        }.get(resource_id)
        if builtin is not None:
            return builtin
        entry = self.registry.get(resource_id)
        assert entry is not None  # _definition already proved the id resolves
        return entry.spec()

    @staticmethod
    def _error_code(error: Exception) -> str:
        """Install failure → protocol error code.

        A bare ``HTTPError`` catch would report 401/403/404/429 as "网络不可用", which is how a
        mistyped repo name or a gated model ends up being debugged as a network problem; hub.py
        already maps the status codes onto the vocabulary, so reuse it.
        """
        if str(error) == "downloadIntegrityFailed" or "Integrity" in type(error).__name__:
            return "integrityCheckFailed"
        hub_error = classify_hub_error(error)
        if hub_error is not None:
            return hub_error.code
        return "installFailed"
