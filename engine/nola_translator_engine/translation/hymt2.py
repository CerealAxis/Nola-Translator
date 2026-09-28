"""Hy-MT2 本地翻译 Provider：官方提示词构造与语言校验。"""

from __future__ import annotations

import asyncio

from .base import ProviderTranslation
from .llama_server import LlamaServerManager

# Hy-MT2 官方 README 支持语言表（39 行；S4 钉值），code → 完整英文名。
SUPPORTED_LANGUAGES: dict[str, str] = {
    "zh": "Chinese",
    "en": "English",
    "fr": "French",
    "pt": "Portuguese",
    "es": "Spanish",
    "ja": "Japanese",
    "tr": "Turkish",
    "ru": "Russian",
    "ar": "Arabic",
    "ko": "Korean",
    "th": "Thai",
    "it": "Italian",
    "de": "German",
    "vi": "Vietnamese",
    "ms": "Malay",
    "id": "Indonesian",
    "tl": "Filipino",
    "hi": "Hindi",
    "zh-Hant": "Traditional Chinese",
    "pl": "Polish",
    "cs": "Czech",
    "nl": "Dutch",
    "km": "Khmer",
    "my": "Burmese",
    "fa": "Persian",
    "gu": "Gujarati",
    "ur": "Urdu",
    "te": "Telugu",
    "mr": "Marathi",
    "he": "Hebrew",
    "bn": "Bengali",
    "ta": "Tamil",
    "uk": "Ukrainian",
    "bo": "Tibetan",
    "kk": "Kazakh",
    "mn": "Mongolian",
    "ug": "Uyghur",
    "yue": "Cantonese",
}

_CASEFOLD_INDEX = {code.casefold(): code for code in SUPPORTED_LANGUAGES}
_TRADITIONAL_ZH_SUFFIXES = {"tw", "hk", "mo"}


class UnsupportedLanguagePair(ValueError):
    """Hy-MT2 不支持的语言（对）。"""

    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"Hy-MT2 不支持的语言：source={source} target={target}")
        self.source = source
        self.target = target


def _normalize_language_code(code: str) -> str | None:
    """把语言码规范化到支持表键（含 zh-CN/fil 等别名）；未知返回 None。"""
    raw = code.strip()
    if not raw:
        return None
    folded = raw.casefold()
    matched = _CASEFOLD_INDEX.get(folded)
    if matched is not None:
        return matched
    primary, _, rest = folded.partition("-")
    if primary == "zh":
        # zh-Hant / zh-TW / zh-HK / zh-MO → 繁体；其余 zh-* → 简体（zh）。
        if "hant" in rest.split("-") or rest in _TRADITIONAL_ZH_SUFFIXES:
            return "zh-Hant"
        return "zh"
    if folded == "fil":
        # Qwen 系用 fil 表示菲律宾语，官方表内代码为 tl。
        return "tl"
    return _CASEFOLD_INDEX.get(primary)


def is_supported(code: str) -> bool:
    """语言码是否在 Hy-MT2 支持表内（含别名）。"""
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


def _system_prompt(source_key: str, target_key: str) -> str:
    """Hy-MT2 官方默认翻译提示词（完整语言名 + 只输出译文约束；正文由 user 消息携带）。"""
    source_name = SUPPORTED_LANGUAGES[source_key]
    target_name = SUPPORTED_LANGUAGES[target_key]
    return (
        f"Translate the following text from {source_name} into {target_name}. "
        "Note that you should **only output the translated result "
        "without any additional explanation**:"
    )


class HyMt2TranslationProvider:
    """基于 llama-server 的 Hy-MT2 本地翻译 Provider。"""

    name = "hymt2"

    def __init__(self, manager: LlamaServerManager) -> None:
        self.manager = manager

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        source_key = _normalize_language_code(source)
        target_key = _normalize_language_code(target)
        if source_key is None or target_key is None:
            raise UnsupportedLanguagePair(source, target)
        messages = [
            {"role": "system", "content": _system_prompt(source_key, target_key)},
            {"role": "user", "content": text},
        ]
        content = await asyncio.to_thread(self.manager.chat_sync, messages)
        return ProviderTranslation(content, (source, target))
