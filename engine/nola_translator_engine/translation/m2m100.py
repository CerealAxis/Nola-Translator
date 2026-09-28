"""M2M100 418M 本地翻译 Provider：进程内 transformers 推理与 FLORES-101 语言校验。"""

from __future__ import annotations

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

# FLORES-101（transformers FAIRSEQ_LANGUAGE_CODES["m2m100"]）；只用于支持性校验，不做提示词。
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
    """M2M100 不支持的语言（对）。"""

    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"M2M100 不支持的语言：source={source} target={target}")
        self.source = source
        self.target = target


class M2M100ModelUnavailable(RuntimeError):
    """模型不可用：目录缺失或权重/tokenizer 加载失败。"""


def _resolve_device(torch: Any) -> str:
    """默认留在 CPU：识别模型已独占显存，翻译模型不再与之争抢。

    需要上显卡时设 NOLA_TRANSLATOR_M2M100_DEVICE=cuda；无 CUDA 时自动退回 CPU。
    """
    requested = os.environ.get(DEVICE_ENV_VAR, "").strip().lower()
    if requested in ("cuda", "gpu") and torch.cuda.is_available():
        return "cuda:0"
    return "cpu"


def _normalize_language_code(code: str) -> str | None:
    """协议码（含 zh-CN 之类的地区后缀）→ FLORES-101 码；未知返回 None。"""
    raw = code.strip().casefold()
    if not raw:
        return None
    if raw in FLORES_LANGUAGES:
        return raw
    primary = raw.partition("-")[0]
    return primary if primary in FLORES_LANGUAGES else None


def is_supported(code: str) -> bool:
    """语言码是否在 FLORES-101 内（含地区后缀别名）。"""
    return _normalize_language_code(code) is not None


def validate_session_languages(source: str | None, targets: list[str]) -> list[str]:
    """会话启动前校验：返回不支持的语言码；source 为 None/'auto' 时跳过源语言检查。"""
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
    """M2M100 进程内运行时：一次加载、tokenizer 状态串行化、单次推理入口。"""

    def __init__(self, model_dir: Path) -> None:
        self.model_dir = Path(model_dir)
        self._lock = threading.Lock()
        self._inference_lock = threading.Lock()
        self._loaded = False
        self._bundle: _Bundle | None = None

    @property
    def loaded(self) -> bool:
        return self._loaded

    def load(self) -> None:
        """线程安全的一次性加载；失败抛 M2M100ModelUnavailable。"""
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

    def unload(self) -> None:
        """等待翻译线程完成后释放模型，不保留到下一次会话。"""
        with self._inference_lock:
            with self._lock:
                bundle = self._bundle
                self._bundle = None
                self._loaded = False
            del bundle
            gc.collect()
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    def _load_bundle(self) -> _Bundle:
        """实际 from_pretrained 块，独立成方法便于测试打桩。"""
        import torch
        from transformers import AutoTokenizer, M2M100ForConditionalGeneration

        device = _resolve_device(torch)
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), local_files_only=True)
        model = M2M100ForConditionalGeneration.from_pretrained(
            str(self.model_dir),
            dtype=torch.float16 if device.startswith("cuda") else torch.float32,
            local_files_only=True,
        )
        model = model.to(device).eval()
        return _Bundle(model=model, tokenizer=tokenizer)

    def translate_sync(self, text: str, source: str, target: str) -> str:
        """单条翻译；tokenizer 的源语言前缀是有状态的，取用期间持锁。"""
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


_runtimes: dict[str, M2M100Runtime] = {}
_runtimes_lock = threading.Lock()


def get_m2m100_runtime(model_dir: Path) -> M2M100Runtime:
    """按 resolved model_dir 缓存的进程级单例（会话期间只加载一次）。"""
    resolved = Path(model_dir).resolve()
    key = os.path.normcase(str(resolved))
    with _runtimes_lock:
        runtime = _runtimes.get(key)
        if runtime is None:
            runtime = M2M100Runtime(resolved)
            _runtimes[key] = runtime
        return runtime


class M2M100TranslationProvider:
    """基于 transformers 的 M2M100 本地翻译 Provider。"""

    name = "m2m100"

    def __init__(self, model_dir: Path) -> None:
        self.runtime = get_m2m100_runtime(model_dir)

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        source_code = _normalize_language_code(source)
        target_code = _normalize_language_code(target)
        if source_code is None or target_code is None:
            raise UnsupportedLanguagePair(source, target)
        content = await asyncio.to_thread(
            self.runtime.translate_sync, text, source_code, target_code
        )
        return ProviderTranslation(content, (source, target))
