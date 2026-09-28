import pytest

from nola_translator_engine.translation.network import (
    MicrosoftTranslatorProvider,
    OllamaTranslationProvider,
    OpenAICompatibleProvider,
)


@pytest.mark.asyncio
async def test_microsoft_translator_uses_v3_contract() -> None:
    captured = {}

    def request(url, payload, headers):
        captured.update(url=url, payload=payload, headers=headers)
        return [{"translations": [{"text": "你好"}]}]

    result = await MicrosoftTranslatorProvider("secret", requester=request).translate("hello", "en", "zh")
    assert result.text == "你好"
    assert "api-version=3.0" in captured["url"] and "to=zh-Hans" in captured["url"]
    assert captured["headers"]["Ocp-Apim-Subscription-Key"] == "secret"


@pytest.mark.asyncio
async def test_openai_compatible_chat_completion() -> None:
    captured = {}

    def request(url, payload, headers):
        captured.update(url=url, payload=payload, headers=headers)
        return {"choices": [{"message": {"content": " 你好 "}}]}

    provider = OpenAICompatibleProvider(endpoint="https://example.test/v1", model="model", api_key="key", requester=request)
    assert (await provider.translate("hello", "en", "zh")).text == "你好"
    assert captured["url"].endswith("/v1/chat/completions")
    assert captured["headers"]["Authorization"] == "Bearer key"


@pytest.mark.asyncio
async def test_ollama_disables_streaming() -> None:
    captured = {}

    def request(url, payload, headers):
        captured.update(url=url, payload=payload)
        return {"message": {"content": "你好"}}

    provider = OllamaTranslationProvider(model="qwen3", requester=request)
    assert (await provider.translate("hello", "en", "zh")).text == "你好"
    assert captured["url"].endswith("/api/chat")
    assert captured["payload"]["stream"] is False
