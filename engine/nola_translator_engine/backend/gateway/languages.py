"""Language tables and registry builders for the gateway.

These turn the models the app already ships/installs into ModelDefinition +
ProviderConfiguration entries the ModelRegistry can match against. Language
support is stated from the models' real capabilities (evidence level
official_doc / source); anything unverified stays unknown rather than being
defaulted to true (doc 08 §3).
"""

from __future__ import annotations

from ...translation.index_translate_languages import LANGUAGE_NAMES
from .capabilities import (
    CapabilityEvidence,
    ContextCapabilities,
    LanguageCapabilities,
    ModelCapabilities,
    ModelKind,
    Operation,
    OperationInput,
    OperationOutput,
    OperationProfile,
    TranslationPolicy,
)
from .definitions import ModelDefinition, ProviderConfiguration

#: SenseVoice-small officially covers these spoken inputs (auto-detection among
#: them). Kept explicit so the gateway never treats "multilingual" as "any".
LANGUAGE_INPUT: tuple[str, ...] = ("zh", "en", "yue", "ja", "ko")

#: Text output languages come from Index-Translate's published table.
LANGUAGE_TEXT_OUTPUT: tuple[str, ...] = tuple(LANGUAGE_NAMES.keys())


def asr_definition(
    model_id: str = "sensevoice-small-crisp-q8-0",
    *,
    languages: tuple[str, ...] = LANGUAGE_INPUT,
    family: str = "sensevoice",
    model_revision: str | None = None,
    estimated_memory_mb: float = 512.0,
    weights_digest: str | None = None,
) -> ModelDefinition:
    capabilities = ModelCapabilities(
        model_id=model_id,
        model_revision=model_revision,
        adapter_id="local-call",
        kinds=[ModelKind.ASR],
        operations=[Operation.TRANSCRIBE],
        operation_profiles={
            Operation.TRANSCRIBE: OperationProfile(
                input=OperationInput(modalities=["audio"], audio_formats=["pcm_s16le_16k"]),
                streaming_input="false",
                streaming_output="false",
                partial_output="false",
                finality="append_only",
                cancellation="abandon_only",
                source_transcript="required",
            )
        },
        languages=LanguageCapabilities(input=list(languages), auto_detection=True),
        evidence=[
            CapabilityEvidence(
                claim="Built-in catalog lists the supported spoken input languages",
                level="source",
                url_or_revision="nola_translator_engine/resources.py",
                limitation="the local_call adapter returns only transcription text",
            )
        ],
    )
    return ModelDefinition(
        model_id=model_id,
        kinds=[ModelKind.ASR],
        capabilities=capabilities,
        family=family,
        weights_digest=weights_digest,
        estimated_memory_mb=estimated_memory_mb,
    )


def local_mt_definition(
    model_id: str = "index-translate",
    *,
    languages: tuple[str, ...] = LANGUAGE_TEXT_OUTPUT,
    family: str = "index-translate",
    contextual: bool = False,
    model_revision: str | None = None,
    estimated_memory_mb: float = 2048.0,
    weights_digest: str | None = None,
) -> ModelDefinition:
    capabilities = ModelCapabilities(
        model_id=model_id,
        model_revision=model_revision,
        adapter_id="local-call",
        kinds=[ModelKind.MT],
        operations=[Operation.TRANSLATE],
        operation_profiles={
            Operation.TRANSLATE: OperationProfile(
                streaming_output="false",
                finality="revisable",
                cancellation="abandon_only",
                incremental_translation="snapshot_retranslate",
                source_revision_support="replace_snapshot",
            )
        },
        languages=LanguageCapabilities(input=list(languages), text_output=list(languages), auto_detection=contextual),
        context=ContextCapabilities(mode="request_context" if contextual else "stateless"),
        translation_policy=TranslationPolicy(min_source_state="stable", allow_preview=True),
    )
    return ModelDefinition(
        model_id=model_id,
        kinds=[ModelKind.MT],
        capabilities=capabilities,
        family=family,
        weights_digest=weights_digest,
        estimated_memory_mb=estimated_memory_mb,
    )


def local_tts_definition(
    model_id: str, *, languages: tuple[str, ...], model_revision: str, estimated_memory_mb: float
) -> ModelDefinition:
    capabilities = ModelCapabilities(
        model_id=model_id,
        model_revision=model_revision,
        adapter_id="local-call",
        kinds=[ModelKind.TTS],
        operations=[Operation.SYNTHESIZE],
        operation_profiles={
            Operation.SYNTHESIZE: OperationProfile(
                input=OperationInput(modalities=["text"]),
                output=OperationOutput(modalities=["audio"], audio_formats=["pcm_s16le"]),
                streaming_input="false",
                streaming_output="false",
                partial_output="false",
                finality="immutable_item",
                cancellation="abandon_only",
                audio_output="utterance",
            )
        },
        languages=LanguageCapabilities(input=list(languages), speech_output=list(languages), speech_output_available=True),
        translation_policy=TranslationPolicy(min_source_state="committed", allow_preview=False),
    )
    return ModelDefinition(model_id, [ModelKind.TTS], capabilities, estimated_memory_mb=estimated_memory_mb)


def local_llm_definition(model_id: str, *, model_revision: str, estimated_memory_mb: float) -> ModelDefinition:
    capabilities = ModelCapabilities(
        model_id=model_id,
        model_revision=model_revision,
        adapter_id="local-call",
        kinds=[ModelKind.LLM],
        operations=[Operation.GENERATE],
        operation_profiles={Operation.GENERATE: OperationProfile(streaming_output="true")},
        context=ContextCapabilities(mode="request_context"),
    )
    return ModelDefinition(
        model_id, [ModelKind.LLM], capabilities, family="qwen3.5", estimated_memory_mb=estimated_memory_mb,
    )


def committed_mt_definition(model_id: str, *, adapter_id: str, auto_detection: bool) -> ModelDefinition:
    capabilities = ModelCapabilities(
        model_id=model_id,
        adapter_id=adapter_id,
        kinds=[ModelKind.MT],
        operations=[Operation.TRANSLATE],
        operation_profiles={
            Operation.TRANSLATE: OperationProfile(
                streaming_output="false",
                finality="immutable_item",
                cancellation="abandon_only",
                incremental_translation="none",
            )
        },
        languages=LanguageCapabilities(auto_detection=auto_detection),
        translation_policy=TranslationPolicy(min_source_state="committed", allow_preview=False),
    )
    return ModelDefinition(model_id=model_id, kinds=[ModelKind.MT], capabilities=capabilities, family=adapter_id)


def mymemory_definition(model_id: str = "mymemory") -> ModelDefinition:
    definition = committed_mt_definition(model_id, adapter_id="mymemory", auto_detection=False)
    definition.capabilities.evidence.append(CapabilityEvidence(
        claim="MyMemory REST translates committed text; requires explicit source language",
        level="official_doc",
        url_or_revision="mymemory.translated.net/doc/spec.php",
        limitation="500 UTF-8 byte query limit; anonymous daily quota",
    ))
    return definition


def local_configuration(
    model_id: str,
    kind: ModelKind,
    *,
    resource_id: str | None = None,
    device: str = "auto",
    runtime: str | None = None,
    compute_options: dict | None = None,
) -> ProviderConfiguration:
    return ProviderConfiguration(
        provider_id="local",
        model_id=model_id,
        kind=kind,
        resource_id=resource_id or model_id,
        runtime=runtime,
        device=device,
        compute_options=compute_options or {},
        is_cloud=False,
    )


def cloud_configuration(
    model_id: str,
    kind: ModelKind,
    *,
    endpoint: str,
    credential_ref: str | None = None,
    region: str | None = None,
) -> ProviderConfiguration:
    return ProviderConfiguration(
        provider_id="cloud",
        model_id=model_id,
        kind=kind,
        endpoint=endpoint,
        credential_ref=credential_ref,
        region=region,
        is_cloud=True,
    )
