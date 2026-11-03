"""Unified model gateway (doc 08).

The gateway owns model discovery, capability matching, instance lifecycle,
leases, cancellation, resource admission and unified errors. It does not own
sentence finalization, translation commit ordering or playback state — those
belong to the pipelines built on top of it (M04+).

Public surface:

    ModelGateway, ModelRegistry, RegistryEntry, MatchRequest, MatchResult
    ModelKind, Operation, ModelCapabilities, OperationProfile, CapabilityEvidence
    CallContext, CancelToken, GatewayError, GatewayErrorCode
    ModelDefinition, ProviderConfiguration, ModelInstance, InstanceState
    ResourceAdmission, ResourceExhausted, ConcurrencyGate
    InstanceManager, Lease, LoadResult
    LocalModelWorker, WorkerRequest
    AdapterRegistry, LocalWorkerAdapter, MyMemoryMtAdapter
    AsrObservation, TranslationResult, SynthesisResult, SynthesisChunk, LlmChunk
"""

from __future__ import annotations

from .adapters import (
    Adapter,
    AdapterRegistry,
    LocalWorkerAdapter,
    MyMemoryMtAdapter,
    map_local_error,
)
from .capabilities import (
    CallContext,
    CancelToken,
    CapabilityEvidence,
    GATEWAY_SCHEMA_VERSION,
    GatewayError,
    GatewayErrorCode,
    KIND_OPERATIONS,
    ModelCapabilities,
    ModelKind,
    Operation,
    OperationProfile,
    sanitize_details,
)
from .definitions import (
    IllegalTransition,
    InstanceState,
    ModelDefinition,
    ModelInstance,
    ProviderConfiguration,
)
from .gateway import (
    MatchRequest,
    MatchResult,
    ModelGateway,
    ModelRegistry,
    RegistryEntry,
)
from .lifecycle import InstanceLoader, InstanceManager, Lease, LoadResult
from .operations import (
    AsrObservation,
    LlmChunk,
    SynthesisChunk,
    SynthesisResult,
    TranslationResult,
)
from .resources import ConcurrencyGate, DeviceBudget, ResourceAdmission, ResourceExhausted
from .worker import LocalModelWorker, WorkerRequest

__all__ = [
    "Adapter",
    "AdapterRegistry",
    "AsrObservation",
    "CallContext",
    "CancelToken",
    "CapabilityEvidence",
    "ConcurrencyGate",
    "DeviceBudget",
    "GATEWAY_SCHEMA_VERSION",
    "GatewayError",
    "GatewayErrorCode",
    "IllegalTransition",
    "InstanceLoader",
    "InstanceManager",
    "InstanceState",
    "KIND_OPERATIONS",
    "Lease",
    "LlmChunk",
    "LoadResult",
    "LocalModelWorker",
    "LocalWorkerAdapter",
    "MatchRequest",
    "MatchResult",
    "ModelCapabilities",
    "ModelDefinition",
    "ModelGateway",
    "ModelInstance",
    "ModelKind",
    "ModelRegistry",
    "MyMemoryMtAdapter",
    "Operation",
    "OperationProfile",
    "ProviderConfiguration",
    "RegistryEntry",
    "ResourceAdmission",
    "ResourceExhausted",
    "SynthesisChunk",
    "SynthesisResult",
    "TranslationResult",
    "WorkerRequest",
    "map_local_error",
    "sanitize_details",
]
