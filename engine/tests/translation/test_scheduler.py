import asyncio

import pytest

from fluentcaptions_engine.translation.base import ProviderTranslation
from fluentcaptions_engine.translation.scheduler import TranslationScheduler


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


class SlowProvider:
    name = "slow"

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        del text, source, target
        await asyncio.sleep(1)
        return ProviderTranslation("late", ("en", "zh"))


@pytest.mark.asyncio
async def test_new_revision_invalidates_old_results_and_timeout_is_per_target() -> None:
    scheduler = TranslationScheduler(SlowProvider(), timeout_seconds=0.01)
    old_task = asyncio.create_task(
        scheduler.translate("segment-1", 1, "old", "en", ["zh"])
    )
    await asyncio.sleep(0)
    current = await scheduler.translate("segment-1", 2, "new", "en", ["zh"])
    old = await old_task

    assert current[0].state == "failed"
    assert current[0].error_code == "translationTimeout"
    assert old == []

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
