import asyncio
import base64
import importlib
import json
import sys
from types import SimpleNamespace

import httpx
import numpy as np
import pytest

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.gateway_client import (
    GatewayRecognizer, GatewayTranslationProvider, gateway_status, private_gateway_address,
)
from nola_translator_engine.protocol import PrewarmConfig, PrewarmModelsCommand
from nola_translator_engine.recognition.base import ModelUnavailable


def run(check):
    return asyncio.run(check())


def test_private_gateway_rejects_remote_or_credential_bearing_origins():
    for origin in ('https://127.0.0.1:1234', 'http://localhost:1234', 'http://example.com:1234',
                   'http://secret@127.0.0.1:1234', 'http://127.0.0.1:1234/private',
                   'http://127.0.0.1:1234?key=secret'):
        with pytest.raises(ValueError):
            private_gateway_address(origin)
    assert private_gateway_address('http://127.0.0.1:1234/') == 'http://127.0.0.1:1234'


def test_translation_stream_preserves_partial_text_final_path_and_session_binding():
    async def check():
        calls, partials = [], []
        def handler(request):
            calls.append((request.headers['authorization'], json.loads(request.content)))
            return httpx.Response(200, headers={'content-type': 'application/x-ndjson'},
                content='{"text":"你"}\n{"text":"你好","path":["en","zh"],"done":true}\n')
        provider = GatewayTranslationProvider('http://127.0.0.1:1234', 'private',
                                               name='anthropic', session='isolated', fallback=True)
        provider._http = httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                           headers={'Authorization': 'Bearer private'})
        translated = await provider.translate_stream('hello', 'en', 'zh', partials.append)
        await provider.aclose()
        assert partials == ['你', '你好']
        assert translated.text == '你好' and translated.path == ('en', 'zh')
        assert calls[0][0] == 'Bearer private'
        assert calls[0][1] == {'op': 'infer', 'text': 'hello', 'source': 'en', 'target': 'zh',
                                'fallback': True, 'stream': True, 'session': 'isolated'}
    run(check)


def test_translation_does_not_report_truncated_stream_as_success():
    async def check():
        provider = GatewayTranslationProvider('http://127.0.0.1:1234', 'private')
        provider._http = httpx.AsyncClient(transport=httpx.MockTransport(lambda request:
            httpx.Response(200, headers={'content-type': 'application/x-ndjson'}, content='{"text":"partial"}\n')))
        with pytest.raises(RuntimeError, match='without a final result'):
            await provider.translate('hello', 'en', 'zh')
        await provider.aclose()
    run(check)


def test_proxy_budget_covers_all_supported_sequential_translation_chunks():
    from nola_translator_engine.translation.network import HTTP_REQUEST_TIMEOUT_SECONDS, MAX_CHUNKS
    from nola_translator_engine.translation.scheduler import TranslationScheduler
    provider = GatewayTranslationProvider('http://127.0.0.1:1234', 'private')
    scheduler = TranslationScheduler(provider)
    assert scheduler._budget_seconds('long text', 'en', 'zh') >= MAX_CHUNKS * HTTP_REQUEST_TIMEOUT_SECONDS


def test_browser_seek_resets_sentence_without_releasing_pinned_socket_or_model(monkeypatch, tmp_path):
    try:
        import pyaudiowpatch
    except ImportError:
        monkeypatch.setitem(sys.modules, 'pyaudiowpatch', SimpleNamespace(paWASAPI=13, PyAudio=object))
    from nola_translator_engine.protocol import ResetStreamCommand, SessionConfig
    from nola_translator_engine.translation.scheduler import TranslationScheduler
    module = importlib.import_module('nola_translator_engine.gateway_session_runtime')
    monkeypatch.setenv('NOLA_GATEWAY_ADDRESS', 'http://127.0.0.1:1234')
    monkeypatch.setenv('NOLA_GATEWAY_KEY', 'private')
    async def check():
        sockets = []
        async def connect(*args, **kwargs):
            socket = RpcSocket()
            sockets.append(socket)
            return socket
        config = SessionConfig(sourceLanguage='auto', targetLanguages=['zh'],
            recognitionModelId='old-local-model', translationModelId='old-mt-model',
            audioSource={'kind': 'browserTab', 'streamId': 'tab'}, recognitionMode='realtime',
            browserTimeline={'epoch': 0, 'videoTimeMs': 0, 'playbackRate': 1})
        runtime = module.GatewaySessionRuntime(tmp_path, lambda event: None)
        runtime.service.session_id = 'business'
        runtime.active_config = config
        runtime.session_paused = True
        recognizer = GatewayRecognizer('http://127.0.0.1:1234', 'private', config, connector=connect)
        await recognizer.start()
        runtime.recognizer = recognizer
        provider = GatewayTranslationProvider('http://127.0.0.1:1234', 'private', session=recognizer.session)
        runtime.translation_provider = provider
        runtime.translation_scheduler = TranslationScheduler(provider)
        original_session = recognizer.session
        monkeypatch.setattr(runtime, '_remote_recognizer', lambda config: pytest.fail('seek selected a new model'))
        try:
            result = await runtime._reset_stream(ResetStreamCommand(protocolVersion=1, type='resetStream',
                requestId='seek', sessionId='business', epoch=1, videoTimeMs=3000, playbackRate=1.5))
            assert result[0].type == 'streamReset' and result[0].epoch == 1
            assert runtime.recognizer is recognizer and len(sockets) == 1
            assert not sockets[0].closed
            assert provider.session == original_session == recognizer.session
            assert [request['op'] for request in sockets[0].requests] == ['session.open', 'session.reset']
            await recognizer.close()
            assert sockets[0].closed and sockets[0].requests[-1]['op'] == 'session.close'
        finally:
            await recognizer.close()
            runtime.service.session_id = None
            await runtime.close()
    run(check)


class RpcSocket:
    def __init__(self):
        self.queue = asyncio.Queue()
        self.requests = []
        self.closed = False

    def __aiter__(self):
        return self

    async def __anext__(self):
        value = await self.queue.get()
        if value is None:
            raise StopAsyncIteration
        return json.dumps(value)

    async def send(self, raw):
        request = json.loads(raw)
        self.requests.append(request)
        if request['op'] == 'session.append':
            await self.queue.put({'session': request['session'], 'event': {
                'type': 'conversation.item.input_audio_transcription.completed',
                'item_id': 'segment', 'revision': 7, 'transcript': 'hello', 'language': 'en',
                'audio_start_ms': request['startedAtMs'], 'audio_end_ms': request['startedAtMs'] + 20,
                'native_translation': {'target_language': 'zh', 'text': '你好',
                                        'state': 'complete', 'error_code': None}}})
        await self.queue.put({'id': request['id'], 'result': {}})

    async def close(self):
        self.closed = True
        await self.queue.put(None)


def test_recognition_keeps_native_translation_timestamps_and_independent_cancellation():
    async def check():
        sockets, credentials = [], []
        async def connect(url, **options):
            assert url == 'ws://127.0.0.1:1234/internal/asr'
            credentials.append(options['additional_headers']['Authorization'])
            socket = RpcSocket()
            sockets.append(socket)
            return socket
        config = PrewarmConfig(recognitionProvider='aliyun', sourceLanguage='en',
                                targetLanguages=['zh'], translationProvider='recognition')
        first = GatewayRecognizer('http://127.0.0.1:1234', 'private', config, connector=connect)
        second = GatewayRecognizer('http://127.0.0.1:1234', 'private', config, connector=connect)
        updates = []
        async def collect(update):
            updates.append(update)
        first.on_update = collect
        await first.accept(AudioFrame(np.zeros(320, dtype=np.float32), 1700))
        await second.start()
        await first.flush(1720)
        await first.close()
        assert not sockets[1].closed
        assert updates[0].revision == 7 and updates[0].started_at_ms == 1700
        assert updates[0].native_translation.text == '你好'
        opening = sockets[0].requests[0]
        assert opening['nativeTranslation'] is True and opening['targetLanguages'] == ['zh']
        audio = sockets[0].requests[1]
        assert len(base64.b64decode(audio['audio'])) == 640
        assert all(value == 'Bearer private' for value in credentials)
        assert first.session != second.session
        await second.close()
    run(check)


def test_recognition_connection_loss_fails_only_its_session():
    async def check():
        socket = RpcSocket()
        async def connect(*args, **kwargs):
            return socket
        recognizer = GatewayRecognizer('http://127.0.0.1:1234', 'private',
            PrewarmConfig(sourceLanguage='auto', targetLanguages=[]), connector=connect)
        await recognizer.start()
        await socket.queue.put({'session': recognizer.session,
                                 'event': {'type': 'error', 'code': 'rateLimited'}})
        await asyncio.sleep(0)
        with pytest.raises(ModelUnavailable):
            await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), 0))
        await recognizer.close()
    run(check)


def test_business_runtime_prewarm_checks_gateway_without_loading_weights(monkeypatch, tmp_path):
    try:
        import pyaudiowpatch
    except ImportError:
        monkeypatch.setitem(sys.modules, 'pyaudiowpatch', SimpleNamespace(paWASAPI=13, PyAudio=object))
    module = importlib.import_module('nola_translator_engine.gateway_session_runtime')
    monkeypatch.setenv('NOLA_GATEWAY_ADDRESS', 'http://127.0.0.1:1234')
    monkeypatch.setenv('NOLA_GATEWAY_KEY', 'private')
    async def check():
        status = {'services': {'asr': {'state': 'ready'}, 'mt': {'state': 'ready'}}}
        async def snapshot(*args):
            return status
        monkeypatch.setattr(module, 'gateway_status', snapshot)
        runtime = module.GatewaySessionRuntime(tmp_path, lambda event: None)
        monkeypatch.setattr(runtime, '_configure_device_plan', lambda *args: pytest.fail('device plan loaded'))
        monkeypatch.setattr(runtime.resources, 'is_installed', lambda *args: pytest.fail('local weights queried'))
        command = PrewarmModelsCommand(protocolVersion=1, type='prewarmModels', requestId='check',
            config=PrewarmConfig(sourceLanguage='auto', targetLanguages=['zh'],
                                  recognitionModelId='does-not-exist', translationModelId='does-not-exist'))
        result = await runtime._prewarm(command)
        assert result[0].state == 'ready'
        assert runtime._active_recognition_runtime is None
        status['services']['mt']['state'] = 'stopped'
        result = await runtime._prewarm(command)
        assert result[0].type == 'error' and result[0].code == 'modelUnavailable'
        await runtime.close()
    run(check)


@pytest.mark.parametrize('stale_model', [None, 'removed-model'])
def test_subtitle_translation_uses_gateway_despite_missing_or_stale_local_selection(monkeypatch, tmp_path, stale_model):
    try:
        import pyaudiowpatch
    except ImportError:
        monkeypatch.setitem(sys.modules, 'pyaudiowpatch', SimpleNamespace(paWASAPI=13, PyAudio=object))
    from nola_translator_engine.recognition.base import RecognitionUpdate
    from nola_translator_engine.translation.scheduler import TranslationScheduler
    module = importlib.import_module('nola_translator_engine.gateway_session_runtime')
    monkeypatch.setenv('NOLA_GATEWAY_ADDRESS', 'http://127.0.0.1:1234')
    monkeypatch.setenv('NOLA_GATEWAY_KEY', 'private')
    async def check():
        completed, emitted, calls = asyncio.Event(), [], []
        def collect(event):
            emitted.append(event)
            if event.type == 'caption' and event.segment.translations:
                if event.segment.translations[0].state == 'complete':
                    completed.set()
        def translate(request):
            calls.append(json.loads(request.content))
            return httpx.Response(200, headers={'content-type': 'application/x-ndjson'},
                content='{"text":"你好","path":["en","zh"],"done":true}\n')
        runtime = module.GatewaySessionRuntime(tmp_path, collect)
        runtime.service.session_id = 'business-session'
        runtime.active_config = SimpleNamespace(targetLanguages=['zh'], translationProvider='local',
            translationModelId=stale_model, allowIntermediateTranslation=False)
        provider = GatewayTranslationProvider('http://127.0.0.1:1234', 'private', name='hymt2', session='asr-session')
        provider._http = httpx.AsyncClient(transport=httpx.MockTransport(translate))
        runtime.translation_provider = provider
        runtime.translation_scheduler = TranslationScheduler(provider)
        monkeypatch.setattr(runtime, '_local_translation_model_id', lambda *args: pytest.fail('caller model resolved'))
        monkeypatch.setattr(runtime.resources, 'configuration', lambda *args: pytest.fail('caller capability queried'))
        try:
            await runtime._emit_update(RecognitionUpdate('segment', 0, 0, 20, 'hello', 'en', True))
            await asyncio.wait_for(completed.wait(), timeout=2)
            assert calls[0]['target'] == 'zh' and calls[0]['session'] == 'asr-session'
            assert emitted[-1].segment.translations[0].text == '你好'
            assert emitted[-1].sessionId == 'business-session'
        finally:
            await runtime._cancel_stream_tasks()
            runtime.service.session_id = None
            await runtime.close()
    run(check)
