import httpx
import pytest

from nola_translator_engine.translation.google_translate import GoogleTranslateError, GoogleTranslateProvider


@pytest.mark.asyncio
async def test_google_translate_uses_public_web_client_and_escapes_plain_text():
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=[["你好 &amp; 世界"]])

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    provider = GoogleTranslateProvider(client=client)
    result = await provider.translate("Hello & world", "en", "zh-CN")

    assert result.text == "你好 & 世界"
    assert not requests[0].url.params
    assert requests[0].url.host == "translate-pa.googleapis.com"
    assert requests[0].url.path == "/v1/translateHtml"
    assert requests[0].headers["Content-Type"] == "application/json+protobuf"
    assert requests[0].read().decode() == '[[["Hello &amp; world"],"en","zh-CN"],"wt_lib"]'
    await provider.aclose()


@pytest.mark.asyncio
async def test_google_translate_preserves_auto_detection():
    def respond(request: httpx.Request) -> httpx.Response:
        assert request.read().decode() == '[[["Hello"],"auto","zh-CN"],"wt_lib"]'
        return httpx.Response(200, json=[["你好"]])

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    provider = GoogleTranslateProvider(client=client)
    assert (await provider.translate("Hello", "auto", "zh")).text == "你好"
    await provider.aclose()


@pytest.mark.asyncio
async def test_google_translate_preserves_line_breaks_and_decodes_entities_once():
    def respond(request: httpx.Request) -> httpx.Response:
        import json
        encoded = json.loads(request.content)[0][0][0]
        return httpx.Response(200, json=[[encoded]])

    client = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    provider = GoogleTranslateProvider(client=client)
    source = "a < b &amp; c\n\n<br> literal"
    assert (await provider.translate(source, "en", "zh")).text == source
    await provider.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("payload", [None, {}, [], [[None]], [[42]]])
async def test_google_translate_rejects_invalid_responses(payload):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=payload)))
    provider = GoogleTranslateProvider(client=client)
    with pytest.raises(GoogleTranslateError, match="translationInvalidResponse"):
        await provider.translate("Hello", "en", "zh")
    await provider.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("status,expected", [(429, "translationRateLimited"), (401, "HTTPError")])
async def test_google_translate_classifies_http_failures(status: int, expected: str):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(status)))
    provider = GoogleTranslateProvider(client=client)
    with pytest.raises(GoogleTranslateError, match=expected):
        await provider.translate("Hello", "en", "zh")
    await provider.aclose()


@pytest.mark.asyncio
async def test_google_translate_maps_quota_403_to_rate_limit():
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(403, text="quota exceeded")))
    provider = GoogleTranslateProvider(client=client)
    with pytest.raises(GoogleTranslateError, match="translationRateLimited"):
        await provider.translate("Hello", "en", "zh")
    await provider.aclose()
