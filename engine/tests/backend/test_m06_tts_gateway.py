import base64
import io
import json
import wave
from uuid import uuid4

import pytest
import httpx

from nola_translator_engine.backend.direct_inference import DirectTtsVoicesRequest, run_direct_inference
from nola_translator_engine.backend.gateway import CallContext, GatewayError, GatewayErrorCode, MatchRequest, Operation
from nola_translator_engine.backend.gateway import bootstrap
from nola_translator_engine.backend.gateway.adapters import MIMO_TTS_MODEL
from nola_translator_engine.backend.gateway.worker import LocalModelWorker
from nola_translator_engine.models.manager import ModelManager

MODEL = "tts-piper-crisp-en-gb-cori-medium"


class TtsWorker(LocalModelWorker):
    running = True
    starts = 0

    async def start(self, **kwargs):
        self.starts += 1

    async def close(self):
        pass

    async def request(self, request, **kwargs):
        assert request.kind == "tts"
        assert request.resource_id == MODEL
        payload = {key: value for key, value in request.payload.items() if key not in ('correlationId', 'taskId')}
        if payload == {"inspect": True, "max_concurrency": 1}:
            return {"voices": ["cori"]}
        assert payload["text"] == "Hello"
        assert payload["language"] == "en"
        assert payload["conditioning"] == {"kind": "preset", "voiceId": "cori"}
        assert payload["schema_version"] == 1
        assert payload["max_concurrency"] == 1
        return self.response


def test_registry_registers_only_installed_callable_tts(tmp_path, monkeypatch):
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    monkeypatch.setattr(
        ModelManager, "is_installed",
        lambda _, spec: spec.model_id in {MODEL, "tts-qwen3-tts-llama-1.7b-base-q4-k-m",
                                         "tts-qwen3-tts-pytorch-0.6b-base-bf16"},
    )
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path)
    assert {entry.definition.model_id for entry in gateway.registry.candidates(Operation.SYNTHESIZE)} == {
        MODEL, MIMO_TTS_MODEL, f"{MIMO_TTS_MODEL}-voicedesign", f"{MIMO_TTS_MODEL}-voiceclone",
        "tts-qwen3-tts-pytorch-0.6b-base-bf16", "nola-provider-tts"}
    match = gateway.match(MatchRequest(Operation.SYNTHESIZE, model_id=MODEL, target_language="en", required_outputs=["speech"]))
    assert match.profile.audio_output == "utterance"
    with pytest.raises(GatewayError, match="speech output required but unavailable"):
        gateway.match(MatchRequest(Operation.SYNTHESIZE, model_id=MODEL, target_language="ja", required_outputs=["speech"]))


async def test_gateway_synthesizes_pcm_and_rejects_missing_or_invalid_audio(tmp_path, monkeypatch):
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    monkeypatch.setattr(ModelManager, "is_installed", lambda _, spec: spec.model_id == MODEL)
    worker = TtsWorker()
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path, worker_factory=lambda: worker)
    pcm = b"\x01\x00\x02\x00"
    wav = io.BytesIO()
    with wave.open(wav, "wb") as output:
        output.setparams((1, 2, 22050, 0, "NONE", "not compressed"))
        output.writeframes(pcm)
    worker.response = {"audio": "data:audio/wav;base64," + base64.b64encode(wav.getvalue()).decode()}
    ctx = CallContext(Operation.SYNTHESIZE, "tts")
    request = MatchRequest(Operation.SYNTHESIZE, model_id=MODEL, target_language="en", required_outputs=["speech"])
    try:
        voices = await run_direct_inference(gateway, DirectTtsVoicesRequest(kind="tts-voices", id=uuid4(), model=MODEL))
        assert voices.voices == ["cori"]
        result = await gateway.synthesize(ctx, text="Hello", voice="cori", request=request)
        assert worker.starts == 1
        chunk, = result.chunks
        assert (chunk.pcm, chunk.sample_rate, chunk.channels, chunk.terminal) == (pcm, 22050, 1, True)
        for response in ({}, {"audio": "data:audio/wav;base64,AA=="}):
            worker.response = response
            with pytest.raises(GatewayError) as failure:
                await gateway.synthesize(ctx, text="Hello", voice="cori", request=request)
            assert failure.value.code == GatewayErrorCode.PROVIDER_ERROR
    finally:
        await gateway.shutdown()


async def test_mimo_synthesizes_pcm_through_the_gateway_without_a_local_worker(tmp_path, monkeypatch):
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    monkeypatch.setattr(ModelManager, "is_installed", lambda *_: False)
    wav = io.BytesIO()
    pcm = b"\x01\x00\x02\x00"
    with wave.open(wav, "wb") as output:
        output.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
        output.writeframes(pcm)
    client = httpx.AsyncClient

    def respond(request):
        assert str(request.url) == "https://api.xiaomimimo.com/v1/chat/completions"
        assert request.headers["authorization"] == "Bearer test-key"
        assert json.loads(request.content) == {
            "model": MIMO_TTS_MODEL, "messages": [{"role": "assistant", "content": "你好"}],
            "audio": {"format": "wav", "voice": "mimo_default"}, "stream": False,
        }
        return httpx.Response(200, json={"choices": [{"message": {"audio": {"data": base64.b64encode(wav.getvalue()).decode()}}}]})

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs))
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path, worker_factory=lambda: pytest.fail("started a local worker"))
    request = MatchRequest(Operation.SYNTHESIZE, model_id=MIMO_TTS_MODEL, target_language="zh", required_outputs=["speech"])
    try:
        context = CallContext(Operation.SYNTHESIZE, "test", provider_options={"api_key": "test-key"})
        result = await gateway.synthesize(context, text="你好", voice=None, request=request)
        chunk, = result.chunks
        assert (chunk.pcm, chunk.sample_rate, chunk.channels, chunk.terminal) == (pcm, 24000, 1, True)
        with pytest.raises(GatewayError, match="API key is missing"):
            await gateway.synthesize(CallContext(Operation.SYNTHESIZE, "missing"), text="你好", voice=None, request=request)
    finally:
        await gateway.shutdown()

@pytest.mark.asyncio
@pytest.mark.parametrize("voice", ["Mia", "Chloe", "Milo", "Dean"])
async def test_mimo_voice_language_is_checked_before_network_or_worker(tmp_path, monkeypatch, voice):
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    monkeypatch.setattr(ModelManager, "is_installed", lambda *_: False)
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: pytest.fail("provider was called"))
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path, worker_factory=lambda: pytest.fail("worker was loaded"))
    try:
        request = MatchRequest(Operation.SYNTHESIZE, model_id=MIMO_TTS_MODEL, target_language="zh", required_outputs=["speech"])
        with pytest.raises(GatewayError, match="does not support zh") as error:
            await gateway.synthesize(CallContext(Operation.SYNTHESIZE, "test"), text="你好", voice=voice, request=request)
        assert error.value.provider_code == "VOICE_LANGUAGE_UNSUPPORTED"
        inventory = await gateway.tts_voices(CallContext(Operation.SYNTHESIZE, "inventory"), request)
        assert next(item for item in inventory if item.id == voice).languages == ["en"]
    finally:
        await gateway.shutdown()
