"""SenseVoiceSmall runtime: funasr local-directory load, tag parsing, protocol language-code mapping.

The model is non-autoregressive: every ``transcribe`` re-transcribes the whole audio it is
given and takes no continuation prefix, so ``prefix`` is ignored here. Output looks like
``<|zh|><|NEUTRAL|><|Speech|><|withitn|>...`` — the leading tag run is language, emotion,
audio event, ITN flag, in that order.
"""

from __future__ import annotations
from ..compute import cpu_threads, release_device_cache

import gc
import os
import re
import threading
from pathlib import Path
from typing import Any

import numpy as np
import torch
from numpy.typing import NDArray

from .base import ModelUnavailable

SAMPLE_RATE = 16_000
# Per-transcribe dynamic-batch duration cap in seconds, matching the official demo.
BATCH_SIZE_S = 60

# The five languages the model's lid_dict covers; every other protocol code falls back to
# auto and is decided by the model.
SUPPORTED_LANGUAGES = frozenset({"zh", "en", "yue", "ja", "ko"})

_TAG_PREFIX = re.compile(r"^(?:<\|[^|]*\|>)+")
_TAG = re.compile(r"<\|([^|]*)\|>")

# Voice activity detection belongs to our own volume gate, so funasr's extra fsmn-vad model
# is deliberately not pulled in. disable_update turns off funasr's startup version check so
# the offline path never reaches out to the network.


class SenseVoiceModelUnavailable(ModelUnavailable):
    """SenseVoiceSmall unavailable: directory missing, or funasr failed to load."""


class SenseVoiceRuntime:
    """In-process SenseVoiceSmall runtime: load once, single-flight inference."""

    def __init__(self, model_dir: Path, *, device: str | None = None, threads: int = 0) -> None:
        self.model_dir = Path(model_dir)
        self._load_lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._warmed = False
        self._device: str | None = None
        self._model: Any = None
        self._requested_device = device
        self.threads = threads

    @property
    def loaded(self) -> bool:
        return self._loaded

    @property
    def device(self) -> str | None:
        return self._device

    def describe(self) -> str:
        return self._device if self._loaded else "unloaded"

    def load(self) -> None:
        """Thread-safe one-shot load; failure raises SenseVoiceModelUnavailable."""
        with self._load_lock:
            if self._loaded:
                return
            try:
                from funasr import AutoModel
            except Exception as error:
                raise SenseVoiceModelUnavailable(
                    f"无法导入 funasr：{type(error).__name__}: {error}"
                ) from error
            device = self._requested_device or ("cuda:0" if torch.cuda.is_available() else "cpu")
            # funasr preprocessing still burns CPU, and the default thread pool can take the cores video playback needs.
            torch.set_num_threads(cpu_threads(self.threads))
            try:
                model = AutoModel(
                    model=str(self.model_dir), device=device, disable_update=True
                )
            except Exception as error:
                raise SenseVoiceModelUnavailable(
                    f"无法从 {self.model_dir} 加载 SenseVoiceSmall 模型"
                    f"（{type(error).__name__}: {error}）"
                ) from error
            self._model = model
            self._device = device
            self._loaded = True

    def warmup(self) -> None:
        """Run the cold inference before live audio enters the bounded capture queue."""
        with self._inference_lock:
            if self._warmed:
                return
            self._transcribe_locked(np.zeros(int(SAMPLE_RATE * 0.6), dtype=np.float32), language=None)
            self._warmed = True

    def unload(self) -> None:
        """Wait for in-flight inference to finish, then drop weights and clear the CUDA cache."""
        with self._inference_lock:
            with self._load_lock:
                model = self._model
                device = self._device or self._requested_device
                self._model = None
                self._loaded = False
                self._warmed = False
                self._device = None
            del model
            gc.collect()
            release_device_cache(device)

    def transcribe(
        self,
        samples: NDArray[np.float32],
        *,
        prefix: str | None = None,
        language: str | None = None,
    ) -> tuple[str, str | None]:
        del prefix  # non-autoregressive models take no continuation prefix; every block is a fresh whole-segment pass
        with self._inference_lock:
            return self._transcribe_locked(samples, language=language)

    def _transcribe_locked(
        self, samples: NDArray[np.float32], *, language: str | None
    ) -> tuple[str, str | None]:
        audio = np.asarray(samples, dtype=np.float32).reshape(-1)
        if audio.size == 0:
            return "", None
        self.load()
        assert self._model is not None

        requested = (language or "auto").strip().lower()
        hint = requested if requested in SUPPORTED_LANGUAGES else "auto"
        results = self._model.generate(
            input=np.ascontiguousarray(audio, dtype=np.float32),
            cache={},
            language=hint,
            use_itn=True,
            batch_size_s=BATCH_SIZE_S,
        )
        if not results:
            return "", None
        return _parse_text(str(results[0].get("text") or ""))


def _parse_text(raw: str) -> tuple[str, str | None]:
    """``<|lang|><|emo|><|event|><|itn|>body`` → (body, protocol language code)."""
    text = raw.strip()
    tags = _TAG_PREFIX.match(text)
    if tags is None:
        return "", None
    language = _TAG.match(tags.group(0))
    body = text[tags.end() :].strip()
    if not body or body == "❓":
        return "", None
    detected = language.group(1).lower() if language else ""
    return body, detected if detected in SUPPORTED_LANGUAGES else None


_runtimes: dict[tuple, SenseVoiceRuntime] = {}
_runtimes_lock = threading.Lock()


def get_sensevoice_runtime(model_dir: Path, **options) -> SenseVoiceRuntime:
    """Cache by resolved model directory and compute options."""
    resolved = Path(model_dir).resolve()
    key = (os.path.normcase(str(resolved)), tuple(sorted(options.items())))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = SenseVoiceRuntime(resolved, **options)
            _runtimes[key] = runtime
        return runtime
