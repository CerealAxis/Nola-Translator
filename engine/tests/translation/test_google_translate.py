import httpx
import pytest

from nola_translator_engine.translation.google_translate import GoogleTranslateError, GoogleTranslateProvider


@pytest.mark.asyncio
async def test_google_translate_sends_official_v2_payload_and_key():
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"data": {"translations": [{"translatedText": "你好 &amp; 世界"}]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    provider = GoogleTranslateProvider(api_key="test-key", client=client)
    result = await provider.translate("Hello & world", "en", "zh-CN")

    assert result.text == "你好 & 世界"
    assert requests[0].url.params["key"] == "test-key"
    assert requests[0].url.path.endswith("/language/translate/v2")
    assert requests[0].read().decode() == '{"q":"Hello & world","target":"zh-CN","format":"text","source":"en"}'
    await provider.aclose()


@pytest.mark.asyncio
async def test_google_translate_omits_source_for_auto_detection():
    def respond(request: httpx.Request) -> httpx.Response:
        assert "source" not in request.read().decode()
        return httpx.Response(200, json={"data": {"translations": [{"translatedText": "你好"}]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    provider = GoogleTranslateProvider(api_key="test-key", client=client)
    assert (await provider.translate("Hello", "auto", "zh")).text == "你好"
    await provider.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("status,expected", [(429, "translationRateLimited"), (401, "HTTPError")])
async def test_google_translate_classifies_http_failures(status: int, expected: str):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(status)))
    provider = GoogleTranslateProvider(api_key="test-key", client=client)
    with pytest.raises(GoogleTranslateError, match=expected):
        await provider.translate("Hello", "en", "zh")
    await provider.aclose()


@pytest.mark.asyncio
async def test_google_translate_maps_quota_403_to_rate_limit():
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(403, text="quota exceeded")))
    provider = GoogleTranslateProvider(api_key="test-key", client=client)
    with pytest.raises(GoogleTranslateError, match="translationRateLimited"):
        await provider.translate("Hello", "en", "zh")
    await provider.aclose()
