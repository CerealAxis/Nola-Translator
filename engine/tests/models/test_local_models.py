import json
import struct

import pytest

from nola_translator_engine.local_models import LocalModelError, import_local, inspect_local
from nola_translator_engine.models.registry import CustomModelRegistry
from nola_translator_engine.protocol import ModelConfiguration


def tensor():
    header = json.dumps({'weight': {'dtype': 'F32', 'shape': [1], 'data_offsets': [0, 4]}}).encode()
    return struct.pack('<Q', len(header)) + header + struct.pack('<f', 1)


def snapshot(tmp_path):
    path = tmp_path / 'custom-asr'
    path.mkdir()
    for name, value in {
        'config.json': {'model_type': 'qwen3_asr', 'architectures': ['Qwen3ASRForConditionalGeneration']},
        'tokenizer_config.json': {}, 'tokenizer.json': {}, 'processor_config.json': {},
    }.items():
        (path / name).write_text(json.dumps(value))
    (path / 'chat_template.jinja').write_text('template')
    (path / 'model.safetensors').write_bytes(tensor())
    return path


def gguf(path, architecture='llama', metadata=None):
    def string(value):
        data = value.encode()
        return struct.pack('<Q', len(data)) + data
    fields = {'general.architecture': architecture, **(metadata or {})}
    data = b'GGUF' + struct.pack('<IQQ', 3, 1, len(fields))
    for key, value in fields.items():
        data += string(key) + struct.pack('<I', 8 if isinstance(value, str) else 7)
        data += string(value) if isinstance(value, str) else struct.pack('<?', value)
    data += string('weight') + struct.pack('<IQIQ', 1, 1, 0, 0)
    data += bytes((-len(data)) % 32) + struct.pack('<f', 1)
    path.write_bytes(data)
    return path


def test_asr_gguf_imports_audio_companion_and_retains_llama_configuration(tmp_path):
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'Qwen3-ASR-0.6B-Q8_0.gguf', 'qwen3vl')
    with pytest.raises(LocalModelError, match='mmproj'):
        inspect_local(source)
    projector = gguf(tmp_path / ('mmproj-' + source.name), 'clip', {
        'clip.has_audio_encoder': True, 'clip.audio.projector_type': 'qwen3a',
    })
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    assert (entry.adapter_id, entry.slot) == ('llama-asr', 'recognition')
    assert {f.path for f in entry.files} == {source.name, projector.name}
    manager = ResourceManager(root, lambda event: None)
    manager.configure(entry.resource_id, ModelConfiguration(slot='recognition', engine='llama', languages=['en'], supportsAutoDetection=True, sourceLanguages=[], targetLanguages=[]))
    reloaded = CustomModelRegistry(root).get(entry.resource_id)
    assert reloaded.configuration.engine == 'llama'
    assert manager.translation_gguf_path(entry.resource_id).name == source.name
    assert manager.audio_projector_path(entry.resource_id).name == projector.name


def test_pytorch_causal_translation_import_is_not_tied_to_recommendations(tmp_path):
    source = snapshot(tmp_path)
    (source / 'config.json').write_text(json.dumps({'model_type': 'qwen3', 'architectures': ['Qwen3ForCausalLM']}))
    _, entry = inspect_local(source)
    assert (entry.adapter_id, entry.slot) == ('transformers-causal', 'translation')


def test_gguf_name_comes_from_weights_in_an_arbitrarily_named_folder(tmp_path):
    source = tmp_path / 'New folder'
    source.mkdir()
    gguf(source / 'Qwen3-ASR-0.6B-Q8_0.gguf', 'qwen3vl')
    gguf(source / 'mmproj-Qwen3-ASR-0.6B-Q8_0.gguf', 'clip', {
        'clip.has_audio_encoder': True, 'clip.audio.projector_type': 'qwen3a',
    })
    _, entry = inspect_local(source)
    assert entry.name == 'Qwen3-ASR-0.6B-Q8_0'


@pytest.mark.asyncio
async def test_removing_an_imported_unconfigured_model_finishes_cleanly(tmp_path):
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'translator.gguf')
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    events = []
    manager = ResourceManager(root, events.append)
    pending = await manager.manage(entry.resource_id, 'remove')
    assert pending.phase == 'remove'
    task = manager.tasks[entry.resource_id]
    await task
    assert not manager.tasks
    assert not manager.operations
    assert manager.registry.get(entry.resource_id) is None
    assert not (root / entry.resolved_directory).exists()
    assert events[-1].resource.state == 'idle'
    assert not events[-1].resource.installed


def test_import_accepts_unlisted_snapshot_and_requires_configuration(tmp_path):
    source = snapshot(tmp_path)
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    assert entry.adapter_id == 'qwen3-asr'
    assert entry.configuration is None
    saved = CustomModelRegistry(root).get(entry.resource_id)
    assert saved and saved.files == entry.files
    assert (root / saved.resolved_directory / 'model.safetensors').read_bytes() == tensor()


def test_truncated_weights_and_missing_shards_are_rejected(tmp_path):
    source = snapshot(tmp_path)
    (source / 'model.safetensors').write_bytes(tensor()[:-1])
    with pytest.raises(LocalModelError, match='Truncated safetensors'):
        inspect_local(source)
    (source / 'model.safetensors').write_bytes(tensor())
    (source / 'model.safetensors.index.json').write_text(json.dumps({'weight_map': {'weight': '../outside.safetensors'}}))
    with pytest.raises(LocalModelError, match='Missing shards'):
        inspect_local(source)


def test_gguf_uses_translation_loader_and_rejects_unsupported_architecture(tmp_path):
    source = gguf(tmp_path / 'custom.gguf')
    _, entry = inspect_local(source)
    assert (entry.adapter_id, entry.slot) == ('llama.cpp', 'translation')
    source = gguf(source, 'whisper')
    with pytest.raises(LocalModelError) as error:
        inspect_local(source)
    assert error.value.issue == 'unsupportedModel'


def test_huggingface_description_is_persisted_without_executing_model_code(tmp_path, monkeypatch):
    source = snapshot(tmp_path)
    (source / 'unsafe.py').write_text('raise RuntimeError("must not execute")')
    monkeypatch.setattr('nola_translator_engine.local_models._http_get', lambda *_: b'---\nlicense: apache\n---\n# Model\nA fine-tuned speech model.')
    entry = import_local(source, tmp_path / 'installed', 'owner/custom-model')
    assert entry.repo == 'owner/custom-model'
    assert entry.description == 'A fine-tuned speech model.'
    assert 'unsafe.py' not in {item.path for item in entry.files}


def test_different_quantizations_do_not_replace_an_existing_model(tmp_path, monkeypatch):
    monkeypatch.setattr('nola_translator_engine.local_models._http_get', lambda *_: b'Card')
    root = tmp_path / 'installed'
    source = gguf(tmp_path / 'quant.gguf')
    first = import_local(source, root, 'owner/translator')
    source.write_bytes(source.read_bytes()[:-4] + struct.pack('<f', 2))
    second = import_local(source, root, 'owner/translator')
    assert first.resource_id != second.resource_id
    assert first.repo == second.repo
    assert len(CustomModelRegistry(root).all()) == 2
    assert (root / first.resolved_directory / 'quant.gguf').read_bytes() != source.read_bytes()


def test_reimport_preserves_saved_capabilities(tmp_path):
    from dataclasses import replace
    root = tmp_path / 'installed'
    source = snapshot(tmp_path)
    first = import_local(source, root)
    config = ModelConfiguration(slot='recognition', engine='pytorch', languages=['en'], supportsAutoDetection=True, sourceLanguages=[], targetLanguages=[])
    CustomModelRegistry(root).put(replace(first, configuration=config))
    second = import_local(source, root)
    assert second.configuration == config


def test_worker_exposes_custom_import_and_specific_failure_reason(tmp_path):
    import os
    import subprocess
    import sys
    from pathlib import Path
    source = snapshot(tmp_path)
    request = {'operation': 'inspect', 'localImport': True, 'source': str(source), 'modelRoot': str(tmp_path / 'installed')}
    def run():
        result = subprocess.run([sys.executable, '-m', 'nola_translator_engine.offline_models'],
            input=json.dumps(request) + '\n', text=True, capture_output=True, timeout=20,
            env={**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[2])})
        assert result.returncode == 0, result.stderr
        return [json.loads(line) for line in result.stdout.splitlines()][-1]['result']
    assert run()['compatible']
    (source / 'tokenizer.json').unlink()
    result = run()
    assert not result['compatible']
    assert result['items'][0]['reason'] == 'tokenizer.json'


def test_language_directory_matches_renderer_contract():
    import re
    from pathlib import Path
    from nola_translator_engine.model_capabilities import LANGUAGE_CODES, normalize
    from nola_translator_engine.translation.index_translate_languages import LANGUAGE_NAMES
    source = (Path(__file__).resolve().parents[3] / 'src/shared/languages.ts').read_text(encoding='utf-8')
    codes = json.loads(re.search(r'LANGUAGE_CODES: readonly string\[\] = (\[[^\]]+\])', source).group(1))
    assert LANGUAGE_CODES == {normalize(code) for code in codes} | set(LANGUAGE_NAMES)


def test_imported_gguf_is_listed_and_configurable_with_its_companion_template(tmp_path):
    from nola_translator_engine.resources import ResourceManager, ResourceActionError
    folder = tmp_path / 'custom-translator'
    folder.mkdir()
    gguf(folder / 'model.gguf')
    (folder / 'chat_template.jinja').write_text('{{ messages }}')
    root = tmp_path / 'installed'
    entry = import_local(folder, root)
    resources = ResourceManager(root, lambda _: None)
    record = resources.record(entry.resource_id)
    assert record.installed and record.kind == 'translationModel' and record.provider == 'llama.cpp'
    assert record.configuration is None
    config = ModelConfiguration(slot='translation', engine='llama', languages=[], supportsAutoDetection=False, sourceLanguages=['en'], targetLanguages=['ky', 'tg'])
    configured = resources.configure(entry.resource_id, config)
    assert configured.configuration == config
    assert resources.translation_chat_template(entry.resource_id) == '{{ messages }}'
    with pytest.raises(ResourceActionError) as error:
        resources.configure(entry.resource_id, config.model_copy(update={'engine': 'pytorch'}))
    assert error.value.details['reason'] == 'modelLoaderMismatch'


@pytest.mark.asyncio
async def test_remove_failure_keeps_custom_identity_and_reports_remove_phase(tmp_path, monkeypatch):
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'translator.gguf')
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    events = []
    manager = ResourceManager(root, events.append)
    def denied(*args, **kwargs):
        raise PermissionError('file in use')
    monkeypatch.setattr('nola_translator_engine.resources.shutil.rmtree', denied)
    await manager.manage(entry.resource_id, 'remove')
    await manager.tasks[entry.resource_id]
    assert manager.registry.get(entry.resource_id) is not None
    assert events[-1].resource.state == 'failed'
    assert events[-1].resource.phase == 'remove'
    assert events[-1].resource.installed


@pytest.mark.asyncio
async def test_remove_cleans_registry_when_custom_weights_are_already_missing(tmp_path):
    import shutil
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'translator.gguf')
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    shutil.rmtree(root / entry.resolved_directory)
    manager = ResourceManager(root, lambda _: None)
    await manager.manage(entry.resource_id, 'remove')
    await manager.tasks[entry.resource_id]
    assert manager.registry.get(entry.resource_id) is None


def test_legacy_generated_name_is_repaired_without_changing_identity(tmp_path):
    from dataclasses import replace
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'Qwen3-0.6B-Q8_0.gguf')
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    legacy = replace(entry, name=entry.repo.split('/')[-1])
    CustomModelRegistry(root).put(legacy)
    record = ResourceManager(root, lambda _: None).record(entry.resource_id)
    assert record.name == 'Qwen3-0.6B-Q8_0'
    assert record.resourceId == entry.resource_id
    assert not record.description.startswith('local/')


def test_gguf_publisher_name_takes_priority_over_filename(tmp_path):
    source = gguf(tmp_path / 'renamed.gguf', metadata={'general.name': 'Actual publisher model'})
    _, entry = inspect_local(source)
    assert entry.name == 'Actual publisher model'
