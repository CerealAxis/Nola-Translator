"""Local Hy-MT2 translation provider: official prompt construction and language validation."""

from __future__ import annotations

import asyncio

from ..hub import HYMT2_LANGUAGES
from .base import ProviderTranslation
from .llama_server import LlamaServerManager

# Keep prompt names aligned with the adapter's official model capability table.
SUPPORTED_LANGUAGES: dict[str, str] = HYMT2_LANGUAGES

_CASEFOLD_INDEX = {code.casefold(): code for code in SUPPORTED_LANGUAGES}
_TRADITIONAL_ZH_SUFFIXES = {"tw", "hk", "mo"}


class UnsupportedLanguagePair(ValueError):
    """A language (pair) Hy-MT2 does not support."""

    def __init__(self, source: str, target: str) -> None:
        super().__init__(f"Hy-MT2 不支持的语言：source={source} target={target}")
        self.source = source
        self.target = target


def _normalize_language_code(code: str) -> str | None:
    """Normalize a language code to a key in the support table (aliases like zh-CN/fil included); None when unknown."""
    raw = code.strip()
    if not raw:
        return None
    folded = raw.casefold()
    matched = _CASEFOLD_INDEX.get(folded)
    if matched is not None:
        return matched
    primary, _, rest = folded.partition("-")
    if primary == "zh":
        # zh-Hant / zh-TW / zh-HK / zh-MO → traditional; every other zh-* → zh (simplified).
        if "hant" in rest.split("-") or rest in _TRADITIONAL_ZH_SUFFIXES:
            return "zh-Hant"
        return "zh"
    if folded == "fil":
        # the Qwen family spells Filipino `fil`; the official table uses tl.
        return "tl"
    return _CASEFOLD_INDEX.get(primary)


def is_supported(code: str) -> bool:
    """Whether a language code is in the Hy-MT2 support table (aliases included)."""
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


class HyMt2TranslationProvider:
    """Local Hy-MT2 translation provider backed by llama-server."""

    name = "hymt2"

    def __init__(self, manager: LlamaServerManager, *, languages: dict[str, str] | None = None) -> None:
        self.manager = manager
        self.languages = languages if languages is not None else SUPPORTED_LANGUAGES

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        from ..model_capabilities import normalize
        source_key = next((code for code in self.languages if normalize(code) == normalize(source)), None)
        target_key = next((code for code in self.languages if normalize(code) == normalize(target)), None)
        if source_key is None or target_key is None:
            raise UnsupportedLanguagePair(source, target)
        # Hy-MT2's official examples place the instruction and text in one user message.
        # The official Chinese template keeps Cantonese distinct from Standard Written Chinese
        # more reliably than the English template in local Q4_K_M inference checks.
        prompt = (
            f"将以下文本翻译为粤语，注意只需要输出翻译后的结果，不要额外解释：\n{text}"
            if normalize(target_key) == "yue"
            else (
                f"Translate the following text into {self.languages[target_key]}. "
                "Note that you should only output the translated result "
                f"without any additional explanation:\n{text}"
            )
        )
        messages = [{"role": "user", "content": prompt}]
        content = await asyncio.to_thread(self.manager.chat_sync, messages)
        return ProviderTranslation(content, (source, target))
