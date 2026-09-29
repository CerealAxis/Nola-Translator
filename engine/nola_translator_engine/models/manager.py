"""Model manager with integrity checking and atomic installs, covering both HF file-list
snapshots and single-file models.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256
import os
from pathlib import Path
import shutil
import tempfile
from urllib.request import Request, urlopen


ProgressCallback = Callable[[int, int], None]
Fetcher = Callable[[str, Path, ProgressCallback], None]
PhaseCallback = Callable[[str], None]


class ModelIntegrityError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class FileEntry:
    """One file in a snapshot: relative path, byte size, sha256."""

    path: str
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """A model spec with a pinned revision; one structure covers everything except an empty file list.

    Snapshot form = several files, as relative paths inside the HuggingFace repo.
    Single-file form = files holds just one GGUF at the repo root.
    """

    model_id: str
    directory: str
    repo: str
    revision: str
    files: tuple[FileEntry, ...]

    @property
    def total_bytes(self) -> int:
        return sum(entry.size for entry in self.files)

    def url_for(self, entry: FileEntry) -> str:
        return f"https://huggingface.co/{self.repo}/resolve/{self.revision}/{entry.path}"


def _download(url: str, destination: Path, progress: ProgressCallback) -> None:
    request = Request(url, headers={"User-Agent": "Nola Translator/0.1"})
    with urlopen(request, timeout=30) as response, destination.open("wb") as output:
        total = int(response.headers.get("Content-Length", 0))
        current = 0
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            current += len(chunk)
            progress(current, total)


class ModelManager:
    def __init__(self, model_root: Path, fetcher: Fetcher = _download) -> None:
        self.model_root = model_root.resolve()
        self.fetcher = fetcher

    def model_path(self, spec: ModelSpec) -> Path:
        return self.model_root / spec.directory

    def is_installed(self, spec: ModelSpec) -> bool:
        target = self.model_path(spec)
        return target.is_dir() and all(
            (target / entry.path).is_file()
            and (target / entry.path).stat().st_size == entry.size
            for entry in spec.files
        )

    def ensure(
        self,
        spec: ModelSpec,
        progress: ProgressCallback = lambda _current, _total: None,
        on_phase: PhaseCallback | None = None,
    ) -> Path:
        """Download file by file into a temp dir, then switch to the target atomically once verification passes.

        Progress is reported in cumulative bytes; an exception from progress means cancelled, and the
        temp dir is cleaned up with it. Phases run in order: download → verify → install.
        """
        if self.is_installed(spec):
            return self.model_path(spec)

        def phase(name: str) -> None:
            if on_phase is not None:
                on_phase(name)

        self.model_root.mkdir(parents=True, exist_ok=True)
        temp = Path(tempfile.mkdtemp(prefix=f".{spec.model_id}-", dir=self.model_root))
        total = spec.total_bytes
        done = 0
        try:
            phase("download")
            for entry in spec.files:
                part = temp / f".{entry.path}.part"
                part.parent.mkdir(parents=True, exist_ok=True)
                # cancellation checkpoint between files, so a fetcher that never reports per chunk still gets noticed
                progress(done, total)
                base = done

                def file_progress(current: int, _file_total: int, base: int = base) -> None:
                    progress(base + current, total)

                self.fetcher(spec.url_for(entry), part, file_progress)
                done += entry.size

            phase("verify")
            for entry in spec.files:
                part = temp / f".{entry.path}.part"
                self._verify_file(part, entry)
                os.replace(part, temp / entry.path)

            phase("install")
            target = self.model_path(spec)
            if target.exists():
                corrupt = self.model_root / f".{spec.directory}.corrupt"
                if corrupt.exists():
                    shutil.rmtree(corrupt, ignore_errors=True)
                os.replace(target, corrupt)
            os.replace(temp, target)
            return target
        finally:
            shutil.rmtree(temp, ignore_errors=True)

    @staticmethod
    def _verify_file(path: Path, entry: FileEntry) -> None:
        if not path.is_file():
            raise ModelIntegrityError("模型文件缺失")
        if path.stat().st_size != entry.size:
            raise ModelIntegrityError("模型文件大小不匹配")
        digest = sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        if digest.hexdigest().casefold() != entry.sha256.casefold():
            raise ModelIntegrityError("模型文件摘要不匹配")
