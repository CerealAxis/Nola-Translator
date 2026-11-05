import asyncio
import base64
import io
import wave
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from nola_translator_engine.backend.direct_inference import (
    DirectInferenceRequest,
    WAV_PREFIX,
    run_direct_inference,
)
from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode, Operation
from nola_translator_engine.backend.gateway.gateway import ModelGateway
from nola_translator_engine.backend.gateway.operations import AsrObservation, SynthesisChunk, SynthesisResult, TranslationResult

REQUEST = TypeAdapter(DirectInferenceRequest)
PCM = bytes.fromhex("0080ffff0000ff7f")


def request(kind, **fields):
    return REQUEST.validate_python({"id": str(uuid4()), "model": "chosen", "kind": kind, **fields})


def wav(rate=16000, *, truncate=False):
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        writer.writeframes(PCM)
    payload = output.getvalue()
    return WAV_PREFIX + base64.b64encode(payload[:-2] if truncate else payload).decode("ascii")


async def test_direct_asr_decodes_wav_and_pins_model():
    gateway = AsyncMock(spec=ModelGateway)
    gateway.transcribe.return_value = AsrObservation("hello")
    body = request("asr", audio=wav(), source="en")

    result = await run_direct_inference(gateway, body)

    assert result.text == "hello"
    ctx, = gateway.transcribe.await_args.args
    assert ctx.operation is Operation.TRANSCRIBE
    assert ctx.request_id == str(body.id)
    assert ctx.deadline is not None
    args = gateway.transcribe.await_args.kwargs
    assert args["audio"] == PCM
    assert args["language"] == "en"
    assert args["request"].source_language == "en"
    assert args["request"].model_id == "chosen"


@pytest.mark.parametrize("audio", [wav(24000), wav(truncate=True)])
async def test_direct_asr_rejects_invalid_wav_before_gateway(audio):
    gateway = AsyncMock(spec=ModelGateway)
    with pytest.raises(GatewayError) as caught:
        await run_direct_inference(gateway, request("asr", audio=audio))
    assert caught.value.code is GatewayErrorCode.CAPABILITY_MISMATCH
    gateway.transcribe.assert_not_awaited()


async def test_direct_batch_asr_resamples_and_joins_segment_transcripts(monkeypatch):
    from nola_translator_engine import gateway_worker

    def split(samples):
        assert samples.dtype.name == "float32"
        assert samples.size == 8
        return [samples[:2], samples[2:3], samples[3:]]

    monkeypatch.setattr(gateway_worker, "split_batch_audio", split)
    gateway = AsyncMock(spec=ModelGateway)
    gateway.transcribe.side_effect = [AsrObservation("hello"), AsrObservation(""), AsrObservation("world")]

    result = await run_direct_inference(gateway, request("asr", audio=wav(8000), batch=True))

    assert result.text == "hello world"
    assert [len(call.kwargs["audio"]) for call in gateway.transcribe.await_args_list] == [4, 2, 10]
    assert all(call.kwargs["request"].model_id == "chosen" for call in gateway.transcribe.await_args_list)


async def test_direct_batch_asr_empty_segmentation_still_checks_model(monkeypatch):
    from nola_translator_engine import gateway_worker

    monkeypatch.setattr(gateway_worker, "split_batch_audio", lambda _: [])
    gateway = AsyncMock(spec=ModelGateway)
    result = await run_direct_inference(gateway, request("asr", audio=wav(), batch=True))

    assert result.text == ""
    assert gateway.match.call_args.args[0].model_id == "chosen"
    gateway.transcribe.assert_not_awaited()


async def test_direct_mt_passes_private_options_and_language_constraints():
    gateway = AsyncMock(spec=ModelGateway)
    gateway.translate.return_value = TranslationResult("你好", "en", "zh")
    body = request("mt", text="Hello", source="en", target="zh")

    result = await run_direct_inference(gateway, body, provider_options={"api_key": "secret"})

    assert result.model_dump(exclude_none=True) == {"text": "你好"}
    ctx, = gateway.translate.await_args.args
    assert ctx.provider_options == {"api_key": "secret"}
    assert "secret" not in repr(ctx)
    args = gateway.translate.await_args.kwargs
    assert args["text"] == "Hello"
    assert (args["request"].model_id, args["request"].source_language, args["request"].target_language) == (
        "chosen", "en", "zh",
    )


async def test_direct_tts_encodes_gateway_chunks_as_wav():
    gateway = AsyncMock(spec=ModelGateway)
    gateway.synthesize.return_value = SynthesisResult(
        chunks=[SynthesisChunk(PCM[:4], 24000), SynthesisChunk(PCM[4:], 24000, seq=1, terminal=True)],
        voices=["voice-1"],
    )
    result = await run_direct_inference(gateway, request("tts", text="Hello", target="en", voice="voice-1"))

    assert result.text == "Hello"
    assert result.voices == ["voice-1"]
    assert result.audio == wav(24000)
    args = gateway.synthesize.await_args.kwargs
    assert args["voice"] == "voice-1"
    assert args["request"].model_id == "chosen"
    assert args["request"].target_language == "en"
    assert args["request"].required_outputs == ["speech"]


async def test_direct_tts_encodes_gateway_chunks_as_mp3():
    gateway = AsyncMock(spec=ModelGateway)
    gateway.synthesize.return_value = SynthesisResult(
        chunks=[SynthesisChunk(PCM * 1200, 24000, terminal=True)],
        voices=["voice-1"],
    )
    result = await run_direct_inference(gateway, request("tts", text="Hello", response_format="mp3"))

    assert result.text == "Hello"
    assert result.voices == ["voice-1"]
    prefix = "data:audio/mpeg;base64,"
    assert result.audio.startswith(prefix)
    mp3 = base64.b64decode(result.audio[len(prefix):], validate=True)
    assert len(mp3) > 100
    assert mp3[0] == 0xff and mp3[1] & 0xe0 == 0xe0


async def test_direct_inference_deadline_cancels_gateway_call():
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def wait(*args, **kwargs):
        started.set()
        try:
            await asyncio.Future()
        finally:
            stopped.set()

    gateway = AsyncMock(spec=ModelGateway)
    gateway.translate.side_effect = wait
    with pytest.raises(GatewayError) as caught:
        await run_direct_inference(gateway, request("mt", text="Hello", target="zh"), timeout_s=0.02)
    assert caught.value.code is GatewayErrorCode.TIMEOUT
    assert started.is_set() and stopped.is_set()
    assert gateway.translate.await_args.args[0].cancel_token.cancelled


async def test_direct_inference_drops_provider_error_details():
    gateway = AsyncMock(spec=ModelGateway)
    gateway.translate.side_effect = GatewayError(
        GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="secret", provider_code="secret",
    )
    with pytest.raises(GatewayError) as caught:
        await run_direct_inference(gateway, request("mt", text="Hello", target="zh"))
    assert caught.value.code is GatewayErrorCode.PROVIDER_ERROR
    assert "secret" not in str(caught.value.to_payload())


@pytest.mark.parametrize("fields", [{"api_key": "secret"}, {"image": "data:image/png"}, {"text": " "}])
def test_direct_request_rejects_private_and_unsupported_fields(fields):
    with pytest.raises(ValidationError):
        request("mt", **{"text": "Hello", "target": "zh", **fields})


@pytest.mark.parametrize("mode", ["realtime", "offline"])
async def test_direct_call_passes_explicit_task_mode_and_concurrency_to_gateway(mode):
    gateway = AsyncMock(spec=ModelGateway)
    gateway.transcribe.return_value = AsrObservation("hello")
    await run_direct_inference(gateway, request("asr", audio=wav(), task_mode=mode, max_concurrency=5))
    ctx, = gateway.transcribe.await_args.args
    assert ctx.task_mode == mode
    assert ctx.max_concurrency == 5


@pytest.mark.parametrize("fields", [{"max_concurrency": 0}, {"max_concurrency": 11}, {"task_mode": "unknown"}])
def test_direct_call_rejects_invalid_scheduling_options(fields):
    with pytest.raises(ValidationError):
        request("mt", text="hello", source="en", target="zh", **fields)


@pytest.mark.parametrize('failure', [GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage='asr', message='private'), RuntimeError('private')])
async def test_asr_batch_failure_cancels_and_joins_siblings_before_return(monkeypatch, failure):
    from nola_translator_engine.backend import direct_inference

    monkeypatch.setattr(direct_inference, '_batch_asr_pcm', lambda *args, **kwargs: [PCM, PCM])
    started = asyncio.Event()
    released = asyncio.Event()
    contexts = []
    calls = 0
    async def transcribe(ctx, **kwargs):
        nonlocal calls
        calls += 1
        contexts.append(ctx)
        if calls == 1:
            await started.wait()
            raise failure
        started.set()
        try:
            await asyncio.Future()
        finally:
            assert ctx.cancel_token.cancelled
            await asyncio.sleep(0)
            released.set()

    gateway = AsyncMock(spec=ModelGateway)
    gateway.transcribe.side_effect = transcribe
    with pytest.raises(GatewayError) as caught:
        await run_direct_inference(gateway, request('asr', audio=wav(), batch=True, task_mode='offline', max_concurrency=2))
    assert caught.value.code is (GatewayErrorCode.PROVIDER_ERROR if isinstance(failure, GatewayError) else GatewayErrorCode.INTERNAL)
    assert released.is_set()
    assert calls == 2 and all(ctx.cancel_token.cancelled for ctx in contexts)


async def test_asr_batch_timeout_signals_cancellation_before_releasing_siblings(monkeypatch):
    from nola_translator_engine.backend import direct_inference

    monkeypatch.setattr(direct_inference, '_batch_asr_pcm', lambda *args, **kwargs: [PCM, PCM])
    released = []
    async def transcribe(ctx, **kwargs):
        try:
            await asyncio.Future()
        finally:
            released.append(ctx.cancel_token.cancelled)
    gateway = AsyncMock(spec=ModelGateway)
    gateway.transcribe.side_effect = transcribe
    with pytest.raises(GatewayError) as caught:
        await run_direct_inference(gateway, request('asr', audio=wav(), batch=True, task_mode='offline', max_concurrency=2), timeout_s=0.05)
    assert caught.value.code is GatewayErrorCode.TIMEOUT
    assert released == [True, True]
