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
        message=message,
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

    async def transcribe(self, instance, ctx, *, audio, language, observe=None):
        import numpy as np

        from ...gateway_worker import GatewayWorker, error_code
        from ...recognition.aliyun import CloudRecognitionError

        worker = GatewayWorker(lambda _: None)
        worker.observe_cloud_call = observe
        worker.config = self.selection(ctx.provider_options, language or "auto")
        samples = np.frombuffer(audio, dtype="<i2").astype(np.float32) / 32768
        try:
            text, detected = await worker.transcribe(samples, language)
        except CloudRecognitionError as error:
            raise GatewayError(
                GatewayErrorCode.PROVIDER_ERROR, stage="asr", message="Cloud recognition failed",
                provider_code=error_code(error)[0],
                retryable=error.reason in ("recognitionTimeout", "recognitionNetworkError", "recognitionClosed", "recognitionRateLimited"),
            ) from error
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
        timeout = 30.0 if ctx.deadline is None else ctx.deadline - time.monotonic()
        if timeout <= 0:
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="tts", message="MiMo synthesis deadline expired")
        try:
            async with asyncio.timeout(timeout), httpx.AsyncClient(timeout=timeout) as client:
                endpoint = (ctx.provider_options.get("endpoint") or MIMO_TTS_ENDPOINT).rstrip("/")
                if not endpoint.endswith("/chat/completions"):
                    endpoint += "/chat/completions"
                response = await client.post(endpoint, headers={"Authorization": f"Bearer {key}"}, json={
                    "model": ctx.provider_options.get("model") or MIMO_TTS_MODEL,
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
        except httpx.HTTPError as error:
            from ...gateway_worker import error_code
            provider_code = error_code(error)[0]
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="MiMo synthesis failed",
                               provider_code=provider_code,
                               retryable=provider_code in ("rate_limited", "request_timeout", "network_unavailable")) from error
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
        crisp = instance.configuration.runtime in ("crisp", "crisp-asr", "crisp-tts")
        limit = 1 if ctx.task_mode == "realtime" or crisp else max(1, ctx.max_concurrency)
        request.payload["max_concurrency"] = limit
        request.payload["correlationId"] = ctx.request_id
        request.payload["taskId"] = ctx.task_id
        try:
            if ctx.task_mode == "offline" and instance.definition.capabilities.concurrency.batching and limit > 1 and request.kind != "llm" and not request.payload.get("inspect"):
                response = await worker.request_batch(request, limit=min(5, limit), timeout=timeout)
            else:
                response = await worker.request(request, timeout=timeout)
        except GatewayError as error:
            raise GatewayError(error.code, stage=stage, message=error.raw_message, fatal_scope=error.fatal_scope,
                               provider_code=error.provider_code, retryable=error.retryable,
                               retry_after_ms=error.retry_after_ms, correlation_id=ctx.request_id) from error
        if response.get("error"):
            error = map_local_error(str(response["error"]), stage=stage)
            error.correlation_id = ctx.request_id
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
        from ..glossary import protect_keep_terms

        protected, restore = protect_keep_terms(text, ctx.translation_context.get("glossary") or [])
        payload: dict[str, Any] = {"text": protected, "source": source, "target": target}
        image = ctx.translation_context.get("image")
        if isinstance(image, str):
            from ...resources import INDEX_TRANSLATE_RESOURCE_IDS, INDEX_TRANSLATE_TRANSFORMERS_SPECS

            supported = instance.configuration.resource_id in INDEX_TRANSLATE_RESOURCE_IDS or any(
                spec.model_id == instance.configuration.resource_id for spec in INDEX_TRANSLATE_TRANSFORMERS_SPECS
            )
            if not supported:
                raise GatewayError(GatewayErrorCode.NOT_SUPPORTED, stage="mt", message="Image translation is unavailable")
            payload["image"] = image
        fixed_terms = [term.model_dump() for term in ctx.translation_context.get("glossary") or [] if term.mode != "keep"]
        if fixed_terms:
            payload["glossary"] = fixed_terms
        if instance.definition.capabilities.context.mode == "request_context":
            payload["history"] = bounded_translation_history(ctx.translation_context.get("history"))
        request = WorkerRequest(
            kind="mt",
            config=instance.configuration.compute_options.get("prewarm") or _prewarm(instance, source=source, target=target),
            resource_id=instance.configuration.resource_id,
            payload=payload,
        )
        try:
            response = await self._call(instance, request, ctx, stage="mt")
        except GatewayError as error:
            if not fixed_terms or error.provider_code != "glossaryUnsupported" or not ctx.translation_context.get("skip_unsupported_glossary"):
                raise
            del payload["glossary"]
            response = await self._call(instance, request, ctx, stage="mt")
        try:
            translated = restore(str(response.get("text", "")))
        except ValueError as error:
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="preserveTermsChanged", provider_code="preserveTermsChanged") from error
        return TranslationResult(text=translated, source=source, target=target)

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

    async def llm_endpoint(self, instance: ModelInstance, ctx: CallContext, *, context_window: int | None = None) -> dict[str, Any]:
        """Local LLM inference streams from a llama.cpp server the desktop AI SDK
        owns; the gateway returns the endpoint + context window and leaves chat
        history, streaming, tool execution and approval in Electron (doc 08 §6)."""

        config = instance.configuration.compute_options.get("prewarm") or _prewarm(instance)
        if context_window is not None:
            config = {**config, "compute": {**config.get("compute", {}), "contextSize": context_window}}
        request = WorkerRequest(
            kind="llm",
            config=config,
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
                from ..glossary import protect_keep_terms

                image = ctx.translation_context.get("image")
                if isinstance(image, str):
                    if not isinstance(provider, IndexTranslatePublicProvider):
                        raise GatewayError(GatewayErrorCode.NOT_SUPPORTED, stage="mt", message="Image translation is unavailable")
                    from ...local_call import index_image_content, translate_public_index_image

                    content = index_image_content(image, text, source, target)
                    translated = await translate_public_index_image(provider, content)
                    return TranslationResult(text=translated, source=source, target=target)
                all_terms = ctx.translation_context.get("glossary") or []
                protected, restore = protect_keep_terms(text, all_terms)
                terms = [term for term in all_terms if term.mode != "keep"]
                if terms:
                    from ...translation.network import _BudgetedChatProvider
                    from ..glossary import glossary_prompt

                    if isinstance(provider, _BudgetedChatProvider):
                        provider.glossary_instructions = glossary_prompt(terms)
                    elif not ctx.translation_context.get("skip_unsupported_glossary"):
                        raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="mt", message="glossaryUnsupported")
                result = await provider.translate(protected, source, target)
                translated = restore(result.text)
        except (TimeoutError, httpx.TimeoutException):
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage="mt", message="translation provider timed out") from None
        except (GoogleTranslateError, MyMemoryError) as error:
            code = GatewayErrorCode.TIMEOUT if error.error_code == "translationTimeout" else GatewayErrorCode.PROVIDER_ERROR
            provider_code = {"translationTimeout": "request_timeout", "translationRateLimited": "rate_limited",
                             "URLError": "network_unavailable"}.get(error.error_code)
            raise GatewayError(
                code, stage="mt", message="translation provider failed", provider_code=provider_code,
                retryable=provider_code in ("request_timeout", "rate_limited", "network_unavailable"),
            ) from error
        except httpx.HTTPStatusError as error:
            from ...gateway_worker import error_code

            provider_code = error_code(error)[0]
            raise GatewayError(
                GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="Translation provider failed",
                provider_code=provider_code, retryable=provider_code in ("rate_limited", "request_timeout", "network_unavailable"),
            ) from None
        except ValueError as error:
            if str(error) in ("glossaryBudgetExceeded", "preserveTermsChanged"):
                raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="mt", message=str(error), provider_code=str(error)) from None
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="translation provider failed") from None
        except (httpx.HTTPError, OSError, RuntimeError) as error:
            from ...gateway_worker import error_code
            provider_code = error_code(error)[0]
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="mt", message="translation provider failed",
                               provider_code=provider_code, retryable=provider_code == "network_unavailable") from error
        ctx.cancel_token.raise_if_cancelled()
        return TranslationResult(text=translated, source=source, target=target)


class CustomMtAdapter(_NetworkMtAdapter):
    adapter_id = "custom-mt"
    requires_commit = False

    def _provider(self, instance: ModelInstance, options: dict[str, str]):
        from ...protocol import TranslationOptions

        config = TranslationOptions(
            endpoint=options.get("endpoint", ""), model=options.get("model", ""), apiKey=options.get("api_key", ""),
            apiFormat=options.get("api_format", "chat-completions"),
            apiVersion=options.get("api_version", ""), apiService=options.get("api_service", ""),
            contextWindow=options.get("context_window", 128000), maxOutputTokens=options.get("max_output_tokens", 4096),
        )
        return custom_translation_provider(
            config.apiFormat, endpoint=config.endpoint, model=config.model, api_key=config.apiKey,
            context_window=config.contextWindow, max_output_tokens=config.maxOutputTokens,
            api_version=config.apiVersion, api_service=config.apiService,
        )


class GoogleMtAdapter(_NetworkMtAdapter):
    adapter_id = "google"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> GoogleTranslateProvider:
        return GoogleTranslateProvider(**({'endpoint': options['endpoint']} if options.get('endpoint') else {}))


class IndexPublicMtAdapter(_NetworkMtAdapter):
    adapter_id = "index-translate"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> IndexTranslatePublicProvider:
        return IndexTranslatePublicProvider(**{key: options[key] for key in ('endpoint', 'model') if options.get(key)})


class MicrosoftMtAdapter(_NetworkMtAdapter):
    adapter_id = "microsoft"

    def _provider(self, instance: ModelInstance, options: dict[str, str]) -> MicrosoftTranslatorProvider:
        return MicrosoftTranslatorProvider(**({'endpoint': options['endpoint']} if options.get('endpoint') else {}))


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
