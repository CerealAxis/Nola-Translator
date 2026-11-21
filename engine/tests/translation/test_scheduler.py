import asyncio

import pytest

from nola_translator_engine.translation.base import ProviderTranslation
from nola_translator_engine.translation.scheduler import TranslationScheduler


class CountingProvider:
    name = "counting"

    def __init__(self) -> None:
        self.calls = 0

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        self.calls += 1
        await asyncio.sleep(0)
        return ProviderTranslation(f"{target}:{text}", (source, target))


@pytest.mark.asyncio
async def test_scheduler_translates_targets_concurrently_and_caches_in_memory() -> None:
    provider = CountingProvider()
    scheduler = TranslationScheduler(provider, timeout_seconds=1)
    first = await scheduler.translate("segment-1", 1, "hello", "en", ["zh", "ja"])
    second = await scheduler.translate("segment-2", 1, "hello", "en", ["zh", "ja"])

    assert [item.text for item in first] == ["zh:hello", "ja:hello"]
    assert [item.text for item in second] == ["zh:hello", "ja:hello"]
    assert provider.calls == 2


@pytest.mark.asyncio
async def test_timeout_is_reported_per_target_without_discarding_success() -> None:
    class Provider:
        name = "partly-slow"

        async def translate(self, text, source, target):
            if target == "zh":
                await asyncio.Event().wait()
            return ProviderTranslation("ready", (source, target))

    scheduler = TranslationScheduler(Provider(), timeout_seconds=0.01)
    try:
        results = await scheduler.translate("segment-1", 1, "hello", "en", ["zh", "ja"])
        assert results[0].state == "failed"
        assert results[0].error_code == "translationTimeout"
        assert results[1].state == "complete"
        assert results[1].text == "ready"
    finally:
        await scheduler.close()


@pytest.mark.asyncio
async def test_concurrent_revisions_return_results_for_runtime_arbitration() -> None:
    started = {text: asyncio.Event() for text in ("old", "new")}
    release = {text: asyncio.Event() for text in ("old", "new")}

    class Provider:
        name = "controlled-revisions"

        async def translate(self, text, source, target):
            started[text].set()
            await release[text].wait()
            return ProviderTranslation(text, (source, target))

    scheduler = TranslationScheduler(Provider())
    tasks, old_updates, new_updates = [], [], []
    try:
        old = asyncio.create_task(scheduler.translate("segment", 1, "old", "en", ["zh"], old_updates.append))
        tasks.append(old)
        await asyncio.wait_for(started["old"].wait(), 1)
        new = asyncio.create_task(scheduler.translate("segment", 2, "new", "en", ["zh"], new_updates.append))
        tasks.append(new)
        await asyncio.wait_for(started["new"].wait(), 1)
        release["new"].set()
        assert (await new)[0].text == "new"
        assert not old.done()
        release["old"].set()
        assert (await old)[0].text == "old"
        assert [result.text for result in old_updates] == ["old"]
        assert [result.text for result in new_updates] == ["new"]
        assert scheduler.current_revision["segment"] == 2
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await scheduler.close()

@pytest.mark.asyncio
async def test_inflight_requests_are_shared_and_concurrency_is_bounded() -> None:
    class Provider:
        name = 'controlled'
        def __init__(self):
            self.calls = 0
            self.running = 0
            self.peak = 0
            self.release = asyncio.Event()
        async def translate(self, text, source, target):
            self.calls += 1
            self.running += 1
            self.peak = max(self.peak, self.running)
            await self.release.wait()
            self.running -= 1
            return ProviderTranslation(text, (source, target))
    provider = Provider()
    scheduler = TranslationScheduler(provider, max_concurrency=2, cache_size=3)
    tasks = [asyncio.create_task(scheduler.translate(str(i), 0, str(i // 2), 'en', ['zh']))
             for i in range(12)]
    for _ in range(20):
        await asyncio.sleep(0)
    assert provider.calls == 2
    provider.release.set()
    results = await asyncio.gather(*tasks)
    assert all(result[0].state == 'complete' for result in results)
    assert provider.calls == 6
    assert provider.peak == 2
    assert len(scheduler.current_revision) <= 3


@pytest.mark.asyncio
async def test_default_concurrency_limit_is_three() -> None:
    class Provider:
        name = 'probe'
        def __init__(self):
            self.running = 0
            self.peak = 0
            self.release = asyncio.Event()
        async def translate(self, text, source, target):
            self.running += 1
            self.peak = max(self.peak, self.running)
            await self.release.wait()
            self.running -= 1
            return ProviderTranslation(text, (source, target))
    provider = Provider()
    scheduler = TranslationScheduler(provider)
    tasks = [asyncio.create_task(scheduler.translate(str(i), 0, f'text-{i}', 'en', ['zh']))
             for i in range(6)]
    for _ in range(50):
        await asyncio.sleep(0)
    assert provider.peak == 3, '默认最多同时运行 3 个翻译请求'
    provider.release.set()
    results = await asyncio.gather(*tasks)
    assert all(result[0].state == 'complete' for result in results)
    assert provider.peak == 3


@pytest.mark.asyncio
async def test_cancelling_one_subscriber_keeps_shared_request_for_other_subscriber():
    started, release, cancelled = asyncio.Event(), asyncio.Event(), asyncio.Event()
    class Provider:
        name = 'shared'
        async def translate(self, text, source, target):
            started.set()
            try:
                await release.wait()
            except asyncio.CancelledError:
                cancelled.set()
                raise
            return ProviderTranslation(text, (source, target))
    scheduler = TranslationScheduler(Provider())
    first = asyncio.create_task(scheduler.translate('a', 1, 'same', 'en', ['zh']))
    second = asyncio.create_task(scheduler.translate('b', 1, 'same', 'en', ['zh']))
    await started.wait()
    first.cancel()
    await asyncio.gather(first, return_exceptions=True)
    assert not cancelled.is_set()
    release.set()
    assert (await second)[0].text == 'same'
    assert not scheduler.listeners
    await scheduler.close()


@pytest.mark.asyncio
async def test_provider_rate_limit_is_reported_without_retrying():
    import httpx
    class Provider:
        name = 'limited'
        calls = 0
        async def translate(self, text, source, target):
            self.calls += 1
            response = httpx.Response(429, request=httpx.Request('POST', 'https://example.test/v1'))
            response.raise_for_status()
    provider = Provider()
    scheduler = TranslationScheduler(provider)
    result = await scheduler.translate('segment', 1, 'hello', 'en', ['zh'])
    assert result[0].state == 'failed'
    assert result[0].error_code == 'translationRateLimited'
    assert provider.calls == 1
