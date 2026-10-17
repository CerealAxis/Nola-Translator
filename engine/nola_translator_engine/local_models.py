"""Inspect local snapshots with the same loader rules used for Hugging Face models."""
from __future__ import annotations

from dataclasses import replace
from hashlib import sha256
import json
import math
from pathlib import Path
import re
import shutil
import struct
from uuid import uuid4

from .hub import HubFile, HubRepoInfo, detect_runtime, _http_get
from .models.manager import hf_endpoint, http_opener, ModelManager
from .models.registry import CustomFile, CustomModelEntry, CustomModelRegistry
from .model_capabilities import LANGUAGE_CODES, normalize


class LocalModelError(ValueError):
    def __init__(self, issue: str, reason: str):
        super().__init__(reason)
        self.issue, self.reason = issue, reason


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
            if (key.startswith(('general.', 'clip.')) or key.endswith('.embedding_length')) and isinstance(item, (str, int, list)):
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
                or not isinstance(dtype, str) or dtype not in sizes or offsets[0] < 0 or offsets[1] < offsets[0]
                or offsets[1] - offsets[0] != math.prod(shape) * sizes[dtype]):
            raise LocalModelError('invalidPackage', 'Invalid safetensors tensor: ' + name)
        spans.append(tuple(offsets))
    cursor = 0
    for start, end in sorted(spans):
        if start != cursor:
            raise LocalModelError('invalidPackage', 'Overlapping or missing tensor data: ' + path.name)
        cursor = end
    if not spans or cursor != path.stat().st_size - 8 - size:
        raise LocalModelError('missingFiles', 'Truncated safetensors data: ' + path.name)


def inspect_local(source: Path, repo: str | None = None, network=None, progress=lambda _: None):
    root = source.parent if source.is_file() else source
    if not root.is_dir() or root.is_symlink() or root.is_junction() or source.is_symlink() or source.is_junction():
        raise LocalModelError('invalidPackage', 'Invalid model directory')
    paths = [source] if source.is_file() else root.rglob('*')
    if source.is_file() and source.suffix.lower() == '.gguf' and not source.name.lower().startswith('mmproj-'):
        # Resolve only the exact companion, never guess among unrelated quantizations.
        companion = root / ('mmproj-' + source.name)
        if companion.is_file():
            paths = [source, companion]
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
        files.append((path, name))
        if len(files) > 4096:
            raise LocalModelError('invalidPackage', 'Too many model files')
    files.sort(key=lambda item: item[1])
    projectors = [path for path, _ in files if path.suffix.lower() == '.gguf' and path.name.lower().startswith('mmproj-')]
    ggufs = [path for path, _ in files if path.suffix.lower() == '.gguf' and path not in projectors]
    if len(ggufs) > 1:
        raise LocalModelError('unsupportedModel', 'Select one GGUF file, not a directory with multiple quantizations')
    metadata = _gguf(ggufs[0]) if ggufs else {}
    if projectors and (not ggufs or len(projectors) != 1):
        raise LocalModelError('missingFiles', '请选择一份主 GGUF 权重及其配套 mmproj 音频编码器。')
    projector = _gguf(projectors[0]) if projectors else {}
    if projectors and (not projector.get('clip.has_audio_encoder') or projector.get('clip.audio.projector_type') != 'qwen3a'):
        raise LocalModelError('unsupportedModel', '当前音频加载器需要 Qwen3-ASR 的 qwen3a 音频编码器。')
    embedding = metadata.get(str(metadata.get('general.architecture')) + '.embedding_length')
    projected = projector.get('clip.audio.projection_dim')
    if embedding is not None and projected is not None and embedding != projected:
        raise LocalModelError('invalidPackage', 'mmproj 音频编码器输出维度与主权重不匹配，请选择同一模型的配套文件。')
    config = {} if ggufs else _json(root / 'config.json')
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
    info = HubRepoInfo(repo=candidate, revision='local',
        files=tuple(HubFile(item.path, item.size, item.sha256) for item in hashed),
        model_type=config.get('model_type'), architectures=tuple(config.get('architectures', [])),
        gguf_architecture=metadata.get('general.architecture'), gguf_audio_projector=projector.get('clip.audio.projector_type'))
    verdict = detect_runtime(info)
    if not verdict.compatible:
        issue = 'missingFiles' if verdict.reason_code in ('missingRequiredFiles', 'missingWeights') else 'unsupportedModel'
        raise LocalModelError(issue, verdict.reason)
    if verdict.adapter_id == 'm2m100' and 'sentencepiece.bpe.model' not in {name for _, name in files}:
        raise LocalModelError('missingFiles', 'sentencepiece.bpe.model')
    if verdict.adapter_id == 'qwen3-asr' and 'tokenizer.json' not in {name for _, name in files}:
        raise LocalModelError('missingFiles', 'tokenizer.json')
    # Sharded indexes are claims about local paths, not permission to read outside the snapshot.
    names = {item.path for item in hashed}
    for path, name in files:
        if name.endswith('.safetensors'):
            _safetensors(path)
        if name.endswith('.index.json'):
            weights = _json(path).get('weight_map', {})
            if not isinstance(weights, dict) or any(value not in names for value in weights.values()):
                raise LocalModelError('missingFiles', 'Missing shards referenced by ' + name)
    fingerprint = sha256(json.dumps([(item.path, item.sha256) for item in hashed]).encode()).hexdigest()
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
    entry = CustomModelEntry(repo=candidate, revision='local-' + fingerprint, adapter_id=verdict.adapter_id,
        slot=verdict.slot, name=(name if isinstance(name, str) and name else candidate.split('/')[-1])[:200], files=tuple(hashed),
        languages=languages,
        description=description)
    return root, entry


def import_local(source: Path, model_root: Path, repo=None, network=None, progress=lambda _: None):
    root, entry = inspect_local(source, repo, network, progress)
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
