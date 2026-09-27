"""带完整性检查和原子安装的模型管理器：支持 HF 文件列表快照与单文件两种形态。"""

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
    """快照内单个文件：相对路径、字节数与 sha256。"""

    path: str
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """钉死 revision 的模型规格；files 为空列表以外的形态共用同一结构。

    快照形式 = 多个文件（HuggingFace 仓库内相对路径）；
    单文件形式 = files 仅含仓库根目录下的一个 GGUF。
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
        return target.is_dir() and all((target / entry.path).is_file() for entry in spec.files)

    def ensure(
        self,
        spec: ModelSpec,
        progress: ProgressCallback = lambda _current, _total: None,
        on_phase: PhaseCallback | None = None,
    ) -> Path:
        """逐文件下载到临时目录，校验通过后整体原子切换到目标目录。

        进度按累计字节上报；progress 抛出异常即视为取消，临时目录随之清理。
        阶段顺序：download → verify → install。
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
                # 文件间取消检查点：即使 fetcher 不逐块上报也能感知取消
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
