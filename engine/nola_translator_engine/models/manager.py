"""Model manager with integrity checking and atomic installs, covering both HF file-list
snapshots and single-file models.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from hashlib import sha1, sha256
import os
from pathlib import Path
import re
import shutil
import tempfile
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import OpenerDirector, ProxyHandler, Request, build_opener

from ..protocol import NetworkSettings


ProgressCallback = Callable[[int, int], None]
Fetcher = Callable[[str, Path, ProgressCallback], None]
PhaseCallback = Callable[[str], None]

#: The official hub and the community mirror, which serves the same resolve and API routes. The
#: choice is a user setting, so it is resolved per operation instead of frozen at import time.
HF_ENDPOINT = "https://huggingface.co"
HF_MIRROR_ENDPOINT = "https://hf-mirror.com"


def hf_endpoint(network: NetworkSettings | None) -> str:
    """The Hugging Face host one operation talks to; absent settings mean the official host."""
    if network is not None and network.useHuggingFaceMirror:
        return HF_MIRROR_ENDPOINT
    return HF_ENDPOINT


def http_opener(network: NetworkSettings | None) -> OpenerDirector:
    """An opener carrying one operation's proxy policy.

    Built once per operation rather than per read: ``build_opener`` assembles the handler stack
    and reads the environment, and the weight download loop would otherwise pay that on every
    1 MB chunk.
    """
    proxy = network.proxyUrl.strip() if network is not None and network.proxyForModelDownload else ""
    if not proxy:
        return build_opener()
    parsed = urlparse(proxy)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        # A malformed proxy otherwise reaches http.client, which raises InvalidURL — neither an
        # HTTP status nor an OSError, so it escapes classify_hub_error and surfaces as an
        # unexplained internal error. URLError is the transport failure callers already speak.
        raise URLError(f"代理地址无效：{proxy}")
    return build_opener(ProxyHandler({"http": proxy, "https": proxy}))


#: Characters Windows refuses in a path component. A self-installed model's id is `hub:owner/name`
#: — a perfectly good protocol identifier and an illegal folder name — so nothing derived from a
#: model id may reach the filesystem unsanitised.
_UNSAFE_PATH_CHARS = re.compile(r"[^A-Za-z0-9._-]+")
_SAFE_PREFIX_LIMIT = 32


class ModelIntegrityError(RuntimeError):
    pass


class ModelStorageError(RuntimeError):
    """A local filesystem failure while installing — not a bad file, and not a network problem.
    """


@dataclass(frozen=True, slots=True)
class FileEntry:
    """One file in a snapshot: relative path, byte size, and a content digest to verify it against.

    ``sha256`` is the per-file sha256 HuggingFace publishes for LFS-tracked files. Small git
    blobs expose no sha256 through the API — only the git blob id — so ``blob_sha1`` carries
    that instead.
    At least one of the two
    is always present on a spec the engine builds, and a spec carrying neither is rejected at
    verification time rather than trusted.
    """

    path: str
    size: int
    sha256: str | None = None
    blob_sha1: str | None = None


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

    def url_for(self, entry: FileEntry, network: NetworkSettings | None = None) -> str:
        endpoint = hf_endpoint(network)
        return f"{endpoint}/{self.repo}/resolve/{self.revision}/{entry.path}"


def _download(
    url: str, destination: Path, progress: ProgressCallback, opener: OpenerDirector
) -> None:
    request = Request(url, headers={"User-Agent": "Nola Translator/0.1"})
    with opener.open(request, timeout=30) as response, destination.open("wb") as output:
        total = int(response.headers.get("Content-Length", 0))
        current = 0
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            current += len(chunk)
            progress(current, total)


class ModelManager:
    def __init__(self, model_root: Path, fetcher: Fetcher | None = None) -> None:
        self.model_root = model_root.resolve()
        # `None` selects the engine's own downloader, the only transport that carries network
        # settings; an injected fetcher arrives with its own.
        self.fetcher = fetcher

    def _fetcher_for(self, network: NetworkSettings | None) -> Fetcher:
        """The downloader for one install, with the proxy bound once for every file it fetches."""
        if self.fetcher is not None:
            return self.fetcher
        return partial(_download, opener=http_opener(network))

    def model_path(self, spec: ModelSpec) -> Path:
        target = self.model_root / spec.directory
        if target.parent.resolve() != self.model_root or target.name in ('', '.', '..'):
            raise ModelStorageError('模型目录必须位于模型存储目录内')
        return target

    def _owned_directory(self, path: Path) -> bool:
        return (path.parent.resolve() == self.model_root and path.is_dir()
                and not path.is_symlink() and not path.is_junction())

    def cleanup_stale(self, specs: list[ModelSpec]) -> None:
        """Recover interrupted swaps before removing known tempfile names; never follow junctions."""
        if not self.model_root.exists():
            return
        names = list(self.model_root.iterdir())
        for spec in specs:
            target = self.model_path(spec)
            prefix = _UNSAFE_PATH_CHARS.sub('-', spec.directory)[:_SAFE_PREFIX_LIMIT] or 'model'
            pattern = re.compile(rf'^\.{re.escape(prefix)}-[a-z0-9_]{{8}}$')
            for path in names:
                if pattern.fullmatch(path.name) and self._owned_directory(path):
                    shutil.rmtree(path, ignore_errors=True)
            backup = self.model_root / f'.{spec.directory}.corrupt'
            if not self._owned_directory(backup):
                continue
            if not target.exists():
                try:
                    os.replace(backup, target)
                except OSError:
                    pass
            elif self._owned_directory(target) and self.is_installed(spec):
                shutil.rmtree(backup, ignore_errors=True)

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
        network: NetworkSettings | None = None,
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
        # Sanitised from `directory`, never from `model_id`: a custom model's id carries
        # `hub:owner/name` and `tempfile` fails on the `:` and `/`, and the resulting OSError
        # classifies as `networkUnavailable` — a working network sent off to be debugged.
        prefix = _UNSAFE_PATH_CHARS.sub("-", spec.directory)[:_SAFE_PREFIX_LIMIT] or "model"
        try:
            temp = Path(tempfile.mkdtemp(prefix=f".{prefix}-", dir=self.model_root))
        except OSError as error:
            raise ModelStorageError(
                f"无法在模型目录 {self.model_root} 下创建临时目录：{error}"
            ) from error
        total = spec.total_bytes
        done = 0
        try:
            phase("download")
            fetcher = self._fetcher_for(network)
            for entry in spec.files:
                part = temp / f".{entry.path}.part"
                part.parent.mkdir(parents=True, exist_ok=True)
                # cancellation checkpoint between files, so a fetcher that never reports per chunk still gets noticed
                progress(done, total)
                base = done

                def file_progress(current: int, _file_total: int, base: int = base) -> None:
                    progress(base + current, total)

                fetcher(spec.url_for(entry, network), part, file_progress)
                done += entry.size

            phase("verify")
            for entry in spec.files:
                part = temp / f".{entry.path}.part"
                self._verify_file(part, entry, lambda: progress(done, total))
                os.replace(part, temp / entry.path)

            phase("install")
            target = self.model_path(spec)
            corrupt = self.model_root / f".{spec.directory}.corrupt"
            moved_old = False
            if target.exists():
                if not self._owned_directory(target):
                    raise ModelStorageError('不能覆盖外部链接模型目录')
                if corrupt.exists():
                    if not self._owned_directory(corrupt):
                        raise ModelStorageError('模型备份目录不是本地目录')
                    shutil.rmtree(corrupt)
                os.replace(target, corrupt)
                moved_old = True
            try:
                os.replace(temp, target)
            except OSError:
                if moved_old:
                    os.replace(corrupt, target)
                raise
            if moved_old:
                shutil.rmtree(corrupt, ignore_errors=True)
            return target
        finally:
            shutil.rmtree(temp, ignore_errors=True)

    @staticmethod
    def _verify_file(path: Path, entry: FileEntry, checkpoint: Callable[[], None] = lambda: None) -> None:
        if not path.is_file():
            raise ModelIntegrityError("模型文件缺失")
        if path.stat().st_size != entry.size:
            raise ModelIntegrityError("模型文件大小不匹配")
        # Exactly one digest is checked, and which one is fixed by what HuggingFace published for
        # this file. Falling through to "size matched, assume it is fine" is the one outcome a
        # supply chain must never produce, so a spec with no digest fails loudly instead.
        if entry.sha256:
            expected, actual = entry.sha256.casefold(), _file_sha256(path, checkpoint)
        elif entry.blob_sha1:
            expected, actual = entry.blob_sha1.casefold(), _git_blob_id(path, checkpoint)
        else:
            raise ModelIntegrityError(f"模型文件 {entry.path} 没有可校验的摘要")
        if actual != expected:
            raise ModelIntegrityError("模型文件摘要不匹配")


def _file_sha256(path: Path, checkpoint: Callable[[], None] = lambda: None) -> str:
    digest = sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            checkpoint()
            digest.update(chunk)
    return digest.hexdigest()


def _git_blob_id(path: Path, checkpoint: Callable[[], None] = lambda: None) -> str:
    """Git's own object id for a file: sha1 over the ``blob <size>\\0`` header plus the content.

    This is the id git stores in its tree, and the one HuggingFace echoes as ``blobId``. Hashing
    it locally is what makes a non-LFS file checkable against the value the hub published.
    """
    size = path.stat().st_size
    digest = sha1()
    digest.update(f"blob {size}\0".encode("ascii"))
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            checkpoint()
            digest.update(chunk)
    return digest.hexdigest()
