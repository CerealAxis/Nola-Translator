import numpy as np
import pytest

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.recognition.volume_gate import SileroVadSegmenter


def test_prepare_detects_missing_vad_dependency_before_audio(monkeypatch):
    import builtins
    from nola_translator_engine.recognition.streaming import StreamingRecognizer

    original = builtins.__import__

    def without_onnx(name, *args, **kwargs):
        if name == 'onnxruntime':
            raise ModuleNotFoundError("No module named 'onnxruntime'", name='onnxruntime')
        return original(name, *args, **kwargs)

    monkeypatch.setattr(builtins, '__import__', without_onnx)
    recognizer = StreamingRecognizer(object())
    with pytest.raises(ModuleNotFoundError) as caught:
        recognizer.prepare()
    assert caught.value.name == 'onnxruntime'
    assert recognizer.segmenter.frames_in == 0


async def test_prepared_silence_never_dispatches_recognition():
    from nola_translator_engine.recognition.streaming import StreamingRecognizer

    # An object without transcribe() makes any unexpected inference fail the test.
    recognizer = StreamingRecognizer(object())
    recognizer.prepare()
    assert recognizer.segmenter._vad_session is not None
    assert recognizer.segmenter.frames_in == 0
    for index in range(1500):
        assert await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), index * 20.0)) == []
    assert await recognizer.flush(30000) == []
    assert recognizer.blocks_dispatched == 0
    assert recognizer.segmenter.frames_in == 1500
    await recognizer.close()


async def test_pipeline_error_records_missing_module(tmp_path, monkeypatch):
    from nola_translator_engine import runtime as runtime_module
    from nola_translator_engine.runtime import EngineRuntime

    class Capture:
        async def frames(self):
            yield AudioFrame(np.zeros(320, dtype=np.float32), 0)

    class BrokenRecognizer:
        async def accept(self, _frame):
            raise ModuleNotFoundError("No module named 'onnxruntime'", name='onnxruntime')

    events, logs = [], []
    runtime = EngineRuntime(tmp_path, events.append)
    runtime.capture = Capture()
    runtime.recognizer = BrokenRecognizer()
    runtime.service.session_id = 'silence-test'
    runtime.session_request_id = 'silence-request'
    monkeypatch.setattr(runtime_module, 'write_debug', lambda layer, event, data: logs.append((event, data)))
    await runtime._run_session()
    assert events[-1].details['missingModule'] == 'onnxruntime'
    failure = next(data for event, data in logs if event == 'audio.pipeline.failed')
    assert failure['missingModule'] == 'onnxruntime'
    assert 'BrokenRecognizer' not in failure['message']
    assert 'test_silero_vad.py' in failure['stackTrace']
    assert '_run_session' in failure['stackTrace']


@pytest.mark.parametrize('provider', ['local', 'minimax'])
async def test_model_preparation_validates_vad_before_returning(tmp_path, monkeypatch, provider):
    from unittest.mock import AsyncMock
    from nola_translator_engine.protocol import ModelSelection
    from nola_translator_engine.recognition.streaming import StreamingRecognizer
    from nola_translator_engine.recognition.minimax import MiniMaxRecognizer
    from nola_translator_engine.runtime import EngineRuntime

    recognizer = (StreamingRecognizer(object()) if provider == 'local' else
                  MiniMaxRecognizer(ModelSelection(sourceLanguage='auto', targetLanguages=[])))
    segmenter = recognizer.segmenter if provider == 'local' else recognizer._segmenter
    runtime = EngineRuntime(tmp_path, lambda _: None)
    monkeypatch.setattr(runtime, '_load_selected_models', AsyncMock(return_value=recognizer))
    assert await runtime._prepare_models(object()) is recognizer
    assert segmenter._vad_session is not None
    assert segmenter.frames_in == 0
    assert runtime.service.session_id is None
    await recognizer.close()


async def test_failed_vad_preparation_closes_recognizer(tmp_path, monkeypatch):
    from unittest.mock import AsyncMock
    from nola_translator_engine.recognition.streaming import StreamingRecognizer
    from nola_translator_engine.runtime import EngineRuntime

    def missing_dependency():
        raise ModuleNotFoundError("No module named 'onnxruntime'", name='onnxruntime')

    recognizer = StreamingRecognizer(object())
    close = AsyncMock()
    monkeypatch.setattr(recognizer, 'close', close)
    monkeypatch.setattr(recognizer.segmenter, 'load', missing_dependency)
    runtime = EngineRuntime(tmp_path, lambda _: None)
    monkeypatch.setattr(runtime, '_load_selected_models', AsyncMock(return_value=recognizer))
    with pytest.raises(ModuleNotFoundError):
        await runtime._prepare_models(object())
    close.assert_awaited_once()
    assert runtime.service.session_id is None


def test_desktop_interpreter_handles_thirty_seconds_of_silence():
    from pathlib import Path
    import subprocess

    source = Path(__file__).resolve().parents[2]
    python = source / 'dist' / 'NolaPythonEngine' / 'python.exe'
    if not python.is_file():
        pytest.skip('Build the desktop Python runtime to exercise its native dependencies')
    script = f"""
import sys, asyncio
sys.path.insert(0, {str(source)!r})
import numpy as np, lameenc
from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.recognition.streaming import StreamingRecognizer
async def main():
    recognizer = StreamingRecognizer(object())
    recognizer.prepare()
    for index in range(1500):
        assert await recognizer.accept(AudioFrame(np.zeros(320, dtype=np.float32), index * 20.0)) == []
    assert await recognizer.flush(30000) == []
    assert recognizer.blocks_dispatched == 0
    assert recognizer.segmenter.frames_in == 1500
    await recognizer.close()
asyncio.run(main())
print('desktop silence OK')
"""
    result = subprocess.run([str(python), '-I', '-c', script], text=True, capture_output=True, timeout=30)
    assert result.returncode == 0, result.stderr
    assert 'desktop silence OK' in result.stdout


def test_high_energy_non_speech_does_not_open_segment():
    segmenter = SileroVadSegmenter()
    rng = np.random.default_rng(42)
    completed = []
    for i in range(400):
        completed.extend(segmenter.accept(AudioFrame(
            rng.uniform(-0.5, 0.5, 320).astype(np.float32), i * 20.0)))
    assert completed == []
    assert segmenter.current_segment() is None


def test_custom_timing_reaches_qwen_and_sensevoice(tmp_path):
    from nola_translator_engine.recognition.qwen_streaming import create_qwen_recognizer
    from nola_translator_engine.recognition.sensevoice_streaming import create_sensevoice_recognizer
    for factory in (create_qwen_recognizer, create_sensevoice_recognizer):
        recognizer = factory(tmp_path / 'qwen3-asr-0.6b-hf', runtime=object(),
                             max_segment_ms=12000, silence_end_ms=1000)
        assert recognizer.segmenter.max_segment_ms == 12000
        assert recognizer.segmenter.silence_end_ms == 1000


@pytest.mark.parametrize('kwargs', [{'max_segment_ms': 0}, {'silence_end_ms': -1}])
def test_invalid_timing_is_rejected(kwargs):
    with pytest.raises(ValueError):
        SileroVadSegmenter(**kwargs)


def test_onnx_windows_preserve_samples_context_and_recurrent_state():
    calls = []

    class Session:
        def run(self, _, inputs):
            calls.append({key: value.copy() for key, value in inputs.items()})
            return np.array([[0.9]], dtype=np.float32), inputs['state'] + 1

    segmenter = SileroVadSegmenter()
    segmenter._vad_session = Session()
    samples = np.arange(1600, dtype=np.float32)
    for start in range(0, 1600, 320):
        segmenter._speech_probability(samples[start:start + 320])
    assert len(calls) == 3
    np.testing.assert_array_equal(np.concatenate([call['input'][0, 64:] for call in calls]), samples[:1536])
    np.testing.assert_array_equal(calls[1]['input'][0, :64], samples[448:512])
    np.testing.assert_array_equal(calls[2]['state'], np.full((2, 1, 128), 2))
    np.testing.assert_array_equal(segmenter._vad_pending, samples[1536:])
    segmenter.flush()
    assert segmenter._vad_pending.size == 0
    assert not segmenter._vad_state.any()
    assert not segmenter._vad_context.any()


@pytest.mark.parametrize('adapter', ['qwen', 'sensevoice', 'llama-asr', 'crisp-asr'])
def test_browser_reset_preserves_vad_settings(tmp_path, monkeypatch, adapter):
    from nola_translator_engine.protocol import SessionConfig
    from nola_translator_engine.runtime import EngineRuntime

    runtime = EngineRuntime(tmp_path, lambda _: None)
    runtime.active_config = SessionConfig(audioSource={'kind': 'defaultOutput'},
        recognitionMode='realtime', sourceLanguage='auto', targetLanguages=[],
        max_segment_ms=15000, silence_end_ms=1200)
    monkeypatch.setattr(runtime.resources, 'adapter_for', lambda _: adapter)
    monkeypatch.setattr(runtime, '_recognition_runtime', lambda: object())
    recognizer = runtime._fresh_recognizer()
    assert recognizer.segmenter.max_segment_ms == 15000
    assert recognizer.segmenter.silence_end_ms == 1200


def test_minimax_uses_configured_segmentation():
    from nola_translator_engine.protocol import ModelSelection
    from nola_translator_engine.recognition.minimax import MiniMaxRecognizer

    config = ModelSelection(sourceLanguage='en', targetLanguages=[],
        recognitionProvider='minimax', recognitionOptions={'apiKey': 'test'},
        max_segment_ms=12000, silence_end_ms=1000)
    recognizer = MiniMaxRecognizer(config)
    assert recognizer._segmenter.max_segment_ms == 12000
    assert recognizer._segmenter.silence_end_ms == 1000
