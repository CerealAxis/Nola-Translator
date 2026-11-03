"""Standard operation protocols and their result types (doc 08 §5).

These are the five interface shapes the gateway exposes to pipelines and to the
/v2 external API. An
adapter must return these typed results, and the pipeline layer above (M04+)
owns sentence/translation/playback state — the gateway never decides when a
caption is final or splits sentences on punctuation.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import AsyncIterator, Protocol, runtime_checkable

from .capabilities import CallContext, Operation
from .definitions import ModelInstance


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class AsrObservation:
    """A single recognition observation. An observation is not a business
    commit; the ASR pipeline arbitrates stable/draft/commit on top of these."""

    text: str
    language: str | None = None
    started_at_ms: float | None = None
    ended_at_ms: float | None = None
    is_final: bool = False
    #: Word/segment timestamps when the model provides them; None means the
    #: model is final-only and the pipeline must not fabricate partials.
    words: list[tuple[str, float, float]] | None = None
    confidence: float | None = None


@dataclass
class TranslationResult:
    text: str
    source: str
    target: str
    is_final: bool = True
    #: Echoed so the scheduler can drop stale generations (doc 05).
    fingerprint: str | None = None


@dataclass
class LlmChunk:
    delta_text: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    finish_reason: str | None = None
    usage: dict[str, int] | None = None


@dataclass
class SynthesisChunk:
    """One audio chunk. `terminal` marks the last chunk of an utterance; the
    gateway reports synthesis completion, never physical playback completion."""

    pcm: bytes
    sample_rate: int
    channels: int = 1
    seq: int = 0
    terminal: bool = False


@dataclass
class SynthesisResult:
    chunks: list[SynthesisChunk]
    voices: list[str] = field(default_factory=list)
    sample_rate: int = 24000


# ---------------------------------------------------------------------------
# Operation protocols
# ---------------------------------------------------------------------------


@runtime_checkable
class AsrOperation(Protocol):
    async def transcribe(
        self, instance: ModelInstance, ctx: CallContext, *, audio: bytes, language: str | None
    ) -> AsrObservation: ...


@runtime_checkable
class MtOperation(Protocol):
    async def translate(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, source: str, target: str
    ) -> TranslationResult: ...


@runtime_checkable
class LlmOperation(Protocol):
    def generate(
        self,
        instance: ModelInstance,
        ctx: CallContext,
        *,
        messages: list[dict],
        attachments: list[dict] | None = None,
        tool_schemas: list[dict] | None = None,
        options: dict | None = None,
    ) -> AsyncIterator[LlmChunk]: ...


@runtime_checkable
class TtsOperation(Protocol):
    async def synthesize(
        self, instance: ModelInstance, ctx: CallContext, *, text: str, voice: str | None
    ) -> SynthesisResult: ...


@runtime_checkable
class S2sOperation(Protocol):
    """Native speech-to-speech session. Opening returns an opaque session the
    pipeline drives with append_audio/finish/interrupt/close (doc 07)."""

    async def open(self, instance: ModelInstance, ctx: CallContext, *, config: dict) -> object: ...


#: Maps each standard operation to the protocol an adapter must satisfy. Used by
#: the adapter registry to reject an adapter that claims an operation it cannot
#: actually run.
OPERATION_PROTOCOLS: dict[Operation, type] = {
    Operation.TRANSCRIBE: AsrOperation,
    Operation.TRANSLATE: MtOperation,
    Operation.GENERATE: LlmOperation,
    Operation.SYNTHESIZE: TtsOperation,
    Operation.S2S_SESSION: S2sOperation,
}
