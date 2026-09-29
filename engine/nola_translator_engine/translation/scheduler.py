"""Multi-target translation, revision invalidation, timeouts, and a session-scoped LRU cache."""

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
        max_concurrency: int = 3,
    ) -> None:
        self.provider = provider
        self.timeout_seconds = timeout_seconds
        self.cache_size = max(0, cache_size)
        self.cache: OrderedDict[tuple[str, str, str, str], ProviderTranslation] = OrderedDict()
        self.current_revision: OrderedDict[str, int] = OrderedDict()
        self.active_segments: dict[str, int] = {}
        self.semaphore = asyncio.Semaphore(max(1, max_concurrency))
        self.inflight: dict[tuple[str, str, str, str], asyncio.Task[ScheduledTranslation]] = {}

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
        self.current_revision.move_to_end(segment_id)
        self.active_segments[segment_id] = self.active_segments.get(segment_id, 0) + 1
        try:
            results = await asyncio.gather(
                *(self._translate_one(text, source, target) for target in targets)
            )
            if self.current_revision.get(segment_id) != revision:
                return []
            return list(results)
        finally:
            self.active_segments[segment_id] -= 1
            if not self.active_segments[segment_id]:
                del self.active_segments[segment_id]
            for old in list(self.current_revision):
                if len(self.current_revision) <= max(1, self.cache_size):
                    break
                if old not in self.active_segments:
                    del self.current_revision[old]

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
        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._request(key, normalized, source, target))
            self.inflight[key] = task
            task.add_done_callback(lambda _task: self.inflight.pop(key, None))
        return await asyncio.shield(task)

    async def close(self) -> None:
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def _request(
        self, key: tuple[str, str, str, str], normalized: str, source: str, target: str
    ) -> ScheduledTranslation:
        try:
            async with self.semaphore:
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
