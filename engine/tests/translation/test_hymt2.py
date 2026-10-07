"""hymt2 provider unit tests: a fake manager captures the prompt, covering the official template and language validation."""

from __future__ import annotations

import pytest

from nola_translator_engine.translation.hymt2 import (
    SUPPORTED_LANGUAGES,
    HyMt2TranslationProvider,
    UnsupportedLanguagePair,
    is_supported,
    validate_session_languages,
)
from nola_translator_engine.translation.llama_server import LlamaServerError


class FakeManager:
    def __init__(self, result: str = "你好。", error: Exception | None = None) -> None:
        self.calls: list[list[dict]] = []
        self.result = result
        self.error = error

    def chat_sync(self, messages: list[dict], *, timeout_s: float = 10.0) -> str:
        self.calls.append(messages)
        if self.error is not None:
            raise self.error
        return self.result


def test_supported_language_table_matches_official_readme() -> None:
    assert len(SUPPORTED_LANGUAGES) == 38
    assert SUPPORTED_LANGUAGES["zh"] == "Chinese"
    assert SUPPORTED_LANGUAGES["zh-Hant"] == "Traditional Chinese"
    assert SUPPORTED_LANGUAGES["bo"] == "Tibetan"
    assert SUPPORTED_LANGUAGES["yue"] == "Cantonese"


def test_is_supported_handles_codes_and_aliases() -> None:
    assert is_supported("en") and is_supported("zh-Hant")
    assert is_supported("zh-CN") and is_supported("zh-Hans")
    assert is_supported("zh-TW") and is_supported("en-US")
    assert is_supported("fil")
    assert not is_supported("xx") and not is_supported("")


async def test_translate_builds_official_prompt_with_full_names() -> None:
    manager = FakeManager(result="今天天气很好。")
    provider = HyMt2TranslationProvider(manager)  # type: ignore[arg-type]

    result = await provider.translate("The weather is nice today.", "en", "zh")

    assert provider.name == "hymt2"
    assert result.text == "今天天气很好。"
    assert result.path == ("en", "zh")
    assert manager.calls[0] == [{
        "role": "user",
        "content": "Translate the following text into Chinese. Note that you should only output "
        "the translated result without any additional explanation:\nThe weather is nice today.",
    }]


async def test_translate_uses_traditional_chinese_name_for_zh_hant() -> None:
    manager = FakeManager()
    provider = HyMt2TranslationProvider(manager)  # type: ignore[arg-type]

    await provider.translate("Hello", "en", "zh-Hant")

    assert "into Traditional Chinese." in manager.calls[0][0]["content"]


async def test_translate_accepts_language_aliases() -> None:
    manager = FakeManager()
    provider = HyMt2TranslationProvider(manager)  # type: ignore[arg-type]

    await provider.translate("Hello", "en", "zh-CN")
    await provider.translate("Hello", "en", "zh-TW")
    await provider.translate("Hello", "en", "fil")

    contents = [call[0]["content"] for call in manager.calls]
    assert "into Chinese." in contents[0]
    assert "into Traditional Chinese." in contents[1]
    assert "into Filipino." in contents[2]
    assert all(content.endswith("\nHello") for content in contents)


@pytest.mark.parametrize(("target", "instruction"), [("bo", "into Tibetan."), ("yue", "翻译为粤语")])
async def test_translate_keeps_tibetan_and_cantonese_target_names(target: str, instruction: str) -> None:
    manager = FakeManager()
    provider = HyMt2TranslationProvider(manager)  # type: ignore[arg-type]

    await provider.translate("What would you like to eat today?", "en", target)

    assert len(manager.calls[0]) == 1
    assert manager.calls[0][0]["role"] == "user"
    assert instruction in manager.calls[0][0]["content"]
    assert "into Chinese." not in manager.calls[0][0]["content"]
    assert manager.calls[0][0]["content"].endswith("\nWhat would you like to eat today?")


async def test_translate_rejects_unsupported_target() -> None:
    provider = HyMt2TranslationProvider(FakeManager())  # type: ignore[arg-type]

    with pytest.raises(UnsupportedLanguagePair) as info:
        await provider.translate("Hello", "en", "klingon")

    assert info.value.source == "en"
    assert info.value.target == "klingon"
    assert isinstance(info.value, ValueError)


async def test_translate_rejects_unsupported_source() -> None:
    provider = HyMt2TranslationProvider(FakeManager())  # type: ignore[arg-type]

    with pytest.raises(UnsupportedLanguagePair) as info:
        await provider.translate("Hello", "xx", "zh")

    assert info.value.source == "xx"
    assert info.value.target == "zh"


async def test_chat_error_propagates_unchanged() -> None:
    error = LlamaServerError("llama-server 未就绪")
    provider = HyMt2TranslationProvider(FakeManager(error=error))  # type: ignore[arg-type]

    with pytest.raises(LlamaServerError, match="未就绪"):
        await provider.translate("Hello", "en", "zh")


def test_validate_session_languages_matrix() -> None:
    assert validate_session_languages("auto", ["zh", "en"]) == []
    assert validate_session_languages(None, ["zh", "ja"]) == []
    assert validate_session_languages("en", ["zh-CN", "yue"]) == []
    assert validate_session_languages("auto", ["xx", "zh"]) == ["xx"]
    assert validate_session_languages("auto", ["zh-CN", "yy", "yy"]) == ["yy"]
    assert validate_session_languages("xx", ["zh"]) == ["xx"]
    assert validate_session_languages("xx", ["yy"]) == ["xx", "yy"]
    assert validate_session_languages("en", ["zh-TW", "fil"]) == []
