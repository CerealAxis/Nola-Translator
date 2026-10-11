import httpx
import pytest

from nola_translator_engine.translation.mymemory import MyMemoryError, MyMemoryTranslationProvider
from nola_translator_engine.translation.scheduler import TranslationScheduler


@pytest.mark.asyncio
async def test_utf8_limit_email_html_decode_and_language_pair():
    queries = []
    def request(req):
        queries.append(req.url.params["q"])
        assert len(req.url.params["q"].encode("utf-8")) <= 500
        assert req.url.params["langpair"] == "zh|en"
        assert req.url.params["de"] == "user@example.com"
        return httpx.Response(200, json={"responseStatus": 200, "responseData": {"translatedText": "Tom &amp; Jerry &#39;hello&#39;"}})
    client = httpx.AsyncClient(transport=httpx.MockTransport(request))
    provider = MyMemoryTranslationProvider(email="user@example.com", client=client)
    text = "汉" * 400 + "😀" * 100
    result = await provider.translate(text, "zh", "en")
    assert "".join(queries) == text and len(queries) == 4
    assert result.text == " ".join(["Tom & Jerry 'hello'"] * 4)
    assert provider.timeout_for(text, "zh", "en") > 60
    await provider.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("body", [
    {"responseStatus": 429, "responseDetails": "private source", "responseData": {"translatedText": "quota"}},
    {"responseStatus": 200, "quotaFinished": True, "responseData": {"translatedText": "quota"}},
])
async def test_embedded_quota_is_a_failure_not_caption_text(body):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=body)))
    provider = MyMemoryTranslationProvider(client=client)
    scheduler = TranslationScheduler(provider)
    result = await scheduler.translate("segment", 1, "private source", "en", ["zh"])
    assert result[0].state == "failed" and result[0].error_code == "translationRateLimited"
    assert result[0].text is None
    await scheduler.close()


@pytest.mark.asyncio
async def test_query_and_vendor_errors_never_escape_in_exception():
    def request(req):
        raise httpx.ConnectError(f"request failed {req.url}", request=req)
    provider = MyMemoryTranslationProvider(client=httpx.AsyncClient(transport=httpx.MockTransport(request)))
    with pytest.raises(MyMemoryError) as error:
        await provider.translate("private source", "en", "zh")
    assert str(error.value) == "URLError" and error.value.__cause__ is None
    await provider.aclose()
