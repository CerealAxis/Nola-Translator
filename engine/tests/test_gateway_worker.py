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
