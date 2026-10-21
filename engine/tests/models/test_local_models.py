import json
import struct
from dataclasses import replace

import pytest

from nola_translator_engine.local_models import LocalModelError, import_local, inspect_local, probe_local, _transformers_adapter
from nola_translator_engine.models.registry import CustomModelRegistry
from nola_translator_engine.protocol import ModelConfiguration


@pytest.fixture(autouse=True)
def fake_runtime_probe(monkeypatch):
    # The snapshot fixtures contain one dummy tensor; transaction tests stub inference explicitly.
    def probe(root, entry):
        assert (root / entry.files[0].path).is_file()
        return replace(entry, adapter_id='llama.cpp') if entry.adapter_id == 'gguf-auto' else entry
    monkeypatch.setattr('nola_translator_engine.local_models.probe_local', probe)


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


@pytest.mark.parametrize('name', ['sensevoice-small-q4_k.gguf', 'vibevoice-asr-q4_k.gguf'])
def test_voice_in_primary_model_name_is_not_a_companion(tmp_path, name):
    _, entry = inspect_local(gguf(tmp_path / name))
    assert entry.files[0].path == name


def test_asr_gguf_imports_audio_companion_and_retains_llama_configuration(tmp_path):
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'Qwen3-ASR-0.6B-Q8_0.gguf', 'qwen3vl')
    assert inspect_local(source)[1].adapter_id == 'gguf-auto'
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


def test_gguf_architecture_is_deferred_to_the_installed_loaders(tmp_path):
    source = gguf(tmp_path / 'custom.gguf')
    _, entry = inspect_local(source)
    assert (entry.adapter_id, entry.slot) == ('gguf-auto', 'translation')
    source = gguf(source, 'whisper')
    assert inspect_local(source)[1].adapter_id == 'gguf-auto'


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
    (source / 'model.safetensors').unlink()
    result = run()
    assert not result['compatible']
    assert result['items'][0]['reason'] == 'Model weights'


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


def test_failed_trial_leaves_registry_and_existing_model_untouched(tmp_path, monkeypatch):
    root = tmp_path / 'installed'
    source = gguf(tmp_path / 'model.gguf')
    existing = import_local(source, root)
    registry_path = CustomModelRegistry(root).path
    before = registry_path.read_bytes()
    installed = root / existing.resolved_directory / 'model.gguf'
    original = installed.read_bytes()

    def reject(staging, entry):
        assert staging.name.startswith('.local-import-')
        assert (staging / 'model.gguf').read_bytes() == original
        raise LocalModelError('incompatible', 'native loader rejected the tensor layout')

    monkeypatch.setattr('nola_translator_engine.local_models.probe_local', reject)
    with pytest.raises(LocalModelError, match='tensor layout'):
        import_local(source, root)
    assert registry_path.read_bytes() == before
    assert installed.read_bytes() == original
    assert not list(root.glob('.local-*'))


def test_successful_trial_persists_the_actual_loader_and_task(tmp_path, monkeypatch):
    root = tmp_path / 'installed'
    source = gguf(tmp_path / 'speech.gguf', 'unlisted-speech-architecture')
    monkeypatch.setattr('nola_translator_engine.local_models.probe_local',
        lambda _, entry: replace(entry, adapter_id='crisp-asr', slot='recognition'))
    entry = import_local(source, root)
    assert (entry.adapter_id, entry.slot) == ('crisp-asr', 'recognition')
    config = ModelConfiguration(slot='recognition', engine='crisp', languages=['en'],
        supportsAutoDetection=True, sourceLanguages=[], targetLanguages=[])
    from nola_translator_engine.resources import ResourceManager
    ResourceManager(root, lambda _: None).configure(entry.resource_id, config)
    assert CustomModelRegistry(root).get(entry.resource_id).configuration == config


def test_synthesis_trial_is_listed_as_a_tts_model(tmp_path, monkeypatch):
    from nola_translator_engine.resources import ResourceManager
    source = gguf(tmp_path / 'speech.gguf', 'unlisted-synthesis-architecture')
    monkeypatch.setattr('nola_translator_engine.local_models.probe_local',
        lambda _, entry: replace(entry, adapter_id='crisp-tts', slot='synthesis'))
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    assert CustomModelRegistry(root).get(entry.resource_id).slot == 'synthesis'
    assert ResourceManager(root, lambda _: None).record(entry.resource_id).kind == 'ttsModel'


def test_transformers_support_comes_from_the_installed_auto_mapping(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace
    class NewSpeechConfig:
        pass
    config = NewSpeechConfig()
    config.model_type = 'new-speech-architecture'
    calls = []
    def read_config(path, **options):
        calls.append(options)
        return config
    monkeypatch.setitem(sys.modules, 'transformers', SimpleNamespace(
        AutoConfig=SimpleNamespace(from_pretrained=read_config),
        AutoModelForSpeechSeq2Seq=SimpleNamespace(_model_mapping={NewSpeechConfig: object()})))
    assert _transformers_adapter(tmp_path, 'transformers-auto') == 'transformers-asr'
    assert calls == [{'local_files_only': True, 'trust_remote_code': False}]


def test_repository_requirements_do_not_block_builtin_funasr_import(tmp_path):
    source = tmp_path / 'speech'
    source.mkdir()
    (source / 'model.pt').write_bytes(b'weights')
    (source / 'config.yaml').write_text('model: RegisteredSpeechModel')
    (source / 'requirements.txt').write_text('numpy==0.0.0')
    _, entry = inspect_local(source)
    assert entry.adapter_id == 'funasr'
    assert 'requirements.txt' not in {item.path for item in entry.files}


def test_trial_reports_absent_loaders_without_registering_anything(tmp_path):
    import subprocess
    source = gguf(tmp_path / 'model.gguf')
    _, entry = inspect_local(source)
    from unittest.mock import patch
    failure = subprocess.CompletedProcess([], 0, json.dumps({'ok': False, 'reason': 'Runtime component missing'}), '')
    with patch('nola_translator_engine.local_models._probe_process', return_value=failure) as run:
        with pytest.raises(LocalModelError, match='Runtime component missing'):
            probe_local(source.parent, entry)
    assert run.call_count == 2
    assert not CustomModelRegistry(tmp_path).all()


def test_native_crash_does_not_prevent_another_loader_from_accepting_the_model(tmp_path, monkeypatch):
    import subprocess
    source = gguf(tmp_path / 'speech.gguf', 'new-speech-format')
    _, entry = inspect_local(source)
    calls = []
    def run(_, request):
        calls.append(request['adapter'])
        if request['adapter'] == 'llama.cpp':
            return subprocess.CompletedProcess([], 1, '', 'native loader crashed')
        return subprocess.CompletedProcess([], 0, json.dumps({'ok': True, 'adapter': 'crisp-asr', 'slot': 'recognition'}), '')
    monkeypatch.setattr('nola_translator_engine.local_models._probe_process', run)
    assert probe_local(source.parent, entry).adapter_id == 'crisp-asr'
    assert calls == ['llama.cpp', 'crisp-auto']


def test_multifile_native_package_retains_the_primary_accepted_by_the_loader(tmp_path, monkeypatch):
    import subprocess
    source = tmp_path / 'package'
    source.mkdir()
    gguf(source / 'audio-tower.gguf', 'new-audio-architecture')
    gguf(source / 'decoder.gguf', 'new-decoder-architecture')
    _, entry = inspect_local(source)
    def run(_, request):
        primary = request['entry']['files'][0]['path']
        output = {'ok': primary == 'decoder.gguf', 'adapter': 'crisp-asr', 'slot': 'recognition', 'reason': 'not a primary weight'}
        return subprocess.CompletedProcess([], 0, json.dumps(output), '')
    monkeypatch.setattr('nola_translator_engine.local_models._probe_process', run)
    tested = probe_local(source, entry)
    assert tested.files[0].path == 'decoder.gguf'
    assert {item.path for item in tested.files} == {'decoder.gguf', 'audio-tower.gguf'}


def test_legacy_native_weights_are_deferred_to_crispasr(tmp_path):
    source = tmp_path / 'speech.bin'
    source.write_bytes(b'lmgg' + bytes(32))
    assert inspect_local(source)[1].adapter_id == 'crisp-auto'


def test_missing_gguf_shards_are_reported_before_trial(tmp_path):
    source = gguf(tmp_path / 'model-00001-of-00003.gguf')
    gguf(tmp_path / 'model-00003-of-00003.gguf')
    with pytest.raises(LocalModelError, match='Incomplete GGUF shards'):
        inspect_local(source)


def test_imported_audio_runtime_uses_the_tested_primary_and_its_projector(tmp_path):
    from nola_translator_engine.resources import ResourceManager
    source = tmp_path / 'speech'
    source.mkdir()
    gguf(source / 'model.gguf', 'qwen3vl')
    for name in ('mmproj-model.gguf', 'mmproj-other-quant.gguf'):
        gguf(source / name, 'clip', {'clip.has_audio_encoder': True, 'clip.audio.projector_type': 'qwen3a'})
    root = tmp_path / 'installed'
    entry = import_local(source, root)
    resources = ResourceManager(root, lambda _: None)
    assert resources.translation_gguf_path(entry.resource_id).name == 'model.gguf'
    assert resources.audio_projector_path(entry.resource_id).name == 'mmproj-model.gguf'


def test_multilingual_tokenizer_uses_its_native_language_tags():
    from types import SimpleNamespace
    from nola_translator_engine.translation.transformers_causal import tokenizer_language
    tokenizer = SimpleNamespace(additional_special_tokens=['eng_Latn', 'fra_Latn', 'zho_Hans', 'zho_Hant'])
    assert tokenizer_language(tokenizer, 'en') == 'eng_Latn'
    assert tokenizer_language(tokenizer, 'fr') == 'fra_Latn'
    assert tokenizer_language(tokenizer, 'zh-CN') == 'zho_Hans'
    assert tokenizer_language(tokenizer, 'zh-TW') == 'zho_Hant'


def test_missing_parameters_are_not_validated_by_randomly_initialized_inference(tmp_path):
    from types import SimpleNamespace
    from nola_translator_engine.translation.transformers_causal import load_verified_model
    loader = SimpleNamespace(from_pretrained=lambda *args, **options: (object(), {'missing_keys': ['encoder.weight']}))
    with pytest.raises(ValueError, match='missing parameters'):
        load_verified_model(loader, tmp_path)


@pytest.mark.parametrize('modern_pipeline', [False, True])
def test_asr_pipeline_accepts_preloaded_local_components_across_transformers_versions(tmp_path, monkeypatch, modern_pipeline):
    import sys
    from types import SimpleNamespace
    import numpy as np
    from nola_translator_engine.recognition.qwen_runtime import TransformersAsrRuntime
    model, tokenizer, extractor = object(), object(), object()
    observed = []
    def pipeline(task, model, tokenizer, feature_extractor, device, trust_remote_code, dtype):
        observed.append((task, model, tokenizer, feature_extractor, dtype))
        return lambda audio: {'text': 'Decoded audio'}
    def legacy_pipeline(task, model, tokenizer, feature_extractor, device, trust_remote_code, torch_dtype):
        return pipeline(task, model, tokenizer, feature_extractor, device, trust_remote_code, torch_dtype)
    def component(value):
        def load(path, *, local_files_only, trust_remote_code):
            assert path == str(tmp_path) and local_files_only and not trust_remote_code
            return value
        return SimpleNamespace(from_pretrained=load)
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(set_num_threads=lambda _: None, float32='float32'))
    monkeypatch.setitem(sys.modules, 'transformers', SimpleNamespace(
        AutoConfig=component(SimpleNamespace()), AutoFeatureExtractor=component(extractor),
        AutoTokenizer=component(tokenizer), AutoModelForSpeechSeq2Seq=SimpleNamespace(_model_mapping={}),
        AutoModelForCTC=SimpleNamespace(from_pretrained=lambda *args, **options: (model, {})),
        pipeline=pipeline if modern_pipeline else legacy_pipeline))
    runtime = TransformersAsrRuntime(tmp_path)
    assert runtime.transcribe(np.zeros(1600, dtype=np.float32), language='en') == ('Decoded audio', 'en')
    assert observed == [('automatic-speech-recognition', model, tokenizer, extractor, 'float32')]
    runtime.unload()


def test_crisp_model_with_asr_and_tts_capabilities_keeps_working_recognition(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from nola_translator_engine.local_models import _probe_runtime
    source = gguf(tmp_path / 'speech.gguf')
    _, entry = inspect_local(source)
    closed = []
    class Runtime:
        def __init__(self, *args, **options):
            self._session = SimpleNamespace()
        def load(self):
            pass
        def transcribe(self, samples):
            return 'Recognized speech', 'en'
        def unload(self):
            closed.append(True)
    monkeypatch.setattr('nola_translator_engine.recognition.crisp_asr.CrispAsrRuntime', Runtime)
    monkeypatch.setattr('nola_translator_engine.recognition.crisp_asr.crisp_capabilities', lambda _: {'tts', 'translate'})
    assert _probe_runtime(tmp_path, entry, 'crisp-auto') == ('crisp-asr', 'recognition')
    assert closed == [True]
