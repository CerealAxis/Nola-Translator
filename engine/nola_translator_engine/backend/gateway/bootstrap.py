"""Default gateway construction for the FastAPI backend.

Builds a ModelGateway whose registry reflects what is actually installed under
the model directory (a model that is not on disk is registered disabled, never
advertised as ready — doc 08 §1: installed / runtime-compatible / loaded /
inferable are four different states). Device budgets come from the existing
compute probe; the CPU is intentionally left uncapped here, matching the current
placement policy that only discrete GPU memory is budgeted.

Provider credentials are supplied per private session, never in the catalog.
"""

from __future__ import annotations

import os
from dataclasses import replace
from pathlib import Path
from typing import Callable

from ...compute import ComputeDevice, ComputeOptions, choose_devices, model_memory_mb, probe_devices
from ...resources import RESOURCE_BY_ID
from ...recognition.aliyun import QWEN_REALTIME_LANGUAGES, STREAMING_ASR_LANGUAGES
from ...recognition.minimax import MINIMAX_LANGUAGES
from ...translation.google_translate import DEFAULT_GOOGLE_TRANSLATE_ENDPOINT
from ...translation.index_translate import PUBLIC_ENDPOINT
from ...translation.llama_server import resolve_llama_dir
from ...translation.mymemory import DEFAULT_MYMEMORY_ENDPOINT
from ...translation.network import DEFAULT_MICROSOFT_ENDPOINT
from .adapters import (
    MIMO_TTS_ENDPOINT, MIMO_TTS_MODEL, AdapterRegistry, GoogleMtAdapter, IndexPublicMtAdapter,
    CloudAsrAdapter, CustomMtAdapter, LocalWorkerAdapter, MicrosoftMtAdapter, MiMoTtsAdapter, MyMemoryMtAdapter,
)
from .capabilities import ConcurrencyCapabilities, ContextCapabilities, LanguageCapabilities, ModelCapabilities, ModelKind, Operation, OperationProfile, TranslationPolicy
from .definitions import ModelDefinition, ProviderConfiguration
from .gateway import ModelGateway, ModelRegistry, RegistryEntry
from .languages import (
    asr_definition,
    cloud_configuration,
    committed_mt_definition,
    local_configuration,
    local_llm_definition,
    local_mt_definition,
    local_tts_definition,
    mymemory_definition,
)
from .resources import ResourceAdmission
from .worker import LocalModelWorker

#: Reserved VRAM head-room kept free for workspace/KV (doc 08 §8).
DEFAULT_VRAM_RESERVE_MB = 1024.0

BUNDLED_ASR_ID = "sensevoice-small-crisp-q8-0"
LOCAL_LLM_MODEL_PREFIX = "llm:"
LOCAL_LLM_CONTEXT_SIZE = 32768


def _model_dir() -> Path | None:
    raw = os.environ.get("NOLA_TRANSLATOR_MODEL_DIR")
    return Path(raw) if raw else None


def register_device_budgets(admission: ResourceAdmission) -> list[ComputeDevice]:
    devices, _, _ = probe_devices(resolve_llama_dir())
    for device in devices:
        if device.id != "cpu" and not device.integrated and device.totalMemoryMb > 0:
            admission.register_device(
                device.id, total_mb=min(device.totalMemoryMb, device.freeMemoryMb),
                reserve_mb=DEFAULT_VRAM_RESERVE_MB,
            )
    return devices


def _local_placement(entry: RegistryEntry, devices: list[ComputeDevice]) -> ProviderConfiguration:
    configuration = entry.configuration
    if configuration.is_cloud or configuration.device != "auto":
        return configuration
    options = ComputeOptions.model_validate(configuration.compute_options.get("compute", {}))
    resource = RESOURCE_BY_ID.get(configuration.resource_id)
    if resource is None:
        return configuration
    estimate = entry.definition.estimated_memory_mb
    kind = configuration.kind
    device_field = "recognitionDevice" if kind in (ModelKind.ASR, ModelKind.TTS) else "translationDevice"
    if not devices or resource.provider in ("crisp-asr", "crisp-tts"):
        # shortcut: Crisp stays on CPU until Vulkan placement can target a budgeted adapter.
        selected = "cpu"
    elif kind in (ModelKind.ASR, ModelKind.TTS):
        recognition, _, _ = choose_devices(devices, options, estimate, 0, None, resource.provider)
        selected = recognition.id
    else:
        _, translation, _ = choose_devices(devices, options, 0, estimate, resource.provider)
        selected = translation.id
    compute = {**configuration.compute_options.get("compute", {}), device_field: selected}
    if kind in (ModelKind.MT, ModelKind.LLM):
        compute["recognitionDevice"] = "cpu"
    return replace(
        configuration, device=selected,
        compute_options={
            **configuration.compute_options,
            "compute": compute,
        },
    )


def _estimate_memory_mb(model_dir: Path, model_id: str, adapter: str, compute: dict | None = None) -> float:
    try:
        return float(model_memory_mb(model_dir / model_id, adapter, ComputeOptions.model_validate(compute or {})))
    except Exception:
        return 512.0


def build_default_gateway(*, model_dir: Path | None = None, worker_factory: Callable[[], LocalModelWorker] | None = None) -> ModelGateway:
    """Assemble the backend's gateway: admission + registry + adapters.

    The returned gateway is owned by BackendContext for the process lifetime and
    shut down during lifespan teardown.
    """

    root = model_dir or _model_dir()
    admission = ResourceAdmission()
    devices = register_device_budgets(admission)

    registry = ModelRegistry()

    register_local_asr(registry, root)

    registry.register(
        mymemory_definition(),
        cloud_configuration("mymemory", ModelKind.MT, endpoint=DEFAULT_MYMEMORY_ENDPOINT),
    )
    for provider, endpoint in (
        ("google", DEFAULT_GOOGLE_TRANSLATE_ENDPOINT),
        ("microsoft", DEFAULT_MICROSOFT_ENDPOINT),
    ):
        registry.register(
            committed_mt_definition(provider, adapter_id=provider, auto_detection=True),
            cloud_configuration(provider, ModelKind.MT, endpoint=endpoint),
        )
    if root is not None:
        register_local_mt(registry, root)
        register_local_tts(registry, root)
        register_local_llm(registry, root)

    index_definition = committed_mt_definition("index-translate", adapter_id="index-translate", auto_detection=True)
    index_definition.capabilities.translation_policy = TranslationPolicy(min_source_state="stable", allow_preview=True)
    index_profile = index_definition.capabilities.operation_profiles[Operation.TRANSLATE]
    index_profile.finality = "revisable"
    index_profile.incremental_translation = "snapshot_retranslate"
    index_profile.source_revision_support = "replace_snapshot"
    registry.register(
        index_definition,
        cloud_configuration("index-translate", ModelKind.MT, endpoint=PUBLIC_ENDPOINT),
    )
    mimo_capabilities = ModelCapabilities(
        model_id=MIMO_TTS_MODEL, adapter_id=MIMO_TTS_MODEL, kinds=[ModelKind.TTS], operations=[Operation.SYNTHESIZE],
        operation_profiles={Operation.SYNTHESIZE: OperationProfile(streaming_output="false", audio_output="utterance")},
        languages=LanguageCapabilities(input=["zh", "en"], speech_output=["zh", "en"], speech_output_available=True),
    )
    registry.register(
        ModelDefinition(MIMO_TTS_MODEL, [ModelKind.TTS], mimo_capabilities),
        cloud_configuration(MIMO_TTS_MODEL, ModelKind.TTS, endpoint=MIMO_TTS_ENDPOINT, credential_ref="mimo-tts"),
    )

    adapters = AdapterRegistry()
    adapters.register(
        LocalWorkerAdapter(),
        [Operation.TRANSCRIBE, Operation.TRANSLATE, Operation.SYNTHESIZE, Operation.GENERATE],
    )
    for provider, languages in (
        ("aliyun", QWEN_REALTIME_LANGUAGES | STREAMING_ASR_LANGUAGES),
        ("minimax", MINIMAX_LANGUAGES),
    ):
        capabilities = ModelCapabilities(
            model_id=provider, adapter_id=provider, kinds=[ModelKind.ASR], operations=[Operation.TRANSCRIBE],
            languages=LanguageCapabilities(input=sorted(languages), auto_detection=True),
            operation_profiles={Operation.TRANSCRIBE: OperationProfile(
                streaming_input="true" if provider == "aliyun" else "false",
                partial_output="true" if provider == "aliyun" else "false",
                cancellation="close_session", source_transcript="required",
            )},
        )
        registry.register(ModelDefinition(provider, [ModelKind.ASR], capabilities),
                          cloud_configuration(provider, ModelKind.ASR, endpoint="", credential_ref=f"{provider}-asr"))
        adapters.register(CloudAsrAdapter(provider))
    adapters.register(GoogleMtAdapter())
    custom_definition = committed_mt_definition("custom-mt", adapter_id="custom-mt", auto_detection=True)
    custom_definition.capabilities.translation_policy = TranslationPolicy(min_source_state="stable", allow_preview=True)
    registry.register(custom_definition, cloud_configuration("custom-mt", ModelKind.MT, endpoint=""))
    adapters.register(CustomMtAdapter())
    adapters.register(IndexPublicMtAdapter())
    adapters.register(MiMoTtsAdapter())
    adapters.register(MicrosoftMtAdapter())
    adapters.register(MyMemoryMtAdapter())
    register_s2s(registry, adapters)

    return ModelGateway(
        registry=registry,
        adapters=adapters,
        admission=admission,
        resolve_configuration=lambda entry: _local_placement(entry, devices),
        worker_factory=worker_factory or (lambda: LocalModelWorker(model_dir=str(root) if root else None)),
    )


def register_local_asr(registry: ModelRegistry, root: Path | None = None) -> None:
    """Refresh installed built-in ASR entries without replacing unchanged registrations."""
    from ...models.catalog import QWEN3_ASR_0_6B_HF, QWEN3_ASR_1_7B_HF, SENSEVOICE_SMALL
    from ...models.crisp_catalog import CRISP_ASR_SPECS
    from ...models.manager import ModelManager
    from ...models.qwen_gguf_catalog import QWEN3_ASR_GGUF_SPECS
    from ...resources import RESOURCE_BY_ID

    root = root or _model_dir()
    manager = ModelManager(root) if root is not None else None
    for engine, specs in (
        ("crisp", CRISP_ASR_SPECS),
        ("pytorch", (QWEN3_ASR_0_6B_HF, QWEN3_ASR_1_7B_HF, SENSEVOICE_SMALL)),
        ("llama", QWEN3_ASR_GGUF_SPECS),
    ):
        for spec in specs:
            model_id = spec.model_id
            installed = manager is not None and manager.is_installed(spec)
            current = registry.get(model_id)
            if current is not None:
                if not installed:
                    registry.set_enabled(model_id, False)
                    continue
                if current.enabled:
                    continue
            elif not installed and model_id != BUNDLED_ASR_ID:
                continue

            resource = RESOURCE_BY_ID[model_id]
            family = next(
                name for name in ("sensevoice", "qwen3-asr", "fun-asr", "vibevoice", "mimo")
                if model_id.startswith(name)
            )
            registry.register(
                asr_definition(
                    model_id,
                    languages=resource.languages,
                    family=family,
                    model_revision=spec.revision,
                    estimated_memory_mb=(
                        _estimate_memory_mb(root, spec.directory, resource.provider) if root and installed else 512.0
                    ),
                ),
                local_configuration(
                    model_id, ModelKind.ASR, runtime=engine,
                    compute_options={"compute": {"recognitionEngine": engine}},
                ),
                enabled=installed,
            )


def register_local_mt(registry: ModelRegistry, root: Path) -> None:
    from ...models.manager import ModelManager
    from ...models.qwen35_catalog import QWEN35_SPECS
    from ...resources import (
        HYMT2_1_8B_IQ2_M,
        HYMT2_1_8B_Q3_K_M,
        HYMT2_1_8B_Q4_K_M,
        HYMT2_7B_Q4_K_M,
        INDEX_TRANSLATE_SPECS,
        INDEX_TRANSLATE_TRANSFORMERS_SPECS,
        M2M100_418M,
        RESOURCE_BY_ID,
    )

    manager = ModelManager(root)
    for engine, specs in (
        ("llama", (
            HYMT2_1_8B_IQ2_M, HYMT2_1_8B_Q3_K_M, HYMT2_1_8B_Q4_K_M, HYMT2_7B_Q4_K_M,
            *INDEX_TRANSLATE_SPECS, *QWEN35_SPECS,
        )),
        ("pytorch", (M2M100_418M, *INDEX_TRANSLATE_TRANSFORMERS_SPECS)),
    ):
        for spec in specs:
            installed = manager.is_installed(spec)
            existing = registry.get(spec.model_id)
            if existing is not None:
                registry.set_enabled(spec.model_id, installed)
                continue
            if not installed:
                continue
            resource = RESOURCE_BY_ID[spec.model_id]
            contextual = spec in QWEN35_SPECS
            compute = {"translationEngine": engine}
            if contextual:
                compute["contextSize"] = 4096
            registry.register(
                local_mt_definition(
                    spec.model_id,
                    languages=resource.languages,
                    family="qwen3.5" if contextual else resource.provider,
                    contextual=contextual,
                    model_revision=spec.revision,
                    estimated_memory_mb=_estimate_memory_mb(
                        root, spec.directory, "llama.cpp" if engine == "llama" else resource.provider, compute,
                    ),
                ),
                local_configuration(
                    spec.model_id, ModelKind.MT, runtime=engine,
                    compute_options={"compute": compute},
                ),
            )


def register_local_tts(registry: ModelRegistry, root: Path) -> None:
    from ...models.manager import ModelManager
    from ...resources import ADDITIONAL_TTS_SPECS, QWEN3_TTS_SPECS, RESOURCE_BY_ID

    manager = ModelManager(root)
    for spec in (*QWEN3_TTS_SPECS, *ADDITIONAL_TTS_SPECS):
        resource = RESOURCE_BY_ID[spec.model_id]
        if resource.provider == "llama.cpp":
            continue
        if resource.provider == "transformers-causal" and "-base-" in spec.model_id:
            continue
        installed = manager.is_installed(spec)
        existing = registry.get(spec.model_id)
        if existing is not None:
            registry.set_enabled(spec.model_id, installed)
            continue
        if not installed:
            continue
        # The installed Kokoro bundle supplies only the English af_heart voice.
        languages = ("en",) if "kokoro" in spec.model_id else resource.languages
        registry.register(
            local_tts_definition(
                spec.model_id,
                languages=languages,
                model_revision=spec.revision,
                estimated_memory_mb=_estimate_memory_mb(root, spec.directory, resource.provider),
            ),
            local_configuration(spec.model_id, ModelKind.TTS, runtime=resource.provider),
        )


def register_local_llm(registry: ModelRegistry, root: Path) -> None:
    from ...models.manager import ModelManager
    from ...models.qwen35_catalog import QWEN35_SPECS

    manager = ModelManager(root)
    for spec in QWEN35_SPECS:
        model_id = LOCAL_LLM_MODEL_PREFIX + spec.model_id
        installed = manager.is_installed(spec)
        if registry.get(model_id) is not None:
            registry.set_enabled(model_id, installed)
        elif installed:
            registry.register(
                local_llm_definition(
                    model_id, model_revision=spec.revision,
                    estimated_memory_mb=_estimate_memory_mb(
                        root, spec.directory, "llama.cpp", {"contextSize": LOCAL_LLM_CONTEXT_SIZE},
                    ),
                ),
                local_configuration(
                    model_id, ModelKind.LLM, resource_id=spec.model_id, runtime="llama",
                    compute_options={"compute": {"translationEngine": "llama", "contextSize": LOCAL_LLM_CONTEXT_SIZE}},
                ),
            )


def refresh_local_models(registry: ModelRegistry) -> None:
    root = _model_dir()
    register_local_asr(registry, root)
    if root is not None:
        register_local_mt(registry, root)
        register_local_tts(registry, root)
        register_local_llm(registry, root)


def register_s2s(registry: ModelRegistry, adapters: AdapterRegistry) -> None:
    from ..s2s_provider import ALIYUN_LANGUAGES, AUDIO_LANGUAGES, LANGUAGE_ALIASES, MODELS, QwenS2SAdapter

    adapter = QwenS2SAdapter()
    adapters.register(adapter)
    for index, model in enumerate(MODELS):
        capabilities = ModelCapabilities(
            model_id=model, adapter_id=adapter.adapter_id, kinds=[ModelKind.S2S],
            operations=[Operation.S2S_SESSION],
            operation_profiles={Operation.S2S_SESSION: OperationProfile(
                streaming_input="true", streaming_output="true", partial_output="true",
                cancellation="close_session", audio_output="chunks",
                source_transcript="required" if index == 0 else "optional",
                speaker_support="provider_ids" if index == 0 else "none",
            )},
            languages=LanguageCapabilities(
                input=["auto"] if index == 0 else sorted(set(ALIYUN_LANGUAGES) | LANGUAGE_ALIASES.keys()),
                text_output=sorted(set(ALIYUN_LANGUAGES) | LANGUAGE_ALIASES.keys()),
                speech_output=sorted(AUDIO_LANGUAGES | LANGUAGE_ALIASES.keys()),
                speech_output_available=True, auto_detection=True,
            ),
            context=ContextCapabilities(mode="session_context"),
            concurrency=ConcurrencyCapabilities(max_active_requests=2, max_streams=2),
        )
        registry.register(
            ModelDefinition(model, [ModelKind.S2S], capabilities, family="livetranslate"),
            cloud_configuration(model, ModelKind.S2S, endpoint="https://maas.aliyuncs.com", credential_ref="aliyun-asr"),
        )
