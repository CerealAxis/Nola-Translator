"""多目标翻译、revision 失效、超时和会话级 LRU 缓存。"""

from __future__ import annotations

import asyncio
from collections import OrderedDict
import unicodedata

from .base import ProviderTranslation, ScheduledTranslation, TranslationProvider


class TranslationScheduler:
    def __init__(
        self,
        provider: TranslationProvider,
        *,
        timeout_seconds: float = 10,
        cache_size: int = 512,
    ) -> None:
        self.provider = provider
        self.timeout_seconds = timeout_seconds
        self.cache_size = cache_size
        self.cache: OrderedDict[tuple[str, str, str, str], ProviderTranslation] = OrderedDict()
        self.current_revision: dict[str, int] = {}

    async def translate(
        self,
        segment_id: str,
        revision: int,
        text: str,
        source: str,
        targets: list[str],
    ) -> list[ScheduledTranslation]:
        current = self.current_revision.get(segment_id, -1)
        if revision < current:
            return []
        self.current_revision[segment_id] = revision
        results = await asyncio.gather(
            *(self._translate_one(text, source, target) for target in targets)
        )
        if self.current_revision.get(segment_id) != revision:
            return []
        return list(results)

    async def _translate_one(
        self, text: str, source: str, target: str
    ) -> ScheduledTranslation:
        normalized = unicodedata.normalize("NFKC", text).strip()
        key = (self.provider.name, source, target, normalized)
        cached = self.cache.get(key)
        if cached is not None:
            self.cache.move_to_end(key)
            return ScheduledTranslation(
                target,
                "complete",
                self.provider.name,
                text=cached.text,
                path=cached.path,
            )
        try:
            result = await asyncio.wait_for(
                self.provider.translate(normalized, source, target),
                timeout=self.timeout_seconds,
            )
        except TimeoutError:
            return ScheduledTranslation(
                target, "failed", self.provider.name, error_code="translationTimeout"
            )
        except Exception as error:
            return ScheduledTranslation(
                target,
                "failed",
                self.provider.name,
                error_code=type(error).__name__,
            )

        self.cache[key] = result
        self.cache.move_to_end(key)
        while len(self.cache) > self.cache_size:
            self.cache.popitem(last=False)
        return ScheduledTranslation(
            target,
            "complete",
            self.provider.name,
            text=result.text,
            path=result.path,
        )
