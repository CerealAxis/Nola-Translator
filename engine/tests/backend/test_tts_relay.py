import io
import wave
from types import SimpleNamespace

import httpx
import pytest

from nola_translator_engine.backend.gateway.capabilities import CallContext, GatewayError, Operation
from nola_translator_engine.backend.gateway.tts_relay import TtsProviderRelayAdapter
from nola_translator_engine.backend.tts_contracts import SynthesisRequest


async def test_relay_preserves_language_and_decodes_provider_audio(monkeypatch):
    output = io.BytesIO()
    with wave.open(output, 'wb') as wav:
        wav.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
        wav.writeframes(b'\1\0' * 16)
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, content=output.getvalue())
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(respond), **kwargs))
    ctx = CallContext(Operation.SYNTHESIZE, 'job', provider_options={'relay_url': 'http://127.0.0.1:9000/synthesize', 'relay_token': 'private'})
    result = await TtsProviderRelayAdapter().synthesize(SimpleNamespace(), ctx, synthesis=SynthesisRequest(text='Bonjour', language='fr'))
    assert result.chunks[0].sample_rate == 24000 and len(result.chunks[0].pcm) == 32
    assert requests[0].headers['Authorization'] == 'Bearer private'
    import json
    assert json.loads(requests[0].content) == {'text': 'Bonjour', 'language': 'fr'}


async def test_relay_rejects_external_addresses_before_network(monkeypatch):
    def unexpected(**kwargs):
        raise AssertionError('Network must not be called')
    monkeypatch.setattr(httpx, 'AsyncClient', unexpected)
    ctx = CallContext(Operation.SYNTHESIZE, 'job', provider_options={'relay_url': 'https://example.com/synthesize', 'relay_token': 'private'})
    with pytest.raises(GatewayError, match='Private TTS relay'):
        await TtsProviderRelayAdapter().synthesize(SimpleNamespace(), ctx, synthesis=SynthesisRequest(text='Hello', language='en'))


async def test_quota_errors_remain_nonretryable(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: original(transport=httpx.MockTransport(
        lambda request: httpx.Response(502, json={'error': 'CLOUD_MODEL_BILLING_REQUIRED'})), **kwargs))
    ctx = CallContext(Operation.SYNTHESIZE, 'job', provider_options={'relay_url': 'http://127.0.0.1:9000/synthesize', 'relay_token': 'private'})
    with pytest.raises(GatewayError) as caught:
        await TtsProviderRelayAdapter().synthesize(SimpleNamespace(), ctx, synthesis=SynthesisRequest(text='Hello', language='en'))
    assert caught.value.provider_code == 'quota_exceeded' and not caught.value.retryable
