"""CrispASR GGUF speech recognition for models outside llama.cpp's audio format."""
from __future__ import annotations

from pathlib import Path
from threading import Lock

import numpy as np

from .base import ModelUnavailable


class CrispAsrRuntime:
    """Keep one native session loaded while the selected recognition model is active."""

    def __init__(self, model_path: Path, *, backend: str, threads: int = 4,
                 use_vulkan: bool = False, allow_cpu_fallback: bool = True) -> None:
        self.model_path = Path(model_path)
        self.backend = backend
        self.threads = max(1, threads)
        self.use_vulkan = use_vulkan
        self.allow_cpu_fallback = allow_cpu_fallback
        self.using_vulkan = False
        self._session = None
        self._lock = Lock()

    @property
    def loaded(self) -> bool:
        return self._session is not None

    def describe(self) -> str:
        return f"CrispASR/{self.backend}/{'Vulkan' if self.using_vulkan else 'CPU'}" if self.loaded else "unloaded"

    def load(self) -> None:
        with self._lock:
            if self._session is not None:
                return
            if not self.model_path.is_file():
                raise ModelUnavailable(f"缺少 CrispASR GGUF：{self.model_path}")
            try:
                import crispasr
            except ImportError as error:
                raise ModelUnavailable("未安装 CrispASR 运行组件。") from error
            vulkan_lib = Path(crispasr.__file__).parent / "vulkan" / "crispasr.dll"
            if self.use_vulkan and vulkan_lib.is_file():
                try:
                    self._session = crispasr.Session(str(self.model_path), backend=self.backend,
                                                     n_threads=self.threads, lib_path=str(vulkan_lib))
                    self.using_vulkan = True
                except Exception:
                    if not self.allow_cpu_fallback:
                        raise
            if self._session is None:
                try:
                    self._session = crispasr.Session(str(self.model_path), backend=self.backend,
                                                     n_threads=self.threads)
                except Exception as error:
                    raise ModelUnavailable(f"CrispASR 无法加载 {self.backend} 权重：{error}") from error

    def transcribe(self, samples, *, prefix=None, language=None):
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if not audio.size:
            return "", language
        self.load()
        with self._lock:
            segments = self._session.transcribe(audio, sample_rate=16000,
                                                language=language or None)
        return " ".join(segment.text.strip() for segment in segments if segment.text.strip()), language

    def wait_idle(self) -> None:
        with self._lock:
            pass

    def unload(self) -> None:
        with self._lock:
            if self._session is not None:
                self._session.close()
                self._session = None
