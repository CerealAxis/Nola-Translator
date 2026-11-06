"""Provider adapters: turn existing inference back-ends into the gateway's
standard operations (doc 08 §5/§6).

Local operations run in isolated local_call workers. Network MT wraps existing
clients and accepts only committed text.

Adapters never fabricate success: a local_call error string is mapped to a
typed GatewayError with a sanitized message, and an unknown/unverifiable
capability stays unknown rather than defaulting to true.
"""

from __future__ import annotations

import asyncio
import time
import wave
from contextlib import aclosing
from typing import Any

import httpx

from ...translation.google_translate import GoogleTranslateError, GoogleTranslateProvider
from ...translation.index_translate import IndexTranslatePublicProvider
from ...translation.mymemory import MyMemoryError, MyMemoryTranslationProvider
from ...translation.network import MicrosoftTranslatorProvider, bounded_translation_history, custom_translation_provider

from .capabilities import (
    CallContext,
    GatewayError,
    GatewayErrorCode,
    ModelKind,
    Operation,
    sanitize_details,
)
from .definitions import ModelInstance
from .operations import (
    AsrObservation,
    SynthesisChunk,
    SynthesisResult,
    TranslationResult,
)
from .worker import LocalModelWorker, WorkerRequest


def _decode_wav_data_url(data_url: str) -> tuple[bytes, int, int]:
    """Decode the base64 WAV local_call returns into raw PCM + rate + channels."""

    import base64
    import io
    raw = base64.b64decode(data_url.split(",", 1)[-1], validate=True)
    with wave.open(io.BytesIO(raw), "rb") as source:
        frames = source.readframes(source.getnframes())
        if source.getsampwidth() != 2 or not frames or len(frames) != source.getnframes() * source.getnchannels() * 2:
            raise ValueError("invalid PCM16 frames")
        return frames, source.getframerate(), source.getnchannels()


def map_local_error(message: str, *, stage: str) -> GatewayError:
    """Map a local_call error string onto the unified error surface.

    local_call prefixes messages with the exception type (e.g.
    "ValueError: Selected model is not installed"); we classify on stable
    substrings and always sanitize before the message can leave the process.
    """

    reason = message.removeprefix("ValueError: ").strip()
    if reason in ("glossaryUnsupported", "glossaryBudgetExceeded"):
        return GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage=stage, message=reason, provider_code=reason)
    lowered = message.lower()
    if "not installed" in lowered or "wrong task type" in lowered:
        code = GatewayErrorCode.MODEL_NOT_INSTALLED
        scope = "request"
    elif "integrity" in lowered or "digest" in lowered or "corrupt" in lowered:
        code = GatewayErrorCode.MODEL_INTEGRITY
        scope = "instance"
    elif "out of memory" in lowered or "oom" in lowered or "cuda" in lowered and "memory" in lowered:
        code = GatewayErrorCode.WORKER_OOM
        scope = "instance"
    elif "device is unavailable" in lowered or "resource" in lowered:
        code = GatewayErrorCode.RESOURCE_EXHAUSTED
        scope = "request"
    elif "not supported" in lowered or "does not" in lowered:
        code = GatewayErrorCode.NOT_SUPPORTED
        scope = "request"
    else:
        code = GatewayErrorCode.PROVIDER_ERROR
        scope = "request"
    return GatewayError(
        code,
        stage=stage,
        message=sanitize_details(message),
        fatal_scope=scope,  # type: ignore[arg-type]
    )


class Adapter:
    """Base adapter: identity + the operations it can actually run."""

    adapter_id: str = "adapter"
    adapter_revision: str = "1"
    operations: frozenset[Operation] = frozenset()
    kinds: frozenset[ModelKind] = frozenset()

    def supports(self, operation: Operation) -> bool:
        return operation in self.operations


class CloudAsrAdapter(Adapter):
    kinds = frozenset({ModelKind.ASR})
    operations = frozenset({Operation.TRANSCRIBE})

    def __init__(self, provider: str):
        self.adapter_id = provider

    def selection(self, options: dict[str, str], language: str):
        from ...protocol import PrewarmConfig
        from ...recognition.aliyun import MODELS as LIVETRANSLATE_MODELS

        if self.adapter_id == "aliyun" and options.get("model") in LIVETRANSLATE_MODELS:
            raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="asr", message="LiveTranslate requires the S2S pipeline")

        return PrewarmConfig(
            recognitionProvider=self.adapter_id, sourceLanguage=language, targetLanguages=[],
            recognitionOptions={
                field: options[key] for field, key in (
                    ("apiKey", "api_key"), ("region", "region"), ("endpoint", "endpoint"),
                    ("model", "model"), ("workspaceId", "workspace"),
                ) if key in options
            },
        )

    async def transcribe(self, instance, ctx, *, audio, language):
        import numpy as np

        from ...gateway_worker import GatewayWorker, error_code
        from ...recognition.aliyun import CloudRecognitionError

        worker = GatewayWorker(lambda _: None)
        worker.config = self.selection(ctx.provider_options, language or "auto")
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768
        try:
            text, detected = await worker.transcribe(samples, language)
        except CloudRecognitionError as error:
            raise GatewayError(
                GatewayErrorCode.PROVIDER_ERROR, stage="asr", message="Cloud recognition failed",
                provider_code=error_code(error)[0],
            ) from None
        return AsrObservation(text, detected, is_final=True)


MIMO_TTS_MODEL = "mimo-v2.5-tts"
MIMO_TTS_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions"
MIMO_TTS_VOICES = ("mimo_default", "冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean")


class MiMoTtsAdapter(Adapter):
    adapter_id = MIMO_TTS_MODEL
    operations = frozenset({Operation.SYNTHESIZE})
    kinds = frozenset({ModelKind.TTS})

    async def tts_voices(self, instance: ModelInstance, ctx: CallContext) -> list[str]:
        return list(MIMO_TTS_VOICES)

    async def synthesize(self, instance: ModelInstance, ctx: CallContext, *, text: str, voice: str | None) -> SynthesisResult:
        ctx.cancel_token.raise_if_cancelled()
        key = ctx.provider_options.get("api_key", "").strip()
        if not key:
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="MiMo API key is missing")
        if voice and voice not in MIMO_TTS_VOICES:
            raise GatewayError(GatewayErrorCode.INVALID_INPUT, stage="tts", message="Unsupported MiMo voice")
        timeout = 30.0 if ctx.deadline is None else ctx.deadline - time.monotonic()
        if timeout <= 0:
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="tts", message="MiMo synthesis deadline expired")
        try:
            async with asyncio.timeout(timeout), httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(MIMO_TTS_ENDPOINT, headers={"Authorization": f"Bearer {key}"}, json={
                    "model": MIMO_TTS_MODEL,
                    "messages": [{"role": "assistant", "content": text}],
                    "audio": {"format": "wav", "voice": voice or "mimo_default"},
                    "stream": False,
                })
                response.raise_for_status()
                data = response.json()["choices"][0]["message"]["audio"]["data"]
                if not isinstance(data, str):
                    raise ValueError("invalid audio payload")
                pcm, rate, channels = _decode_wav_data_url("data:audio/wav;base64," + data)
        except (TimeoutError, httpx.TimeoutException):
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="tts", message="MiMo synthesis timed out") from None
        except (httpx.HTTPError, ValueError, TypeError, KeyError, IndexError, wave.Error, EOFError):
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="MiMo synthesis failed") from None
        ctx.cancel_token.raise_if_cancelled()
        return SynthesisResult(chunks=[SynthesisChunk(pcm=pcm, sample_rate=rate, channels=channels, seq=0, terminal=True)],
                               voices=list(MIMO_TTS_VOICES), sample_rate=rate)


class LocalWorkerAdapter(Adapter):
    """Adapts the persistent local_call worker to standard operations."""

    adapter_id = "local-call"
    adapter_revision = "1"
    operations = frozenset(
        {Operation.TRANSCRIBE, Operation.TRANSLATE, Operation.SYNTHESIZE, Operation.GENERATE}
    )
    kinds = frozenset({ModelKind.ASR, ModelKind.MT, ModelKind.TTS, ModelKind.LLM})

    async def _call(self, instance: ModelInstance, request: WorkerRequest, ctx: CallContext, *, stage: str) -> dict[str, Any]:
        ctx.cancel_token.raise_if_cancelled()
        timeout = None
        if ctx.deadline is not None:
            import time

            timeout = ctx.deadline - time.monotonic()
            if timeout <= 0:
                raise GatewayError(GatewayErrorCode.TIMEOUT, stage=stage, message="operation deadline expired")
        worker = instance.handle
        if not isinstance(worker, LocalModelWorker):
            raise GatewayError(GatewayErrorCode.WORKER_EXITED, stage=stage, message="local worker unavailable")
        if instance.configuration.device != "auto":
            request.gateway_device = instance.configuration.device
        limit = 1 if ctx.task_mode == "realtime" else min(5, instance.definition.capabilities.concurrency.max_active_requests, max(1, ctx.max_concurrency))
        request.payload["max_concurrency"] = limit
        if ctx.task_mode == "offline" and instance.definition.capabilities.concurrency.batching and limit > 1 and request.kind != "llm" and not request.payload.get("inspect"):
            response = await worker.request_batch(request, limit=limit, timeout=timeout)
        else:
            response = await worker.request(request, timeout=timeout)
        if response.get("error"):
            error = map_local_error(str(response["error"]), stage=stage)
            if error.code == GatewayErrorCode.WORKER_OOM:
                await worker.abort()
            raise error
        ctx.cancel_token.raise_if_cancelled()
        return response

    async def transcribe(
        self, instance: ModelInstance, ctx: CallContext, *, audio: bytes, language: str | None
    ) -> AsrObservation:
        import base64
        import io

        # local_call expects a mono 16 kHz PCM16 WAV data URL.
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(16000)
            out.writeframes(audio)
        data_url = "data:audio/wav;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
        config = instance.configuration.compute_options.get("prewarm") or _prewarm(instance)
        request = WorkerRequest(
            kind="asr",
            config={**config, "sourceLanguage": language or config["sourceLanguage"]},
            resource_id=instance.configuration.resource_id,
            payload={"audio": data_url},
        )
        response = await self._call(instance, request, ctx, stage="asr")
        detected = response.get("language")
        return AsrObservation(
            text=str(response.get("text", "")),
            language=detected if isinstance(detected, str) and detected else language,
            is_final=True,
        )

    async def translate(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, source: str, target: str
    ) -> TranslationResult:
        payload: dict[str, Any] = {"text": text, "source": source, "target": target}
        if ctx.translation_context.get("glossary"):
            payload["glossary"] = [term.model_dump() for term in ctx.translation_context["glossary"]]
        if instance.definition.capabilities.context.mode == "request_context":
            payload["history"] = bounded_translation_history(ctx.translation_context.get("history"))
        request = WorkerRequest(
            kind="mt",
            config=instance.configuration.compute_options.get("prewarm") or _prewarm(instance, source=source, target=target),
            resource_id=instance.configuration.resource_id,
            payload=payload,
        )
        response = await self._call(instance, request, ctx, stage="mt")
        return TranslationResult(text=str(response.get("text", "")), source=source, target=target)

    async def tts_voices(self, instance: ModelInstance, ctx: CallContext) -> list[str]:
        request = WorkerRequest(
            kind="tts",
            config=instance.configuration.compute_options.get("prewarm") or _prewarm(instance),
            resource_id=instance.configuration.resource_id,
            payload={"inspect": True},
        )
        response = await self._call(instance, request, ctx, stage="tts")
        return list(response.get("voices") or [])

    async def synthesize(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, voice: str | None
    ) -> SynthesisResult:
        payload: dict[str, Any] = {"text": text}
        if voice:
            payload["voice"] = voice
        request = WorkerRequest(
            kind="tts",
            config=instance.configuration.compute_options.get("prewarm") or _prewarm(instance),
            resource_id=instance.configuration.resource_id,
            payload=payload,
        )
        response = await self._call(instance, request, ctx, stage="tts")
        voices = list(response.get("voices") or [])
        audio = response.get("audio")
        if not isinstance(audio, str) or not audio.startswith("data:audio/wav;base64,"):
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="synthesis returned no WAV audio")
        try:
            pcm, rate, channels = _decode_wav_data_url(audio)
        except (ValueError, wave.Error, EOFError) as error:
            raise GatewayError(
                GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="synthesis returned invalid PCM16 WAV audio",
            ) from error
        chunk = SynthesisChunk(pcm=pcm, sample_rate=rate, channels=channels, seq=0, terminal=True)
        return SynthesisResult(chunks=[chunk], voices=voices, sample_rate=rate)

    async def llm_endpoint(self, instance: ModelInstance, ctx: CallContext) -> dict[str, Any]:
        """Local LLM inference streams from a llama.cpp server the desktop AI SDK
        owns; the gateway returns the endpoint + context window and leaves chat
        history, streaming, tool execution and approval in Electron (doc 08 §6)."""

        request = WorkerRequest(
            kind="llm",
            config=instance.configuration.compute_options.get("prewarm") or _prewarm(instance),
            resource_id=instance.configuration.resource_id,
        )
        return await self._call(instance, request, ctx, stage="llm")


def _prewarm(instance: ModelInstance, *, source: str = "auto", target: str | None = None) -> dict[str, Any]:
    """Build a minimal valid PrewarmConfig for a local instance when the caller
    did not supply one. Only source/target languages are required; everything
    else falls back to the protocol defaults."""

    config: dict[str, Any] = {
        "sourceLanguage": source or "auto",
        "targetLanguages": [target] if target else [],
        "recognitionProvider": "local",
    }
    if instance.configuration.resource_id:
        if instance.definition.supports(Operation.TRANSCRIBE):
            config["recognitionModelId"] = instance.configuration.resource_id
        if instance.definition.supports(Operation.TRANSLATE) or instance.definition.supports(Operation.GENERATE):
            config["translationModelId"] = instance.configuration.resource_id
            config["translationProvider"] = "local"
    compute = instance.configuration.compute_options.get("compute")
    if compute:
        config["compute"] = compute
    return config


class _NetworkMtAdapter(Adapter):
    operations = frozenset({Operation.TRANSLATE})
    kinds = frozenset({ModelKind.MT})
    requires_commit = True

    async def translate(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, source: str, target: str
    ) -> TranslationResult:
        ctx.cancel_token.raise_if_cancelled()
        if self.requires_commit and ctx.source_is_provisional:
            raise GatewayError(
                GatewayErrorCode.CAPABILITY_MISMATCH, stage="mt", message="translation requires committed source text"
            )
        timeout = None if ctx.deadline is None else ctx.deadline - time.monotonic()
        if timeout is not None and timeout <= 0:
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="mt", message="translation deadline expired")
        try:
            async with asyncio.timeout(timeout), aclosing(self._provider(instance, ctx.provider_options)) as provider:
                terms = ctx.translation_context.get("glossary")
                if terms:
                    from ...translation.network import _BudgetedChatProvider
                    from ..glossary import glossary_prompt

                    if not isinstance(provider, _BudgetedChatProvider):
                        raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="mt", message="glossaryUnsupported")
                    provider.glossary_instructions = glossary_prompt(terms)
                result = await provider.translate(text, source, target)
        except (TimeoutError, httpx.TimeoutException):
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="mt", message="translation provider timed out") from None
        except (GoogleTranslateError, MyMemoryError) as error:
            code = GatewayErrorCode.TIMEOUT if error.error_code == "translationTimeout" else GatewayErrorCode.PROVIDER_ERROR
            raise GatewayError(
                code, stage="mt", message="translation provider failed", provider_code=error.error_code
            ) from None
        except httpx.HTTPStatusError as error:
            from ...gateway_worker import error_code

            raise GatewayError(
                GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="Translation provider failed",
                provider_code=error_code(error)[0],
            ) from None
        except ValueError as error:
            if str(error) == "glossaryBudgetExceeded":
                raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="mt", message=str(error), provider_code=str(error)) from None
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="translation provider failed") from None
        except (httpx.HTTPError, OSError, RuntimeError):
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="translation provider failed") from None
        ctx.cancel_token.raise_if_cancelled()
        return TranslationResult(text=result.text, source=source, target=target)


class CustomMtAdapter(_NetworkMtAdapter):
    adapter_id = "custom-mt"
    requires_commit = False

    def _provider(self, instance: ModelInstance, options: dict[str, str]):
        from ...protocol import TranslationOptions

        config = TranslationOptions(
            endpoint=options.get("endpoint", ""), model=options.get("model", ""), apiKey=options.get("api_key", ""),
            apiFormat=options.get("api_format", "chat-completions"),
            contextWindow=options.get("context_window", 128000), maxOutputTokens=options.get("max_output_tokens", 4096),
        )
        return custom_translation_provider(
            config.apiFormat, endpoint=config.endpoint, model=config.model, api_key=config.apiKey,
            context_window=config.contextWindow, max_output_tokens=config.maxOutputTokens,
        )


class GoogleMtAdapter(_NetworkMtAdapter):
    adapter_id = "google"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> GoogleTranslateProvider:
        return GoogleTranslateProvider()


class IndexPublicMtAdapter(_NetworkMtAdapter):
    adapter_id = "index-translate"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> IndexTranslatePublicProvider:
        return IndexTranslatePublicProvider()


class MicrosoftMtAdapter(_NetworkMtAdapter):
    adapter_id = "microsoft"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> MicrosoftTranslatorProvider:
        return MicrosoftTranslatorProvider()


class MyMemoryMtAdapter(_NetworkMtAdapter):
    adapter_id = "mymemory"

    def __init__(self, *, email: str = "", endpoint: str | None = None) -> None:
        self._email = email
        self._endpoint = endpoint

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> MyMemoryTranslationProvider:
        endpoint = options.get("endpoint", self._endpoint or instance.configuration.endpoint)
        kwargs = {"endpoint": endpoint} if endpoint is not None else {}
        return MyMemoryTranslationProvider(email=options.get("email", self._email), **kwargs)

    async def translate(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, source: str, target: str
    ) -> TranslationResult:
        if source == "auto":
            raise GatewayError(
                GatewayErrorCode.NOT_SUPPORTED, stage="mt",
                message="MyMemory requires an explicit committed source language",
            )
        return await super().translate(instance, ctx, text=text, source=source, target=target)


class AdapterRegistry:
    """Resolve a model's declared adapter for a requested operation."""

    def __init__(self) -> None:
        self._adapters: dict[tuple[Operation, str], Adapter] = {}

    def register(self, adapter: Adapter, operations: list[Operation] | None = None) -> None:
        for operation in operations or list(adapter.operations):
            if operation not in adapter.operations:
                raise ValueError(f"adapter {adapter.adapter_id} cannot run {operation.value}")
            self._adapters[operation, adapter.adapter_id] = adapter

    def resolve(self, operation: Operation, adapter_id: str) -> Adapter | None:
        return self._adapters.get((operation, adapter_id))

    def require(self, operation: Operation, adapter_id: str) -> Adapter:
        adapter = self.resolve(operation, adapter_id)
        if adapter is None:
            raise GatewayError(
                GatewayErrorCode.CAPABILITY_MISMATCH,
                stage="resolve",
                message=f"adapter {adapter_id} is unavailable for {operation.value}",
                fatal_scope="request",
            )
        return adapter
