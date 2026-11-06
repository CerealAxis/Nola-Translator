"""Pinned, one-shot workbench inference through the model gateway."""

from __future__ import annotations

import asyncio
import base64
import io
import time
import wave
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from .gateway.adapters import _decode_wav_data_url
from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.gateway import MatchRequest, ModelGateway
from .gateway.operations import SynthesisResult
from .glossary import GlossaryTerm, glossary_prompt

Language = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64_000)]
WAV_PREFIX = "data:audio/wav;base64,"
DIRECT_INFERENCE_TIMEOUT_S = 600.0
PUBLIC_PROVIDER_CODES = frozenset({"authentication_failed", "rate_limited", "request_timeout", "network_unavailable"})


class _DirectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    model: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]
    task_mode: Literal["realtime", "offline"] = "offline"
    max_concurrency: int = Field(default=1, ge=1, le=10)


class DirectAsrRequest(_DirectRequest):
    kind: Literal["asr"]
    audio: str = Field(max_length=32 * 1024 * 1024 + 64, repr=False)
    source: Language = "auto"
    batch: bool = False


class DirectMtRequest(_DirectRequest):
    kind: Literal["mt"]
    text: Text
    source: Language = "auto"
    target: Language
    glossary: list[GlossaryTerm] = Field(default_factory=list, max_length=256)


class DirectTtsRequest(_DirectRequest):
    kind: Literal["tts"]
    text: Text
    voice: str | None = Field(default=None, max_length=256)
    target: Language | None = None
    response_format: Literal["wav", "mp3"] = "wav"


class DirectTtsVoicesRequest(_DirectRequest):
    kind: Literal["tts-voices"]


DirectInferenceRequest = Annotated[
    DirectAsrRequest | DirectMtRequest | DirectTtsRequest | DirectTtsVoicesRequest, Field(discriminator="kind")
]


class DirectInferenceResult(BaseModel):
    text: str
    audio: str | None = None
    voices: list[str] | None = None


def _asr_pcm(audio: str) -> bytes:
    try:
        if not audio.startswith(WAV_PREFIX):
            raise ValueError("expected WAV data URL")
        pcm, sample_rate, channels = _decode_wav_data_url(audio)
        if sample_rate != 16_000 or channels != 1:
            raise ValueError("expected mono 16 kHz")
        return pcm
    except (ValueError, wave.Error, EOFError) as error:
        raise GatewayError(
            GatewayErrorCode.CAPABILITY_MISMATCH, stage="asr", message="Expected mono 16 kHz PCM16 WAV audio",
        ) from error


def _batch_asr_pcm(audio: str, *, split: bool = True) -> list[bytes]:
    import numpy as np

    from ..gateway_worker import decode_file, split_batch_audio

    try:
        if not audio.startswith(WAV_PREFIX):
            raise ValueError("expected WAV data URL")
        samples = decode_file(audio[len(WAV_PREFIX):])
    except (ValueError, wave.Error, EOFError) as error:
        raise GatewayError(
            GatewayErrorCode.INVALID_INPUT, stage="asr", message="Expected a supported PCM WAV file",
        ) from error
    return [
        np.rint(np.clip(segment, -1, 32767 / 32768) * 32768).astype("<i2").tobytes()
        for segment in (split_batch_audio(samples) if split else [samples]) if segment.size
    ]


def _tts_wav(result: SynthesisResult) -> str:
    if not result.chunks:
        raise ValueError("no synthesis chunks")
    first = result.chunks[0]
    if not 8000 <= first.sample_rate <= 192000 or first.channels not in (1, 2):
        raise ValueError("invalid synthesis audio format")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(first.channels)
        wav.setsampwidth(2)
        wav.setframerate(first.sample_rate)
        for chunk in result.chunks:
            if (
                chunk.channels != first.channels or chunk.sample_rate != first.sample_rate
                or not chunk.pcm or len(chunk.pcm) % (first.channels * 2)
            ):
                raise ValueError("inconsistent synthesis chunk")
            wav.writeframesraw(chunk.pcm)
    return WAV_PREFIX + base64.b64encode(output.getvalue()).decode("ascii")


async def run_direct_inference(
    gateway: ModelGateway,
    request: DirectInferenceRequest,
    *,
    provider_options: dict[str, str] | None = None,
    timeout_s: float = DIRECT_INFERENCE_TIMEOUT_S,
) -> DirectInferenceResult:
    operation = {
        "asr": Operation.TRANSCRIBE,
        "mt": Operation.TRANSLATE,
        "tts": Operation.SYNTHESIZE,
        "tts-voices": Operation.SYNTHESIZE,
    }[request.kind]
    deadline = time.monotonic() + timeout_s
    ctx = CallContext(
        operation=operation,
        task_id=str(request.id),
        request_id=str(request.id),
        deadline=deadline,
        provider_options=provider_options or {},
        task_mode=request.task_mode, max_concurrency=request.max_concurrency,
    )
    if isinstance(request, DirectMtRequest) and request.glossary:
        glossary_prompt(request.glossary)
        ctx.translation_context["glossary"] = request.glossary
    match = MatchRequest(operation=operation, model_id=request.model)
    try:
        async with asyncio.timeout(deadline - time.monotonic()):
            if isinstance(request, DirectAsrRequest):
                match.source_language = request.source
                segments = await asyncio.to_thread(
                    _batch_asr_pcm, request.audio, split=request.model not in ("aliyun", "minimax"),
                ) if request.batch else [_asr_pcm(request.audio)]
                if not segments:
                    gateway.match(match)
                transcript = []
                batch_size = min(5, request.max_concurrency) if request.task_mode == "offline" else 1
                for offset in range(0, len(segments), batch_size):
                    tasks = [asyncio.create_task(gateway.transcribe(ctx, audio=pcm, language=request.source, request=match))
                        for pcm in segments[offset:offset + batch_size]]
                    try:
                        await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
                        observations = await asyncio.gather(*tasks)
                    finally:
                        if any(not task.done() or task.cancelled() or task.exception() is not None for task in tasks):
                            ctx.cancel_token.cancel()
                        for task in tasks:
                            if not task.done():
                                task.cancel()
                        await asyncio.gather(*tasks, return_exceptions=True)
                    transcript.extend(observation.text for observation in observations if observation.text)
                return DirectInferenceResult(text=" ".join(transcript))
            if isinstance(request, DirectMtRequest):
                match.source_language = request.source
                match.target_language = request.target
                translation = await gateway.translate(
                    ctx, text=request.text, source=request.source, target=request.target, request=match,
                )
                return DirectInferenceResult(text=translation.text)
            match.required_outputs = ["speech"]
            if isinstance(request, DirectTtsVoicesRequest):
                return DirectInferenceResult(text="", voices=await gateway.tts_voices(ctx, match))
            match.target_language = request.target
            result = await gateway.synthesize(ctx, text=request.text, voice=request.voice or None, request=match)
            audio = _tts_wav(result)
            if request.response_format == "mp3":
                from ..gateway_worker import speech_format

                encoded = await asyncio.to_thread(speech_format, {"audio": audio}, "mp3")
                audio = encoded["audio"]
            return DirectInferenceResult(text=request.text, audio=audio, voices=result.voices)
    except TimeoutError:
        ctx.cancel_token.cancel()
        raise GatewayError(GatewayErrorCode.TIMEOUT, stage=request.kind, message="Inference timed out") from None
    except asyncio.CancelledError:
        ctx.cancel_token.cancel()
        raise
    except GatewayError as error:
        ctx.cancel_token.cancel()
        # Provider diagnostics can contain opaque credentials that string redaction cannot recognize.
        raise GatewayError(
            error.code, stage=request.kind, message="Inference failed", retryable=error.retryable,
            provider_code=error.provider_code if error.provider_code in PUBLIC_PROVIDER_CODES else None,
            fatal_scope=error.fatal_scope, retry_after_ms=error.retry_after_ms, correlation_id=error.correlation_id,
        ) from None
    except Exception:
        ctx.cancel_token.cancel()
        raise GatewayError(GatewayErrorCode.INTERNAL, stage=request.kind, message="Inference failed") from None
