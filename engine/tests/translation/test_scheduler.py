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
