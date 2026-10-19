"""Isolated JSONL worker for local model compatibility and portable resource packages."""
from __future__ import annotations

from dataclasses import asdict, replace
import json
from pathlib import Path
import sys
import time
from typing import Callable

from .models import catalog
from .models.manager import ModelIntegrityError, ModelManager, ModelSpec
from .protocol import NetworkSettings

Progress = Callable[[dict], None]
MAX_REQUEST_BYTES = 1024 * 1024
MAX_PACKAGE_MODELS = 16


class OfflineError(RuntimeError):
    def __init__(self, issue: str, reason: str | None = None):
        super().__init__(reason or issue)
        self.issue, self.reason = issue, reason


def catalog_specs() -> dict[str, ModelSpec]:
    return {value.model_id: value for value in vars(catalog).values()
            if isinstance(value, ModelSpec)}


def _local(path: Path, root: Path) -> bool:
    # Reparse points can escape a portable package even when its lexical path is safe.
    try:
        path.resolve().relative_to(root.resolve())
        current = path
        while current != root.parent:
            if current.is_symlink() or current.is_junction():
                return False
            if current == root:
                return True
            current = current.parent
    except (ValueError, OSError):
        pass
    return False


def _record(spec: ModelSpec, source: str) -> dict:
    return {"id": spec.model_id, "source": source, "directory": spec.directory,
            "files": [asdict(entry) for entry in spec.files_for(source)]}


def _selections(source: Path) -> list[tuple[ModelSpec, str, Path]]:
    specs = catalog_specs()
    model_manifest = source / "model-manifest.json" if source.is_dir() else None
    if source.is_dir() and (model_manifest is None or not model_manifest.exists()):
        try:
            children = [child for child in source.iterdir() if child.is_dir() and not child.is_symlink() and not child.is_junction()]
            if len(children) == 1:
                model_manifest = children[0] / "model-manifest.json"
        except OSError:
            pass
    if model_manifest is not None and model_manifest.exists():
        try:
            if not _local(model_manifest, source) or model_manifest.stat().st_size > MAX_REQUEST_BYTES:
                raise ValueError()
            data = json.loads(model_manifest.read_text(encoding="utf-8"))
            spec = specs[data["id"]]
            variant = data["source"]
            if variant not in ("huggingface", "hf-mirror", "modelscope"):
                raise ValueError()
            catalog_source = "modelscope" if variant == "modelscope" else "huggingface"
            if variant == "modelscope" and not spec.modelscope_files:
                raise ValueError()
            if data != {"version": 1, "id": spec.model_id, "source": variant,
                        "files": [asdict(entry) for entry in spec.files_for(catalog_source)]}:
                raise ValueError()
            directory = model_manifest.parent
            if directory.name != spec.directory or not _local(directory, source):
                raise ValueError()
            return [(spec, variant, directory)]
        except (ValueError, KeyError, TypeError, OSError) as error:
            raise OfflineError("invalidPackage") from error
    inventory = source / "models.json" if source.is_dir() else None
    if inventory is not None and inventory.exists():
        try:
            if not _local(inventory, source) or inventory.stat().st_size > MAX_REQUEST_BYTES:
                raise ValueError()
            with inventory.open("rb") as reader:
                contents = reader.read(MAX_REQUEST_BYTES + 1)
            if len(contents) > MAX_REQUEST_BYTES:
                raise ValueError()
            data = json.loads(contents)
            if (not isinstance(data, dict) or data.get("version") != 1
                    or not isinstance(data.get("models"), list)
                    or len(data["models"]) > MAX_PACKAGE_MODELS):
                raise ValueError()
            selected = []
            seen = set()
            for record in data["models"]:
                spec = specs[record["id"]]
                variant = record["source"]
                if variant not in ("huggingface", "modelscope") or spec.model_id in seen:
                    raise ValueError()
                if record != _record(spec, variant):
                    raise ValueError()
                directory = source / "models" / spec.directory
                if not _local(directory, source):
                    raise ValueError()
                seen.add(spec.model_id)
                selected.append((spec, variant, directory))
            return selected
        except (ValueError, KeyError, TypeError, OSError) as error:
            raise OfflineError("invalidPackage") from error
    directory = source.parent if source.is_file() else source
    candidates = []
    for spec in specs.values():
        manifests = set()
        for variant in ("huggingface", "modelscope"):
            if variant == "modelscope" and not spec.modelscope_files:
                continue
            entries = spec.files_for(variant)
            if entries in manifests:
                continue
            manifests.add(entries)
            if source.is_file():
                matches = any(entry.path == source.name for entry in entries)
            else:
                matches = directory.name == spec.directory or any(
                    (directory / entry.path).exists() for entry in entries
                    if entry.path.endswith((".gguf", ".safetensors", ".bin", ".pt")))
            if matches:
                candidates.append((spec, variant, directory))
    # Identical variants are common; retain one candidate per model, preferring a valid one.
    selected = {}
    checks = {}
    def check(candidate):
        key = (candidate[0].model_id, candidate[1])
        if key not in checks:
            checks[key] = _check(*candidate)
        return checks[key]
    for candidate in candidates:
        spec, _, _ = candidate
        if spec.model_id not in selected or not check(candidate)[0]:
            selected[spec.model_id] = candidate
    valid = [candidate for candidate in selected.values() if not check(candidate)[0]]
    if valid:
        return valid
    exact = [candidate for candidate in selected.values() if directory.name == candidate[0].directory]
    if exact:
        return exact
    if not selected:
        return []
    # Shared names such as model.safetensors must not manufacture several broken models.
    return [min(selected.values(), key=lambda candidate: len(check(candidate)[1]))]


def _check(spec: ModelSpec, variant: str, directory: Path,
           progress: Progress = lambda _: None) -> tuple[str | None, list[str]]:
    missing, corrupt = [], []
    entries = spec.files_for(variant)
    for index, entry in enumerate(entries):
        path = directory / entry.path
        progress({"type": "progress", "phase": "check", "current": index,
                  "total": len(entries), "detail": spec.model_id})
        if not _local(path, directory) or not path.is_file():
            missing.append(entry.path)
            continue
        try:
            ModelManager._verify_file(path, entry)
        except ModelIntegrityError:
            corrupt.append(entry.path)
    return (("missingFiles", missing) if missing else
            ("checksumMismatch", corrupt) if corrupt else (None, []))


def inspect(source: Path, model_root: Path, progress: Progress = lambda _: None) -> dict:
    selections = _selections(source)
    items = []
    for spec, variant, directory in selections:
        issue, files = _check(spec, variant, directory, progress)
        installed_issue, _ = _check(spec, "modelscope" if variant == "modelscope" else "huggingface", model_root / spec.directory)
        item = {"id": spec.model_id, "name": spec.model_id, "kind": "model",
                "bytes": sum(entry.size for entry in spec.files_for(variant)),
                "status": "invalid" if issue else "installed" if not installed_issue else "ready"}
        if issue:
            item.update(issue=issue, files=files)
        items.append(item)
    issues = list(dict.fromkeys(item["issue"] for item in items if "issue" in item))
    if not selections and not (source / "models.json").is_file():
        issues = ["unsupportedModel"]
    return {"items": items, "totalBytes": sum(item["bytes"] for item in items),
            "issues": issues, "compatible": not issues}


def install(source: Path, model_root: Path, model_ids: list[str] | None = None,
            progress: Progress = lambda _: None) -> dict:
    preview = inspect(source, model_root, progress)
    if preview["issues"]:
        raise OfflineError(preview["issues"][0])
    for spec, variant, directory in _selections(source):
        if model_ids is not None and spec.model_id not in model_ids:
            continue
        if not _check(spec, variant, model_root / spec.directory)[0]:
            continue
        entries = {spec.url_for(entry, source=variant): entry for entry in spec.files_for(variant)}

        def copy(url, target, callback):
            entry = entries[url]
            _copy(directory / entry.path, target, callback, entry.size)

        manager = ModelManager(model_root, copy)
        manager.cleanup_stale([spec])
        # is_installed deliberately checks sizes only; an import must replace corrupt same-size files.
        manager.is_installed = lambda _: False
        manager.ensure(spec, source=variant, progress=lambda current, total: progress(
            {"type": "progress", "phase": "copy", "current": current, "total": total,
             "detail": spec.model_id}))
    return inspect(source, model_root)


def _copy(source: Path, target: Path, callback, total: int) -> None:
    copied = 0
    with source.open("rb") as reader, target.open("wb") as writer:
        while chunk := reader.read(1024 * 1024):
            writer.write(chunk)
            copied += len(chunk)
            callback(copied, total)


def prepare(model_ids: list[str], model_root: Path, destination: Path,
            network: NetworkSettings | None = None, progress: Progress = lambda _: None,
            model_source: str | None = None, export_model: bool = False) -> dict:
    specs = catalog_specs()
    if any(model_id not in specs for model_id in model_ids):
        raise OfflineError("unsupportedModel")
    destination.mkdir(parents=True, exist_ok=True)
    package_root = destination / "models"
    if not _local(package_root, destination):
        raise OfflineError("invalidPackage")
    records = []
    for model_id in dict.fromkeys(model_ids):
        spec = specs[model_id]
        variant = model_source or "huggingface"
        if variant not in ("huggingface", "hf-mirror", "modelscope"):
            raise OfflineError("unsupportedModel")
        if variant == "modelscope" and not spec.modelscope_files:
            raise OfflineError("unsupportedModel")
        catalog_source = "modelscope" if variant == "modelscope" else "huggingface"
        installed = model_root / spec.directory
        if not export_model and not _check(spec, catalog_source, installed)[0]:
            install(installed, package_root, [model_id], progress)
        else:
            manager = ModelManager(package_root, cache_root=model_root)
            manager.cleanup_stale([spec])
            if _check(spec, catalog_source, package_root / spec.directory)[0]:
                manager.is_installed = lambda _: False
            selected_network = network
            if variant == "hf-mirror":
                selected_network = NetworkSettings.model_validate({**(network.model_dump() if network else {}), "huggingFaceEndpoint": "https://hf-mirror.com"})
            manager.ensure(spec, network=selected_network, source="modelscope" if variant == "modelscope" else None,
                           progress=lambda current, total: progress({"type": "progress",
                               "phase": "download", "current": current, "total": total,
                               "detail": model_id}))
        catalog_source = "modelscope" if variant == "modelscope" else "huggingface"
        issue, _ = _check(spec, catalog_source, package_root / spec.directory, progress)
        if issue:
            raise OfflineError(issue)
        records.append(_record(spec, catalog_source))
    inventory = destination / "models.json"
    if not _local(inventory, destination):
        raise OfflineError("invalidPackage")
    temporary = destination / ".models.json.tmp"
    if not _local(temporary, destination):
        raise OfflineError("invalidPackage")
    temporary.write_text(json.dumps({"version": 1, "models": records}, indent=2), encoding="utf-8")
    temporary.replace(inventory)
    if export_model and len(records) == 1:
        record = records[0]
        source_name = "modelscope" if model_source == "modelscope" else "huggingface"
        catalog_source = "modelscope" if source_name == "modelscope" else "huggingface"
        model_manifest = destination / "models" / specs[record["id"]].directory / "model-manifest.json"
        model_manifest.write_text(json.dumps({"version": 1, "id": record["id"], "source": source_name,
            "files": [asdict(entry) for entry in specs[record["id"]].files_for(catalog_source)]}, indent=2), encoding="utf-8")
        (destination / "models.json").unlink(missing_ok=True)
    return inspect(destination, model_root)


def main() -> None:
    last_progress = 0.0
    last_phase = ""
    def emit(value: dict) -> None:
        nonlocal last_progress, last_phase
        if value.get("type") == "progress":
            now = time.monotonic()
            phase = value["phase"]
            if phase == last_phase and now - last_progress < 0.2:
                return
            last_progress, last_phase = now, phase
        print(json.dumps(value, ensure_ascii=False), flush=True)
    try:
        contents = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
        if len(contents) > MAX_REQUEST_BYTES:
            raise OfflineError("invalidPackage")
        request = json.loads(contents)
        root = Path(request["modelRoot"])
        operation = request["operation"]
        if request.get("localImport") and operation in ("inspect", "install"):
            from .local_models import inspect_local, import_local, probe_local, LocalModelError
            source = Path(request["source"])
            network = NetworkSettings.model_validate(request["network"]) if request.get("network") else None
            try:
                # Byte matching establishes identity only; every selected model also clears loader compatibility.
                try:
                    known = _selections(source)
                    known = [item for item in known if not _check(*item)[0]]
                except OfflineError:
                    known = []
                local_source = known[0][2] if known else source
                directory, entry = inspect_local(local_source,
                    request.get("repo"), network, emit)
                if known and not entry.repo.startswith("local/"):
                    known = [item for item in known if entry.repo in (item[0].repo, item[0].modelscope_repo)]
                if known:
                    if operation == "install":
                        for spec, variant, known_directory in known:
                            expected = {item.path for item in spec.files_for('modelscope' if variant == 'modelscope' else 'huggingface')}
                            selected = replace(entry, files=tuple(item for item in entry.files if item.path in expected))
                            probe_local(known_directory, selected)
                    result = install(source, root, progress=emit) if operation == "install" else inspect(source, root, emit)
                else:
                    if operation == "install":
                        entry = import_local(local_source, root, request.get("repo"), network, emit, inspection=(directory, entry))
                    result = {"items": [{"id": entry.resource_id, "name": entry.name, "kind": "model",
                        "bytes": entry.total_bytes, "status": "ready"}], "totalBytes": entry.total_bytes,
                        "issues": [], "compatible": True}
            except LocalModelError as error:
                result = {"items": [{"id": "local", "name": source.name, "kind": "model", "bytes": 0,
                    "status": "invalid", "issue": error.issue, "reason": error.reason[:2048]}],
                    "totalBytes": 0, "issues": [error.issue], "compatible": False}
                if operation == "install":
                    raise OfflineError(error.issue, error.reason) from error
        elif operation == "inspect":
            result = inspect(Path(request["source"]), root, emit)
        elif operation == "install":
            result = install(Path(request["source"]), root, request.get("modelIds"), emit)
        elif operation == "prepare":
            network = NetworkSettings.model_validate(request["network"]) if request.get("network") else None
            result = prepare(request["modelIds"], root, Path(request["destination"]), network, emit,
                             request.get("modelSource"), request.get("exportModel", False))
        else:
            raise OfflineError("failed")
        emit({"type": "result", "result": result})
    except Exception as error:
        emit({"type": "error", "issue": error.issue if isinstance(error, OfflineError) else "failed",
              "reason": error.reason if isinstance(error, OfflineError) else None})
        sys.exit(1)


if __name__ == "__main__":
    main()
