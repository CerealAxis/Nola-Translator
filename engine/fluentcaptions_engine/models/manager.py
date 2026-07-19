"""带完整性检查和原子安装的模型管理器。"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from hashlib import md5
import os
from pathlib import Path
import shutil
import tarfile
import tempfile
from urllib.request import Request, urlopen


ProgressCallback = Callable[[int, int], None]
Fetcher = Callable[[str, Path, ProgressCallback], None]


class ModelIntegrityError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ModelSpec:
    model_id: str
    url: str
    archive_size: int
    archive_md5: str
    directory: str
    required_files: tuple[str, ...]


def _download(url: str, destination: Path, progress: ProgressCallback) -> None:
    request = Request(url, headers={"User-Agent": "FluentCaptions/0.1"})
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
        return target.is_dir() and all((target / name).is_file() for name in spec.required_files)

    def ensure_archive(
        self,
        spec: ModelSpec,
        progress: ProgressCallback = lambda _current, _total: None,
    ) -> Path:
        if self.is_installed(spec):
            return self.model_path(spec)

        self.model_root.mkdir(parents=True, exist_ok=True)
        archive = self.model_root / f".{spec.model_id}.part"
        install_temp = Path(tempfile.mkdtemp(prefix=f".{spec.model_id}-", dir=self.model_root))
        try:
            self.fetcher(spec.url, archive, progress)
            self._verify_archive(archive, spec)
            with tarfile.open(archive, "r:bz2") as bundle:
                bundle.extractall(install_temp, filter="data")
            extracted = install_temp / spec.directory
            if not extracted.is_dir() or not all(
                (extracted / name).is_file() for name in spec.required_files
            ):
                raise ModelIntegrityError("模型压缩包缺少必要文件")

            target = self.model_path(spec)
            if target.exists():
                corrupt = self.model_root / f".{spec.directory}.corrupt"
                if corrupt.exists():
                    shutil.rmtree(corrupt)
                os.replace(target, corrupt)
            os.replace(extracted, target)
            return target
        finally:
            archive.unlink(missing_ok=True)
            shutil.rmtree(install_temp, ignore_errors=True)

    @staticmethod
    def _verify_archive(archive: Path, spec: ModelSpec) -> None:
        if archive.stat().st_size != spec.archive_size:
            raise ModelIntegrityError("模型压缩包大小不匹配")
        digest = md5()
        with archive.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        if digest.hexdigest().casefold() != spec.archive_md5.casefold():
            raise ModelIntegrityError("模型压缩包摘要不匹配")
