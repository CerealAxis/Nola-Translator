from nola_translator_engine.backend.gateway.bootstrap import BUNDLED_ASR_ID, register_custom_models, register_local_asr
from nola_translator_engine.backend.gateway.capabilities import Operation
from nola_translator_engine.backend.gateway.gateway import ModelRegistry
from nola_translator_engine.models.catalog import QWEN3_ASR_0_6B_HF, SENSEVOICE_SMALL
from nola_translator_engine.models.crisp_catalog import FUN_ASR_GGUF_SPECS, QWEN3_ASR_CRISP_SPECS
from nola_translator_engine.models.manager import ModelManager
from nola_translator_engine.models.qwen_gguf_catalog import QWEN3_ASR_GGUF_SPECS
from nola_translator_engine.models.registry import CustomFile, CustomModelEntry, CustomModelRegistry
from nola_translator_engine.model_capabilities import translation_configuration
from nola_translator_engine.resources import RESOURCE_BY_ID


def test_local_asr_catalog_refresh(tmp_path, monkeypatch):
    registry = ModelRegistry()
    (tmp_path / BUNDLED_ASR_ID).mkdir()
    register_local_asr(registry, tmp_path)
    assert not registry.get(BUNDLED_ASR_ID).enabled
    assert registry.candidates(Operation.TRANSCRIBE) == []

    models = (
        (QWEN3_ASR_0_6B_HF, "pytorch", "qwen3-asr"),
        (SENSEVOICE_SMALL, "pytorch", "sensevoice"),
        (QWEN3_ASR_GGUF_SPECS[0], "llama", "qwen3-asr"),
        (QWEN3_ASR_CRISP_SPECS[0], "crisp", "qwen3-asr"),
        (FUN_ASR_GGUF_SPECS[0], "crisp", "fun-asr"),
    )
    installed = {spec.model_id for spec, _, _ in models}
    monkeypatch.setattr(ModelManager, "is_installed", lambda self, spec: spec.model_id in installed)
    register_local_asr(registry, tmp_path)
    assert {entry.definition.model_id for entry in registry.candidates(Operation.TRANSCRIBE)} == installed
    for spec, engine, family in models:
        entry = registry.get(spec.model_id)
        assert entry.configuration.compute_options["compute"]["recognitionEngine"] == engine
        assert entry.definition.family == family
        assert entry.definition.capabilities.languages.input == list(RESOURCE_BY_ID[spec.model_id].languages)

    removed_id = QWEN3_ASR_0_6B_HF.model_id
    retained_id = SENSEVOICE_SMALL.model_id
    retained = registry.get(retained_id)
    installed.remove(removed_id)
    register_local_asr(registry, tmp_path)
    assert not registry.get(removed_id).enabled
    assert registry.get(retained_id) is retained


def test_custom_translation_is_available_to_v2_and_removed_with_the_registry_entry(tmp_path, monkeypatch):
    saved = CustomModelRegistry(tmp_path)
    config = translation_configuration(["en", "zh"], "llama")
    entry = saved.put(CustomModelEntry(repo="local/translator", revision="fixture", adapter_id="llama.cpp",
                                       slot="translation", name="Translator", files=(CustomFile("weights.gguf", 1, sha256="a" * 64),),
                                       configuration=config))
    monkeypatch.setattr(ModelManager, "is_installed", lambda self, spec: spec.model_id == entry.resource_id)
    registry = ModelRegistry()
    register_custom_models(registry, tmp_path)
    [available] = registry.candidates(Operation.TRANSLATE)
    assert available.definition.model_id == entry.resource_id
    assert available.definition.capabilities.languages.text_output == ["en", "zh"]
    saved.remove(entry.resource_id)
    register_custom_models(registry, tmp_path)
    assert not registry.candidates(Operation.TRANSLATE)
