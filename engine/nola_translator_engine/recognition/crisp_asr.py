"""CrispASR GGUF speech recognition for models outside llama.cpp's audio format."""
from __future__ import annotations

import os
from importlib.util import find_spec
from pathlib import Path
from threading import Lock

import numpy as np

from .base import ModelUnavailable


def crisp_acceleration_library() -> tuple[str, Path] | None:
    package = find_spec("crispasr")
    if not package or not package.origin:
        return None
    root = Path(package.origin).parent
    for backend in ("cuda", "vulkan"):
        library = root / backend / "crispasr.dll"
        if library.is_file():
            return backend, library
    return None


def cuda_device_count() -> int:
    if os.name != "nt":
        return 0
    import ctypes

    try:
        driver = ctypes.WinDLL("nvcuda.dll", winmode=0x800)
        count = ctypes.c_int()
        if driver.cuInit(0) == 0 and driver.cuDeviceGetCount(ctypes.byref(count)) == 0:
            return count.value
    except (OSError, AttributeError):
        pass
    return 0


def crisp_capabilities(session) -> set[str]:
    """Query the installed native backend rather than duplicating its model table."""
    import ctypes

    function = getattr(getattr(session, '_lib', None), 'crispasr_backend_caps_abi', None)
    if function is None:
        return set()
    function.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int32]
    function.restype = ctypes.c_int
    buffer = ctypes.create_string_buffer(4096)
    size = function(session.backend.encode('utf-8'), buffer, len(buffer))
    if size < 0 or size >= len(buffer):
        raise ModelUnavailable('CrispASR could not read backend capabilities')
    return set(buffer.value.decode('utf-8').split(','))


def prepare_crisp_synthesis(session, root: Path) -> None:
    """Pass local auxiliary files to the same native session used for synthesis."""
    files = sorted(root.rglob('*.gguf'))
    codec = next((path for path in files if any(part in path.name.casefold() for part in ('tokenizer', 'codec', 'vocoder'))), None)
    if codec is not None:
        session.set_codec_path(str(codec))
    voice = next((path for path in files if 'voice-' in path.name.casefold()), None)
    if voice is not None:
        session.set_voice(str(voice))
    elif session.is_voice_design():
        session.set_instruct('A clear, neutral speaking voice.')
    else:
        speakers = session.speakers()
        if speakers:
            session.set_speaker_name(speakers[0])


class CrispAsrRuntime:
    """Keep one native session loaded while the selected recognition model is active."""

    def __init__(self, model_path: Path, *, backend: str | None = None, threads: int = 4,
                 use_acceleration: bool = False, allow_cpu_fallback: bool = True) -> None:
        self.model_path = Path(model_path)
        self.backend = backend
        self.threads = max(1, threads)
        self.use_acceleration = use_acceleration
        self.allow_cpu_fallback = allow_cpu_fallback
        self.execution_backend = "cpu"
        self._accelerator_dlls = None
        self._session = None
        self._lock = Lock()

    @property
    def loaded(self) -> bool:
        return self._session is not None

    def describe(self) -> str:
        return f"CrispASR/{self.backend}/{self.execution_backend}" if self.loaded else "unloaded"

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
            accelerator = crisp_acceleration_library() if self.use_acceleration else None
            if accelerator:
                execution_backend, library = accelerator
                try:
                    if os.name == "nt":
                        self._accelerator_dlls = os.add_dll_directory(str(library.parent))
                    if execution_backend == "cuda" and cuda_device_count() < 1:
                        raise ModelUnavailable("CrispASR CUDA requires an available NVIDIA CUDA device")
                    self._session = crispasr.Session(str(self.model_path), backend=self.backend,
                                                     n_threads=self.threads, lib_path=str(library))
                    self.execution_backend = execution_backend
                except Exception:
                    if self._accelerator_dlls is not None:
                        self._accelerator_dlls.close()
                        self._accelerator_dlls = None
                    if not self.allow_cpu_fallback:
                        raise
            if self._session is None:
                try:
                    self._session = crispasr.Session(str(self.model_path), backend=self.backend,
                                                     n_threads=self.threads)
                except Exception as error:
                    raise ModelUnavailable(f"CrispASR 无法加载 {self.backend} 权重：{error}") from error
            self.backend = self._session.backend

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
                try:
                    self._session.close()
                finally:
                    self._session = None
                    self.execution_backend = "cpu"
                    if self._accelerator_dlls is not None:
                        self._accelerator_dlls.close()
                        self._accelerator_dlls = None
