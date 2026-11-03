"""Wire contracts for the /api/v2 realtime backend (schema_version = 2).

Pydantic models here are the single source of truth: OpenAPI and the WS frame
JSON Schemas are exported from these models, and the TypeScript boundary
consumes the exported artifacts instead of hand-written twins.

Field naming is snake_case on the wire (unlike the camelCase JSONL protocol
v1) because doc 09 fixes the envelope examples in snake_case and both REST
and WS payloads must round-trip through the same models.
"""

from __future__ import annotations

import struct
from typing import Annotated, Literal, Self, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

SCHEMA_VERSION = 2
BINARY_VERSION = 1
#: 40-byte little-endian PCM frame header: magic, binary_version, kind,
#: header_bytes, stream_handle, epoch, chunk_seq, sample_start, sample_count,
#: payload_bytes. Struct layout is fixed by doc 09 §4.
AUDIO_HEADER_FORMAT = "<4sBBHIIQQII"
AUDIO_HEADER_BYTES = struct.calcsize(AUDIO_HEADER_FORMAT)
AUDIO_MAGIC = b"NOLA"
AUDIO_KIND_INPUT = 1
AUDIO_KIND_OUTPUT = 2


class ContractModel(BaseModel):
    """Base for all v2 contracts: closed payloads, no mutation after validation."""

    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------------------------------------------------------------------------
# Identifiers and shared value objects
# ---------------------------------------------------------------------------

SessionId = UUID
PipelineId = UUID
EventId = UUID

TextState = Literal["draft", "stable", "committed"]
TranslationState = Literal["draft", "provisional", "committed"]
TimingQuality = Literal["word", "segment", "estimated", "unknown"]
BoundaryReason = Literal[
    "hard_silence",
    "soft_silence_boundary",
    "punctuation",
    "speaker_change",
    "forced_duration",
    "input_end",
    "model_final",
    "stop_cutoff",
    "empty_suppressed",
]

ErrorCode = Literal[
    "INVALID_CONFIG",
    "CAPABILITY_MISMATCH",
    "OUTPUT_UNSUPPORTED",
    "AUTH_REQUIRED",
    "MODEL_NOT_READY",
    "RESOURCE_BUSY",
    "RESOURCE_EXHAUSTED",
    "AUDIO_GAP",
    "AUDIO_SOURCE_UNAVAILABLE",
    "SOURCE_FINALIZE_TIMEOUT",
    "TRANSLATION_TIMEOUT",
    "SYNTHESIS_FAILED",
    "PLAYBACK_DEVICE_LOST",
    "PLAYBACK_UNKNOWN",
    "PROVIDER_DISCONNECTED",
    "RESYNC_REQUIRED",
    "SESSION_NOT_FOUND",
    "SESSION_SLOT_BUSY",
    "COMMAND_CONFLICT",
    "PROTOCOL_ERROR",
    "INTERNAL_ERROR",
]

ErrorScope = Literal["session", "pipeline", "task", "consumer", "instance"]


class AudioSpan(ContractModel):
    """A span on the 16kHz canonical clock; ms = sample / 16."""

    start_sample: int = Field(ge=0)
    end_sample: int = Field(ge=0)
    sample_rate: Literal[16000] = 16000

    @model_validator(mode="after")
    def _ordered(self) -> "AudioSpan":
        if self.end_sample < self.start_sample:
            raise ValueError("end_sample must be >= start_sample")
        return self


class ErrorPayload(ContractModel):
    code: ErrorCode
    stage: str = Field(min_length=1, max_length=64)
    scope: ErrorScope = "session"
    retryable: bool = False
    fatal: bool = False
    message_key: str = Field(min_length=1, max_length=128)
    message_args: dict[str, str] = Field(default_factory=dict)
    correlation_id: str = Field(default="", max_length=128)
    provider_code: str | None = None
    retry_after_ms: int | None = Field(default=None, ge=0)
    safe_details: dict[str, Union[str, int, float, bool]] = Field(default_factory=dict)
    related_task_id: str | None = None
    segment_id: str | None = None
    model_instance_id: str | None = None


# ---------------------------------------------------------------------------
# Session configuration (validated at create; frozen into the pipeline)
# ---------------------------------------------------------------------------

PipelineKind = Literal["cascade", "s2s"]
OutputModality = Literal["source_text", "translated_text", "audio"]
InputKind = Literal["microphone", "system_audio", "process_audio", "virtual_input", "browser_tab"]
CaptureBackend = Literal[
    "device", "windows_process_include", "windows_process_exclude", "virtual_input", "browser_tab"
]


class CascadePipelineConfig(ContractModel):
    kind: Literal["cascade"]
    asr_model: str = Field(min_length=1, max_length=256)
    #: Absent when the user chose a captions-only or ASR+MT output mode.
    translation_model: str | None = Field(default=None, max_length=256)
    fallback_translation_model: str | None = Field(default=None, max_length=256)
    tts_model: str | None = Field(default=None, max_length=256)
    tts_voice: str | None = Field(default=None, max_length=256)


class S2SPipelineConfig(ContractModel):
    kind: Literal["s2s"]
    s2s_model: str = Field(min_length=1, max_length=256)
    #: S2S forbids cascade bindings: no hidden ASR/MT/TTS may be attached.
    asr_model: None = None
    translation_model: None = None
    tts_model: None = None


PipelineConfig = Annotated[
    Union[CascadePipelineConfig, S2SPipelineConfig], Field(discriminator="kind")
]


class InputConfig(ContractModel):
    kind: InputKind
    device_id: str = Field(default="", max_length=512)
    capture_backend: CaptureBackend | None = None
    process_selection_id: str = Field(default="", max_length=64)
    browser_stream_id: str = Field(default="", max_length=128)
    #: Root PIDs of the real Electron playback process tree to exclude when the
    #: capture backend is windows_process_exclude. Electron supplies this (main
    #: + renderer/GPU/utility children); the backend PID alone is NOT sufficient
    #: because translated speech is played by the renderer tree (doc 08 §6,
    #: research-audio-routing R02). Empty means preflight reports the route as
    #: missing_exclude_tree rather than silently capturing Nola's own output.
    excluded_process_tree: tuple[int, ...] = ()

    @model_validator(mode="after")
    def validate_process_source(self):
        if self.kind == "process_audio":
            if not self.process_selection_id or self.capture_backend not in (None, "windows_process_include"):
                raise ValueError("process audio requires a process selection")
        elif self.process_selection_id or self.capture_backend == "windows_process_include":
            raise ValueError("process selection is only valid for process audio")
        return self


class SpeakerDetectionConfig(ContractModel):
    enabled: bool = True


class SessionConfig(ContractModel):
    """Immutable create-time configuration for one realtime session."""

    pipeline: PipelineConfig
    input: InputConfig
    source_language: str = Field(default="auto", max_length=32)
    target_languages: tuple[str, ...] = ()
    required_outputs: tuple[OutputModality, ...] = ()
    optional_outputs: tuple[OutputModality, ...] = ()
    #: Single speech language for TTS/S2S audio; distinct from caption targets.
    speech_target_language: str | None = Field(default=None, max_length=32)
    # Accept this field from older v2 clients. Local ASR always uses speaker-assisted segmentation.
    speaker_detection: SpeakerDetectionConfig = Field(
        default_factory=SpeakerDetectionConfig
    )
    audio_route_id: str = Field(default="", max_length=128)
    recording_path: str | None = Field(default=None, min_length=1, max_length=4096)
    max_segment_ms: int = Field(default=10_000, ge=3000, le=30000)
    silence_end_ms: int = Field(default=900, ge=300, le=2000)
    translation_preview: bool = True
    latency_detection: bool = False

    @model_validator(mode="after")
    def _coherent(self) -> "SessionConfig":
        outputs = set(self.required_outputs)
        if "audio" in outputs and not self.speech_target_language:
            raise ValueError("speech_target_language is required when audio output is required")
        if self.pipeline.kind == "cascade":
            if "translated_text" in outputs or "audio" in outputs:
                if not self.pipeline.translation_model:
                    raise ValueError("translation_model is required for translated/audio outputs")
            if "audio" in outputs and not self.pipeline.tts_model:
                raise ValueError("tts_model is required for audio output in cascade")
        if "audio" in outputs and not self.target_languages:
            # Audio always rides on a committed translation (cascade) or the
            # native S2S target; both need at least one target language.
            raise ValueError("target_languages must not be empty when audio output is required")
        return self


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

CommandType = Literal[
    "start", "pause", "resume", "stop", "reset_stream", "switch_pipeline"
]


class SwitchPipelineParams(ContractModel):
    pipeline: PipelineConfig
    speech_target_language: str | None = Field(default=None, max_length=32)


class SessionCommand(ContractModel):
    """User command envelope. `finish_input`/drain deliberately does not exist."""

    command_id: str = Field(min_length=1, max_length=128)
    type: CommandType
    params: SwitchPipelineParams | None = None

    @model_validator(mode="after")
    def _params_match(self) -> "SessionCommand":
        if (self.type == "switch_pipeline") != (self.params is not None):
            raise ValueError("switch_pipeline requires params; other commands forbid params")
        return self


class CommandAck(ContractModel):
    #: 202 semantics: accepted for processing, not yet in the target state.
    accepted: bool
    command_id: str
    session_id: SessionId
    result_state: "SessionState | None" = None


# ---------------------------------------------------------------------------
# Session state and snapshot
# ---------------------------------------------------------------------------

SessionState = Literal[
    "created",
    "preparing",
    "running",
    "pausing",
    "paused",
    "recovering",
    "draining",
    "stopping",
    "closed",
    "failed",
]

SessionOwner = Literal["quick_interpret", "browser_captions"]


class SubscriptionInfo(ContractModel):
    consumer_id: str = Field(min_length=1, max_length=128)
    outputs: tuple[OutputModality, ...] = ()


class SessionSnapshot(ContractModel):
    """Complete server-side view returned by GET /sessions/{id} and by the
    events WS hello. Snapshot + tail registration happen in one reducer step
    so no event can be missed between them."""

    schema_version: Literal[2] = SCHEMA_VERSION
    server_instance_id: str
    session_id: SessionId
    pipeline_id: PipelineId | None = None
    config_revision: int = Field(ge=0, default=0)
    state: SessionState = "created"
    epoch: int = Field(ge=0, default=0)
    owner: SessionOwner
    snapshot_seq: int = Field(ge=0, default=0)
    #: Revision counters that must never alias each other (doc 09 §5).
    source_revision_watermark: int = Field(ge=0, default=0)
    target_revision_watermark: int = Field(ge=0, default=0)
    playback_generation: int = Field(ge=0, default=0)
    subscriptions: tuple[SubscriptionInfo, ...] = ()
    last_error: ErrorPayload | None = None
    updated_at_unix_ms: int = Field(ge=0, default=0)


CommandAck.model_rebuild()


# ---------------------------------------------------------------------------
# Event payloads (discriminated union on event_type in the envelope)
# ---------------------------------------------------------------------------


class SourceTextPayload(ContractModel):
    utterance_id: str = Field(min_length=1, max_length=128)
    segment_id: str = Field(min_length=1, max_length=128)
    segment_index: int = Field(ge=0)
    source_revision: int = Field(ge=1)
    text: str
    text_state: TextState
    #: Unicode code-point offset of the stable prefix end (half-open).
    stable_end_offset: int = Field(ge=0, default=0)
    language: str = Field(default="auto", max_length=32)
    audio_span: AudioSpan | None = None
    timing_quality: TimingQuality = "segment"
    speaker_id: str | None = None
    speaker_metadata_revision: int = Field(ge=0, default=0)
    quality_flags: tuple[str, ...] = ()


class SourceCommittedPayload(ContractModel):
    commit_id: str = Field(min_length=1, max_length=128)
    segment_id: str
    segment_index: int = Field(ge=0)
    utterance_id: str
    source_revision: int = Field(ge=1)
    text: str
    language: str = Field(default="auto", max_length=32)
    boundary_reason: BoundaryReason
    cutoff_sample: int = Field(ge=0)
    audio_span: AudioSpan | None = None
    timing_quality: TimingQuality = "segment"
    speaker_id: str | None = None
    quality_flags: tuple[str, ...] = ()


class TranslatedTextPayload(ContractModel):
    translation_id: str = Field(min_length=1, max_length=128)
    segment_id: str
    source_revision: int = Field(ge=1)
    target_language: str = Field(min_length=1, max_length=32)
    target_revision: int = Field(ge=1)
    text: str
    state: TranslationState
    based_on_source_revision: int = Field(ge=0, default=0)
    source_refs: tuple[str, ...] = ()
    based_on_context_revision: int = Field(ge=0, default=0)
    origin: Literal["cascade", "s2s"] = "cascade"
    alignment_quality: TimingQuality = "segment"
    quality_flags: tuple[str, ...] = ()


class TranslationCommittedPayload(ContractModel):
    commit_id: str = Field(min_length=1, max_length=128)
    translation_id: str
    segment_id: str
    target_language: str
    target_revision: int = Field(ge=1)
    text: str
    text_fingerprint: str = Field(min_length=1, max_length=128)
    based_on_source_revision: int = Field(ge=0)
    source_refs: tuple[str, ...] = ()
    based_on_context_revision: int = Field(ge=0, default=0)
    origin: Literal["cascade", "s2s"] = "cascade"


class SpeakerChangedPayload(ContractModel):
    speaker_metadata_revision: int = Field(ge=1)
    segment_id: str | None = None
    speaker_id: str | None = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source: Literal["local", "provider"] = "local"
    span: AudioSpan | None = None


class AudioStreamOpenedPayload(ContractModel):
    audio_stream_id: str = Field(min_length=1, max_length=128)
    stream_handle: int = Field(ge=0)
    origin: Literal["synthesis", "s2s"]
    sample_rate: int = Field(gt=0)
    channels: int = Field(ge=1, default=1)
    encoding: Literal["pcm_s16le", "pcm_f32le"] = "pcm_s16le"
    job_id: str | None = None
    translation_id: str | None = None
    response_id: str | None = None
    target_language: str | None = None
    playback_generation: int = Field(ge=0)
    timing_quality: TimingQuality = "segment"
    #: S2S may emit audio before the text is final; cascade synthesis never does.
    irreversible_audio: bool = False


class AudioChunkMetaPayload(ContractModel):
    """Metadata mirror of a binary audio WS frame; PCM bytes never enter JSON."""

    audio_stream_id: str
    chunk_seq: int = Field(ge=0)
    sample_start: int = Field(ge=0)
    sample_count: int = Field(ge=0)
    payload_bytes: int = Field(ge=0)
    is_last: bool = False


class SynthesisStatePayload(ContractModel):
    job_id: str = Field(min_length=1, max_length=128)
    translation_id: str | None = None
    synthesis_attempt: int = Field(ge=1, default=1)
    state: Literal["queued", "running", "complete", "failed", "cancelled"]
    failure: ErrorPayload | None = None


class PlaybackStatePayload(ContractModel):
    job_id: str | None = None
    audio_stream_id: str | None = None
    claim_id: str | None = None
    playback_generation: int = Field(ge=0)
    owner_id: str | None = None
    state: Literal[
        "waiting",
        "claimed",
        "playing",
        "finished",
        "interrupted",
        "failed",
        "unknown",
        "cancelled",
    ]
    played_sample_offset: int = Field(ge=0, default=0)


class PipelineStatePayload(ContractModel):
    state: SessionState
    reason: str = Field(default="", max_length=256)
    operation_id: str | None = None
    required_actions: tuple[str, ...] = ()


class AudioGapPayload(ContractModel):
    lost_start_sample: int = Field(ge=0)
    lost_end_sample: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=256)
    recoverable: bool = False
    new_epoch: int | None = Field(default=None, ge=0)


class CursorAdvancedPayload(ContractModel):
    """Tells a filtered consumer how far the reducer scanned; filtered output
    makes event_seq non-contiguous and that is not packet loss."""

    scanned_through_seq: int = Field(ge=0)


class ErrorEventPayload(ContractModel):
    error: ErrorPayload


class LatencyObservationPayload(ContractModel):
    kind: Literal["input", "segment_boundary", "translation_started", "translation_ready", "synthesis_started", "audio_ready"]
    at_ms: float = Field(ge=0, allow_inf_nan=False)
    segment_id: str | None = Field(default=None, min_length=1, max_length=128)
    audio_stream_id: str | None = Field(default=None, min_length=1, max_length=128)
    duration_ms: float | None = Field(default=None, gt=0, le=1000, allow_inf_nan=False)
    min: float | None = Field(default=None, ge=-1, le=1)
    max: float | None = Field(default=None, ge=-1, le=1)
    provider: str | None = Field(default=None, min_length=1, max_length=256)

    @model_validator(mode="after")
    def _required_observation_fields(self) -> Self:
        if self.kind == "input":
            if self.duration_ms is None or self.min is None or self.max is None or self.min > self.max:
                raise ValueError("Input observation requires an ordered amplitude range and duration")
        elif self.kind == "audio_ready":
            if self.audio_stream_id is None:
                raise ValueError("Audio readiness requires a stream ID")
        elif self.segment_id is None:
            raise ValueError("Stage timing requires a segment ID")
        return self


EventPayload = Annotated[
    Union[
        SourceTextPayload,
        SourceCommittedPayload,
        TranslatedTextPayload,
        TranslationCommittedPayload,
        SpeakerChangedPayload,
        AudioStreamOpenedPayload,
        AudioChunkMetaPayload,
        SynthesisStatePayload,
        PlaybackStatePayload,
        PipelineStatePayload,
        AudioGapPayload,
        CursorAdvancedPayload,
        ErrorEventPayload,
        LatencyObservationPayload,
    ],
    Field(discriminator=None),
]

EventType = Literal[
    "source_text",
    "source_committed",
    "translated_text",
    "translation_committed",
    "speaker_changed",
    "audio_stream_opened",
    "audio_chunk",
    "synthesis_state",
    "playback_state",
    "pipeline_state",
    "audio_gap",
    "cursor_advanced",
    "error",
    "latency_observation",
]

#: Which event_type each payload class belongs to; the envelope carries the
#: type explicitly so consumers can filter before parsing the payload.
EVENT_TYPE_TO_PAYLOAD: dict[str, type[ContractModel]] = {
    "source_text": SourceTextPayload,
    "source_committed": SourceCommittedPayload,
    "translated_text": TranslatedTextPayload,
    "translation_committed": TranslationCommittedPayload,
    "speaker_changed": SpeakerChangedPayload,
    "audio_stream_opened": AudioStreamOpenedPayload,
    "audio_chunk": AudioChunkMetaPayload,
    "synthesis_state": SynthesisStatePayload,
    "playback_state": PlaybackStatePayload,
    "pipeline_state": PipelineStatePayload,
    "audio_gap": AudioGapPayload,
    "cursor_advanced": CursorAdvancedPayload,
    "error": ErrorEventPayload,
    "latency_observation": LatencyObservationPayload,
}

#: Output mask mapping: which event types a consumer subscribed to a given
#: output modality receives. State/error/pipeline events always pass.
OUTPUT_EVENT_TYPES: dict[str, frozenset[str]] = {
    "source_text": frozenset({"source_text", "source_committed", "speaker_changed", "latency_observation"}),
    "translated_text": frozenset(
        {"translated_text", "translation_committed"}
    ),
    "audio": frozenset(
        {"audio_stream_opened", "audio_chunk", "synthesis_state", "playback_state"}
    ),
}
ALWAYS_DELIVERED_EVENT_TYPES = frozenset({"pipeline_state", "audio_gap", "error"})


class EventEnvelope(ContractModel):
    """Unified envelope; event_seq is assigned by the single session reducer."""

    schema_version: Literal[2] = SCHEMA_VERSION
    server_instance_id: str = Field(min_length=1, max_length=128)
    event_id: EventId
    event_seq: int = Field(ge=1)
    event_type: EventType
    session_id: SessionId
    pipeline_id: PipelineId | None = None
    epoch: int = Field(ge=0)
    emitted_at_unix_ms: int = Field(ge=0)
    trace_id: str = Field(default="", max_length=128)
    payload: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _payload_matches_type(self) -> "EventEnvelope":
        model = EVENT_TYPE_TO_PAYLOAD.get(self.event_type)
        if model is not None:
            model.model_validate(self.payload)
        return self


# ---------------------------------------------------------------------------
# REST request/response bodies
# ---------------------------------------------------------------------------


class CreateSessionRequest(ContractModel):
    command_id: str = Field(min_length=1, max_length=128)
    owner: SessionOwner
    config: SessionConfig


class CreateSessionResponse(ContractModel):
    session_id: SessionId
    pipeline_id: PipelineId
    config_revision: int = Field(ge=0)
    state: SessionState
    snapshot: SessionSnapshot


class SubscriptionRequest(ContractModel):
    command_id: str = Field(min_length=1, max_length=128)
    consumer_id: str = Field(min_length=1, max_length=128)
    outputs: tuple[OutputModality, ...] = Field(min_length=1)


class SubscriptionResponse(ContractModel):
    session_id: SessionId
    consumer_id: str
    outputs: tuple[OutputModality, ...]
    #: One-time short-lived ticket for a direct WS connection (browser path).
    #: Empty when the connection is brokered by Electron with its bearer.
    ws_ticket: str = ""


class HealthResponse(ContractModel):
    status: Literal["ok"]
    server_instance_id: str
    schema_version: Literal[2] = SCHEMA_VERSION
    ready: bool = True


class ConflictResponse(ContractModel):
    """409 body: slot busy or command_id reuse with a different body."""

    code: ErrorCode
    message_key: str
    current_owner: SessionOwner | None = None
    current_session_id: SessionId | None = None
    correlation_id: str = ""


# ---------------------------------------------------------------------------
# WebSocket control frames
# ---------------------------------------------------------------------------


class WsHello(ContractModel):
    frame: Literal["hello"] = "hello"
    schema_version: Literal[2] = SCHEMA_VERSION
    consumer_id: str = Field(min_length=1, max_length=128)
    outputs: tuple[OutputModality, ...] = ()
    #: Resume after an existing cursor; 0/absent means snapshot-first.
    resume_cursor: int = Field(default=0, ge=0)
    #: Playback owner election: only audio consumers may claim ownership.
    request_playback_owner: bool = False


class WsHelloAck(ContractModel):
    frame: Literal["hello_ack"] = "hello_ack"
    schema_version: Literal[2] = SCHEMA_VERSION
    server_instance_id: str
    session_id: SessionId
    consumer_id: str
    snapshot: SessionSnapshot
    #: Events replayed after the snapshot; -1 when RESYNC_REQUIRED applied.
    replay_from_seq: int = Field(default=0, ge=-1)
    resync_required: bool = False
    playback_owner_id: str | None = None


class WsPing(ContractModel):
    frame: Literal["ping"] = "ping"


class WsPong(ContractModel):
    frame: Literal["pong"] = "pong"


class WsStreamOpen(ContractModel):
    """Negotiates an input audio stream; frames then flow as binary."""

    frame: Literal["stream_open"] = "stream_open"
    stream_handle: int = Field(ge=0)
    epoch: int = Field(ge=0)
    encoding: Literal["pcm_s16le", "pcm_f32le"] = "pcm_s16le"
    sample_rate: int = Field(gt=0)
    channels: int = Field(ge=1, default=1)


class WsStreamOpened(ContractModel):
    frame: Literal["stream_opened"] = "stream_opened"
    stream_handle: int = Field(ge=0)
    epoch: int = Field(ge=0)
    server_instance_id: str


class WsAudioAck(ContractModel):
    """Per-chunk ingestion ack: accepted up to this watermark. Acceptance is
    not proof of ASR or provider processing."""

    frame: Literal["audio_accepted"] = "audio_accepted"
    stream_handle: int = Field(ge=0)
    epoch: int = Field(ge=0)
    through_chunk_seq: int = Field(ge=0)
    through_sample: int = Field(ge=0)


class WsStreamClose(ContractModel):
    frame: Literal["stream_close"] = "stream_close"
    stream_handle: int = Field(ge=0)
    #: Natural EOF of the input; internal lifecycle, never a user drain mode.
    eof: bool = False


class WsPlaybackAck(ContractModel):
    frame: Literal["playback_ack"] = "playback_ack"
    owner_id: str = Field(min_length=1, max_length=128)
    claim_id: str = Field(min_length=1, max_length=128)
    playback_generation: int = Field(ge=0)
    audio_stream_id: str = Field(min_length=1, max_length=128)
    chunk_seq: int = Field(ge=-1, default=-1)
    state: Literal["started", "progress", "finished", "interrupted", "unknown"]
    played_sample_offset: int = Field(ge=0, default=0)


class WsError(ContractModel):
    frame: Literal["error"] = "error"
    error: ErrorPayload


WsClientFrame = Annotated[
    Union[WsHello, WsPing, WsStreamOpen, WsStreamClose, WsPlaybackAck],
    Field(discriminator="frame"),
]
WsServerFrame = Annotated[
    Union[WsHelloAck, WsPong, WsStreamOpened, WsAudioAck, WsError, EventEnvelope],
    Field(discriminator=None),
]


# ---------------------------------------------------------------------------
# Binary audio frame helpers
# ---------------------------------------------------------------------------


class AudioFrameHeader(ContractModel):
    binary_version: Literal[1] = BINARY_VERSION
    kind: Literal[1, 2]
    stream_handle: int = Field(ge=0)
    epoch: int = Field(ge=0)
    chunk_seq: int = Field(ge=0)
    sample_start: int = Field(ge=0)
    sample_count: int = Field(ge=0)
    payload_bytes: int = Field(ge=0)


class AudioFrameError(ValueError):
    """Malformed or unauthenticated binary frame; rejected before allocation."""


def pack_audio_frame(header: AudioFrameHeader, payload: bytes) -> bytes:
    if len(payload) != header.payload_bytes:
        raise AudioFrameError("payload length does not match payload_bytes")
    return struct.pack(
        AUDIO_HEADER_FORMAT,
        AUDIO_MAGIC,
        header.binary_version,
        header.kind,
        AUDIO_HEADER_BYTES,
        header.stream_handle,
        header.epoch,
        header.chunk_seq,
        header.sample_start,
        header.sample_count,
        header.payload_bytes,
    ) + payload


def parse_audio_frame(data: bytes, *, bytes_per_sample: int, channels: int) -> tuple[AudioFrameHeader, bytes]:
    """Validate and split a binary WS frame. Raises AudioFrameError on any
    magic/version/size/consistency violation before touching the payload."""

    if len(data) < AUDIO_HEADER_BYTES:
        raise AudioFrameError("frame shorter than header")
    magic, version, kind, header_bytes, handle, epoch, seq, start, count, nbytes = struct.unpack_from(
        AUDIO_HEADER_FORMAT, data, 0
    )
    if magic != AUDIO_MAGIC:
        raise AudioFrameError("bad magic")
    if version != BINARY_VERSION:
        raise AudioFrameError(f"unsupported binary_version {version}")
    if kind not in (AUDIO_KIND_INPUT, AUDIO_KIND_OUTPUT):
        raise AudioFrameError(f"bad kind {kind}")
    if header_bytes != AUDIO_HEADER_BYTES:
        raise AudioFrameError(f"bad header_bytes {header_bytes}")
    if len(data) != AUDIO_HEADER_BYTES + nbytes:
        raise AudioFrameError("payload_bytes does not match frame length")
    if count * channels * bytes_per_sample != nbytes:
        raise AudioFrameError("sample_count x channels x bytes_per_sample != payload_bytes")
    header = AudioFrameHeader(
        kind=kind,  # type: ignore[arg-type]
        stream_handle=handle,
        epoch=epoch,
        chunk_seq=seq,
        sample_start=start,
        sample_count=count,
        payload_bytes=nbytes,
    )
    return header, data[AUDIO_HEADER_BYTES:]
