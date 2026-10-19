"""Inspect local files and import only after an installed loader runs them successfully."""
from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
from uuid import uuid4

from .hub import _http_get
from .models.manager import hf_endpoint, http_opener, ModelManager
from .models.registry import CustomFile, CustomModelEntry, CustomModelRegistry
from .model_capabilities import LANGUAGE_CODES, normalize


class LocalModelError(ValueError):
    def __init__(self, issue: str, reason: str):
        super().__init__(reason)
        self.issue, self.reason = issue, reason[:2048]


def _json(path: Path) -> dict:
    if not path.is_file():
        return {}
    if path.stat().st_size > 8 * 1024 * 1024:
        raise LocalModelError('invalidPackage', path.name)
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (ValueError, UnicodeError) as error:
        raise LocalModelError('invalidPackage', 'Invalid JSON: ' + path.name) from error
    if not isinstance(value, dict):
        raise LocalModelError('invalidPackage', path.name)
    return value


def _declared_languages(configs: list[dict]) -> tuple[str, ...]:
    """Read explicit ISO/model language codes without guessing from prose or architecture."""
    fields = {
        'language', 'languages', 'supported_languages', 'supportedlanguages',
        'language_codes', 'languagecodes', 'supported_language_codes',
        'source_languages', 'target_languages', 'language_to_id', 'lang_to_id',
        'id_to_language', 'id2lang', 'lang2id',
    }
    found: list[str] = []
    for config in configs:
        for key, value in config.items():
            normalized_key = key.lower()
            if normalized_key not in fields and not normalized_key.endswith('.languages'):
                continue
            candidates = [*value.keys(), *value.values()] if isinstance(value, dict) else value if isinstance(value, list) else [value]
            for candidate in candidates:
                if not isinstance(candidate, str):
                    continue
                code = normalize(candidate)
                if code in LANGUAGE_CODES and code not in found:
                    found.append(code)
    return tuple(found)


def _languages_from_model_card(card: str) -> tuple[str, ...]:
    """Extract explicit ISO codes from a model card's supported-languages table."""
    for line in card.splitlines():
        columns = [column.strip() for column in line.strip().strip('|').split('|')]
        if len(columns) < 2 or not re.search(r'Qwen3-ASR-(?:1\.7B|0\.6B)', columns[0], re.IGNORECASE):
            continue
        found: list[str] = []
        for candidate in re.findall(r'\(([A-Za-z]{2,3})\)', columns[1]):
            code = normalize(candidate)
            if code in LANGUAGE_CODES and code not in found:
                found.append(code)
        if found:
            return tuple(found)
    return ()


def declared_languages_from_snapshot(root: Path, filenames: tuple[str, ...]) -> tuple[str, ...]:
    """Read saved language declarations from an already imported model without hashing its weights."""
    metadata = {}
    ggufs = [root / name for name in filenames if name.lower().endswith('.gguf') and not Path(name).name.lower().startswith('mmproj-')]
    if len(ggufs) == 1 and ggufs[0].is_file():
        try:
            metadata = _gguf(ggufs[0])
        except (OSError, ValueError, struct.error):
            pass
    configs = [_json(root / 'config.json'), metadata]
    for filename in ('tokenizer_config.json', 'processor_config.json', 'generation_config.json'):
        if filename in filenames:
            configs.append(_json(root / filename))
    return _declared_languages(configs)


def _gguf(path: Path) -> dict:
    # Metadata is bounded independently of weight size; never import or execute model code.
    metadata = {}
    with path.open('rb') as reader:
        def read(size):
            if size < 0 or reader.tell() + size > 32 * 1024 * 1024:
                raise LocalModelError('invalidPackage', 'GGUF metadata exceeds 32 MiB')
            data = reader.read(size)
            if len(data) != size:
                raise LocalModelError('missingFiles', 'Truncated GGUF header')
            return data

        def number(fmt):
            return struct.unpack('<' + fmt, read(struct.calcsize('<' + fmt)))[0]

        def string():
            return read(number('Q')).decode('utf-8')

        formats = {0: 'B', 1: 'b', 2: 'H', 3: 'h', 4: 'I', 5: 'i', 6: 'f', 7: '?', 10: 'Q', 11: 'q', 12: 'd'}
        def value(kind, depth=0):
            if depth > 2:
                raise LocalModelError('invalidPackage', 'Nested GGUF metadata')
            if kind == 8:
                return string()
            if kind == 9:
                subtype, count = number('I'), number('Q')
                if count > 1000000:
                    raise LocalModelError('invalidPackage', 'GGUF array is too large')
                items = []
                for _ in range(count):
                    item = value(subtype, depth + 1)
                    if subtype == 8 and count <= 1000:
                        items.append(item)
                return items if subtype == 8 and count <= 1000 else None
            if kind not in formats:
                raise LocalModelError('invalidPackage', 'Unknown GGUF metadata type')
            return number(formats[kind])

        if read(4) != b'GGUF' or number('I') not in (2, 3):
            raise LocalModelError('unsupportedModel', 'Unsupported GGUF format')
        tensors, count = number('Q'), number('Q')
        if not tensors or tensors > 100000 or count > 100000:
            raise LocalModelError('invalidPackage', 'Invalid GGUF header')
        for _ in range(count):
            key = string()
            item = value(number('I'))
            if (key.startswith(('general.', 'clip.', 'split.')) or key.endswith('.embedding_length')) and isinstance(item, (str, int, list)):
                metadata[key] = item
        offsets = []
        for _ in range(tensors):
            string()
            dimensions = number('I')
            if dimensions < 1 or dimensions > 4 or any(number('Q') == 0 for _ in range(dimensions)):
                raise LocalModelError('invalidPackage', 'Invalid GGUF tensor dimensions')
            number('I')
            offsets.append(number('Q'))
        alignment = metadata.get('general.alignment', 32)
        if not isinstance(alignment, int) or alignment < 1 or alignment > 65536 or alignment & (alignment - 1):
            raise LocalModelError('invalidPackage', 'Invalid GGUF alignment')
        data_start = (reader.tell() + alignment - 1) // alignment * alignment
        if any(offset % alignment or data_start + offset >= path.stat().st_size for offset in offsets):
            raise LocalModelError('missingFiles', 'GGUF contains no tensor data')
    return metadata


def _safetensors(path: Path) -> None:
    with path.open('rb') as reader:
        prefix = reader.read(8)
        if len(prefix) != 8:
            raise LocalModelError('missingFiles', 'Truncated safetensors header: ' + path.name)
        size = struct.unpack('<Q', prefix)[0]
        if size < 2 or size > 8 * 1024 * 1024:
            raise LocalModelError('invalidPackage', 'Invalid safetensors header: ' + path.name)
        try:
            header = json.loads(reader.read(size))
        except (ValueError, UnicodeError) as error:
            raise LocalModelError('invalidPackage', 'Invalid safetensors header: ' + path.name) from error
    if not isinstance(header, dict):
        raise LocalModelError('invalidPackage', path.name)
    spans = []
    sizes = {'BOOL': 1, 'I8': 1, 'U8': 1, 'I16': 2, 'U16': 2, 'F16': 2, 'BF16': 2,
             'I32': 4, 'U32': 4, 'F32': 4, 'I64': 8, 'U64': 8, 'F64': 8,
             'F8_E4M3': 1, 'F8_E5M2': 1, 'F8_E4M3FN': 1}
    for name, tensor in header.items():
        if name == '__metadata__':
            continue
        if not isinstance(tensor, dict):
            raise LocalModelError('invalidPackage', path.name)
        offsets, shape, dtype = tensor.get('data_offsets'), tensor.get('shape'), tensor.get('dtype')
        if (not isinstance(offsets, list) or len(offsets) != 2 or not all(isinstance(item, int) for item in offsets)
                or not isinstance(shape, list) or len(shape) > 8 or not all(isinstance(item, int) and 0 <= item <= 2 ** 40 for item in shape)
                or not isinstance(dtype, str) or offsets[0] < 0 or offsets[1] < offsets[0]
                or dtype in sizes and offsets[1] - offsets[0] != math.prod(shape) * sizes[dtype]):
            raise LocalModelError('invalidPackage', 'Invalid safetensors tensor: ' + name)
        spans.append(tuple(offsets))
    cursor = 0
    for start, end in sorted(spans):
        if start != cursor:
            raise LocalModelError('invalidPackage', 'Overlapping or missing tensor data: ' + path.name)
        cursor = end
    if not spans or cursor != path.stat().st_size - 8 - size:
        raise LocalModelError('missingFiles', 'Truncated safetensors data: ' + path.name)


def _gguf_metadata(path: Path) -> dict:
    try:
        return _gguf(path)
    except LocalModelError as error:
        if error.issue == 'missingFiles':
            raise
    except (UnicodeError, struct.error):
        pass
    # Metadata reader limits must not veto formats understood by the installed native loader.
    return {}


def _companion(path: Path) -> bool:
    name = path.stem.casefold()
    return name.startswith('mmproj') or any(part in name for part in ('tokenizer', 'codec', 'voice-', 'vocoder'))


def _local_adapter(config: dict, metadata: dict, names: set[str]) -> tuple[str, str]:
    # These are routing hints, not admission rules. The installed loader makes the final decision.
    if any(name.lower().endswith('.gguf') for name in names):
        if any(Path(name).name.casefold().startswith('mmproj') for name in names):
            return 'llama-asr', 'recognition'
        return 'gguf-auto', 'translation'
    if not config and 'config.yaml' not in names:
        return 'crisp-auto', 'recognition'
    model_type = config.get('model_type')
    if model_type == 'qwen3_asr':
        return 'qwen3-asr', 'recognition'
    if model_type == 'm2m_100':
        return 'm2m100', 'translation'
    if 'config.yaml' in names and any(name.endswith(('.pt', '.pth')) for name in names):
        return 'funasr', 'recognition'
    architectures = ' '.join(str(item) for item in config.get('architectures', []))
    if 'ForCausalLM' in architectures:
        return 'transformers-causal', 'translation'
    return 'transformers-auto', 'translation'


def inspect_local(source: Path, repo: str | None = None, network=None, progress=lambda _: None):
    root = source.parent if source.is_file() else source
    if not root.is_dir() or root.is_symlink() or root.is_junction() or source.is_symlink() or source.is_junction():
        raise LocalModelError('invalidPackage', 'Invalid model directory')
    paths = [source] if source.is_file() else root.rglob('*')
    if source.is_file() and source.suffix.lower() == '.gguf' and not source.name.lower().startswith('mmproj-'):
        exact_projector = root / ('mmproj-' + source.name)
        paths = [source, *(path for path in root.iterdir() if path.is_file() and (_companion(path) or path.name == 'chat_template.jinja')
            and (not path.name.lower().startswith('mmproj') or path == exact_projector or not exact_projector.exists()))]
        shard = re.search(r'-(\d{5})-of-(\d{5})\.gguf$', source.name)
        if shard:
            prefix = source.name[:shard.start()]
            paths.extend(path for path in root.glob(prefix + '-*-of-' + shard[2] + '.gguf') if path != source)
    files = []
    for path in paths:
        if path.is_symlink() or path.is_junction():
            raise LocalModelError('invalidPackage', 'Model files cannot contain links')
        if not path.is_file():
            continue
        name = path.relative_to(root).as_posix()
        if any(part.startswith('.') for part in path.relative_to(root).parts):
            continue
        # Executable repository scripts are not part of a local inference snapshot.
        if path.suffix.lower() in ('.py', '.pyc', '.exe', '.dll', '.bat', '.cmd', '.ps1'):
            continue
        if path.name == 'requirements.txt':
            # Local import never installs repository dependencies into the application's runtime.
            continue
        files.append((path, name))
        if len(files) > 4096:
            raise LocalModelError('invalidPackage', 'Too many model files')
    files.sort(key=lambda item: item[1])
    projectors = [path for path, _ in files if path.suffix.lower() == '.gguf' and path.name.lower().startswith('mmproj-')]
    ggufs = [path for path, _ in files if path.suffix.lower() == '.gguf' and not _companion(path)]
    if source.is_file() and source.suffix.lower() == '.gguf' and not re.search(r'-\d{5}-of-\d{5}\.gguf$', source.name):
        ggufs = [source]
    # llama.cpp resolves the remaining shards from the first shard's filename.
    if len(ggufs) > 1 and all(re.search(r'-\d{5}-of-\d{5}\.gguf$', path.name) for path in ggufs):
        stems = {re.sub(r'-\d{5}-of-\d{5}\.gguf$', '', path.name) for path in ggufs}
        if len(stems) == 1:
            shards = sorted(ggufs)
            count = int(re.search(r'-of-(\d{5})\.gguf$', shards[0].name)[1])
            if len(shards) != count or any(int(re.search(r'-(\d{5})-of-', path.name)[1]) != index for index, path in enumerate(shards, 1)):
                raise LocalModelError('missingFiles', 'Incomplete GGUF shards')
            ggufs = shards[:1]
    metadata = _gguf_metadata(ggufs[0]) if ggufs else {}
    if projectors and not ggufs:
        raise LocalModelError('missingFiles', '请选择一份主 GGUF 权重及其配套 mmproj 音频编码器。')
    matching = next((path for path in projectors if path.name == 'mmproj-' + ggufs[0].name), None) if ggufs else None
    projector = _gguf_metadata(matching or projectors[0]) if matching or len(projectors) == 1 else {}
    embedding = metadata.get(str(metadata.get('general.architecture')) + '.embedding_length')
    projected = projector.get('clip.audio.projection_dim')
    if embedding is not None and projected is not None and embedding != projected:
        raise LocalModelError('invalidPackage', 'mmproj 音频编码器输出维度与主权重不匹配，请选择同一模型的配套文件。')
    config = {} if ggufs else _json(root / 'config.json')
    names = {name for _, name in files}
    native_weights = [path for path, _ in files if path.suffix.lower() in ('.bin', '.ggml', '.ggmf') and not _companion(path)] if not ggufs and not config and 'config.yaml' not in names else []
    if len(native_weights) > 1:
        raise LocalModelError('invalidPackage', 'Select one primary model weight')
    if not ggufs and not native_weights and not config and 'config.yaml' not in names:
        raise LocalModelError('missingFiles', 'config.json / config.yaml')
    if not ggufs and not native_weights and not any(name.endswith(('.safetensors', '.bin', '.pt', '.pth')) for name in names):
        raise LocalModelError('missingFiles', 'Model weights')
    adapter_id, slot = _local_adapter(config, metadata, names)
    if ggufs or native_weights:
        # Store the primary before its auxiliary files; runtime selection reuses this order.
        files.sort(key=lambda item: (item[0] != (ggufs or native_weights)[0], item[1]))
    # GGUF snapshots can still include the original Hugging Face config files.
    # Read their declared language fields as well as GGUF metadata so local GGUF
    # imports can prefill capabilities from the source files when available.
    language_configs = [config, metadata]
    for filename in ('tokenizer_config.json', 'processor_config.json', 'generation_config.json'):
        candidate_path = root / filename
        if candidate_path.is_file():
            language_configs.append(_json(candidate_path))
    languages = _declared_languages(language_configs)
    cached_repo = next((part.removeprefix('models--').replace('--', '/', 1) for part in root.parts if part.startswith('models--') and part.count('--') == 2), None)
    base_model_repo = metadata.get('general.base_model.0.repo_url')
    candidate = repo or cached_repo or config.get('_name_or_path') or metadata.get('general.source.huggingface.repository') or base_model_repo
    if isinstance(candidate, str):
        candidate = candidate.removeprefix('https://huggingface.co/').strip('/')
    if not isinstance(candidate, str) or len(candidate) > 200 or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*/[A-Za-z0-9_-][A-Za-z0-9_.-]*', candidate):
        candidate = 'local/' + re.sub(r'[^A-Za-z0-9_.-]', '-', source.stem)[:60] + '-' + sha256(str(source.resolve()).encode()).hexdigest()[:8]
    hashed = []
    for index, (path, name) in enumerate(files):
        progress({'type': 'progress', 'phase': 'check', 'current': index, 'total': len(files), 'detail': name})
        digest = sha256()
        with path.open('rb') as reader:
            while chunk := reader.read(1024 * 1024):
                digest.update(chunk)
        hashed.append(CustomFile(name, path.stat().st_size, digest.hexdigest()))
    # Sharded indexes are claims about local paths, not permission to read outside the snapshot.
    names = {item.path for item in hashed}
    for path, name in files:
        if name.endswith('.safetensors'):
            _safetensors(path)
        if name.endswith('.index.json'):
            weights = _json(path).get('weight_map', {})
            if not isinstance(weights, dict) or any(value not in names for value in weights.values()):
                raise LocalModelError('missingFiles', 'Missing shards referenced by ' + name)
    fingerprint = sha256(json.dumps(sorted((item.path, item.sha256) for item in hashed)).encode()).hexdigest()
    description = ''
    card_repositories = []
    for card_repo in (candidate, base_model_repo):
        if not isinstance(card_repo, str):
            continue
        card_repo = card_repo.removeprefix('https://huggingface.co/').strip('/')
        if card_repo.startswith('local/') or not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9_.-]*/[A-Za-z0-9_-][A-Za-z0-9_.-]*', card_repo):
            continue
        if card_repo not in card_repositories:
            card_repositories.append(card_repo)
    for card_repo in card_repositories:
        try:
            url = f'{hf_endpoint(network)}/{card_repo}/raw/main/README.md'
            card = _http_get(url, http_opener(network)).decode('utf-8')
            if not languages:
                languages = _languages_from_model_card(card)
            if not description:
                clean_card = re.sub(r'^---\s*\n.*?\n---\s*\n', '', card, count=1, flags=re.S)
                lines = [line.strip() for line in clean_card.splitlines() if line.strip() and not line.lstrip().startswith(('#', '<', '!', '|', '[!'))]
                description = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', ' '.join(lines))[:1000]
        except (OSError, ValueError, UnicodeError):
            continue
    name = metadata.get('general.name')
    if not isinstance(name, str) or not name.strip():
        # Container folders and identity hashes are not model names. GGUF filenames
        # remain meaningful even when the publisher omits general.name.
        name = ggufs[0].stem if ggufs else candidate.split('/')[-1]
    entry = CustomModelEntry(repo=candidate, revision='local-' + fingerprint, adapter_id=adapter_id,
        slot=slot, name=(name if isinstance(name, str) and name else candidate.split('/')[-1])[:200], files=tuple(hashed),
        languages=languages,
        description=description)
    return root, entry


def import_local(source: Path, model_root: Path, repo=None, network=None, progress=lambda _: None, *, inspection=None):
    root, entry = inspection if inspection is not None else inspect_local(source, repo, network, progress)
    model_root.mkdir(parents=True, exist_ok=True)
    target = model_root / entry.resolved_directory
    registry = CustomModelRegistry(model_root)
    previous = registry.get(entry.resource_id)
    # Different local quantizations from one repo must not overwrite one another.
    if previous and previous.revision != entry.revision:
        entry = replace(entry, variant=entry.revision[-8:])
        target = model_root / entry.resolved_directory
        previous = registry.get(entry.resource_id)
    if previous and previous.revision == entry.revision:
        entry = replace(entry, configuration=previous.configuration)
    staging = model_root / ('.local-import-' + uuid4().hex)
    backup = model_root / ('.local-backup-' + uuid4().hex)
    staging.mkdir()
    copied = 0
    try:
        for item in entry.files:
            dest = staging / item.path
            dest.parent.mkdir(parents=True, exist_ok=True)
            with (root / item.path).open('rb') as reader, dest.open('wb') as writer:
                while chunk := reader.read(1024 * 1024):
                    writer.write(chunk)
                    copied += len(chunk)
                    progress({'type': 'progress', 'phase': 'copy', 'current': copied, 'total': entry.total_bytes, 'detail': entry.resource_id})
            ModelManager._verify_file(dest, item.to_entry())
        progress({'type': 'progress', 'phase': 'verify', 'current': 0, 'total': 1, 'detail': entry.resource_id})
        tested = probe_local(staging, entry)
        configuration = previous.configuration if previous and (tested.adapter_id, tested.slot) == (previous.adapter_id, previous.slot) else None
        entry = replace(tested, configuration=configuration)
        progress({'type': 'progress', 'phase': 'verify', 'current': 1, 'total': 1, 'detail': entry.resource_id})
        if target.exists():
            target.rename(backup)
        try:
            staging.rename(target)
        except Exception:
            if backup.exists():
                backup.rename(target)
            raise
        try:
            registry.put(entry)
        except Exception:
            shutil.rmtree(target)
            if backup.exists():
                backup.rename(target)
            raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)
        if backup.exists() and target.exists():
            shutil.rmtree(backup)
    return entry


def _probe_process(bootstrap: str, request: dict) -> subprocess.CompletedProcess:
    args = [sys.executable, '-I', '-X', 'utf8', '-c', bootstrap]
    with subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding='utf-8', errors='replace',
            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0),
            env={**os.environ, 'HF_HUB_OFFLINE': '1', 'TRANSFORMERS_OFFLINE': '1', 'HF_DATASETS_OFFLINE': '1'}) as child:
        try:
            stdout, stderr = child.communicate(json.dumps(request), timeout=300)
        except subprocess.TimeoutExpired:
            # A llama-server belongs to this trial too, and must not survive its timeout.
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(child.pid), '/T', '/F'], capture_output=True,
                    creationflags=subprocess.CREATE_NO_WINDOW, timeout=15)
            child.kill()
            child.communicate()
            raise
        return subprocess.CompletedProcess(args, child.returncode, stdout, stderr)


def probe_local(root: Path, entry: CustomModelEntry) -> CustomModelEntry:
    """Keep native crashes and model allocations outside the import transaction's process."""
    ggufs = [item for index, item in enumerate(entry.files) if item.path.lower().endswith('.gguf')
             and (index == 0 or not _companion(Path(item.path)))
             and (not re.search(r'-\d{5}-of-\d{5}\.gguf$', item.path) or re.search(r'-00001-of-\d{5}\.gguf$', item.path))]
    variants = [replace(entry, files=(weight, *(item for item in entry.files if item != weight))) for weight in ggufs] or [entry]
    errors = []
    paths = [str(path) for path in sys.path]
    bootstrap = (
        f'import os,sys; sys.path[:] = {paths!r}; '
        f'_dirs = {paths!r}; '
        '_handles = [os.add_dll_directory(p) for d in _dirs for p in '
        '(d, os.path.join(d,"Library","bin"), os.path.join(d,"torch","lib"), '
        'os.path.join(d,"crispasr","vulkan")) if os.name == "nt" and os.path.isdir(p)]; '
        'from nola_translator_engine.local_models import _probe_worker; _probe_worker()'
    )
    for variant in variants:
        has_projector = any(Path(item.path).name.lower().startswith('mmproj') for item in variant.files)
        candidates = (['llama-asr' if has_projector else 'llama.cpp', 'crisp-auto']
                      if ggufs else [entry.adapter_id])
        for adapter in candidates:
            result = None
            try:
                result = _probe_process(bootstrap, {'root': str(root), 'entry': variant.to_json(), 'adapter': adapter})
                output = json.loads(result.stdout)
                if result.returncode == 0 and output.get('ok'):
                    name = variant.name
                    if ggufs and variant.files[0] != entry.files[0]:
                        metadata = _gguf_metadata(root / variant.files[0].path)
                        name = str(metadata.get('general.name') or Path(variant.files[0].path).stem)[:200]
                    return replace(variant, adapter_id=output['adapter'], slot=output['slot'], name=name)
                reason = str(output.get('reason', 'Runtime probe failed'))
            except subprocess.TimeoutExpired:
                reason = '模型试运行超过 300 秒。'
            except (OSError, ValueError) as error:
                reason = f'模型加载器异常退出：{error}'
                if result is not None:
                    reason += ' ' + result.stderr[-1000:]
            errors.append(f'{adapter}: {reason[:800]}')
    raise LocalModelError('incompatible', '模型试运行失败：' + '\n'.join(errors[-3:]))


def _transformers_adapter(root: Path, hint: str) -> str:
    import transformers

    config = transformers.AutoConfig.from_pretrained(str(root), local_files_only=True, trust_remote_code=False)
    tasks = (
        ('transformers-asr', 'AutoModelForSpeechSeq2Seq'),
        ('transformers-asr', 'AutoModelForCTC'),
        ('transformers-tts', 'AutoModelForTextToWaveform'),
        ('transformers-tts', 'AutoModelForTextToSpectrogram'),
        ('transformers-causal', 'AutoModelForCausalLM'),
        ('transformers-seq2seq', 'AutoModelForSeq2SeqLM'),
    )
    supported = [adapter for adapter, name in tasks
                 if (loader := getattr(transformers, name, None)) is not None and type(config) in loader._model_mapping]
    if hint in supported:
        return hint
    if not supported:
        raise LocalModelError('unsupportedModel', f'已安装的 Transformers 没有此模型的语音识别、翻译或语音合成加载器：{config.model_type}')
    return supported[0]


def _probe_runtime(root: Path, entry: CustomModelEntry, adapter: str) -> tuple[str, str]:
    import numpy as np

    samples = (np.sin(np.arange(16000, dtype=np.float32) * (440 * 2 * np.pi / 16000)) * 0.1).astype(np.float32)
    if adapter == 'crisp-auto':
        from .recognition.crisp_asr import CrispAsrRuntime, prepare_crisp_synthesis, crisp_capabilities

        weight = next(item for item in entry.files if item.path.lower().endswith(('.gguf', '.bin', '.ggml', '.ggmf')))
        runtime = CrispAsrRuntime(root / weight.path, threads=2, use_vulkan=True)
        try:
            runtime.load()
            session = runtime._session
            capabilities = crisp_capabilities(session)
            try:
                text, _ = runtime.transcribe(samples)
                if not isinstance(text, str):
                    raise ValueError('CrispASR returned an invalid transcription')
            except RuntimeError:
                if capabilities and 'tts' not in capabilities:
                    raise
                prepare_crisp_synthesis(session, root)
                audio = session.synthesize('Hello.')
                if not np.asarray(audio).size or not np.isfinite(audio).all():
                    raise ValueError('CrispASR returned no valid synthesized audio')
                return 'crisp-tts', 'synthesis'
        finally:
            runtime.unload()
        return 'crisp-asr', 'recognition'
    if adapter in ('llama.cpp', 'llama-asr'):
        import asyncio
        from .translation.llama_server import LlamaServerManager, resolve_llama_dir
        from .compute import ComputeOptions, probe_devices
        from .recognition.llama_asr import LlamaAsrRuntime

        weight = next(item for item in entry.files if item.path.lower().endswith('.gguf'))
        manager = LlamaServerManager(gguf_path=root / weight.path)
        devices, _, _ = probe_devices(resolve_llama_dir())
        device = max((item for item in devices if item.llamaDevice), key=lambda item: item.score, default=devices[0])
        manager.configure_compute(device, ComputeOptions())
        template = root / 'chat_template.jinja'
        if template.is_file():
            manager.chat_template = template.read_text(encoding='utf-8')
        projectors = [root / item.path for item in entry.files if Path(item.path).name.lower().startswith('mmproj')]
        projector = next((path for path in projectors if path.name == 'mmproj-' + Path(weight.path).name), projectors[0] if projectors else None)
        manager.mmproj_path = projector

        async def run():
            try:
                await manager.start(timeout_s=120)
                if adapter == 'llama-asr':
                    qwen = projector is not None and _gguf_metadata(projector).get('clip.audio.projector_type') == 'qwen3a'
                    result, _ = await asyncio.to_thread(LlamaAsrRuntime(manager, qwen_format=qwen).transcribe, samples)
                else:
                    result = await asyncio.to_thread(manager.chat_sync,
                        [{'role': 'user', 'content': 'Translate into Chinese. Return only the translation: Hello.'}],
                        timeout_s=120, max_tokens=128)
                if not isinstance(result, str) or adapter == 'llama.cpp' and not result.strip():
                    raise ValueError('llama.cpp returned an invalid result')
            finally:
                await manager.stop()
        asyncio.run(run())
        return adapter, 'recognition' if adapter == 'llama-asr' else 'translation'

    from .compute import probe_devices
    devices, _, _ = probe_devices(None)
    device = max((item for item in devices if item.torchDevice and item.recognition),
                 key=lambda item: item.score, default=devices[0]).torchDevice
    if adapter not in ('qwen3-asr', 'sensevoice', 'funasr', 'm2m100'):
        adapter = _transformers_adapter(root, adapter)
    if adapter == 'transformers-tts':
        from transformers import AutoConfig, AutoModelForTextToWaveform, AutoModelForTextToSpectrogram, pipeline
        from .translation.transformers_causal import load_verified_model
        config = AutoConfig.from_pretrained(str(root), local_files_only=True, trust_remote_code=False)
        loader = AutoModelForTextToWaveform if type(config) in AutoModelForTextToWaveform._model_mapping else AutoModelForTextToSpectrogram
        model = load_verified_model(loader, root)
        synthesizer = pipeline('text-to-audio', model=model, device=device, trust_remote_code=False)
        result = synthesizer('Hello.')
        if not isinstance(result, dict) or not np.asarray(result.get('audio', [])).size:
            raise ValueError('Transformers returned no synthesized audio')
        return adapter, 'synthesis'
    if adapter in ('qwen3-asr', 'sensevoice', 'funasr', 'transformers-asr'):
        from .recognition.qwen_runtime import QwenRuntime, TransformersAsrRuntime
        from .recognition.sensevoice_runtime import SenseVoiceRuntime, FunAsrRuntime
        if adapter == 'qwen3-asr':
            runtime = QwenRuntime(root, quant='none', device=device)
        else:
            runtime_class = {'sensevoice': SenseVoiceRuntime, 'funasr': FunAsrRuntime, 'transformers-asr': TransformersAsrRuntime}[adapter]
            runtime = runtime_class(root, device=device)
        try:
            runtime.load()
            text, _ = runtime.transcribe(samples)
            if not isinstance(text, str):
                raise ValueError('ASR returned an invalid result')
        finally:
            runtime.unload()
        return adapter, 'recognition'

    from .translation.transformers_causal import CausalTranslationRuntime, Seq2SeqTranslationRuntime
    from .translation.m2m100 import M2M100Runtime
    runtime_class = {'m2m100': M2M100Runtime, 'transformers-causal': CausalTranslationRuntime,
                     'transformers-seq2seq': Seq2SeqTranslationRuntime}[adapter]
    runtime = runtime_class(root, device=device)
    try:
        runtime.load()
        pairs = getattr(runtime._bundle.model.config, 'task_specific_params', None) or {}
        pair = next((re.fullmatch(r'translation_(.+)_to_(.+)', key) for key in pairs if re.fullmatch(r'translation_(.+)_to_(.+)', key)), None)
        languages = entry.languages
        source, target = (pair[1], pair[2]) if pair else (languages[0], languages[1]) if len(languages) > 1 else ('en', 'zh')
        text = runtime.translate_sync('Hello.', source, target)
        if not isinstance(text, str) or not text.strip():
            raise ValueError('Translation returned an invalid result')
    finally:
        runtime.unload()
    return adapter, 'translation'


def _probe_worker() -> None:
    request = json.load(sys.stdin)
    # Native libraries also write to fd 1. Preserve a separate protocol descriptor first.
    with os.fdopen(os.dup(sys.stdout.fileno()), 'w', encoding='utf-8') as protocol:
        os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
        sys.stdout = sys.stderr
        try:
            entry = CustomModelEntry.from_json(request['entry'])
            adapter, slot = _probe_runtime(Path(request['root']), entry, request['adapter'])
            output = {'ok': True, 'adapter': adapter, 'slot': slot}
        except Exception as error:
            output = {'ok': False, 'reason': f'{type(error).__name__}: {error}'[:1600]}
        protocol.write(json.dumps(output, ensure_ascii=False))
