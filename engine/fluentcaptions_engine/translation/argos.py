"""Argos Translate 本地直译与显式英语中转。"""

from __future__ import annotations

import asyncio
from collections.abc import Callable
import os
import sys
from types import ModuleType
from typing import Protocol

from .base import ProviderTranslation


class Translator(Protocol):
    def __call__(self, text: str) -> str: ...


TranslatorLookup = Callable[[str, str], Translator | None]


class TranslationPathError(RuntimeError):
    pass


def _installed_lookup(source: str, target: str) -> Translator | None:
    # Argos 的 sbd 模块会无条件导入 Stanza，而本应用明确使用 MiniSBD。
    # 打包版注入轻量占位模块，避免携带未执行分支需要的整套 Torch。
    if os.environ.get("ARGOS_CHUNK_TYPE", "MINISBD").upper() == "MINISBD":
        sys.modules.setdefault("spacy", None)
        sys.modules.setdefault("stanza", ModuleType("stanza"))
    from argostranslate import translate

    languages = {language.code: language for language in translate.get_installed_languages()}
    source_language = languages.get(source)
    target_language = languages.get(target)
    if source_language is None or target_language is None:
        return None
    try:
        translation = source_language.get_translation(target_language)
    except Exception:
        return None
    return translation.translate


class ArgosTranslationProvider:
    name = "argos"

    def __init__(
        self,
        *,
        lookup: TranslatorLookup = _installed_lookup,
        allow_intermediate: bool = False,
    ) -> None:
        self.lookup = lookup
        self.allow_intermediate = allow_intermediate
        self.lock = asyncio.Lock()
        self.translators: dict[tuple[str, str], Translator] = {}

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        async with self.lock:
            return await self._translate_locked(text, source, target)

    async def _translate_locked(
        self, text: str, source: str, target: str
    ) -> ProviderTranslation:
        if source == target:
            return ProviderTranslation(text, (source, target))
        direct = self._translator(source, target)
        if direct is not None:
            translated = await asyncio.to_thread(direct, text)
            return ProviderTranslation(translated, (source, target))

        if self.allow_intermediate and source != "en" and target != "en":
            to_english = self._translator(source, "en")
            from_english = self._translator("en", target)
            if to_english is not None and from_english is not None:
                english = await asyncio.to_thread(to_english, text)
                translated = await asyncio.to_thread(from_english, english)
                return ProviderTranslation(translated, (source, "en", target))
        raise TranslationPathError(f"没有已安装的翻译路径：{source} -> {target}")

    def _translator(self, source: str, target: str) -> Translator | None:
        key = (source, target)
        cached = self.translators.get(key)
        if cached is not None:
            return cached
        translator = self.lookup(source, target)
        if translator is not None:
            self.translators[key] = translator
        return translator
