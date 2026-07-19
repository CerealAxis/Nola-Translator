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
