"""Multi-target translation, revision invalidation, timeouts, and a session-scoped LRU cache."""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import Callable
from time import monotonic
import unicodedata
import httpx

from .base import ProviderTranslation, ScheduledTranslation, TranslationProvider
from ..debug_log import write as write_debug


class TranslationScheduler:
    def __init__(
        self,
        provider: TranslationProvider,
        *,
        # The flat budget for a provider that answers in one request, and the floor for a
        # provider that asks for more; see `_budget_seconds`. Not a hard ceiling.
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
        self.listeners: dict[tuple[str, str, str, str], set[Callable[[ScheduledTranslation], None]]] = {}

    async def translate(
        self,
        segment_id: str,
        revision: int,
        text: str,
        source: str,
        targets: list[str],
        on_result: Callable[[ScheduledTranslation], None] | None = None,
    ) -> list[ScheduledTranslation]:
        current = self.current_revision.get(segment_id, -1)
        if revision < current:
            return []
        self.current_revision[segment_id] = revision
        self.current_revision.move_to_end(segment_id)
        self.active_segments[segment_id] = self.active_segments.get(segment_id, 0) + 1
        def notify(result: ScheduledTranslation) -> None:
            if on_result is not None and self.current_revision.get(segment_id) == revision:
                on_result(result)
        try:
            results = await asyncio.gather(
                *(self._translate_one(text, source, target, notify) for target in targets)
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
        self, text: str, source: str, target: str, notify: Callable[[ScheduledTranslation], None]
    ) -> ScheduledTranslation:
        normalized = unicodedata.normalize("NFKC", text).strip()
        key = (self.provider.name, source, target, normalized)
        cached = self.cache.get(key)
        if cached is not None:
            self.cache.move_to_end(key)
            result = ScheduledTranslation(
                target,
                "complete",
                self.provider.name,
                text=cached.text,
                path=cached.path,
            )
            notify(result)
            return result
        listeners = self.listeners.setdefault(key, set())
        listeners.add(notify)
        task = self.inflight.get(key)
        if task is None:
            task = asyncio.create_task(self._request(key, normalized, source, target))
            self.inflight[key] = task
            def retire(done: asyncio.Task[ScheduledTranslation]) -> None:
                if self.inflight.get(key) is done:
                    self.inflight.pop(key, None)
            task.add_done_callback(retire)
        try:
            result = await asyncio.shield(task)
            notify(result)
            return result
        finally:
            listeners.discard(notify)
            if not listeners:
                if self.listeners.get(key) is listeners:
                    self.listeners.pop(key, None)
                if not task.done():
                    # Cancel abandoned HTTP work so obsolete intermediates release their queue slot.
                    task.cancel()
                    if self.inflight.get(key) is task:
                        self.inflight.pop(key, None)
                    await asyncio.gather(task, return_exceptions=True)

    async def close(self) -> None:
        tasks = list(self.inflight.values())
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        close = getattr(self.provider, 'aclose', None)
        if close is not None:
            await close()

    def _budget_seconds(self, text: str, source: str, target: str) -> float:
        """How long this one translation may take.

        `timeout_seconds` is the flat budget for a provider that answers in a single
        request. A provider that has to split the text into several sequential requests —
        the cloud formats do, whenever contextWindow is smaller than the caption — states
        what it needs with `timeout_for`, since one flat budget across all those chunks cannot fit
        even one of them. The hook is optional, so every provider that does not need it keeps the flat default.
        """
        timeout_for = getattr(self.provider, "timeout_for", None)
        if timeout_for is None:
            return self.timeout_seconds
        return max(self.timeout_seconds, timeout_for(text, source, target))

    async def _request(
        self, key: tuple[str, str, str, str], normalized: str, source: str, target: str
    ) -> ScheduledTranslation:
        queued = monotonic()
        started: float | None = None
        first_text: float | None = None
        outcome = 'cancelled'
        def progress(text: str) -> None:
            nonlocal first_text
            if first_text is None:
                first_text = monotonic()
            update = ScheduledTranslation(target, 'pending', self.provider.name, text=text)
            for listener in tuple(self.listeners.get(key, ())):
                listener(update)
        try:
            async with self.semaphore:
                started = monotonic()
                stream = getattr(self.provider, 'translate_stream', None)
                result = await asyncio.wait_for(
                    stream(normalized, source, target, progress) if stream is not None
                    else self.provider.translate(normalized, source, target),
                    timeout=self._budget_seconds(normalized, source, target),
                )
                outcome = 'complete'
        except (TimeoutError, httpx.TimeoutException):
            outcome = 'timeout'
            return ScheduledTranslation(
                target, "failed", self.provider.name, error_code="translationTimeout"
            )
        except httpx.HTTPStatusError as error:
            outcome = 'failed'
            return ScheduledTranslation(target, 'failed', self.provider.name,
                error_code='translationRateLimited' if error.response.status_code == 429 else 'HTTPError')
        except httpx.RequestError:
            outcome = 'failed'
            return ScheduledTranslation(target, 'failed', self.provider.name, error_code='URLError')
        except Exception as error:
            outcome = 'failed'
            return ScheduledTranslation(
                target,
                "failed",
                self.provider.name,
                error_code=type(error).__name__,
            )
        finally:
            # Log timings only: credentials and caption text are not needed to locate queue delay.
            ended = monotonic()
            write_debug('engine', 'translation.timing', {
                'provider': self.provider.name, 'target': target, 'outcome': outcome,
                'queueMs': round(((started if started is not None else ended) - queued) * 1000),
                'requestMs': round((ended - started) * 1000) if started is not None else 0,
                'firstTextMs': round((first_text - started) * 1000) if first_text is not None and started is not None else None,
            })

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
