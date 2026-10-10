"""M2M100 418M local translation provider: in-process transformers inference and FLORES-101 language validation."""

from __future__ import annotations
from ..compute import cpu_threads, release_device_cache, resolve_dtype

import asyncio
import gc
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .base import ProviderTranslation


MAX_NEW_TOKENS = 256
DEVICE_ENV_VAR = "NOLA_TRANSLATOR_M2M100_DEVICE"

# FLORES-101 (transformers FAIRSEQ_LANGUAGE_CODES["m2m100"]); used only to validate support, never to build a prompt.
FLORES_LANGUAGES = frozenset(
    {
        "af", "am", "ar", "ast", "az", "ba", "be", "bg", "bn", "br", "bs",
        "ca", "ceb", "cs", "cy", "da", "de", "el", "en", "es", "et", "fa",
        "ff", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha", "he", "hi",
        "hr", "ht", "hu", "hy", "id", "ig", "ilo", "is", "it", "ja", "jv",
        "ka", "kk", "km", "kn", "ko", "lb", "lg", "ln", "lo", "lt", "lv",
        "mg", "mk", "ml", "mn", "mr", "ms", "my", "ne", "nl", "no", "ns",
        "oc", "or", "pa", "pl", "ps", "pt", "ro", "ru", "sd", "si", "sk",
        "sl", "so", "sq", "sr", "ss", "su", "sv", "sw", "ta", "th", "tl",
        "tn", "tr", "uk", "ur", "uz", "vi", "wo", "xh", "yi", "yo", "zh",
        "zu",
    }
)


class UnsupportedLanguagePair(ValueError):
    """A language (pair) M2M100 does not support."""

    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"M2M100 不支持的语言：source={source} target={target}")
        self.source = source
        self.target = target


class M2M100ModelUnavailable(RuntimeError):
    """Model unavailable: directory missing, or the weights/tokenizer failed to load."""


def _resolve_device(torch: Any) -> str:
    """Stay on CPU by default: the recognition model already owns VRAM, so the translation model doesn't compete for it.

    Set NOLA_TRANSLATOR_M2M100_DEVICE=cuda to put it on the GPU; without CUDA it falls back to CPU.
    """
    requested = os.environ.get(DEVICE_ENV_VAR, "").strip().lower()
    if requested in ("cuda", "gpu") and torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def _normalize_language_code(code: str) -> str | None:
    """Protocol code (including region suffixes like zh-CN) → FLORES-101 code; None when unknown."""
    raw = code.strip().casefold()
    if not raw:
        return None
    if raw in FLORES_LANGUAGES:
        return raw
    primary = raw.partition("-")[0]
    return primary if primary in FLORES_LANGUAGES else None


def is_supported(code: str) -> bool:
    """Whether a language code is in FLORES-101 (region-suffix aliases included)."""
    return _normalize_language_code(code) is not None


def validate_session_languages(source: str | None, targets: list[str]) -> list[str]:
    """Pre-session check returning the unsupported codes; a source of None/'auto' skips the source check."""
    unsupported: list[str] = []
    if source is not None and source.strip().casefold() != "auto":
        if _normalize_language_code(source) is None:
            unsupported.append(source)
    for target in targets:
        if _normalize_language_code(target) is None:
            unsupported.append(target)
    return list(dict.fromkeys(unsupported))


@dataclass(slots=True)
class _Bundle:
    model: Any
    tokenizer: Any


class M2M100Runtime:
    """In-process M2M100 runtime: load once, serialize access to the stateful tokenizer, single-flight inference."""

    def __init__(self, model_dir: Path, *, device: str | None = None,
                 precision: str = "auto", threads: int = 0) -> None:
        self.model_dir = Path(model_dir)
        self._lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._bundle: _Bundle | None = None
        self.device = device
        self.precision = precision
        self.threads = threads

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """Thread-safe one-shot load; failure raises M2M100ModelUnavailable."""
        with self._lock:
            if self._loaded:
                return
            try:
                bundle = self._load_bundle()
            except Exception as error:
                raise M2M100ModelUnavailable(
                    f"无法从 {self.model_dir} 加载 M2M100 模型：{type(error).__name__}: {error}"
                ) from error
            self._bundle = bundle
            self._loaded = True

    def wait_idle(self) -> None:
        """Wait out cancelled native translations before a session reuses the tokenizer."""
        with self._inference_lock:
            pass

    def unload(self) -> None:
        """Wait for translation threads before releasing weights on a model switch or service close."""
        with self._inference_lock:
            with self._lock:
                bundle = self._bundle
                self._bundle = None
                self._loaded = False
            del bundle
            gc.collect()
            release_device_cache(self.device)

    def _load_bundle(self) -> _Bundle:
        """The real from_pretrained block, split into its own method so tests can stub it."""
        import torch
        from transformers import AutoTokenizer, M2M100ForConditionalGeneration

        device = self.device or _resolve_device(torch)
        self.device = device
        torch.set_num_threads(cpu_threads(self.threads))
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), local_files_only=True)
        model = M2M100ForConditionalGeneration.from_pretrained(
            str(self.model_dir),
            torch_dtype=resolve_dtype(device, self.precision),
            local_files_only=True,
        )
        model = model.to(device).eval()
        return _Bundle(model=model, tokenizer=tokenizer)

    def translate_sync(self, text: str, source: str, target: str) -> str:
        """Translate one string; the tokenizer's source-language prefix is stateful, so it
        is held under lock while in use.
        """
        with self._inference_lock:
            return self._translate_locked(text, source, target)

    def _translate_locked(self, text: str, source: str, target: str) -> str:
        import torch

        self.load()
        bundle = self._bundle
        assert bundle is not None
        with self._lock:
            bundle.tokenizer.src_lang = source
            bundle.tokenizer.set_tgt_lang_special_tokens(target)
            inputs = bundle.tokenizer(text, return_tensors="pt")
            forced_bos_token_id = bundle.tokenizer.get_lang_id(target)
            inputs = {key: value.to(bundle.model.device) for key, value in inputs.items()}
        with torch.inference_mode():
            output = bundle.model.generate(
                **inputs, forced_bos_token_id=forced_bos_token_id, max_new_tokens=MAX_NEW_TOKENS
            )
        result = bundle.tokenizer.batch_decode(output, skip_special_tokens=True)[0]
        return result.strip()


_runtimes: dict[tuple, M2M100Runtime] = {}
_runtimes_lock = threading.Lock()


def get_m2m100_runtime(model_dir: Path, **options) -> M2M100Runtime:
    """Cache by resolved model directory and compute options."""
    resolved = Path(model_dir).resolve()
    key = (os.path.normcase(str(resolved)), tuple(sorted(options.items())))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = M2M100Runtime(resolved, **options)
            _runtimes[key] = runtime
        return runtime


class M2M100TranslationProvider:
    """Local M2M100 translation provider built on transformers."""

    name = "m2m100"

    def __init__(self, model_dir: Path, **options) -> None:
        self.runtime = get_m2m100_runtime(model_dir, **options)

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        source_code = _normalize_language_code(source)
        target_code = _normalize_language_code(target)
        if source_code is None or target_code is None:
            raise UnsupportedLanguagePair(source, target)
        content = await asyncio.to_thread(
            self.runtime.translate_sync, text, source_code, target_code
        )
        return ProviderTranslation(content, (source, target))
