"""Model manager with integrity checking and atomic installs, covering both HF file-list
snapshots and single-file models.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha1, sha256
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from threading import Event, Lock
import time
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import OpenerDirector, ProxyHandler, Request, build_opener

from ..protocol import NetworkSettings
from ..debug_log import write as write_diagnostic


ProgressCallback = Callable[[int, int], None]
Fetcher = Callable[[str, Path, ProgressCallback], None]
PhaseCallback = Callable[[str], None]

#: The official hub and the community mirror, which serves the same resolve and API routes. The
#: choice is a user setting, so it is resolved per operation instead of frozen at import time.
HF_ENDPOINT = "https://huggingface.co"
HF_MIRROR_ENDPOINT = "https://hf-mirror.com"
MODELSCOPE_ENDPOINT = "https://www.modelscope.cn/models"


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
    repo: str | None = None
    revision: str | None = None
    modelscope_repo: str | None = None
    modelscope_revision: str | None = None


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
    modelscope_repo: str | None = None
    modelscope_revision: str = ""
    modelscope_files: tuple[FileEntry, ...] = ()

    def files_for(self, source: str | None = None) -> tuple[FileEntry, ...]:
        if source != "modelscope":
            return self.files
        # ModelScope is a separate repository, not a byte-identical HF mirror. Never
        # substitute HF metadata or a moving branch when its own manifest is missing.
        if (not self.modelscope_files or any(
                not entry.sha256 or not re.fullmatch(r"[0-9a-f]{64}", entry.sha256)
                or not (entry.modelscope_repo or self.modelscope_repo)
                or not re.fullmatch(r"[0-9a-f]{40}", entry.modelscope_revision or self.modelscope_revision)
                for entry in self.modelscope_files
        )):
            raise ValueError("modelscopeSourceUnavailable")
        return self.modelscope_files

    @property
    def total_bytes(self) -> int:
        return sum(entry.size for entry in self.files)

    def url_for(
        self, entry: FileEntry, network: NetworkSettings | None = None,
        source: str | None = None,
    ) -> str:
        if source == "modelscope":
            self.files_for(source)
            repo = entry.modelscope_repo or self.modelscope_repo
            revision = entry.modelscope_revision or self.modelscope_revision
            if entry.repo:
                endpoint = HF_MIRROR_ENDPOINT if network is not None and network.useHuggingFaceMirror else HF_ENDPOINT
                return f"{endpoint}/{entry.repo}/resolve/{entry.revision}/{entry.path}"
            return f"{MODELSCOPE_ENDPOINT}/{repo}/resolve/{revision}/{entry.path}"
        if source == "huggingface":
            endpoint = HF_ENDPOINT
        elif source == "hf-mirror":
            endpoint = HF_MIRROR_ENDPOINT
        else:
            endpoint = hf_endpoint(network)
        return f"{endpoint}/{entry.repo or self.repo}/resolve/{entry.revision or self.revision}/{entry.path}"


class _DownloadStopped(RuntimeError):
    """A sibling range stopped after another range failed."""


class _DownloadProtocolError(RuntimeError):
    """The server returned bytes that cannot safely be associated with a requested range."""


class _DownloadTruncatedError(_DownloadProtocolError):
    """A valid response ended early; retrying the same range can recover it."""


class _ProgressCallbackCancelled(Exception):
    """A caller stopped this download from its progress callback."""

    def __init__(self, cause: Exception) -> None:
        super().__init__(str(cause))
        self.cause = cause


class ResumableParallelDownloader:
    """Download model files with bounded HTTP ranges and persistent completed chunks."""

    def __init__(
        self,
        model_root: Path,
        opener: OpenerDirector,
        *,
        chunk_size: int = 16 * 1024 * 1024,
        max_workers: int = 8,
        parallel_threshold: int = 32 * 1024 * 1024,
        max_retries: int = 3,
    ) -> None:
        self.model_root = model_root
        self.opener = opener
        self.chunk_size = max(1, chunk_size)
        self.max_workers = max(1, max_workers)
        self.parallel_threshold = max(1, parallel_threshold)
        self.max_retries = max(0, max_retries)

    def download(
        self,
        url: str,
        destination: Path,
        entry: FileEntry,
        progress: ProgressCallback,
    ) -> None:
        cache_dir = self._cache_dir(url, entry)
        started_at = time.monotonic()
        try:
            download_url, ranges = (self._resolve_download(url, entry.size, progress)
                                    if entry.size >= self.parallel_threshold else (url, False))
            write_diagnostic('engine', 'model.download.start', {
                'file': entry.path, 'sourceHost': urlparse(url).hostname,
                'downloadHost': urlparse(download_url).hostname, 'bytes': entry.size,
                'workers': self.max_workers if ranges else 1, 'chunkBytes': self.chunk_size,
            })
            if ranges:
                self._download_parallel(download_url, destination, entry.size, cache_dir, progress)
            else:
                self._download_sequential(download_url, destination, entry.size, cache_dir, progress)
        except _ProgressCallbackCancelled as stopped:
            # Explicit cancellation discards resumable chunks. Pausing never raises from the
            # callback, so it keeps these files and resumes from the same byte ranges.
            shutil.rmtree(cache_dir, ignore_errors=True)
            self._remove_empty_cache_root()
            raise stopped.cause
        shutil.rmtree(cache_dir, ignore_errors=True)
        self._remove_empty_cache_root()
        write_diagnostic('engine', 'model.download.complete', {
            'file': entry.path, 'bytes': entry.size,
            'durationMs': round((time.monotonic() - started_at) * 1000),
        })

    def _cache_dir(self, url: str, entry: FileEntry) -> Path:
        identity_data = json.dumps(
            {
                "url": url,
                "path": entry.path,
                "size": entry.size,
                "sha256": entry.sha256,
                "blob_sha1": entry.blob_sha1,
                "chunk_size": self.chunk_size,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        identity = sha256(identity_data).hexdigest()
        cache_root = self.model_root / ".downloads"
        if cache_root.is_symlink() or cache_root.is_junction() or (
            cache_root.exists() and not cache_root.is_dir()
        ):
            raise ModelStorageError("模型下载缓存目录不是本地目录")
        cache_root.mkdir(parents=True, exist_ok=True)
        cache_dir = cache_root / identity
        metadata = {
            "identity": identity,
            "size": entry.size,
            "chunk_size": self.chunk_size,
        }
        if cache_dir.is_symlink() or cache_dir.is_junction() or (
            cache_dir.exists() and not cache_dir.is_dir()
        ):
            raise ModelStorageError("模型下载缓存不是本地目录")
        if cache_dir.exists():
            try:
                current = json.loads((cache_dir / "metadata.json").read_text(encoding="utf-8"))
            except (OSError, ValueError):
                current = None
            if current != metadata:
                shutil.rmtree(cache_dir)
        cache_dir.mkdir(exist_ok=True)
        metadata_path = cache_dir / "metadata.json"
        if not metadata_path.exists():
            temporary = cache_dir / "metadata.json.tmp"
            temporary.write_text(json.dumps(metadata), encoding="utf-8")
            os.replace(temporary, metadata_path)
        return cache_dir

    def _resolve_download(self, url: str, size: int, progress: ProgressCallback) -> tuple[str, bool]:
        # Resolve repository redirects once; every worker can then use the same CDN URL without
        # repeating the origin request. Cache identity still uses the stable repository URL.
        for attempt in range(self.max_retries + 1):
            if attempt:
                self._report_progress(progress, 0, size)
            request = Request(url, headers={"User-Agent": "Nola Translator/0.1", "Range": "bytes=0-0"})
            try:
                with self.opener.open(request, timeout=30) as response:
                    resolved = response.geturl()
                    ranges = (self._status(response) == 206 and
                              response.headers.get('Content-Range', '') == f'bytes 0-0/{size}')
                    return resolved, ranges
            except HTTPError as error:
                if error.code in (400, 403, 405, 416):
                    error.close()
                    return url, False
                if not self._retryable(error) or attempt == self.max_retries:
                    raise
                self._retry_pause(error, attempt)
            except (URLError, HTTPException, ConnectionError, TimeoutError) as error:
                if attempt == self.max_retries:
                    raise
                self._retry_pause(error, attempt)
        raise _DownloadProtocolError('下载服务器无法响应')

    def _download_parallel(
        self,
        url: str,
        destination: Path,
        size: int,
        cache_dir: Path,
        progress: ProgressCallback,
    ) -> None:
        chunk_count = (size + self.chunk_size - 1) // self.chunk_size
        completed: dict[int, int] = {}
        active: dict[int, int] = {}
        lock = Lock()
        stopped = Event()

        def report(index: int, current: int, complete: bool = False) -> None:
            with lock:
                if complete:
                    completed[index] = current
                    active.pop(index, None)
                else:
                    active[index] = current
                self._report_progress(progress, sum(completed.values()) + sum(active.values()), size)

        def fetch(index: int) -> None:
            if stopped.is_set():
                raise _DownloadStopped()
            start = index * self.chunk_size
            end = min(size, start + self.chunk_size) - 1
            expected = end - start + 1
            chunk = cache_dir / f"chunk-{index:06d}.part"
            temporary = cache_dir / f"chunk-{index:06d}.tmp"
            if chunk.is_file() and chunk.stat().st_size == expected:
                report(index, expected, complete=True)
                return
            chunk.unlink(missing_ok=True)

            last_error: Exception | None = None
            for attempt in range(self.max_retries + 1):
                if stopped.is_set():
                    raise _DownloadStopped()
                request = Request(
                    url,
                    headers={
                        "User-Agent": "Nola Translator/0.1",
                        "Range": f"bytes={start}-{end}",
                    },
                )
                written = 0
                try:
                    with self.opener.open(request, timeout=30) as response:
                        if self._status(response) != 206:
                            raise _DownloadProtocolError("下载服务器未返回分块响应")
                        expected_range = f"bytes {start}-{end}/{size}"
                        if response.headers.get("Content-Range", "") != expected_range:
                            raise _DownloadProtocolError("下载服务器返回了不匹配的字节范围")
                        with temporary.open("wb") as output:
                            while data := response.read(1024 * 1024):
                                if stopped.is_set():
                                    raise _DownloadStopped()
                                written += len(data)
                                if written > expected:
                                    raise _DownloadProtocolError("下载分块长度超过请求范围")
                                output.write(data)
                                report(index, written)
                    if written != expected:
                        raise _DownloadTruncatedError("下载分块长度不完整")
                    os.replace(temporary, chunk)
                    report(index, expected, complete=True)
                    return
                except Exception as error:
                    temporary.unlink(missing_ok=True)
                    with lock:
                        active.pop(index, None)
                    if isinstance(error, _DownloadStopped):
                        raise
                    if not self._retryable(error) or attempt == self.max_retries:
                        stopped.set()
                        raise
                    last_error = error
                    self._retry_pause(error, attempt)
            if last_error is not None:
                raise last_error

        first_error: Exception | None = None
        with ThreadPoolExecutor(max_workers=self.max_workers, thread_name_prefix="model-download") as pool:
            futures = [pool.submit(fetch, index) for index in range(chunk_count)]
            for future in as_completed(futures):
                try:
                    future.result()
                except _DownloadStopped:
                    continue
                except Exception as error:
                    if first_error is None:
                        first_error = error
                        stopped.set()
                        for pending in futures:
                            pending.cancel()
        if first_error is not None:
            raise first_error

        with destination.open("wb") as output:
            for index in range(chunk_count):
                with (cache_dir / f"chunk-{index:06d}.part").open("rb") as source:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
        self._report_progress(progress, size, size)

    def _download_sequential(
        self, url: str, destination: Path, size: int, cache_dir: Path,
        progress: ProgressCallback,
    ) -> None:
        for attempt in range(self.max_retries + 1):
            partial = cache_dir / 'sequential.part'
            self._report_progress(progress, partial.stat().st_size if partial.is_file() else 0, size)
            try:
                self._download_sequential_once(url, destination, size, cache_dir, progress)
                return
            except Exception as error:
                if not self._retryable(error) or attempt == self.max_retries:
                    raise
                self._retry_pause(error, attempt)

    def _download_sequential_once(
        self,
        url: str,
        destination: Path,
        size: int,
        cache_dir: Path,
        progress: ProgressCallback,
    ) -> None:
        partial_path = cache_dir / "sequential.part"
        offset = partial_path.stat().st_size if partial_path.is_file() else 0
        if offset > size:
            partial_path.unlink()
            offset = 0
        if offset == size:
            self._report_progress(progress, size, size)
            shutil.copyfile(partial_path, destination)
            return

        request_headers = {"User-Agent": "Nola Translator/0.1"}
        if offset:
            request_headers["Range"] = f"bytes={offset}-"
        request = Request(url, headers=request_headers)
        response = self.opener.open(request, timeout=30)
        status = self._status(response)
        append = False
        if offset and status == 206:
            append = response.headers.get("Content-Range", "") == f"bytes {offset}-{size - 1}/{size}"
        if offset and not append:
            response.close()
            request = Request(url, headers={"User-Agent": "Nola Translator/0.1"})
            response = self.opener.open(request, timeout=30)
            status = self._status(response)
            offset = 0
        if status not in (200, 206) or (status == 206 and not append):
            response.close()
            raise _DownloadProtocolError("下载服务器返回了不支持的响应")

        current = offset
        mode = "ab" if append else "wb"
        with response, partial_path.open(mode) as output:
            self._report_progress(progress, current, size)
            while data := response.read(1024 * 1024):
                output.write(data)
                current += len(data)
                if current > size:
                    raise _DownloadProtocolError("下载文件长度超过模型清单")
                self._report_progress(progress, current, size)
        if current != size:
            raise _DownloadTruncatedError("下载文件长度与模型清单不匹配")
        shutil.copyfile(partial_path, destination)

    @staticmethod
    def _status(response: object) -> int:
        status = getattr(response, "status", None)
        return int(status if status is not None else response.getcode())

    @staticmethod
    def _report_progress(progress: ProgressCallback, current: int, total: int) -> None:
        try:
            progress(current, total)
        except Exception as error:
            raise _ProgressCallbackCancelled(error) from error

    @staticmethod
    def _retryable(error: Exception) -> bool:
        if isinstance(error, HTTPError):
            return error.code in (408, 429, 500, 502, 503, 504)
        return isinstance(error, (URLError, HTTPException, ConnectionError, TimeoutError, _DownloadTruncatedError))

    @staticmethod
    def _retry_pause(error: Exception, attempt: int) -> None:
        delay = min(2.0, 0.25 * 2 ** attempt)
        if isinstance(error, HTTPError):
            retry_after = error.headers.get('Retry-After', '') if error.headers else ''
            if retry_after.isdigit():
                delay = min(10.0, max(delay, float(retry_after)))
            error.close()
        write_diagnostic('engine', 'model.download.retry', {
            'attempt': attempt + 1, 'delayMs': round(delay * 1000), 'reason': type(error).__name__,
        })
        time.sleep(delay)

    def _remove_empty_cache_root(self) -> None:
        cache_root = self.model_root / ".downloads"
        try:
            cache_root.rmdir()
        except OSError:
            pass


class ModelManager:
    def __init__(self, model_root: Path, fetcher: Fetcher | None = None, cache_root: Path | None = None) -> None:
        self.model_root = model_root.resolve()
        self.cache_root = (cache_root or self.model_root).resolve()
        # `None` selects the engine's own downloader, the only transport that carries network
        # settings; an injected fetcher arrives with its own.
        self.fetcher = fetcher

    def _downloader_for(self, network: NetworkSettings | None) -> ResumableParallelDownloader:
        """Bind one proxy-aware HTTP opener for all ranges in this model operation."""
        return ResumableParallelDownloader(self.cache_root, http_opener(network))

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
        # The desktop clears download caches before launching any worker. Do not purge them
        # here: offline import/export also calls this method during an active app session.
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
        # Startup has no download-source preference. Accept a complete snapshot from
        # either pinned catalog, but never a mixture of files from different sources.
        manifests = [spec.files]
        if spec.modelscope_files:
            manifests.append(spec.files_for("modelscope"))
        return target.is_dir() and any(all(
            (target / entry.path).is_file()
            and (target / entry.path).stat().st_size == entry.size
            for entry in entries
        ) for entries in manifests)

    def ensure(
        self,
        spec: ModelSpec,
        progress: ProgressCallback = lambda _current, _total: None,
        on_phase: PhaseCallback | None = None,
        network: NetworkSettings | None = None,
        source: str | None = None,
    ) -> Path:
        """Download file by file into a temp dir, then switch to the target atomically once verification passes.

        Progress is reported in cumulative bytes; an exception from progress means cancelled. The
        temporary install directory is removed, while completed download ranges remain resumable.
        Phases run in order: download → verify → install.
        """
        files = spec.files_for(source)
        if self.is_installed(spec):
            return self.model_path(spec)

        target = self.model_path(spec)
        if target.exists() and not self._owned_directory(target):
            raise ModelStorageError('不能覆盖外部链接模型目录')
        # A newer manifest may add optional assets such as a vision projector. Keep valid
        # weights already installed and fetch only missing or size-mismatched files.
        existing_files = tuple(entry for entry in files if (target / entry.path).is_file()
                                and (target / entry.path).stat().st_size == entry.size) if target.is_dir() else ()
        missing_files = tuple(entry for entry in files if entry not in existing_files)
        preserve_existing = bool(existing_files and missing_files)
        pending_files = missing_files if preserve_existing else files

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
        total = sum(entry.size for entry in pending_files)
        done = 0
        try:
            phase("download")
            fetcher = self.fetcher
            downloader = None if fetcher is not None else self._downloader_for(network)
            for entry in pending_files:
                part = temp / f".{entry.path}.part"
                part.parent.mkdir(parents=True, exist_ok=True)
                # cancellation checkpoint between files, so a fetcher that never reports per chunk still gets noticed
                progress(done, total)
                base = done

                def file_progress(current: int, _file_total: int, base: int = base) -> None:
                    progress(base + current, total)

                url = spec.url_for(entry, network, source)
                urls = [url]
                if source is None and network is not None and network.useHuggingFaceMirror:
                    official_url = spec.url_for(entry, None, source)
                    if official_url != url:
                        urls.append(official_url)
                for attempt, download_url in enumerate(urls):
                    try:
                        if downloader is not None:
                            downloader.download(download_url, part, entry, file_progress)
                        else:
                            assert fetcher is not None
                            fetcher(download_url, part, file_progress)
                        break
                    except Exception:
                        if attempt + 1 == len(urls):
                            raise
                        # A failed mirror should not strand an automatic download; restart this file
                        # from the official host while keeping the already verified completed files.
                        part.unlink(missing_ok=True)
                        progress(base, total)
                done += entry.size

            phase("verify")
            for entry in pending_files:
                part = temp / f".{entry.path}.part"
                self._verify_file(part, entry, lambda: progress(done, total))
                os.replace(part, temp / entry.path)

            phase("install")
            target = self.model_path(spec)
            if target.is_dir() and preserve_existing:
                for entry in pending_files:
                    destination = target / entry.path
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(temp / entry.path, destination)
                shutil.rmtree(temp, ignore_errors=True)
                return target
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
    def _verify_file(
        path: Path, entry: FileEntry, checkpoint: Callable[[], None] = lambda: None,
    ) -> None:
        if not path.is_file():
            raise ModelIntegrityError("模型文件缺失")
        if path.stat().st_size != entry.size:
            raise ModelIntegrityError("模型文件大小不匹配")
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
