import asyncio
import base64
import io
import json
import sys
import wave
from pathlib import Path
from types import ModuleType, SimpleNamespace

import numpy as np
import pytest

from nola_translator_engine import local_call


def wav_data_url(*, rate=16000, channels=1, frames=320):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(np.zeros(frames * channels, dtype="<i2").tobytes())
    return "data:audio/wav;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def test_audio_codec_uses_synthesizer_sample_rate_and_round_trips():
    payload = local_call.encode_audio(np.array([-1.0, 0.0, 0.5], dtype=np.float32), 22050)

    decoded = local_call.decode_audio(wav_data_url())
    raw = base64.b64decode(payload.split(",", 1)[1], validate=True)
    with wave.open(io.BytesIO(raw), "rb") as audio:
        assert audio.getframerate() == 22050
        assert audio.getnchannels() == 1
        assert audio.getsampwidth() == 2
    np.testing.assert_array_equal(decoded, np.zeros(320, dtype=np.float32))


def test_tts_device_selection_honors_request_and_cpu_fallback():
    devices = [SimpleNamespace(id="cpu", torchDevice="cpu", score=0, recognition=True),
        SimpleNamespace(id="cuda:test", torchDevice="cuda:0", score=20, recognition=True)]
    assert local_call.torch_device_for_tts(SimpleNamespace(recognitionDevice="auto", allowCpuFallback=True), devices) == "cuda:0"
    assert local_call.torch_device_for_tts(SimpleNamespace(recognitionDevice="missing", allowCpuFallback=True), devices) == "cpu"
    with pytest.raises(ValueError, match="Requested TTS device is unavailable"):
        local_call.torch_device_for_tts(SimpleNamespace(recognitionDevice="missing", allowCpuFallback=False), devices)


def test_crisp_tts_retries_runtime_error_on_cpu_after_unloading_vulkan(monkeypatch, tmp_path):
    from nola_translator_engine.recognition import crisp_asr

    events = []

    class FakeSession:
        def speakers(self):
            return []

        def output_sample_rate(self):
            return 24000

        def synthesize(self, _text):
            if events[-1] == "vulkan-loaded":
                raise RuntimeError("non-finite logits")
            return np.zeros(100, dtype=np.float32)

    class FakeCrispRuntime:
        def __init__(self, _weights, *, threads, use_vulkan, allow_cpu_fallback):
            assert threads == 2
            assert allow_cpu_fallback
            self.use_vulkan = use_vulkan
            self._session = FakeSession()

        def load(self):
            events.append("vulkan-loaded" if self.use_vulkan else "cpu-loaded")

        def unload(self):
            events.append("vulkan-unloaded" if self.use_vulkan else "cpu-unloaded")

    monkeypatch.setattr(crisp_asr, "CrispAsrRuntime", FakeCrispRuntime)
    monkeypatch.setattr(crisp_asr, "prepare_crisp_synthesis", lambda *_args: None)
    def retry_on_cpu(request):
        assert request["text"] == "Hello."
        return {"text": request["text"], "audio": "data:audio/wav;base64,AA==", "voices": []}
    monkeypatch.setattr(local_call, "retry_tts_on_cpu", retry_on_cpu)
    resources = SimpleNamespace(model_path=lambda _model_id: tmp_path,
        recognition_weight_path=lambda _model_id: tmp_path / "model.gguf",
        adapter_for=lambda _model_id: "crisp-tts")

    result = local_call.synthesize(resources, {"resourceId": "test-crisp-tts", "text": "Hello."},
        SimpleNamespace(cpuThreads=2, recognitionDevice="auto", allowCpuFallback=True))

    assert result["audio"].startswith("data:audio/wav;base64,")
    assert events == ["vulkan-loaded", "vulkan-unloaded"]


def test_tts_cpu_retry_uses_offline_worker_and_drops_unrelated_environment(monkeypatch, tmp_path):
    captured = {}

    def fake_run(args, **options):
        captured["args"] = args
        captured["options"] = options
        return SimpleNamespace(returncode=0, stdout='{"text":"Hello.","audio":"data:audio/wav;base64,AA==","voices":[]}')

    monkeypatch.setattr(local_call.subprocess, "run", fake_run)
    monkeypatch.setenv("NOLA_TRANSLATOR_MODEL_DIR", str(tmp_path))
    monkeypatch.setenv("OPENAI_API_KEY", "should-not-be-in-child-environment")
    request = {"kind": "tts", "resourceId": "tts-model", "config": {"compute": {"recognitionDevice": "auto"}}, "text": "Hello."}

    response = local_call.retry_tts_on_cpu(request)

    assert response["audio"].startswith("data:audio/wav;base64,")
    assert captured["args"][1:4] == ["-I", "-X", "utf8"]
    child_request = json.loads(captured["options"]["input"])
    assert child_request["config"]["compute"]["recognitionDevice"] == "cpu"
    assert captured["options"]["env"]["HF_HUB_OFFLINE"] == "1"
    assert "OPENAI_API_KEY" not in captured["options"]["env"]
    assert "shell" not in captured["options"]


@pytest.mark.parametrize("rate,channels", [(22050, 1), (16000, 2)])
def test_decode_audio_rejects_non_normalized_input(rate, channels):
    with pytest.raises(ValueError, match="mono 16 kHz PCM16"):
        local_call.decode_audio(wav_data_url(rate=rate, channels=channels))


def test_cloud_asr_uses_final_source_text_and_closes_worker_runtime(monkeypatch, tmp_path):
    class FakeRuntime:
        def __init__(self, model_root, _emit):
            self.status_path = Path(model_root) / ".runtime" / "engine-status.json"
            self.resources = SimpleNamespace(record=lambda _model_id: SimpleNamespace(installed=True, kind="recognitionModel"))
            self.closed = False
            runtime_instances.append(self)
            self._write_engine_status()

        async def _configure_device_plan(self, _command):
            return None

        async def close(self):
            self._remove_engine_status()
            self.closed = True

        def _write_engine_status(self):
            self.status_path.parent.mkdir(parents=True, exist_ok=True)
            self.status_path.write_text("worker", encoding="utf8")

        def _remove_engine_status(self):
            self.status_path.unlink(missing_ok=True)

    runtime_instances = []
    class FakeRecognizer:
        def __init__(self, _config):
            self.on_update = None
            self.closed = False

        async def start(self):
            return None

        async def accept(self, _frame):
            return [SimpleNamespace(segment_id="seg-2", source_text="world", started_at_ms=20)]

        async def flush(self, _end_ms):
            return [SimpleNamespace(segment_id="seg-1", source_text="hello", started_at_ms=0)]

        async def close(self):
            self.closed = True

    recognizer_instances = []

    def create_recognizer(config):
        recognizer = FakeRecognizer(config)
        recognizer_instances.append(recognizer)
        return recognizer

    runtime_module = ModuleType("nola_translator_engine.runtime")
    runtime_module.EngineRuntime = FakeRuntime
    monkeypatch.setitem(sys.modules, "nola_translator_engine.runtime", runtime_module)
    monkeypatch.setattr("nola_translator_engine.recognition.minimax.MiniMaxRecognizer", create_recognizer)
    monkeypatch.setenv("NOLA_TRANSLATOR_MODEL_DIR", str(tmp_path))
    config = {
        "recognitionProvider": "minimax",
        "recognitionModelId": "test-asr",
        "sourceLanguage": "auto",
        "targetLanguages": [],
        "translationProvider": "local",
    }

    result = asyncio.run(local_call.infer({"kind": "asr", "resourceId": "test-asr", "config": config,
        "audio": wav_data_url(frames=640)}))

    assert result == {"text": "hello world"}
    assert recognizer_instances[0].closed
    assert runtime_instances[0].closed
    assert not (tmp_path / ".runtime" / "engine-status.json").exists()

