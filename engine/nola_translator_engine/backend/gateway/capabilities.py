"""Gateway contract layer: model kinds, capability declarations, unified errors
and the call context shared by every standard operation.

This module is the single source of truth for the concepts doc 08 §1/§3/§5
introduces. It deliberately holds no I/O: instances, leases and workers live in
the sibling modules so the contract can be imported from both the control plane
and the adapters without pulling in torch/llama dependencies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

GATEWAY_SCHEMA_VERSION = 1


class ModelKind(str, Enum):
    """Five model classifications (doc 08 §1).

    S2S is a distinct kind with its own selection entry and call path even
    though its backbone may be a causal LM; a general LLM can serve the MT
    stage through a translation profile without changing its base identity.
    """

    ASR = "asr"
    MT = "mt"
    LLM = "llm"
    TTS = "tts"
    S2S = "s2s"


class Operation(str, Enum):
    """Standard operations a model instance can be leased for (doc 08 §5)."""

    TRANSCRIBE = "transcribe"
    TRANSCRIBE_STREAM = "transcribe_stream"
    TRANSLATE = "translate"
    TRANSLATE_STREAM = "translate_stream"
    GENERATE = "generate"
    SYNTHESIZE = "synthesize"
    SYNTHESIZE_STREAM = "synthesize_stream"
    S2S_SESSION = "s2s_session"


#: Which operations each kind is allowed to declare. Kept explicit so a
#: registry entry cannot silently advertise an operation its kind never runs.
KIND_OPERATIONS: dict[ModelKind, frozenset[Operation]] = {
    ModelKind.ASR: frozenset({Operation.TRANSCRIBE, Operation.TRANSCRIBE_STREAM}),
    ModelKind.MT: frozenset({Operation.TRANSLATE, Operation.TRANSLATE_STREAM}),
    ModelKind.LLM: frozenset({Operation.GENERATE, Operation.TRANSLATE, Operation.TRANSLATE_STREAM}),
    ModelKind.TTS: frozenset({Operation.SYNTHESIZE, Operation.SYNTHESIZE_STREAM}),
    ModelKind.S2S: frozenset({Operation.S2S_SESSION}),
}


TriState = Literal["true", "false", "unknown"]
Finality = Literal["revisable", "append_only", "immutable_item", "unknown"]
Cancellation = Literal["cooperative", "close_session", "abandon_only", "none", "unknown"]
IncrementalTranslation = Literal[
    "none", "snapshot_retranslate", "prefix_constrained", "native_simultaneous"
]
AudioOutput = Literal["none", "utterance", "chunks"]
Timestamps = Literal["none", "segment", "word"]
SpeakerSupport = Literal["none", "change", "diarization", "provider_ids"]


class GatewayModel(BaseModel):
    """Base for capability payloads: forbid unknown fields so a stale producer
    fails loudly instead of drifting (doc 08 §3 "unknown must stay unknown")."""

    model_config = ConfigDict(extra="forbid")


class OperationInput(GatewayModel):
    modalities: list[str] = Field(default_factory=list)
    audio_formats: list[str] = Field(default_factory=list)
    text_input_mode: str | None = None


class OperationOutput(GatewayModel):
    modalities: list[str] = Field(default_factory=list)
    audio_formats: list[str] = Field(default_factory=list)
    text_update_mode: str | None = None


class LanguageCapabilities(GatewayModel):
    input: list[str] = Field(default_factory=list)
    text_output: list[str] = Field(default_factory=list)
    #: An empty speech_output list means "no audio", never "any language"
    #: (doc 08 §3). Use speech_output_available to distinguish.
    speech_output: list[str] = Field(default_factory=list)
    speech_output_available: bool = False
    explicit_pairs: list[tuple[str, str]] = Field(default_factory=list)
    auto_detection: bool = False


class ContextCapabilities(GatewayModel):
    mode: Literal["stateless", "request_context", "session_context"] = "stateless"
    max_tokens: int | None = None
    reset: bool = False
    resumable: bool = False


class ConcurrencyCapabilities(GatewayModel):
    max_active_requests: int = 1
    max_streams: int = 1
    state_isolation: bool = True
    batching: bool = False


class LimitCapabilities(GatewayModel):
    input_audio_ms: int | None = None
    session_ms: int | None = None
    text_tokens: int | None = None
    output_tokens: int | None = None
    rate_limits: dict[str, float] = Field(default_factory=dict)


class TranslationPolicy(GatewayModel):
    """Nola policy combined with implementation capability (doc 08 §3).

    Google/Microsoft/MyMemory are physically able to translate short text;
    the committed-only rule is a subtitle policy, so it lives here rather than
    being encoded as a fake capability gap.
    """

    min_source_state: Literal["stable", "committed"] = "stable"
    allow_preview: bool = True


class OperationProfile(GatewayModel):
    input: OperationInput = Field(default_factory=OperationInput)
    output: OperationOutput = Field(default_factory=OperationOutput)
    streaming_input: TriState = "unknown"
    streaming_output: TriState = "unknown"
    partial_output: TriState = "unknown"
    finality: Finality = "unknown"
    cancellation: Cancellation = "unknown"
    incremental_translation: IncrementalTranslation = "none"
    source_revision_support: Literal["replace_snapshot", "append_only", "none"] = "none"
    prefix_constraint: Literal["none", "prompt_soft", "hard_tokens"] = "none"
    audio_output: AudioOutput = "none"
    timestamps: Timestamps = "none"
    timestamp_quality: Literal["native", "aligned", "estimated"] | None = None
    source_transcript: Literal["required", "optional", "unavailable"] = "unavailable"
    speaker_support: SpeakerSupport = "none"


EvidenceLevel = Literal["source", "official_doc", "runtime_probe", "user_override"]


class CapabilityEvidence(GatewayModel):
    claim: str
    level: EvidenceLevel
    url_or_revision: str | None = None
    checked_at: str | None = None
    limitation: str | None = None


class ModelCapabilities(GatewayModel):
    """Capability declaration keyed by operation × runtime × model version."""

    schema_version: int = GATEWAY_SCHEMA_VERSION
    model_id: str
    model_revision: str | None = None
    adapter_id: str
    adapter_revision: str | None = None
    kinds: list[ModelKind] = Field(default_factory=list)
    operations: list[Operation] = Field(default_factory=list)
    operation_profiles: dict[Operation, OperationProfile] = Field(default_factory=dict)
    languages: LanguageCapabilities = Field(default_factory=LanguageCapabilities)
    context: ContextCapabilities = Field(default_factory=ContextCapabilities)
    concurrency: ConcurrencyCapabilities = Field(default_factory=ConcurrencyCapabilities)
    limits: LimitCapabilities = Field(default_factory=LimitCapabilities)
    translation_policy: TranslationPolicy = Field(default_factory=TranslationPolicy)
    evidence: list[CapabilityEvidence] = Field(default_factory=list)

    def profile(self, operation: Operation) -> OperationProfile | None:
        return self.operation_profiles.get(operation)

    def validate_kinds(self) -> None:
        """Every declared operation must belong to at least one declared kind."""

        allowed: set[Operation] = set()
        for kind in self.kinds:
            allowed |= KIND_OPERATIONS[kind]
        for operation in self.operations:
            if operation not in allowed:
                raise ValueError(
                    f"operation {operation.value} is not valid for kinds "
                    f"{[k.value for k in self.kinds]}"
                )


# ---------------------------------------------------------------------------
# Unified errors (doc 08 §5)
# ---------------------------------------------------------------------------

FatalScope = Literal["request", "lease", "instance", "session", "backend"]

_SECRET_PATTERNS = (
    # Authorization / proxy-authorization headers plus the credential that follows.
    re.compile(r"(?i)\b(?:proxy-)?authorization\b\s*:?\s*\S+(?:\s+\S+)?"),
    # Bearer / basic tokens on their own.
    re.compile(r"(?i)\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+"),
    # key=value style secrets.
    re.compile(r"(?i)\b(?:api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|passwd|pwd)\b\s*[:=]\s*\S+"),
    # Common provider key shapes (OpenAI-style sk-, ali LTAI, etc.).
    re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9._-]{6,}"),
    re.compile(r"\bLTAI[A-Za-z0-9]{6,}"),
    re.compile(r"[A-Za-z]:\\\\?[^\s'\"]+"),  # windows absolute paths
    re.compile(r"/(?:home|Users|root|tmp|var)/[^\s'\"]+"),  # posix absolute paths
)


def sanitize_details(message: str) -> str:
    """Strip credentials, auth headers and local filesystem paths from a
    provider message before it can reach a client or the journal."""

    cleaned = message
    for pattern in _SECRET_PATTERNS:
        cleaned = pattern.sub("[redacted]", cleaned)
    return cleaned[:2000]


class GatewayErrorCode(str, Enum):
    INVALID_INPUT = "INVALID_INPUT"
    CAPABILITY_MISMATCH = "CAPABILITY_MISMATCH"
    MODEL_NOT_INSTALLED = "MODEL_NOT_INSTALLED"
    MODEL_INTEGRITY = "MODEL_INTEGRITY"
    RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED"
    LOAD_FAILED = "LOAD_FAILED"
    WORKER_EXITED = "WORKER_EXITED"
    WORKER_OOM = "WORKER_OOM"
    LEASE_CONFLICT = "LEASE_CONFLICT"
    CANCELLED = "CANCELLED"
    TIMEOUT = "TIMEOUT"
    PROVIDER_ERROR = "PROVIDER_ERROR"
    NOT_SUPPORTED = "NOT_SUPPORTED"
    INTERNAL = "INTERNAL"


_RETRYABLE = frozenset(
    {
        GatewayErrorCode.RESOURCE_EXHAUSTED,
        GatewayErrorCode.WORKER_EXITED,
        GatewayErrorCode.WORKER_OOM,
        GatewayErrorCode.TIMEOUT,
    }
)


class GatewayError(Exception):
    """Unified error surface. `sanitized_details` is the only field safe to
    forward off-process; the raw cause stays local for diagnostics."""

    def __init__(
        self,
        code: GatewayErrorCode,
        *,
        stage: str,
        message: str,
        fatal_scope: FatalScope = "request",
        provider_code: str | None = None,
        retry_after_ms: int | None = None,
        correlation_id: str | None = None,
        retryable: bool | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.stage = stage
        self.raw_message = message
        self.fatal_scope = fatal_scope
        self.provider_code = provider_code
        self.retry_after_ms = retry_after_ms
        self.correlation_id = correlation_id or str(uuid4())
        self.retryable = _RETRYABLE.__contains__(code) if retryable is None else retryable

    def to_payload(self) -> dict[str, object]:
        return {
            "code": self.code.value,
            "stage": self.stage,
            "provider_code": self.provider_code,
            "retryable": self.retryable,
            "fatal_scope": self.fatal_scope,
            "retry_after_ms": self.retry_after_ms,
            "correlation_id": self.correlation_id,
            "sanitized_details": sanitize_details(self.raw_message),
        }


# ---------------------------------------------------------------------------
# Call context (doc 08 §5)
# ---------------------------------------------------------------------------


class CancelToken:
    """Cooperative cancellation flag. Adapters that cannot stop a native call
    must still observe this so a cancelled queued task is removed immediately;
    whether an in-flight native call actually stopped is reported separately."""

    def __init__(self) -> None:
        self._cancelled = False
        self.reason: str | None = None

    def cancel(self, reason: str = "cancelled") -> None:
        self._cancelled = True
        self.reason = reason

    @property
    def cancelled(self) -> bool:
        return self._cancelled

    def raise_if_cancelled(self) -> None:
        if self._cancelled:
            raise GatewayError(
                GatewayErrorCode.CANCELLED,
                stage="cancel",
                message=self.reason or "operation cancelled",
                fatal_scope="request",
            )


@dataclass
class CallContext:
    """Everything an adapter needs to attribute, deadline and cancel a call."""

    operation: Operation
    task_id: str
    request_id: str = field(default_factory=lambda: str(uuid4()))
    session_id: UUID | None = None
    pipeline_id: str | None = None
    epoch: int | None = None
    deadline: float | None = None
    cancel_token: CancelToken = field(default_factory=CancelToken)
    lease_id: str | None = None
    config_revision: int | None = None
    provider_options: dict[str, str] = field(default_factory=dict, repr=False)
    translation_context: dict[str, object] = field(default_factory=dict, repr=False)
    source_is_provisional: bool = False
