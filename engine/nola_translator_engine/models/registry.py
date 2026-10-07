"""Persistent registry of models the user installed from Hugging Face, so a self-installed model
is a first-class resource instead of a directory nothing in the engine can address.

Why a registry is needed at all
-------------------------------
``resources.py`` answers ``listResources()`` from a static table, and the runtime refuses any
session naming a model id that table has never heard of. A self-installed model is by definition
absent from a hand-written table, so without this file the download would succeed and the model
would still be unusable. The registry is what turns "a repo the user picked" into a
``resourceId`` the rest of the engine — and the renderer — can name.

Identity
--------
``resourceId`` is ``hub:<owner>/<name>``: the spelling the renderer's model-brand helper already
parses, and reversible, because the id minus the prefix *is* the repo. The on-disk directory is
a separate derived name for two reasons that both bite on real machines — the ``/`` is not a
legal folder separator, and Windows folds case, so ``Owner/Name`` and ``owner/name`` would
otherwise share one directory. The digest suffix keeps distinct repos apart even after the
human-readable part has been truncated to stay inside Windows path limits.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha1
import json
import os
from pathlib import Path
import re
from typing import Literal

from .manager import FileEntry, ModelSpec
from ..protocol import ModelConfiguration
from ..model_capabilities import LANGUAGE_CODES, normalize, supports_translation


CUSTOM_REGISTRY_FILENAME = ".custom-models.json"
CUSTOM_RESOURCE_PREFIX = "hub:"
REGISTRY_VERSION = 1

Slot = Literal["recognition", "translation"]

#: Long enough to stay readable, short enough that the whole directory name still fits inside
#: Windows' path budget once the models root and a long repo name are prepended.
_DIRECTORY_SLUG_LIMIT = 48

_UNSAFE_DIRECTORY_CHARS = re.compile(r"[^A-Za-z0-9._-]+")


class RegistryError(RuntimeError):
    """The registry file exists but cannot be read as one. Never silently ignored."""


def resource_id_for_repo(repo: str) -> str:
    return f"{CUSTOM_RESOURCE_PREFIX}{repo}"


def repo_for_resource_id(resource_id: str) -> str | None:
    """The repo a resource id names, or ``None`` when the id is not a hub id.

    The inverse of :func:`resource_id_for_repo`; that reversibility is the whole reason the id
    carries the repo instead of a hash, since the renderer has to be able to show which repo a
    listed model came from without a second round trip.
    """
    if not resource_id.startswith(CUSTOM_RESOURCE_PREFIX):
        return None
    repo = resource_id[len(CUSTOM_RESOURCE_PREFIX) :]
    return repo or None


def directory_for_repo(repo: str) -> str:
    """A stable, filesystem-safe directory name for a repo, distinct per repo.

    Stable because the registry records it at install time anyway; derived because recomputing it
    for a repo that is already installed has to land on the same folder.
    """
    slug = _UNSAFE_DIRECTORY_CHARS.sub("-", repo.replace("/", "--"))
    if len(slug) > _DIRECTORY_SLUG_LIMIT:
        slug = slug[:_DIRECTORY_SLUG_LIMIT].rstrip("-.")
    # Hashed over the exact repo string rather than its casefold: on a case-insensitive
    # filesystem `Owner/Name` and `owner/name` would otherwise produce one directory, and
    # silently sharing a folder between two different repos is worse than a long name.
    digest = sha1(repo.encode("utf-8")).hexdigest()[:8]
    return f"hub-{slug}-{digest}"


@dataclass(frozen=True, slots=True)
class CustomFile:
    path: str
    size: int
    sha256: str | None = None
    blob_sha1: str | None = None

    def to_entry(self) -> FileEntry:
        return FileEntry(self.path, self.size, self.sha256, self.blob_sha1)

    @classmethod
    def from_json(cls, raw: object) -> CustomFile:
        if not isinstance(raw, dict):
            raise RegistryError("自定义模型注册表的 files 项不是对象")
        path = raw.get("path")
        size = raw.get("size")
        if not isinstance(path, str) or not path or not isinstance(size, int) or size < 0:
            raise RegistryError("自定义模型注册表的文件项缺少 path/size")
        sha256 = raw.get("sha256")
        blob_sha1 = raw.get("blobSha1")
        if not isinstance(sha256, str) and not isinstance(blob_sha1, str):
            # A file with no digest at all would install on size alone. Refusing the entry is
            # the only safe reading: the alternative is a silently unverifiable model.
            raise RegistryError(f"自定义模型的文件 {path} 没有任何摘要")
        return cls(
            path=path,
            size=size,
            sha256=sha256 if isinstance(sha256, str) else None,
            blob_sha1=blob_sha1 if isinstance(blob_sha1, str) else None,
        )

    def to_json(self) -> dict[str, object]:
        return {
            "path": self.path,
            "size": self.size,
            "sha256": self.sha256,
            "blobSha1": self.blob_sha1,
        }


@dataclass(frozen=True, slots=True)
class CustomModelEntry:
    """One self-installed model: enough to verify it, reinstall it, and pick a loader for it."""

    repo: str
    revision: str
    adapter_id: str
    slot: Slot
    name: str
    files: tuple[CustomFile, ...]
    directory: str = ""
    languages: tuple[str, ...] = ()
    configuration: ModelConfiguration | None = None

    @property
    def resource_id(self) -> str:
        return resource_id_for_repo(self.repo)

    @property
    def resolved_directory(self) -> str:
        return self.directory or directory_for_repo(self.repo)

    @property
    def total_bytes(self) -> int:
        return sum(item.size for item in self.files)

    def spec(self) -> ModelSpec:
        """The download spec handed to ``ModelManager.ensure`` — pinned to this exact revision."""
        return ModelSpec(
            model_id=self.resource_id,
            directory=self.resolved_directory,
            repo=self.repo,
            revision=self.revision,
            files=tuple(item.to_entry() for item in self.files),
        )

    @classmethod
    def from_json(cls, raw: object) -> CustomModelEntry:
        if not isinstance(raw, dict):
            raise RegistryError("自定义模型注册表的条目不是对象")
        repo = raw.get("repo")
        revision = raw.get("revision")
        adapter_id = raw.get("adapterId")
        slot = raw.get("slot")
        name = raw.get("name")
        files = raw.get("files")
        if not isinstance(repo, str) or not repo:
            raise RegistryError("自定义模型注册表条目缺少 repo")
        if not isinstance(revision, str) or not revision:
            raise RegistryError(f"自定义模型 {repo} 没有固定 revision")
        if not isinstance(adapter_id, str) or not adapter_id:
            raise RegistryError(f"自定义模型 {repo} 没有记录适配器")
        if slot not in ("recognition", "translation"):
            raise RegistryError(f"自定义模型 {repo} 的 slot 非法：{slot!r}")
        if not isinstance(files, list) or not files:
            raise RegistryError(f"自定义模型 {repo} 没有文件清单")
        directory = raw.get("directory")
        languages = raw.get("languages")
        configuration = None
        # Incomplete capabilities must not make an otherwise manageable download disappear.
        if raw.get("configuration"):
            try:
                candidate = ModelConfiguration.model_validate(raw["configuration"])
                required = [candidate.languages] if slot == "recognition" else [candidate.sourceLanguages, candidate.targetLanguages]
                codes = candidate.languages + candidate.sourceLanguages + candidate.targetLanguages
                valid_pairs = candidate.translationPairs is None or bool(candidate.translationPairs) and all(supports_translation(candidate, pair.source, pair.target) for pair in candidate.translationPairs)
                if candidate.slot == slot and candidate.engine == ("llama" if adapter_id == "llama.cpp" else "pytorch") and all(required) and all(normalize(code) in LANGUAGE_CODES for code in codes) and valid_pairs:
                    configuration = candidate
            except ValueError:
                pass
        return cls(
            configuration=configuration,
            repo=repo,
            revision=revision,
            adapter_id=adapter_id,
            slot=slot,
            name=name if isinstance(name, str) and name else repo.split("/")[-1],
            files=tuple(CustomFile.from_json(item) for item in files),
            directory=directory if isinstance(directory, str) else "",
            languages=tuple(item for item in languages if isinstance(item, str))
            if isinstance(languages, list)
            else (),
        )

    def to_json(self) -> dict[str, object]:
        return {
            "resourceId": self.resource_id,
            "repo": self.repo,
            "revision": self.revision,
            "directory": self.resolved_directory,
            "adapterId": self.adapter_id,
            "slot": self.slot,
            "name": self.name,
            "configuration": self.configuration.model_dump(exclude_none=True) if self.configuration else None,
            "languages": list(self.languages),
            "files": [item.to_json() for item in self.files],
        }


class CustomModelRegistry:
    """Reads ``<model_root>/.custom-models.json`` on first use and writes it back atomically.

    A missing file is the normal state before the first install and reads as an empty registry.
    A *corrupt* file is not: it is raised, because silently treating it as empty would make every
    installed custom model vanish from the resource list and become unremovable by id.
    """

    def __init__(self, model_root: Path) -> None:
        self.model_root = Path(model_root)
        self._entries: dict[str, CustomModelEntry] | None = None

    @property
    def path(self) -> Path:
        return self.model_root / CUSTOM_REGISTRY_FILENAME

    def entries(self) -> dict[str, CustomModelEntry]:
        if self._entries is None:
            self._entries = self._read()
        return self._entries

    def get(self, resource_id: str) -> CustomModelEntry | None:
        return self.entries().get(resource_id)

    def all(self) -> tuple[CustomModelEntry, ...]:
        """Every entry, ordered by resource id so the resource list does not reshuffle per run."""
        return tuple(self.entries()[key] for key in sorted(self.entries()))

    def put(self, entry: CustomModelEntry) -> CustomModelEntry:
        self.entries()[entry.resource_id] = entry
        self._write()
        return entry

    def remove(self, resource_id: str) -> CustomModelEntry | None:
        removed = self.entries().pop(resource_id, None)
        if removed is not None:
            self._write()
        return removed

    def invalidate(self) -> None:
        self._entries = None

    def _read(self) -> dict[str, CustomModelEntry]:
        if not self.path.is_file():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RegistryError(
                f"无法读取自定义模型注册表 {self.path}：{error}。"
                "该文件记录了已安装模型与它们的校验摘要，删掉它会让这些模型失去可管理的身份。"
            ) from error
        if not isinstance(raw, dict):
            raise RegistryError(f"自定义模型注册表 {self.path} 不是 JSON 对象")
        models = raw.get("models")
        if models is None:
            return {}
        if not isinstance(models, list):
            raise RegistryError(f"自定义模型注册表 {self.path} 的 models 不是数组")
        entries: dict[str, CustomModelEntry] = {}
        for item in models:
            entry = CustomModelEntry.from_json(item)
            entries[entry.resource_id] = entry
        return entries

    def _write(self) -> None:
        entries = self.entries()
        payload = {
            "version": REGISTRY_VERSION,
            "models": [entries[key].to_json() for key in sorted(entries)],
        }
        self.model_root.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(".json.tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        # Atomic so an interrupted write cannot leave a half-written registry that would read
        # as corrupt on the next launch and take every custom model out of the resource list.
        os.replace(temp, self.path)
