"""Local Hy-MT2 translation provider: official prompt construction and language validation."""

from __future__ import annotations

import asyncio

from ..hub import HYMT2_LANGUAGES
from .base import ProviderTranslation
from .llama_server import LlamaServerManager

# The language table from the official Hy-MT2 README (39 rows), code → full English name. It now
# lives in hub.py next to the adapter that declares Hy-MT2's capabilities: the table describes the
# *model*, not this prompt template, and a runtime adapter that cannot answer "which languages do
# you cover" is just the hardcoded list wearing a different hat.
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


def _system_prompt(source_key: str, target_key: str) -> str:
    """Hy-MT2's official default translation prompt: full language names plus the
    translate-only constraint, with the body carried by the user message.
    """
    source_name = SUPPORTED_LANGUAGES[source_key]
    target_name = SUPPORTED_LANGUAGES[target_key]
    return (
        f"Translate the following text from {source_name} into {target_name}. "
        "Note that you should **only output the translated result "
        "without any additional explanation**:"
    )


class HyMt2TranslationProvider:
    """Local Hy-MT2 translation provider backed by llama-server."""

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
