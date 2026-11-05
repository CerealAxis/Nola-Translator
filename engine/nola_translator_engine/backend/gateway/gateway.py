"""ModelGateway facade: resolve → match → acquire lease → call → release
(doc 08 §4/§9).

The gateway is a module inside the FastAPI backend, not a separate process that
must be reached over HTTP (decision: "Model Gateway is an independent module in
the same backend"). It is the single owner of model instances, leases, resource
admission and capability arbitration. Business code asks for an *operation* with
languages/output requirements and never branches on a model name.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from typing import Any, Callable, Iterable

from .adapters import Adapter, AdapterRegistry, CloudAsrAdapter, LocalWorkerAdapter
from .capabilities import (
    CallContext,
    GatewayError,
    GatewayErrorCode,
    ModelCapabilities,
    ModelKind,
    Operation,
    OperationProfile,
)
from .definitions import ModelDefinition, ModelInstance, ProviderConfiguration
from .lifecycle import InstanceManager, Lease
from .operations import (
    AsrObservation,
    SynthesisResult,
    TranslationResult,
)
from .resources import ConcurrencyGate, ResourceAdmission, ResourceExhausted
from .worker import LocalModelWorker


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


@dataclass
class RegistryEntry:
    definition: ModelDefinition
    configuration: ProviderConfiguration
    enabled: bool = True


class ModelRegistry:
    """Model definitions + provider configurations. Resolution by id/kind only;
    a provider or model name is never used to pick an adapter at call time."""

    def __init__(self) -> None:
        self._entries: dict[str, RegistryEntry] = {}

    def register(self, definition: ModelDefinition, configuration: ProviderConfiguration, *, enabled: bool = True) -> None:
        if not configuration.is_cloud and definition.capabilities.adapter_id == "local-call":
            crisp = configuration.runtime in ("crisp", "crisp-asr", "crisp-tts")
            definition.capabilities.concurrency.max_active_requests = 1 if crisp else 5
            definition.capabilities.concurrency.batching = not crisp and configuration.runtime in (
                "pytorch", "llama", "transformers-causal", "transformers-seq2seq", "transformers-tts",
            )
        definition.capabilities.validate_kinds()
        self._entries[definition.model_id] = RegistryEntry(definition, configuration, enabled)

    def get(self, model_id: str) -> RegistryEntry | None:
        return self._entries.get(model_id)

    def entries(self) -> list[RegistryEntry]:
        """All registered entries (enabled or not) for management reporting."""

        return list(self._entries.values())

    def set_enabled(self, model_id: str, enabled: bool) -> None:
        entry = self._entries.get(model_id)
        if entry is not None:
            entry.enabled = enabled

    def candidates(self, operation: Operation) -> list[RegistryEntry]:
        return [
            entry
            for entry in self._entries.values()
            if entry.enabled and entry.definition.supports(operation)
        ]


# ---------------------------------------------------------------------------
# Match request / result
# ---------------------------------------------------------------------------


@dataclass
class MatchRequest:
    operation: Operation
    source_language: str | None = None
    target_language: str | None = None
    required_outputs: list[str] = field(default_factory=list)
    optional_outputs: list[str] = field(default_factory=list)
    accept_preview: bool = True
    source_is_provisional: bool = False
    #: Hard requirements: unknown does not satisfy them (doc 08 §4 step 5).
    require_streaming_input: bool | None = None
    require_streaming_output: bool | None = None
    require_cancellation: bool = False
    require_timestamps: bool | None = None
    device: str | None = None
    #: Pin a specific model id (e.g. the user's explicit selection).
    model_id: str | None = None


@dataclass
class MatchResult:
    entry: RegistryEntry
    profile: OperationProfile
    unmet_optional: list[str] = field(default_factory=list)


class ModelGateway:
    def __init__(
        self,
        *,
        registry: ModelRegistry | None = None,
        adapters: AdapterRegistry | None = None,
        admission: ResourceAdmission | None = None,
        manager: InstanceManager | None = None,
        worker_factory: Callable[[], LocalModelWorker] = LocalModelWorker,
        resolve_configuration: Callable[[RegistryEntry], ProviderConfiguration] = lambda entry: entry.configuration,
    ) -> None:
        self.registry = registry or ModelRegistry()
        self.adapters = adapters or AdapterRegistry()
        self.admission = admission or ResourceAdmission()
        self.concurrency = ConcurrencyGate()
        self._worker_factory = worker_factory
        self._resolve_configuration = resolve_configuration
        loader = _WorkerLoader(self)
        self.manager = manager or InstanceManager(loader, self.admission)

    # -- capability matching (doc 08 §4) ------------------------------------

    def match(self, request: MatchRequest) -> MatchResult:
        entries: Iterable[RegistryEntry]
        if request.model_id is not None:
            entry = self.registry.get(request.model_id)
            entries = [entry] if entry is not None and entry.enabled and entry.definition.supports(request.operation) else []
        else:
            entries = self.registry.candidates(request.operation)

        reasons: list[str] = []
        for entry in entries:
            capabilities = entry.definition.capabilities
            adapter = self.adapters.resolve(request.operation, capabilities.adapter_id)
            if adapter is None:
                reasons.append(f"{entry.definition.model_id}: adapter {capabilities.adapter_id} unavailable")
                continue
            profile = capabilities.profile(request.operation)
            if profile is None:
                # Fall back to a permissive profile only when the definition
                # declared the operation but no profile detail.
                profile = OperationProfile()
            problem = _check_match(capabilities, profile, adapter, request)
            if problem is None:
                unmet = _unmet_optional(profile, request)
                return MatchResult(entry=entry, profile=profile, unmet_optional=unmet)
            reasons.append(f"{entry.definition.model_id}: {problem}")

        raise GatewayError(
            GatewayErrorCode.CAPABILITY_MISMATCH,
            stage="match",
            message="no model satisfies the request — " + ("; ".join(reasons) or "no enabled candidates"),
            fatal_scope="request",
        )

    # -- lease + call -------------------------------------------------------

    async def acquire(self, request: MatchRequest) -> tuple[ModelInstance, Lease, Adapter, MatchResult]:
        matched = self.match(request)
        definition = matched.entry.definition
        adapter = self.adapters.require(request.operation, definition.capabilities.adapter_id)
        instance, lease = await self.manager.acquire(definition, self._resolve_configuration(matched.entry))
        return instance, lease, adapter, matched

    async def _enter(self, instance: ModelInstance, ctx: CallContext | None = None) -> None:
        realtime = ctx is None or ctx.task_mode == "realtime"
        maximum = 10 if instance.configuration.is_cloud else 1 if instance.configuration.runtime in ("crisp", "crisp-asr", "crisp-tts") else 5
        limit = 1 if realtime else min(maximum, max(1, ctx.max_concurrency))
        if not instance.configuration.is_cloud and limit > 1:
            compute = instance.configuration.compute_options.get("compute", {})
            slot_mb = compute.get("contextSize", 2048) / 4 if instance.configuration.runtime == "llama" else 1024
            try:
                self.admission.reserve_parallel(instance.instance_id, instance.configuration.device, limit, slot_mb)
            except ResourceExhausted as error:
                raise GatewayError(GatewayErrorCode.RESOURCE_EXHAUSTED, stage="admission", message="Insufficient memory for concurrency") from error
        await self.concurrency.acquire(instance.instance_id, limit, realtime=realtime)

    def _exit(self, instance: ModelInstance) -> None:
        self.concurrency.release(instance.instance_id)

    async def release(self, instance: ModelInstance, lease: Lease) -> None:
        await self.manager.release(lease)
        # A worker that exited while a lease was held must fail the instance so
        # the next acquire rebuilds it rather than serving a dead handle.
        worker = instance.handle
        if isinstance(worker, LocalModelWorker) and worker.exited:
            await self.manager.mark_worker_exited(instance)

    async def transcribe(
        self, ctx: CallContext, *, audio: bytes, language: str | None, request: MatchRequest | None = None
    ) -> AsrObservation:
        match_request = request or MatchRequest(operation=Operation.TRANSCRIBE, source_language=language)
        instance, lease, adapter, _ = await self.acquire(match_request)
        try:
            await self._enter(instance, ctx)
            try:
                return await adapter.transcribe(instance, ctx, audio=audio, language=language)  # type: ignore[attr-defined]
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    @asynccontextmanager
    async def cloud_asr_session(self, request: MatchRequest, options: dict[str, str]):
        instance, lease, adapter, _ = await self.acquire(request)
        try:
            if not isinstance(adapter, CloudAsrAdapter):
                raise GatewayError(GatewayErrorCode.NOT_SUPPORTED, stage="asr", message="Cloud ASR adapter required")
            # A stream lease covers the connection; each stream preserves its own frame order.
            await self.concurrency.acquire(instance.instance_id, instance.definition.capabilities.concurrency.max_streams)
            try:
                yield adapter.selection(options, request.source_language or "auto")
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    async def translate(
        self, ctx: CallContext, *, text: str, source: str, target: str, request: MatchRequest | None = None
    ) -> TranslationResult:
        match_request = request or MatchRequest(
            operation=Operation.TRANSLATE, source_language=source, target_language=target
        )
        provisional = ctx.source_is_provisional or match_request.source_is_provisional
        match_request = replace(match_request, source_is_provisional=provisional)
        ctx = replace(ctx, source_is_provisional=provisional)
        instance, lease, adapter, _ = await self.acquire(match_request)
        try:
            await self._enter(instance, ctx)
            try:
                return await adapter.translate(instance, ctx, text=text, source=source, target=target)  # type: ignore[attr-defined]
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    async def synthesize(
        self, ctx: CallContext, *, text: str, voice: str | None, request: MatchRequest | None = None
    ) -> SynthesisResult:
        match_request = request or MatchRequest(operation=Operation.SYNTHESIZE)
        instance, lease, adapter, _ = await self.acquire(match_request)
        try:
            await self._enter(instance, ctx)
            try:
                return await adapter.synthesize(instance, ctx, text=text, voice=voice)  # type: ignore[attr-defined]
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    async def tts_voices(self, ctx: CallContext, request: MatchRequest) -> list[str]:
        instance, lease, adapter, _ = await self.acquire(request)
        try:
            await self._enter(instance, ctx)
            try:
                if not isinstance(adapter, LocalWorkerAdapter):
                    raise GatewayError(GatewayErrorCode.CAPABILITY_MISMATCH, stage="tts", message="Voice inspection is unavailable")
                return await adapter.tts_voices(instance, ctx)
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    @asynccontextmanager
    async def s2s_session(self, ctx: CallContext, *, request: MatchRequest, config: dict):
        instance, lease, adapter, _ = await self.acquire(request)
        try:
            await self.concurrency.acquire(instance.instance_id, instance.definition.capabilities.concurrency.max_streams)
            try:
                session = await adapter.open(instance, ctx, config=config)
                try:
                    yield session
                finally:
                    await session.close()
            finally:
                self._exit(instance)
        finally:
            await self.release(instance, lease)

    async def llm_endpoint(self, ctx: CallContext, *, model_id: str) -> dict[str, Any]:
        request = MatchRequest(operation=Operation.GENERATE, model_id=model_id)
        instance, lease, adapter, _ = await self.acquire(request)
        try:
            return await adapter.llm_endpoint(instance, ctx)  # type: ignore[attr-defined]
        finally:
            await self.release(instance, lease)

    async def shutdown(self) -> None:
        await self.manager.shutdown()


# ---------------------------------------------------------------------------
# Loader: bridges the lifecycle manager to the worker
# ---------------------------------------------------------------------------


class _WorkerLoader:
    """InstanceLoader implementation.

    Local instances start (or reuse) the persistent local_call worker and record
    its measured RSS; cloud instances connect lazily and reserve nothing.
    """

    def __init__(self, gateway: ModelGateway) -> None:
        self._gateway = gateway

    async def load(self, instance: ModelInstance):
        from .lifecycle import LoadResult

        if instance.configuration.is_cloud:
            return LoadResult(handle=None, measured_memory_mb=None)
        worker = self._gateway._worker_factory()
        instance.handle = worker
        try:
            await worker.start(on_exit=lambda: self._gateway.manager.mark_worker_exited(instance))
            if instance.definition.supports(Operation.TRANSCRIBE):
                adapter = self._gateway.adapters.require(
                    Operation.TRANSCRIBE, instance.definition.capabilities.adapter_id
                )
                if isinstance(adapter, LocalWorkerAdapter):
                    ctx = CallContext(operation=Operation.TRANSCRIBE, task_id=instance.instance_id, deadline=time.monotonic() + 180)
                    await adapter.transcribe(instance, ctx, audio=bytes(32_000), language=None)
            elif instance.definition.supports(Operation.TRANSLATE):
                adapter = self._gateway.adapters.require(Operation.TRANSLATE, instance.definition.capabilities.adapter_id)
                if isinstance(adapter, LocalWorkerAdapter):
                    languages = instance.definition.capabilities.languages
                    source = "en" if "en" in languages.input else next(iter(languages.input), "en")
                    target = next((language for language in languages.text_output if language != source), "zh")
                    ctx = CallContext(Operation.TRANSLATE, instance.instance_id, deadline=time.monotonic() + 180)
                    await adapter.translate(instance, ctx, text="Hello.", source=source, target=target)
            if not worker.running:
                raise GatewayError(GatewayErrorCode.WORKER_EXITED, stage="load", message="local worker exited")
        except BaseException:
            await worker.close()
            raise
        memory = worker.resident_memory_mb() if instance.configuration.device in (None, "cpu") else None
        return LoadResult(handle=worker, measured_memory_mb=memory)

    async def unload(self, instance: ModelInstance) -> None:
        if instance.configuration.is_cloud:
            return
        worker = instance.handle
        if isinstance(worker, LocalModelWorker):
            await worker.close()


# ---------------------------------------------------------------------------
# Matching helpers
# ---------------------------------------------------------------------------


def _check_match(
    capabilities: ModelCapabilities, profile: OperationProfile, adapter: Adapter, request: MatchRequest
) -> str | None:
    """Return a human-readable reason the candidate fails, or None if it matches."""

    if not any(kind in adapter.kinds for kind in capabilities.kinds):
        return "adapter does not serve this model kind"

    languages = capabilities.languages
    if request.source_language == "auto" and not languages.auto_detection:
        return "automatic source language detection not supported"
    if request.source_language and request.source_language != "auto":
        if languages.input and request.source_language not in languages.input:
            return f"source language {request.source_language} not supported"
    if request.target_language:
        if languages.text_output and request.target_language not in languages.text_output:
            return f"target language {request.target_language} not supported"

    if request.require_streaming_input is True and profile.streaming_input != "true":
        return "streaming input required but not confirmed"
    if request.require_streaming_output is True and profile.streaming_output != "true":
        return "streaming output required but not confirmed"
    if request.require_cancellation and profile.cancellation not in ("cooperative", "close_session"):
        return "cooperative cancellation required but unavailable"
    if request.require_timestamps is True and profile.timestamps == "none":
        return "timestamps required but unavailable"

    if request.source_is_provisional and (
        not capabilities.translation_policy.allow_preview
        or capabilities.translation_policy.min_source_state == "committed"
    ):
        return "translation requires committed source text"

    if not request.accept_preview and capabilities.translation_policy.allow_preview:
        # A committed-only caller must not be routed to a preview-capable path
        # unless the policy already forces committed sources.
        if capabilities.translation_policy.min_source_state != "committed":
            return "committed-only requested but model previews partial sources"

    for output in request.required_outputs:
        if output == "speech" and (
            not languages.speech_output_available
            or request.target_language and languages.speech_output
            and request.target_language not in languages.speech_output
        ):
            return "speech output required but unavailable"
        if output == "source_text" and profile.source_transcript == "unavailable":
            return "source transcript required but unavailable"
    return None


def _unmet_optional(profile: OperationProfile, request: MatchRequest) -> list[str]:
    unmet: list[str] = []
    for output in request.optional_outputs:
        if output == "speech" and profile.audio_output == "none":
            unmet.append("speech")
        if output == "word_timestamps" and profile.timestamps != "word":
            unmet.append("word_timestamps")
    return unmet
