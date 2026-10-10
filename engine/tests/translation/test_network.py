import pytest
import asyncio
import httpx

from nola_translator_engine.translation.network import (
    MicrosoftTranslatorProvider,
    OllamaTranslationProvider,
    OpenAICompatibleProvider,
    AnthropicMessagesProvider,
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


@pytest.mark.asyncio
async def test_chat_stream_exposes_text_before_completion_and_separates_minimax_thinking(monkeypatch):
    updates = []
    release = asyncio.Event()
    captured = {}

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"choices":[{"delta":{"reasoning_content":"private thinking"}}]}\n\n'
            yield 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n'.encode()
            await release.wait()
            yield b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'

    def handler(request):
        import json
        captured.update(json.loads(request.content))
        return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=Stream())

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: client)
    provider = OpenAICompatibleProvider(endpoint='https://api.minimax.io/v1', model='MiniMax-M2.7')
    task = asyncio.create_task(provider.translate_stream('hello', 'en', 'zh', updates.append))
    try:
        for _ in range(20):
            await asyncio.sleep(0)
        assert updates == ['你好']
        assert not task.done()
        assert captured['reasoning_split'] is True
        assert captured['temperature'] == 1
        release.set()
        assert (await task).text == '你好'
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        await client.aclose()


@pytest.mark.asyncio
async def test_truncated_chat_response_is_not_a_successful_translation():
    def request(*args):
        return {'choices': [{'message': {'content': 'unfinished'}, 'finish_reason': 'length'}]}
    provider = OpenAICompatibleProvider(model='model', requester=request)
    with pytest.raises(RuntimeError, match='截断'):
        await provider.translate('hello', 'en', 'zh')


@pytest.mark.asyncio
async def test_anthropic_stream_shows_text_without_thinking_and_reuses_client(monkeypatch):
    updates = []
    factory_calls = []
    requests = []
    release = asyncio.Event()

    class Stream(httpx.AsyncByteStream):
        async def __aiter__(self):
            yield b'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"secret"}}\n\n'
            yield 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"你好"}}\n\n'.encode()
            await release.wait()
            yield b'data: {"type":"message_stop"}\n\n'

    def handler(request):
        import json
        requests.append(json.loads(request.content))
        return httpx.Response(200, headers={'content-type': 'text/event-stream'}, stream=Stream())
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    def factory(**kwargs):
        factory_calls.append(kwargs)
        return client
    monkeypatch.setattr(httpx, 'AsyncClient', factory)
    provider = AnthropicMessagesProvider(endpoint='https://api.minimax.cn/anthropic', model='MiniMax M2.7', api_key='test')
    task = asyncio.create_task(provider.translate_stream('hello', 'en', 'zh', updates.append))
    try:
        for _ in range(20):
            await asyncio.sleep(0)
        assert updates == ['你好']
        assert not task.done()
        release.set()
        assert (await task).text == '你好'
        await provider.translate_stream('again', 'en', 'zh', updates.append)
        assert len(factory_calls) == 1
        assert all(request['stream'] is True for request in requests)
        await provider.aclose()
        assert client.is_closed
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)
        await client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize('body', [
    'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    'data: {"error":{"message":"failed"}}\n\n',
])
async def test_incomplete_or_failed_stream_never_completes(monkeypatch, body):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request:
        httpx.Response(200, headers={'content-type': 'text/event-stream'}, content=body.encode())))
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: client)
    provider = OpenAICompatibleProvider(model='model')
    try:
        with pytest.raises(RuntimeError):
            await provider.translate_stream('hello', 'en', 'zh', lambda text: None)
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_stream_falls_back_to_json_when_gateway_ignores_stream(monkeypatch):
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request:
        httpx.Response(200, json={'choices': [{'message': {'content': '你好'}, 'finish_reason': 'stop'}]})))
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **kwargs: client)
    provider = OpenAICompatibleProvider(model='model')
    try:
        assert (await provider.translate_stream('hello', 'en', 'zh', lambda text: None)).text == '你好'
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_network_requests_reuse_real_keepalive_connection(monkeypatch):
    import json
    monkeypatch.setenv('NO_PROXY', '127.0.0.1')
    connections = 0
    workers = set()
    async def serve(reader, writer):
        nonlocal connections
        connections += 1
        workers.add(asyncio.current_task())
        try:
            while True:
                header = (await reader.readuntil(b'\r\n\r\n')).decode()
                length = next(int(line.split(':', 1)[1]) for line in header.split('\r\n') if line.lower().startswith('content-length:'))
                await reader.readexactly(length)
                body = json.dumps({'choices': [{'message': {'content': 'translation'}, 'finish_reason': 'stop'}]}).encode()
                writer.write(f'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(body)}\r\n\r\n'.encode() + body)
                await writer.drain()
        except asyncio.IncompleteReadError:
            pass
        finally:
            writer.close()
            await writer.wait_closed()
            workers.discard(asyncio.current_task())
    server = await asyncio.start_server(serve, '127.0.0.1', 0)
    port = server.sockets[0].getsockname()[1]
    provider = OpenAICompatibleProvider(endpoint=f'http://127.0.0.1:{port}/v1', model='model')
    try:
        for text in ['first', 'second', 'third']:
            assert (await provider.translate(text, 'en', 'zh')).text == 'translation'
        assert connections == 1
    finally:
        await provider.aclose()
        server.close()
        await server.wait_closed()
        await asyncio.gather(*workers)
