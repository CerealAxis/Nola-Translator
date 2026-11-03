"""Unified audio ingestion: continuity, canonical timeline, normalization.

Single access layer for every input backend (device / windows_process_exclude
/ virtual_input / browser_tab) and for WS-transported PCM frames. Doc 04 §2
rules implemented here:

  * frames carry session_id / stream_id / epoch / audio_seq / sample_start /
    sample_count / format; the format is negotiated once at stream open, not
    re-guessed per frame;
  * AudioContinuity: seq contiguity, non-overlapping sample spans, payload
    byte count, rate/channels/encoding agreement, finite values;
  * EXPLICIT capture silence (backend zero-fill) stays ordinary audio, while
    a TRANSPORT gap emits `audio_gap` and resets the stream context — a lost
    packet is never disguised as silence;
  * the 16 kHz canonical sample index is the only exact timeline
    (ms = sample / 16); wall clock is never substituted, so pause cannot
    leak elapsed real time into the audio timeline and seek/resume creates a
    new anchor (new epoch);
  * continuous resampling via StreamingAudioNormalizer (no per-chunk reset);
  * Silero 512-sample windows accumulate across network packets with 64
    sample context carry (same policy as recognition.volume_gate), never
    zero-padded per packet;
  * buffer budget: 2 s soft warning, 5 s hard limit answered with an
    explicit gap + context reset instead of silent drops;
  * `audio_accepted` ACKs only prove validation and the ingestion watermark,
    never ASR or provider processing.

Blocking policy: realtime streams never block the producer; file-fed streams
(realtime=False) may block the producer while the buffer exceeds the soft
limit.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from hashlib import blake2s
from typing import Callable, Literal

import numpy as np
from numpy.typing import NDArray

from ..audio.resample import (
    FRAME_SAMPLES,
    TARGET_SAMPLE_RATE,
    AudioFrame,
    StreamingAudioNormalizer,
)

CANONICAL_SAMPLE_RATE = TARGET_SAMPLE_RATE
#: Silero v6 window/context at 16 kHz (mirrors recognition.volume_gate).
VAD_WINDOW_SAMPLES = 512
VAD_CONTEXT_SAMPLES = 64

#: Buffer budget (doc 11 M03): warn early, hard-cap with an explicit gap.
BUFFER_WARN_MS = 2_000
BUFFER_HARD_LIMIT_MS = 5_000

AcceptStatus = Literal["accepted", "duplicate", "rejected", "gap"]

Encoding = Literal["pcm_s16le", "pcm_f32le"]


def canonical_ms(sample: int) -> float:
    """16 kHz canonical clock: ms = sample / 16 (doc 04 §2)."""
    return sample * 1000.0 / CANONICAL_SAMPLE_RATE


@dataclass(frozen=True, slots=True)
class StreamFormat:
    """Negotiated once per stream open; every frame must match it."""

    sample_rate: int
    channels: int = 1
    encoding: Encoding = "pcm_s16le"

    @property
    def bytes_per_sample(self) -> int:
        return 4 if self.encoding == "pcm_f32le" else 2


@dataclass(frozen=True, slots=True)
class InputAudioFrame:
    """One input chunk with full transport metadata (doc 04 §2 entry fields)."""

    session_id: str
    stream_id: str
    epoch: int
    audio_seq: int
    #: Frame start in per-channel frames at the NEGOTIATED rate (not 16k).
    sample_start: int
    sample_count: int
    format: StreamFormat
    payload: bytes


@dataclass(frozen=True, slots=True)
class VadWindow:
    """One full 512-sample Silero window plus its 64-sample left context.

    `model_input` is shaped (1, 576) exactly like the ONNX session input in
    recognition.volume_gate; windows never pad partial packets with zeros.
    """

    #: Canonical 16 kHz sample index of the window's first sample.
    start_sample: int
    samples: NDArray[np.float32]
    context: NDArray[np.float32]

    @property
    def model_input(self) -> NDArray[np.float32]:
        return np.concatenate((self.context, self.samples))[None, :]


class VadWindowAccumulator:
    """Carries the sub-window remainder across packets. Equivalent to the
    `_vad_pending`/`_vad_context` logic inside SileroVadSegmenter, extracted
    so ingestion can window without loading the ONNX model."""

    def __init__(self) -> None:
        self._pending = np.empty(0, dtype=np.float32)
        self._context = np.zeros(VAD_CONTEXT_SAMPLES, dtype=np.float32)
        self._pending_start = 0
        self.windows_produced = 0

    def accept(self, samples: NDArray[np.float32], start_sample: int) -> list[VadWindow]:
        if samples.size == 0:
            return []
        if self._pending.size == 0:
            self._pending_start = start_sample
        self._pending = np.concatenate((self._pending, samples))
        windows: list[VadWindow] = []
        while self._pending.size >= VAD_WINDOW_SAMPLES:
            window = self._pending[:VAD_WINDOW_SAMPLES]
            windows.append(
                VadWindow(
                    start_sample=self._pending_start,
                    samples=window.astype(np.float32, copy=True),
                    context=self._context.copy(),
                )
            )
            self._context = window[-VAD_CONTEXT_SAMPLES:].astype(np.float32, copy=True)
            self._pending = self._pending[VAD_WINDOW_SAMPLES:]
            self._pending_start += VAD_WINDOW_SAMPLES
            self.windows_produced += 1
        return windows

    @property
    def remainder(self) -> int:
        return int(self._pending.size)

    def reset(self) -> None:
        self._pending = np.empty(0, dtype=np.float32)
        self._context = np.zeros(VAD_CONTEXT_SAMPLES, dtype=np.float32)
        self._pending_start = 0


@dataclass(frozen=True, slots=True)
class AudioGapInfo:
    """Domain audio_gap content (contracts.AudioGapPayload-compatible fields;
    lost samples are on the 16 kHz canonical clock)."""

    stream_id: str
    lost_start_sample: int
    lost_end_sample: int
    reason: str
    recoverable: bool = False
    new_epoch: int | None = None
    #: Lost span at the negotiated input rate, for transport-level diagnosis.
    input_lost_start_sample: int = 0
    input_lost_end_sample: int = 0


@dataclass(frozen=True, slots=True)
class AudioAck:
    """Ingestion watermark for one accepted frame. Proves validation and
    ingestion only — not ASR or provider processing (doc 09 §4)."""

    stream_id: str
    epoch: int
    through_chunk_seq: int
    #: Watermark at the negotiated input rate.
    through_sample: int
    #: Watermark on the 16 kHz canonical clock.
    through_canonical_sample: int


@dataclass(frozen=True, slots=True)
class IngestOutcome:
    status: AcceptStatus
    #: Rejection/gap detail; empty for accepted/duplicate.
    reason: str = ""
    ack: AudioAck | None = None
    gap: AudioGapInfo | None = None
    #: Normalized 16 kHz frames produced by this call (also queued for
    #: consume_frames(); inline consumers may use either view).
    frames_produced: int = 0
    vad_windows_produced: int = 0
    buffered_ms: float = 0.0


@dataclass
class _StreamState:
    """Per-stream ingestion context; rebuilt wholesale on epoch change,
    transport gap or buffer overrun (never partially patched)."""

    stream_id: str
    epoch: int
    format: StreamFormat
    next_seq: int | None = None
    next_sample_start: int | None = None
    normalizer: StreamingAudioNormalizer = field(init=False)
    vad: VadWindowAccumulator = field(init=False)
    #: Canonical sample index where the next normalized frame starts.
    canonical_pos: int = field(init=False, default=0)
    #: Bounded seq -> payload digest map for conflicting-retransmit detection.
    recent_digests: dict = field(init=False, default_factory=dict)
    eof: bool = field(init=False, default=False)
    natural_eof: bool = field(init=False, default=False)
    #: Pause cutoff on the input-rate sample axis; None while running.
    cutoff_sample: int | None = field(init=False, default=None)

    def __post_init__(self) -> None:
        self.normalizer = StreamingAudioNormalizer(self.format.sample_rate, self.format.channels)
        self.vad = VadWindowAccumulator()

    def reset_context(self) -> None:
        """Drop resampler/VAD carry and sample-span anchoring after a gap.
        `canonical_pos` and `next_seq` advance (they describe what WAS
        ingested), but continuity anchors restart from the next frame."""
        self.normalizer = StreamingAudioNormalizer(self.format.sample_rate, self.format.channels)
        self.vad = VadWindowAccumulator()
        self.next_sample_start = None
        self.recent_digests.clear()


class BufferOverrunError(RuntimeError):
    """Blocking (file) mode: producer blocked longer than its deadline."""


class AudioIngestion:
    """Validates, normalizes and windows one session's input audio streams.

    Thread-safety: accept()/consume_* are guarded by one lock; the blocking
    (realtime=False) mode parks producers on a condition variable until a
    consumer drains below the soft limit.
    """

    #: Keep digests for at most this many recent seqs per stream.
    _DIGEST_HISTORY = 64

    def __init__(
        self,
        session_id: str,
        *,
        realtime: bool = True,
        on_event: Callable[[str, dict], None] | None = None,
        buffer_warn_ms: float = BUFFER_WARN_MS,
        buffer_hard_limit_ms: float = BUFFER_HARD_LIMIT_MS,
        block_timeout_s: float | None = None,
    ) -> None:
        if buffer_hard_limit_ms <= buffer_warn_ms:
            raise ValueError("buffer hard limit must exceed the warning threshold")
        self.session_id = session_id
        self.realtime = realtime
        self.on_event = on_event
        self.buffer_warn_ms = buffer_warn_ms
        self.buffer_hard_limit_ms = buffer_hard_limit_ms
        self.block_timeout_s = block_timeout_s
        self._streams: dict[str, _StreamState] = {}
        self._frames: list[tuple[str, AudioFrame, int]] = []  # (stream_id, frame, canonical_start)
        self._windows: list[tuple[str, VadWindow]] = []
        self._buffered_samples = 0
        self._warn_active = False
        self._sealed = False
        self._cv = threading.Condition()
        #: Counters for diagnostics/tests.
        self.accepted_frames = 0
        self.duplicate_frames = 0
        self.rejected_frames = 0
        self.gap_events = 0

    # -- stream lifecycle ----------------------------------------------------

    @property
    def input_finished(self) -> bool:
        with self._cv:
            return self._sealed or any(stream.natural_eof for stream in self._streams.values()) and all(
                stream.eof for stream in self._streams.values()
            )

    def reset(self) -> None:
        with self._cv:
            self._streams.clear()
            self._frames.clear()
            self._windows.clear()
            self._buffered_samples = 0
            self._warn_active = False
            self._sealed = False
            self._cv.notify_all()

    def open_stream(self, stream_id: str, epoch: int, format: StreamFormat) -> None:
        """Negotiate the format once (doc 09 stream_open); reopening the same
        id starts a fresh epoch context."""
        with self._cv:
            self._streams[stream_id] = _StreamState(stream_id=stream_id, epoch=epoch, format=format)
            self._cv.notify_all()

    def close_stream(self, stream_id: str, *, eof: bool = False) -> list[AudioFrame]:
        """Natural EOF flushes the normalizer tail frame (doc 04 §2: EOF must
        not drop recognized audio). Returns the flushed frames."""
        with self._cv:
            stream = self._streams.get(stream_id)
            if stream is None:
                return []
            if stream.natural_eof:
                return []
            flushed = stream.normalizer.finish() if eof else []
            queued: list[AudioFrame] = []
            for frame in flushed:
                self._enqueue_locked(stream, frame)
                queued.append(frame)
            stream.eof = True
            stream.natural_eof = eof
            self._cv.notify_all()
            return queued

    def seal_input(self) -> None:
        """Flush samples already accepted at the pause cutoff and reject later audio."""
        with self._cv:
            if self._sealed:
                return
            for stream in self._streams.values():
                if not stream.natural_eof:
                    for frame in stream.normalizer.finish():
                        self._enqueue_locked(stream, frame)
                stream.eof = True
                stream.natural_eof = True
            self._sealed = True
            self._cv.notify_all()

    def rotate_epoch(self, stream_id: str, epoch: int) -> None:
        """Seek/resume: new anchor on a new epoch. Resets resampler, VAD and
        continuity state; the canonical timeline restarts from 0. Wall-clock
        time elapsed while paused never enters the audio timeline."""
        with self._cv:
            stream = self._streams.get(stream_id)
            if stream is None:
                return
            self._streams[stream_id] = _StreamState(
                stream_id=stream_id, epoch=epoch, format=stream.format
            )
            self._cv.notify_all()

    # -- acceptance ----------------------------------------------------------

    def accept(self, frame: InputAudioFrame) -> IngestOutcome:
        """Validate and ingest one frame. Never blocks for realtime streams;
        blocking (file) mode waits for consumers below the soft limit."""
        if frame.session_id != self.session_id:
            return self._reject(frame, "session_mismatch")
        with self._cv:
            if self._sealed:
                return self._reject(frame, "paused_cutoff")
            stream = self._streams.get(frame.stream_id)
            if stream is None:
                return self._reject(frame, "unknown_stream")
            if stream.eof:
                return self._reject(frame, "stream_closed")
            if stream.cutoff_sample is not None and frame.sample_start >= stream.cutoff_sample:
                # Paused: audio past the cutoff stops being ingested. Elapsed
                # wall time is NOT converted into silence samples.
                return self._reject(frame, "paused_cutoff")
            if frame.epoch < stream.epoch:
                # Stale epoch audio must never mix into the current timeline.
                return self._reject(frame, "stale_epoch")
            problem = self._validate_payload(frame, stream)
            if problem is not None:
                return self._reject(frame, problem)

            if frame.epoch > stream.epoch:
                # Producer-declared new epoch (seek/resume): fresh anchor.
                self._streams[frame.stream_id] = _StreamState(
                    stream_id=frame.stream_id, epoch=frame.epoch, format=stream.format
                )
                stream = self._streams[frame.stream_id]

            if self.realtime:
                overrun = self._enforce_hard_limit_locked(frame)
                if overrun is not None:
                    return overrun
            else:
                self._block_until_drained_locked(frame)

            return self._accept_continuity_locked(frame, stream)

    def _validate_payload(self, frame: InputAudioFrame, stream: _StreamState) -> str | None:
        fmt = frame.format
        if (
            fmt.sample_rate != stream.format.sample_rate
            or fmt.channels != stream.format.channels
            or fmt.encoding != stream.format.encoding
        ):
            return "format_mismatch"
        expected = frame.sample_count * fmt.channels * fmt.bytes_per_sample
        if frame.sample_count < 0 or len(frame.payload) != expected:
            return "payload_size_mismatch"
        if fmt.encoding == "pcm_f32le":
            values = np.frombuffer(frame.payload, dtype="<f4")
            if values.size and not np.all(np.isfinite(values)):
                return "non_finite_samples"
        return None

    def _accept_continuity_locked(self, frame: InputAudioFrame, stream: _StreamState) -> IngestOutcome:
        gap: AudioGapInfo | None = None
        digest = blake2s(frame.payload, digest_size=8).hexdigest()

        if stream.next_seq is not None and frame.audio_seq < stream.next_seq:
            known = stream.recent_digests.get(frame.audio_seq)
            self.duplicate_frames += 1
            if known is not None and known != digest:
                # Same seq, different bytes: a protocol error, not a retry.
                return self._reject(frame, "conflicting_retransmit")
            # Already-accepted frame retransmitted: idempotent drop.
            return IngestOutcome(
                status="duplicate",
                ack=self._ack_locked(stream, frame),
                buffered_ms=self.buffered_ms,
            )

        if stream.next_seq is not None and frame.audio_seq > stream.next_seq:
            expected_start = (
                frame.sample_start if stream.next_sample_start is None else stream.next_sample_start
            )
            gap = self._transport_gap_locked(
                stream,
                reason="seq_gap",
                input_lost_start=expected_start,
                input_lost_end=frame.sample_start,
            )
        elif (
            stream.next_sample_start is not None
            and frame.sample_start != stream.next_sample_start
        ):
            if frame.sample_start > stream.next_sample_start:
                gap = self._transport_gap_locked(
                    stream,
                    reason="sample_gap",
                    input_lost_start=stream.next_sample_start,
                    input_lost_end=frame.sample_start,
                )
            else:
                return self._reject(frame, "sample_overlap")

        # Ingest: continuous resample to 16k mono, then window for Silero.
        samples = self._decode(frame)
        canonical_start = stream.canonical_pos
        produced = stream.normalizer.accept_float32(samples, captured_at_ms=canonical_ms(canonical_start))
        windows: list[VadWindow] = []
        for audio_frame in produced:
            self._enqueue_locked(stream, audio_frame)
            windows.extend(stream.vad.accept(audio_frame.samples, stream.canonical_pos - audio_frame.samples.size))
        for window in windows:
            self._windows.append((stream.stream_id, window))

        stream.next_seq = frame.audio_seq + 1
        stream.next_sample_start = frame.sample_start + frame.sample_count
        stream.recent_digests[frame.audio_seq] = digest
        if len(stream.recent_digests) > self._DIGEST_HISTORY:
            for old_seq in sorted(stream.recent_digests)[: len(stream.recent_digests) - self._DIGEST_HISTORY]:
                stream.recent_digests.pop(old_seq, None)
        self.accepted_frames += 1
        self._cv.notify_all()

        if gap is not None:
            return IngestOutcome(
                status="gap",
                reason=gap.reason,
                ack=self._ack_locked(stream, frame),
                gap=gap,
                frames_produced=len(produced),
                vad_windows_produced=len(windows),
                buffered_ms=self.buffered_ms,
            )
        return IngestOutcome(
            status="accepted",
            ack=self._ack_locked(stream, frame),
            frames_produced=len(produced),
            vad_windows_produced=len(windows),
            buffered_ms=self.buffered_ms,
        )

    def _decode(self, frame: InputAudioFrame) -> NDArray[np.float32]:
        if frame.format.encoding == "pcm_s16le":
            return np.frombuffer(frame.payload, dtype="<i2").astype(np.float32) / 32768.0
        return np.frombuffer(frame.payload, dtype="<f4").astype(np.float32, copy=True)

    def _enqueue_locked(self, stream: _StreamState, audio_frame: AudioFrame) -> None:
        start = stream.canonical_pos
        stream.canonical_pos += audio_frame.samples.size
        self._frames.append((stream.stream_id, audio_frame, start))
        self._buffered_samples += audio_frame.samples.size
        self._check_buffer_warning_locked(stream)

    def _ack_locked(self, stream: _StreamState, frame: InputAudioFrame) -> AudioAck:
        return AudioAck(
            stream_id=stream.stream_id,
            epoch=stream.epoch,
            through_chunk_seq=frame.audio_seq,
            through_sample=frame.sample_start + frame.sample_count,
            through_canonical_sample=stream.canonical_pos,
        )

    def _reject(self, frame: InputAudioFrame, reason: str) -> IngestOutcome:
        self.rejected_frames += 1
        return IngestOutcome(status="rejected", reason=reason, buffered_ms=self.buffered_ms)

    # -- gap / epoch handling --------------------------------------------------

    def _transport_gap_locked(
        self, stream: _StreamState, *, reason: str, input_lost_start: int, input_lost_end: int
    ) -> AudioGapInfo:
        """A lost transport packet is NOT silence: announce audio_gap, drop
        the resampler/VAD carry and re-anchor on the next frame."""
        scale = CANONICAL_SAMPLE_RATE / stream.format.sample_rate
        canonical_lost_start = int(round(input_lost_start * scale))
        canonical_lost_end = int(round(input_lost_end * scale))
        gap = AudioGapInfo(
            stream_id=stream.stream_id,
            lost_start_sample=canonical_lost_start,
            lost_end_sample=canonical_lost_end,
            reason=reason,
            recoverable=False,
            input_lost_start_sample=input_lost_start,
            input_lost_end_sample=input_lost_end,
        )
        stream.reset_context()
        stream.canonical_pos = max(stream.canonical_pos, canonical_lost_end)
        self.gap_events += 1
        self._emit("audio_gap", {
            "stream_id": gap.stream_id,
            "lost_start_sample": gap.lost_start_sample,
            "lost_end_sample": gap.lost_end_sample,
            "reason": gap.reason,
            "recoverable": gap.recoverable,
            "new_epoch": gap.new_epoch,
        })
        return gap

    # -- buffer budget ---------------------------------------------------------

    @property
    def buffered_ms(self) -> float:
        return self._buffered_samples * 1000.0 / CANONICAL_SAMPLE_RATE

    def _check_buffer_warning_locked(self, stream: _StreamState) -> None:
        if not self._warn_active and self.buffered_ms >= self.buffer_warn_ms:
            self._warn_active = True
            self._emit("buffer_warning", {
                "stream_id": stream.stream_id,
                "buffered_ms": round(self.buffered_ms, 1),
            })
        elif self._warn_active and self.buffered_ms < self.buffer_warn_ms * 0.75:
            self._warn_active = False

    def _enforce_hard_limit_locked(self, frame: InputAudioFrame) -> IngestOutcome | None:
        """Realtime mode: at the hard limit, drop the backlog with an explicit
        gap + context reset instead of silently discarding or blocking."""
        if self.buffered_ms < self.buffer_hard_limit_ms:
            return None
        stream = self._streams[frame.stream_id]
        lost_start = self._frames[0][2] if self._frames else stream.canonical_pos
        lost_end = stream.canonical_pos
        self._frames.clear()
        self._windows.clear()
        self._buffered_samples = 0
        self._warn_active = False
        stream.reset_context()
        gap = AudioGapInfo(
            stream_id=stream.stream_id,
            lost_start_sample=lost_start,
            lost_end_sample=lost_end,
            reason="buffer_overrun",
            recoverable=True,
        )
        self.gap_events += 1
        self._emit("audio_gap", {
            "stream_id": gap.stream_id,
            "lost_start_sample": gap.lost_start_sample,
            "lost_end_sample": gap.lost_end_sample,
            "reason": gap.reason,
            "recoverable": gap.recoverable,
            "new_epoch": None,
        })
        # The frame itself is still ingested as the fresh anchor.
        outcome = self._accept_continuity_locked(frame, stream)
        return IngestOutcome(
            status="gap",
            reason="buffer_overrun",
            ack=outcome.ack,
            gap=gap,
            frames_produced=outcome.frames_produced,
            vad_windows_produced=outcome.vad_windows_produced,
            buffered_ms=self.buffered_ms,
        )

    def _block_until_drained_locked(self, frame: InputAudioFrame) -> None:
        """File input: block the producer above the soft limit so a file is
        read at consumption speed instead of buffering unboundedly."""
        import time

        deadline = None if self.block_timeout_s is None else time.monotonic() + self.block_timeout_s
        while self.buffered_ms >= self.buffer_warn_ms:
            remaining = None if deadline is None else deadline - time.monotonic()
            if remaining is not None and remaining <= 0:
                raise BufferOverrunError(
                    f"ingestion buffer stayed above {self.buffer_warn_ms} ms for {self.block_timeout_s} s"
                )
            self._cv.wait(0.05 if remaining is None else min(0.05, remaining))

    # -- consumption -----------------------------------------------------------

    def consume_frames(self, max_count: int | None = None) -> list[tuple[AudioFrame, int]]:
        """Drain normalized frames as (frame, canonical_start_sample) pairs."""
        with self._cv:
            take = len(self._frames) if max_count is None else min(max_count, len(self._frames))
            taken = self._frames[:take]
            del self._frames[:take]
            self._buffered_samples -= sum(frame.samples.size for _, frame, _start in taken)
            self._check_buffer_warning_locked_for_drain()
            self._cv.notify_all()
            return [(frame, start) for _, frame, start in taken]

    def _check_buffer_warning_locked_for_drain(self) -> None:
        if self._warn_active and self.buffered_ms < self.buffer_warn_ms * 0.75:
            self._warn_active = False

    def consume_vad_windows(self, max_count: int | None = None) -> list[VadWindow]:
        with self._cv:
            take = len(self._windows) if max_count is None else min(max_count, len(self._windows))
            taken = self._windows[:take]
            del self._windows[:take]
            return [window for _, window in taken]

    # -- pause (cutoff semantics) ----------------------------------------------

    def pause_at(self, stream_id: str, cutoff_sample: int) -> None:
        """Pause at a cutoff on the INPUT-rate sample axis: frames at or past
        the cutoff are rejected, and elapsed wall time never becomes silence.
        Resume goes through rotate_epoch() (new anchor, new epoch)."""
        with self._cv:
            stream = self._streams.get(stream_id)
            if stream is None:
                return
            stream.cutoff_sample = cutoff_sample

    def _emit(self, event_type: str, payload: dict) -> None:
        if self.on_event is not None:
            self.on_event(event_type, payload)
