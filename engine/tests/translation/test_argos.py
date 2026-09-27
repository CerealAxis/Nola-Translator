import pytest

from fluentcaptions_engine.translation.argos import ArgosTranslationProvider, TranslationPathError


class FakeLookup:
    def __init__(self) -> None:
        self.calls = 0
        self.edges = {
            ("en", "zh"): lambda text: f"中:{text}",
            ("ja", "en"): lambda text: f"EN:{text}",
        }

    def __call__(self, source: str, target: str):
        self.calls += 1
        return self.edges.get((source, target))


@pytest.mark.asyncio
async def test_argos_prefers_direct_translation() -> None:
    provider = ArgosTranslationProvider(lookup=FakeLookup())
    result = await provider.translate("hello", "en", "zh")
    assert result.text == "中:hello"
    assert result.path == ("en", "zh")


@pytest.mark.asyncio
async def test_argos_uses_explicit_english_pivot_only_when_enabled() -> None:
    provider = ArgosTranslationProvider(lookup=FakeLookup(), allow_intermediate=True)
    result = await provider.translate("こんにちは", "ja", "zh")
    assert result.text == "中:EN:こんにちは"
    assert result.path == ("ja", "en", "zh")

    disabled = ArgosTranslationProvider(lookup=FakeLookup(), allow_intermediate=False)
    with pytest.raises(TranslationPathError):
        await disabled.translate("こんにちは", "ja", "zh")


@pytest.mark.asyncio
async def test_argos_reuses_the_loaded_translator_during_a_session() -> None:
    lookup = FakeLookup()
    provider = ArgosTranslationProvider(lookup=lookup)

    await provider.translate("hello", "en", "zh")
    await provider.translate("hello again", "en", "zh")

    assert lookup.calls == 1

@pytest.mark.asyncio
async def test_cancelled_caller_keeps_native_worker_serialized_and_lookup_off_loop() -> None:
    import asyncio
    import threading
    entered = threading.Event()
    release = threading.Event()
    threads = []
    calls = []
    def translate(text):
        calls.append(text)
        if text == 'first':
            entered.set()
            assert release.wait(2)
        return text
    def lookup(source, target):
        threads.append(threading.get_ident())
        return translate
    provider = ArgosTranslationProvider(lookup=lookup)
    first = asyncio.create_task(provider.translate('first', 'en', 'zh'))
    try:
        assert await asyncio.to_thread(entered.wait, 2)
        first.cancel()
        with pytest.raises(asyncio.CancelledError):
            await first
        second = asyncio.create_task(provider.translate('second', 'en', 'zh'))
        await asyncio.sleep(0.02)
        assert calls == ['first']
        release.set()
        assert (await second).text == 'second'
        assert threads == [threads[0]]
        assert threads[0] != threading.get_ident()
    finally:
        release.set()
        await asyncio.gather(*provider.workers, return_exceptions=True)


@pytest.mark.asyncio
async def test_scheduler_timeout_leaves_native_lock_held_until_real_completion() -> None:
    import asyncio
    import threading
    from fluentcaptions_engine.translation.scheduler import TranslationScheduler
    entered = threading.Event()
    release = threading.Event()
    calls = []
    def translate(text):
        calls.append(text)
        if text == 'first':
            entered.set()
            assert release.wait(2)
        return text
    def lookup(source, target):
        return translate
    provider = ArgosTranslationProvider(lookup=lookup)
    scheduler = TranslationScheduler(provider, timeout_seconds=0.2)
    try:
        first = await scheduler.translate('segment-1', 1, 'first', 'en', ['zh'])
        assert first[0].state == 'failed'
        assert first[0].error_code == 'translationTimeout'
        assert await asyncio.to_thread(entered.wait, 2)

        second_task = asyncio.create_task(scheduler.translate('segment-1', 2, 'second', 'en', ['zh']))
        for _ in range(10):
            await asyncio.sleep(0)
        assert calls == ['first'], '超时后原生线程仍持锁，第二个请求必须等待'
        assert not second_task.done()

        release.set()
        second = await asyncio.wait_for(second_task, 2)
        assert second[0].state == 'complete'
        assert second[0].text == 'second'
        assert calls == ['first', 'second']
    finally:
        release.set()
        await asyncio.gather(*provider.workers, return_exceptions=True)
