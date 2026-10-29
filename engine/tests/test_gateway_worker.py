import asyncio
import base64
from functools import wraps
import io
import json
import sys
from types import SimpleNamespace
import wave

import numpy as np
import pytest

from nola_translator_engine.gateway_worker import GatewayWorker, PersistentSynthesizer, decode_file, error_code, serve, speech_format, stream_backlog_samples, MAX_STREAM_BACKLOG_SAMPLES


def run_async(test):
    @wraps(test)
    def execute():
        return asyncio.run(test())
    return execute


def test_cloud_translation_initializes_without_local_weights(monkeypatch, tmp_path):
    calls = []
    class Runtime:
        def __init__(self, *_):
            self.resources = SimpleNamespace(record=lambda _: pytest.fail('cloud translation looked up local weights'))

        def _configure_translation(self, command):
            calls.append(command.config.translationProvider)
            async def translate(text, source, target):
                return SimpleNamespace(text=f'{target}:{text}')
            self.translation_provider = SimpleNamespace(translate=translate)

    monkeypatch.setitem(sys.modules, 'nola_translator_engine.runtime', SimpleNamespace(EngineRuntime=Runtime))
    monkeypatch.setenv('NOLA_TRANSLATOR_MODEL_DIR', str(tmp_path))
    async def check():
        worker = GatewayWorker(lambda _: None)
        await worker.initialize({'kind': 'mt', 'config': {'recognitionProvider': 'aliyun',
            'translationProvider': 'index-translate', 'sourceLanguage': 'auto', 'targetLanguages': ['zh']}})
        assert await worker.request({'op': 'infer', 'text': 'hello', 'target': 'ja'}) == {'text': 'ja:hello'}
    asyncio.run(check())
    assert calls == ['index-translate']


def wav_data(samples, rate=16000, channels=1, width=2):
    output = io.BytesIO()
    with wave.open(output, 'wb') as target:
        target.setnchannels(channels)
        target.setsampwidth(width)
        target.setframerate(rate)
        target.writeframes(samples)
    return base64.b64encode(output.getvalue()).decode('ascii')


def test_pcm_wav_is_downmixed_and_duration_is_validated():
    source = np.array([[32767, -32767], [16384, 16384]], dtype='<i2')
    samples = decode_file(wav_data(source.tobytes(), channels=2))
    np.testing.assert_allclose(samples, [0, 0.5])
    with pytest.raises(ValueError):
        decode_file(wav_data(b''))
    with pytest.raises(ValueError):
        decode_file(wav_data(b'\0' * (16000 * 301 * 2)))


def test_pcm_wav_resampling_preserves_duration():
    samples = decode_file(wav_data(np.zeros(8000, dtype='<i2').tobytes(), rate=8000))
    assert samples.shape == (16000,)
    assert np.isfinite(samples).all()


def test_errors_do_not_expose_native_diagnostics():
    assert error_code(RuntimeError('CUDA out of memory: private model path')) == ('out_of_memory', True)
    assert error_code(ValueError('private request text')) == ('invalid_request', False)
    assert error_code(RuntimeError('private native diagnostics')) == ('inference_failed', True)


def test_cloud_request_failure_does_not_kill_other_sessions():
    import httpx
    from nola_translator_engine.recognition.aliyun import CloudRecognitionError
    assert error_code(httpx.ConnectError('private endpoint')) == ('network_unavailable', False)
    assert error_code(CloudRecognitionError('recognitionRateLimited')) == ('rate_limited', False)
    assert error_code(TimeoutError()) == ('request_timeout', False)
    for status, expected in ((401, 'authentication_failed'), (429, 'rate_limited'), (504, 'request_timeout')):
        request = httpx.Request('POST', 'https://private.example')
        error = httpx.HTTPStatusError('private credential', request=request, response=httpx.Response(status, request=request))
        assert error_code(error) == (expected, False)


@run_async
async def test_translation_stream_and_fallback_use_request_scoped_events():
    from nola_translator_engine.translation.base import ProviderTranslation
    events, calls = [], []
    async def primary(text, source, target, on_text):
        calls.append('primary')
        on_text('partial')
        return ProviderTranslation('complete', ('en', 'zh'))
    async def fallback(text, source, target):
        calls.append('fallback')
        return ProviderTranslation('backup', ('en', 'ja'))
    worker = GatewayWorker(events.append)
    worker.kind = 'mt'
    worker.runtime = SimpleNamespace(translation_provider=SimpleNamespace(translate_stream=primary))
    worker.fallback_runtime = SimpleNamespace(translation_provider=SimpleNamespace(translate=fallback))
    result = await worker.request({'id': 'first', 'op': 'infer', 'text': 'hello', 'source': 'en', 'target': 'zh', 'stream': True})
    backup = await worker.request({'id': 'second', 'op': 'infer', 'text': 'hello', 'source': 'en', 'target': 'ja', 'fallback': True})
    assert result == {'text': 'complete', 'path': ['en', 'zh']}
    assert backup == {'text': 'backup', 'path': ['en', 'ja']}
    assert events == [{'id': 'first', 'event': {'type': 'translation.delta', 'text': 'partial'}}]
    assert calls == ['primary', 'fallback']


@run_async
async def test_native_fallback_reuses_primary_without_duplicate_runtime():
    async def translate(text, source, target):
        return SimpleNamespace(text='backup')
    worker = GatewayWorker(lambda event: None)
    worker.kind = 'mt'
    worker.fallback_uses_primary = True
    worker.runtime = SimpleNamespace(translation_provider=SimpleNamespace(translate=translate))
    assert await worker.request({'op': 'infer', 'fallback': True, 'text': 'hello', 'target': 'zh'}) == {'text': 'backup'}


@run_async
async def test_local_translation_pair_is_validated_against_active_worker_model():
    from nola_translator_engine.model_capabilities import translation_configuration
    from nola_translator_engine.protocol import PrewarmConfig
    looked_up = []
    def configuration(model_id):
        looked_up.append(model_id)
        return translation_configuration(['en', 'zh'], 'llama')
    async def translate(text, source, target):
        return SimpleNamespace(text='你好')
    worker = GatewayWorker(lambda event: None)
    worker.kind = 'mt'
    worker.config = PrewarmConfig(sourceLanguage='auto', targetLanguages=['zh'],
        translationProvider='local', translationModelId='active-model')
    worker.runtime = SimpleNamespace(resources=SimpleNamespace(configuration=configuration),
        translation_provider=SimpleNamespace(translate=translate))
    result = await worker.request({'op': 'infer', 'text': 'hello', 'source': 'en', 'target': 'zh'})
    assert result == {'text': '你好'} and looked_up == ['active-model']
    with pytest.raises(ValueError, match='language pair'):
        await worker.request({'op': 'infer', 'text': 'hello', 'source': 'en', 'target': 'ja'})


@run_async
async def test_cloud_realtime_keeps_native_translation_revision_and_input_clock():
    from nola_translator_engine.protocol import PrewarmConfig
    from nola_translator_engine.recognition.base import NativeTranslation, RecognitionUpdate
    events, frames = [], []
    class Recognizer:
        async def start(self):
            pass

        async def accept(self, frame):
            frames.append(frame.started_at_ms)
            return [RecognitionUpdate('segment', 5, frame.started_at_ms, frame.started_at_ms + 20,
                'hello', 'en', True, NativeTranslation('zh', '你好', 'complete'))]

        async def flush(self, end):
            assert end == 1720
            return []

        async def close(self):
            pass
    worker = GatewayWorker(events.append)
    worker.kind = 'asr'
    worker.config = PrewarmConfig(recognitionProvider='aliyun', sourceLanguage='auto', targetLanguages=[])
    config_calls = []
    def create(config):
        config_calls.append(config)
        return Recognizer()
    worker.remote_recognizer = create
    await worker.realtime({'op': 'session.open', 'session': 'first', 'language': 'en',
                           'targetLanguages': ['zh'], 'nativeTranslation': True})
    await worker.realtime({'op': 'session.append', 'session': 'first', 'startedAtMs': 1700,
                           'audio': base64.b64encode(bytes(640)).decode('ascii')})
    await worker.realtime({'op': 'session.commit', 'session': 'first', 'endedAtMs': 1720})
    assert frames == [1700]
    assert config_calls[0].translationProvider == 'recognition'
    assert config_calls[0].targetLanguages == ['zh']
    assert events[0]['event']['revision'] == 5
    assert events[0]['event']['native_translation']['text'] == '你好'
    await worker.realtime({'op': 'session.close', 'session': 'first'})


def test_malformed_wav_is_a_nonfatal_client_error():
    for raw in (b'R', b'RIFF\x10\0\0\0WAVEfmt \x10\0\0\0\x01'):
        with pytest.raises(Exception) as failure:
            decode_file(base64.b64encode(raw).decode('ascii'))
        assert error_code(failure.value) == ('invalid_request', False)


def test_realtime_backlog_counts_native_and_queued_audio():
    samples = np.empty(16000, dtype=np.float32)
    recognizer = SimpleNamespace(segmenter=SimpleNamespace(_active_samples=32000),
        _pending_finals=[SimpleNamespace(samples=samples)],
        _pending_intermediates={'current': SimpleNamespace(samples=samples)})
    state = {'recognizer': recognizer, 'pending': np.empty(320, dtype=np.float32), 'inflight_samples': 16000}
    assert stream_backlog_samples(state) == 80320
    assert MAX_STREAM_BACKLOG_SAMPLES == 16000 * 30


@run_async
async def test_jsonl_waits_for_hydration_and_serves_repeated_requests_with_one_worker():
    output, calls = [], []
    hydrated = asyncio.Event()
    class FakeWorker:
        def __init__(self, emit):
            calls.append('construct')

        async def initialize(self, request):
            calls.append('load')
            await hydrated.wait()
            return {'voices': ['Voice']}

        async def request(self, request):
            calls.append(request['text'])
            return {'text': request['text']}

        async def close(self):
            calls.append('close')
    lines = iter([json.dumps({'id': 'init', 'op': 'init'}), json.dumps({'id': 'one', 'op': 'infer', 'text': 'first'}), json.dumps({'id': 'two', 'op': 'infer', 'text': 'second'}), ''])
    async def read():
        return next(lines)
    task = asyncio.create_task(serve(read, output.append, FakeWorker))
    await asyncio.sleep(0)
    assert output == []
    assert calls == ['construct', 'load']
    hydrated.set()
    await task
    assert output[0] == {'id': 'init', 'result': {'voices': ['Voice']}}
    assert [result['result']['text'] for result in output[1:]] == ['first', 'second']
    assert calls == ['construct', 'load', 'first', 'second', 'close']


@run_async
async def test_cancel_aborts_obsolete_cloud_request_without_affecting_another_request():
    from nola_translator_engine.protocol import PrewarmConfig
    inputs, output = asyncio.Queue(), []
    stale_started, stale_cancelled, other_finished = asyncio.Event(), asyncio.Event(), asyncio.Event()
    class Worker(GatewayWorker):
        async def initialize(self, request):
            self.kind = 'mt'
            self.config = PrewarmConfig(sourceLanguage='auto', targetLanguages=['zh'], translationProvider='mymemory')
            async def translate(text, source, target):
                if text == 'obsolete':
                    stale_started.set()
                    try:
                        await asyncio.Event().wait()
                    finally:
                        stale_cancelled.set()
                return SimpleNamespace(text='other result')
            self.runtime = SimpleNamespace(translation_provider=SimpleNamespace(translate=translate))
            return {}

        async def close(self):
            pass
    def emit(message):
        output.append(message)
        if message.get('id') == 'other' and 'result' in message:
            other_finished.set()
    await inputs.put(json.dumps({'id': 'init', 'op': 'init'}))
    running = asyncio.create_task(serve(inputs.get, emit, Worker))
    await inputs.put(json.dumps({'id': 'stale', 'op': 'infer', 'text': 'obsolete', 'target': 'zh'}))
    await asyncio.wait_for(stale_started.wait(), timeout=1)
    await inputs.put(json.dumps({'id': 'other', 'op': 'infer', 'text': 'current', 'target': 'zh'}))
    await inputs.put(json.dumps({'op': 'cancel', 'requestId': 'stale'}))
    await asyncio.wait_for(stale_cancelled.wait(), timeout=1)
    await asyncio.wait_for(other_finished.wait(), timeout=1)
    await inputs.put('')
    await running
    assert not any(message.get('id') == 'stale' for message in output)
    assert next(message['result'] for message in output if message.get('id') == 'other') == {'text': 'other result'}


@run_async
async def test_native_inference_cannot_be_cancelled_until_its_model_lock_is_released():
    worker = GatewayWorker(lambda event: None)
    request = {'id': 'native', 'op': 'infer'}
    assert worker.can_cancel(request)
    async with worker._inference_scope(False, 'native'):
        assert not worker.can_cancel(request)
        assert worker.can_cancel({'id': 'queued', 'op': 'infer'})
        assert not worker.can_cancel({'id': 'append', 'op': 'session.append'})
    assert worker.can_cancel(request)


@run_async
async def test_closing_sentence_waits_for_native_thread_before_releasing_shared_model():
    import threading
    from nola_translator_engine.protocol import PrewarmConfig
    started, release = asyncio.Event(), threading.Event()
    loop = asyncio.get_running_loop()
    def transcribe(samples, **options):
        loop.call_soon_threadsafe(started.set)
        release.wait(timeout=5)
        return 'hello', 'en'
    worker = GatewayWorker(lambda event: None)
    worker.config = PrewarmConfig(sourceLanguage='auto', targetLanguages=[])
    worker.runtime = SimpleNamespace(_recognition_runtime=lambda: SimpleNamespace(transcribe=transcribe))
    task = asyncio.create_task(worker.transcribe(np.zeros(320), request_id='native'))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
        task.cancel()
        await asyncio.sleep(0)
        task.cancel()
        await asyncio.sleep(0)
        assert worker.inference.locked() and not task.done()
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert not worker.inference.locked()
    finally:
        release.set()
        await asyncio.gather(task, return_exceptions=True)


@run_async
async def test_session_reset_reuses_open_options_and_suppresses_old_generation_updates():
    from nola_translator_engine.protocol import PrewarmConfig
    from nola_translator_engine.recognition.base import RecognitionUpdate
    events, recognizers, configs = [], [], []
    class Recognizer:
        def __init__(self):
            self.closed = False

        async def start(self):
            pass

        async def close(self):
            self.closed = True
    def create(config):
        configs.append(config)
        recognizer = Recognizer()
        recognizers.append(recognizer)
        return recognizer
    worker = GatewayWorker(events.append)
    worker.config = PrewarmConfig(sourceLanguage='auto', targetLanguages=[], recognitionProvider='aliyun')
    worker.remote_recognizer = create
    opening = {'op': 'session.open', 'session': 'pinned', 'language': 'en',
        'targetLanguages': ['zh'], 'nativeTranslation': True, 'silenceMs': 900, 'maxSegmentMs': 12000}
    await worker.realtime(opening)
    first_generation = worker.sessions['pinned']['generation']
    await worker.realtime({'op': 'session.reset', 'session': 'pinned', 'language': 'ja'})
    assert recognizers[0].closed and not recognizers[1].closed
    assert worker.sessions['pinned']['open_request'] == opening
    assert worker.sessions['pinned']['generation'] is not first_generation
    assert configs[1].sourceLanguage == 'en' and configs[1].targetLanguages == ['zh']
    update = RecognitionUpdate('old', 0, 0, 20, 'old', 'en', True)
    await recognizers[0].on_update(update)
    assert not events
    await recognizers[1].on_update(update)
    assert len(events) == 1
    await worker.realtime({'op': 'session.close', 'session': 'pinned'})


@run_async
async def test_manual_realtime_has_intermediate_and_final_transcription_without_vad():
    events, transcriptions = [], []
    worker = GatewayWorker(events.append)
    worker.kind = 'asr'
    def transcribe(samples, **kwargs):
        transcriptions.append(samples.size)
        return f'text-{samples.size}', 'en'
    worker.runtime = SimpleNamespace(_recognition_runtime=lambda: SimpleNamespace(transcribe=transcribe))
    await worker.realtime({'op': 'session.open', 'session': 'session1', 'manual': True})
    await worker.realtime({'op': 'session.append', 'session': 'session1', 'audio': base64.b64encode(bytes(32000)).decode('ascii')})
    await worker.realtime({'op': 'session.commit', 'session': 'session1'})
    assert [item['event']['type'] for item in events] == ['conversation.item.input_audio_transcription.text', 'conversation.item.input_audio_transcription.completed']
    assert transcriptions == [16000, 16000]
    assert events[0]['event']['item_id'] == events[1]['event']['item_id']
    assert worker.sessions['session1']['samples'] == 0
    await worker.realtime({'op': 'session.finish', 'session': 'session1'})
    assert not worker.sessions


def test_crisp_synthesizer_loads_once_for_multiple_speech_requests(monkeypatch, tmp_path):
    calls = []
    class Session:
        def speakers(self):
            return ['Voice']

        def output_sample_rate(self):
            return 16000

        def set_speaker_name(self, name):
            calls.append(('voice', name))

        def synthesize(self, text):
            calls.append(('synthesize', text))
            return np.zeros(160, dtype=np.float32)
    class Runtime:
        def __init__(self, *args, **kwargs):
            self._session = Session()

        def load(self):
            calls.append('load')

        def unload(self):
            calls.append('unload')
    monkeypatch.setitem(sys.modules, 'nola_translator_engine.recognition.crisp_asr', SimpleNamespace(CrispAsrRuntime=Runtime, prepare_crisp_synthesis=lambda *args: calls.append('prepare')))
    resources = SimpleNamespace(model_path=lambda model: tmp_path, adapter_for=lambda model: 'crisp-tts', recognition_weight_path=lambda model: tmp_path / 'weights')
    synth = PersistentSynthesizer(resources, 'tts-test', SimpleNamespace(cpuThreads=2, recognitionDevice='cpu', allowCpuFallback=True))
    synth.load()
    for value in ['first', 'second']:
        result = synth.synthesize(value, 'Voice')
        assert result['audio'].startswith('data:audio/wav;base64,')
    with pytest.raises(ValueError, match='Unknown voice'):
        synth.synthesize('bad voice', 'Other')
    synth.close()
    assert calls.count('load') == 1
    assert calls.count('unload') == 1
    assert ('synthesize', 'first') in calls
    assert ('synthesize', 'second') in calls


def test_speech_mp3_encoding_uses_wav_metadata(monkeypatch):
    calls = []
    class Encoder:
        def set_bit_rate(self, value):
            calls.append(('bitrate', value))

        def set_in_sample_rate(self, value):
            calls.append(('rate', value))

        def set_channels(self, value):
            calls.append(('channels', value))

        def set_quality(self, value):
            pass

        def encode(self, pcm):
            assert len(pcm) == 320
            return b'\xff\xfb'

        def flush(self):
            return b'\x90\0'
    monkeypatch.setitem(sys.modules, 'lameenc', SimpleNamespace(Encoder=Encoder))
    result = speech_format({'text': 'speech', 'audio': 'data:audio/wav;base64,' + wav_data(bytes(320), rate=24000)}, 'mp3')
    assert base64.b64decode(result['audio'].split(',')[1]).startswith(b'\xff\xfb')
    assert ('rate', 24000) in calls
    assert ('channels', 1) in calls
