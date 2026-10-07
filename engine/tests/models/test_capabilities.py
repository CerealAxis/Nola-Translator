import pytest

from nola_translator_engine.model_capabilities import supports_translation
from nola_translator_engine.models.registry import CustomFile, CustomModelEntry, CustomModelRegistry
from nola_translator_engine.protocol import ModelConfiguration
from nola_translator_engine.resources import ResourceActionError, ResourceManager


def register(manager, adapter="llama.cpp", slot="translation"):
    return manager.register_hub_model("test/model", "fixed-revision", adapter, slot, "Test", (CustomFile("weights.gguf", 1, "0" * 64),), ("en", "ja"))


def bilingual(**changes):
    return ModelConfiguration(**dict(dict(slot="translation", engine="llama", languages=[], supportsAutoDetection=False, sourceLanguages=["en", "ja"], targetLanguages=["en", "ja"]), **changes))


def test_old_custom_models_retain_files_and_need_configuration(tmp_path):
    manager = ResourceManager(tmp_path, lambda event: None)
    entry = register(manager)
    assert manager.configuration(entry.resource_id) is None
    reloaded = CustomModelRegistry(tmp_path).get(entry.resource_id)
    assert reloaded.configuration is None
    assert reloaded.files == entry.files


@pytest.mark.parametrize("configuration", [dict(slot="translation"), dict(slot="translation", engine="llama", languages=[], supportsAutoDetection=False, sourceLanguages=[], targetLanguages=["en"]), dict(slot="translation", engine="llama", languages=[], supportsAutoDetection=False, sourceLanguages=["unknown"], targetLanguages=["en"])])
def test_incomplete_saved_capabilities_keep_downloads_pending(tmp_path, configuration):
    manager = ResourceManager(tmp_path, lambda event: None)
    entry = register(manager)
    raw = entry.to_json()
    raw["configuration"] = configuration
    migrated = CustomModelEntry.from_json(raw)
    assert migrated.configuration is None
    assert migrated.files == entry.files


def test_configuration_is_persisted_and_broadcast(tmp_path, monkeypatch):
    events = []
    manager = ResourceManager(tmp_path, events.append)
    entry = register(manager)
    monkeypatch.setattr(manager.models, "is_installed", lambda spec: True)
    config = bilingual(translationPairs=[dict(source="ja", target="en")])
    result = manager.configure(entry.resource_id, config)
    assert result.configuration == config
    assert events[-1].resource.configuration == config
    assert CustomModelRegistry(tmp_path).get(entry.resource_id).configuration == config
    assert supports_translation(config, "ja", "en")
    assert not supports_translation(config, "en", "ja")
    assert not supports_translation(config, "zh", "en")


@pytest.mark.parametrize("changes", [dict(engine="pytorch"), dict(slot="recognition"), dict(sourceLanguages=[]), dict(sourceLanguages=["zz"]), dict(translationPairs=[]), dict(translationPairs=[dict(source="zh", target="en")])])
def test_configuration_cannot_bypass_loader_and_language_validation(tmp_path, changes):
    manager = ResourceManager(tmp_path, lambda event: None)
    entry = register(manager)
    with pytest.raises(ResourceActionError):
        manager.configure(entry.resource_id, bilingual(**changes))
    assert manager.configuration(entry.resource_id) is None


def test_recommended_models_expose_full_capabilities(tmp_path):
    manager = ResourceManager(tmp_path, lambda event: None)
    assert len(manager.configuration("qwen3-asr-1.7b-hf").languages) == 30
    assert len(manager.configuration("m2m100-418m").sourceLanguages) == 100
    assert "zh-Hant" in manager.configuration("hy-mt2-1.8b-q4-k-m").targetLanguages
    assert manager.configuration("sensevoice-small").languages == ["zh", "en", "yue", "ja", "ko"]


def test_reinstall_preserves_configuration_only_for_the_same_model(tmp_path):
    manager = ResourceManager(tmp_path, lambda event: None)
    entry = register(manager)
    manager.configure(entry.resource_id, bilingual())
    assert register(manager).configuration == bilingual()
    changed = manager.register_hub_model(entry.repo, "new-revision", entry.adapter_id, entry.slot, entry.name, entry.files, entry.languages)
    assert changed.configuration is None
