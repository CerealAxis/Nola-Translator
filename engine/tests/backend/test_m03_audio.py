"""M03 audio ingestion, routing and process-loopback tests.

Deterministic tests (no audio hardware) cover A01/A02/A04/A05 from doc 12,
the 40-byte frame contract round-trip and route loop detection. The final
group exercises the real Windows process-loopback capture on this machine
(build >= 20348); playback is started and stopped by the test itself.
"""

from __future__ import annotations

import os
import sys
import time

import numpy as np
import pytest

from nola_translator_engine.audio.resample import FRAME_SAMPLES, TARGET_SAMPLE_RATE
from nola_translator_engine.backend.contracts import (
    AUDIO_HEADER_BYTES,
    AudioFrameError,
    AudioFrameHeader,
    pack_audio_frame,
    parse_audio_frame,
)
from nola_translator_engine.backend.ingestion import (
    VAD_CONTEXT_SAMPLES,
    VAD_WINDOW_SAMPLES,
    AudioIngestion,
    InputAudioFrame,
    StreamFormat,
    VadWindowAccumulator,
    canonical_ms,
)
from nola_translator_engine.backend.routing import (
    AudioRoute,
    BrowserTabCaptureBackend,
    DeviceCaptureBackend,
    preflight_route,
)

SESSION = "sess-m03"
STREAM = "stream-1"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def make_ingestion(**kwargs) -> AudioIngestion:
    events: list[tuple[str, dict]] = []

    def on_event(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))

    ingestion = AudioIngestion(SESSION, on_event=on_event, **kwargs)
    ingestion.events = events  # type: ignore[attr-defined]
    return ingestion


def sine_payload(
    sample_count: int, rate: int, channels: int, *, freq: float = 440.0, amplitude: float = 0.5,
    phase_samples: int = 0, encoding: str = "pcm_s16le",
) -> bytes:
    t = (np.arange(sample_count, dtype=np.float64) + phase_samples) / rate
    mono = (amplitude * np.sin(2 * np.pi * freq * t)).astype(np.float32)
    # Interleaved layout: identical tone on every channel.
    values = np.column_stack([mono] * channels).reshape(-1) if channels > 1 else mono
    if encoding == "pcm_s16le":
        return np.rint(np.clip(values, -1.0, 1.0) * 32767).astype("<i2").tobytes()
    return values.astype("<f4").tobytes()


def pcm_frame(
    seq: int,
    sample_start: int,
    sample_count: int,
    fmt: StreamFormat,
    *,
    epoch: int = 0,
    payload: bytes | None = None,
    stream_id: str = STREAM,
    session_id: str = SESSION,
) -> InputAudioFrame:
    if payload is None:
        payload = sine_payload(sample_count, fmt.sample_rate, fmt.channels, phase_samples=sample_start)
    return InputAudioFrame(
        session_id=session_id,
        stream_id=stream_id,
        epoch=epoch,
        audio_seq=seq,
        sample_start=sample_start,
        sample_count=sample_count,
        format=fmt,
        payload=payload,
    )


def collect_frames(ingestion: AudioIngestion) -> list[tuple[np.ndarray, int]]:
    return [(frame.samples, start) for frame, start in ingestion.consume_frames()]


# ---------------------------------------------------------------------------
# A01: resampling continuity across rates, channel counts and chunk boundaries
# ---------------------------------------------------------------------------

# chunk=1 is only exercised at 16 kHz (pass-through path); one-sample chunks
# through resample_poly at 44.1k/48k would make the suite needlessly slow.
A01_COMBOS = [
    (16_000, 1, 1),
    (16_000, 1, 320),
    (16_000, 1, 997),
    (44_100, 1, 960),
    (44_100, 2, 997),
    (48_000, 1, 4801),
    (48_000, 2, 480),
    (44_100, 2, 320),
]


@pytest.mark.parametrize(("rate", "channels", "chunk_samples"), A01_COMBOS)
def test_a01_resample_continuity_conserves_samples(rate: int, channels: int, chunk_samples: int) -> None:
    """Arbitrary chunk boundaries: total canonical samples are conserved and
    frames stay contiguous (no periodic gaps at chunk edges)."""
    fmt = StreamFormat(sample_rate=rate, channels=channels)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)

    total_input = rate  # exactly one second of audio
    start = 0
    seq = 0
    while start < total_input:
        count = min(chunk_samples, total_input - start)
        outcome = ingestion.accept(pcm_frame(seq, start, count, fmt))
        assert outcome.status == "accepted", outcome.reason
        start += count
        seq += 1
    ingestion.close_stream(STREAM, eof=True)

    frames = collect_frames(ingestion)
    produced = sum(frame.size for frame, _ in frames)
    expected = int(round(total_input * TARGET_SAMPLE_RATE / rate))
    # EOF tail padding rounds up to the last 20 ms frame.
    assert expected <= produced <= expected + FRAME_SAMPLES
    # Contiguity: canonical start indexes advance by exactly the frame size.
    position = 0
    for frame, frame_start in frames:
        assert frame_start == position
        assert frame.size == FRAME_SAMPLES
        position += FRAME_SAMPLES


def test_a01_no_discontinuity_at_chunk_boundaries() -> None:
    """A 440 Hz tone fed in awkward chunks stays phase-continuous: adjacent
    frame deltas are bounded by the tone's own slew, no spike at boundaries."""
    fmt = StreamFormat(sample_rate=48_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    total = 48_000
    chunk_sizes = (1000, 333, 2047, 129, 5000)
    start = seq = index = 0
    while start < total:
        count = min(chunk_sizes[index % len(chunk_sizes)], total - start)
        assert ingestion.accept(pcm_frame(seq, start, count, fmt)).status == "accepted"
        start += count
        seq += 1
        index += 1
    ingestion.close_stream(STREAM, eof=True)
    frames = collect_frames(ingestion)
    signal = np.concatenate([frame for frame, _ in frames])
    diff = np.abs(np.diff(signal))
    # 440 Hz at 16 kHz: max slew well under 0.2; a sample-skipping boundary
    # error would show a much larger jump.
    assert diff.max() < 0.2


# ---------------------------------------------------------------------------
# A02: Silero 512-sample windows advance on 20 ms frames with carry-over
# ---------------------------------------------------------------------------


def test_a02_vad_windows_accumulate_across_packets() -> None:
    accumulator = VadWindowAccumulator()
    fed = 0
    windows = 0
    # 20 ms frames (320 samples) do not divide 512: the remainder must carry.
    for index in range(16):
        frame = np.full(FRAME_SAMPLES, 0.1, dtype=np.float32)
        produced = accumulator.accept(frame, fed)
        fed += FRAME_SAMPLES
        windows += len(produced)
    assert fed == 16 * FRAME_SAMPLES
    assert windows == fed // VAD_WINDOW_SAMPLES
    assert accumulator.remainder == fed % VAD_WINDOW_SAMPLES
    # Context carry: every window after the first carries the previous
    # window's last 64 samples.
    accumulator2 = VadWindowAccumulator()
    all_windows = []
    for index in range(4):
        samples = np.arange(FRAME_SAMPLES, dtype=np.float32) / FRAME_SAMPLES + index
        all_windows.extend(accumulator2.accept(samples, index * FRAME_SAMPLES))
    for previous, current in zip(all_windows, all_windows[1:]):
        assert np.array_equal(current.context, previous.samples[-VAD_CONTEXT_SAMPLES:])
    assert all_windows[0].model_input.shape == (1, VAD_CONTEXT_SAMPLES + VAD_WINDOW_SAMPLES)


def test_a02_ingestion_emits_windows_continuously_over_wire_chunks() -> None:
    """Odd-sized 48k wire chunks still produce exact 512-sample windows with
    a continuous canonical start axis; no per-packet zero padding."""
    fmt = StreamFormat(sample_rate=48_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    start = seq = 0
    for _ in range(10):
        ingestion.accept(pcm_frame(seq, start, 480, fmt))
        start += 480
        seq += 1
    windows = ingestion.consume_vad_windows()
    total_window_samples = len(windows) * VAD_WINDOW_SAMPLES
    # 10 x 480 = 4800 input samples = 1600 canonical = 3 full windows + 64 remainder.
    assert total_window_samples == 1536
    assert windows[0].start_sample == 0
    for previous, current in zip(windows, windows[1:]):
        assert current.start_sample == previous.start_sample + VAD_WINDOW_SAMPLES


# ---------------------------------------------------------------------------
# A04: seq duplicates / reordering / loss and epoch isolation
# ---------------------------------------------------------------------------


def test_a04_duplicate_seq_is_idempotent() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    frame = pcm_frame(0, 0, 320, fmt)
    assert ingestion.accept(frame).status == "accepted"
    duplicate = ingestion.accept(frame)
    assert duplicate.status == "duplicate"
    first_frames = collect_frames(ingestion)
    collect_frames(ingestion)
    assert sum(f.size for f, _ in first_frames) == 320
    assert ingestion.duplicate_frames == 1


def test_a04_conflicting_retransmit_is_rejected() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    original = pcm_frame(0, 0, 320, fmt)
    assert ingestion.accept(original).status == "accepted"
    conflicting = pcm_frame(
        0, 0, 320, fmt, payload=sine_payload(320, 16_000, 1, freq=880.0, amplitude=0.25)
    )
    outcome = ingestion.accept(conflicting)
    assert outcome.status == "rejected"
    assert outcome.reason == "conflicting_retransmit"


def test_a04_missing_seq_emits_audio_gap_and_resets_context() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt)).status == "accepted"
    # seq 1 (samples 320..640) lost in transport; seq 2 arrives.
    outcome = ingestion.accept(pcm_frame(2, 640, 320, fmt))
    assert outcome.status == "gap"
    assert outcome.gap is not None
    assert outcome.gap.reason == "seq_gap"
    assert outcome.gap.input_lost_start_sample == 320
    assert outcome.gap.input_lost_end_sample == 640
    assert outcome.gap.lost_start_sample == 320  # 16k canonical == input rate here
    assert ingestion.events[-1][0] == "audio_gap"
    # The gap frame itself is still ingested as the fresh anchor.
    assert outcome.ack is not None and outcome.ack.through_chunk_seq == 2
    # Continuity anchors restart: seq 3 at the right offset is clean again.
    assert ingestion.accept(pcm_frame(3, 960, 320, fmt)).status == "accepted"
    assert ingestion.gap_events == 1


def test_a04_sample_overlap_rejected_and_sample_gap_reported() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt)).status == "accepted"
    # Same seq stream position but overlapping sample range -> reject.
    overlap = ingestion.accept(pcm_frame(1, 100, 320, fmt))
    assert overlap.status == "rejected"
    assert overlap.reason == "sample_overlap"
    # Contiguous seq but a hole in sample space -> explicit gap, not silence.
    holed = ingestion.accept(pcm_frame(1, 640, 320, fmt))
    assert holed.status == "gap"
    assert holed.gap is not None and holed.gap.reason == "sample_gap"


def test_a04_old_epoch_never_mixes_in() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 5, fmt)
    stale = ingestion.accept(pcm_frame(0, 0, 320, fmt, epoch=4))
    assert stale.status == "rejected"
    assert stale.reason == "stale_epoch"
    assert collect_frames(ingestion) == []


def test_a04_payload_and_format_validation() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    truncated = pcm_frame(0, 0, 320, fmt, payload=b"\x00" * 100)
    assert ingestion.accept(truncated).reason == "payload_size_mismatch"
    wrong_format = pcm_frame(0, 0, 320, StreamFormat(sample_rate=48_000, channels=1))
    assert ingestion.accept(wrong_format).reason == "format_mismatch"
    f32_fmt = StreamFormat(sample_rate=16_000, channels=1, encoding="pcm_f32le")
    ingestion.open_stream("stream-f32", 0, f32_fmt)
    nan_payload = np.full(320, np.nan, dtype="<f4").tobytes()
    nan_frame = pcm_frame(0, 0, 320, f32_fmt, payload=nan_payload, stream_id="stream-f32")
    assert ingestion.accept(nan_frame).reason == "non_finite_samples"
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt, session_id="other")).reason == "session_mismatch"
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt, stream_id="unknown")).reason == "unknown_stream"
    assert collect_frames(ingestion) == []


# ---------------------------------------------------------------------------
# A05: pause is not silence; seek creates a new anchor
# ---------------------------------------------------------------------------


def test_a05_pause_rejects_post_cutoff_audio_without_padding_silence() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt)).status == "accepted"
    ingestion.pause_at(STREAM, cutoff_sample=320)
    late = ingestion.accept(pcm_frame(1, 320, 320, fmt))
    assert late.status == "rejected"
    assert late.reason == "paused_cutoff"
    frames = collect_frames(ingestion)
    # Only the 320 samples ingested before the cutoff exist; the paused wall
    # time was NOT converted into silence frames.
    assert sum(frame.size for frame, _ in frames) == 320


def test_a05_seek_rotates_epoch_with_new_anchor() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    for seq in range(5):
        assert ingestion.accept(pcm_frame(seq, seq * 320, 320, fmt)).status == "accepted"
    collect_frames(ingestion)
    # Seek: new epoch restarts the canonical timeline and continuity anchors.
    ingestion.rotate_epoch(STREAM, epoch=1)
    first = ingestion.accept(pcm_frame(0, 90_000, 320, fmt, epoch=1))
    assert first.status == "accepted"
    assert first.ack is not None
    assert first.ack.epoch == 1
    assert first.ack.through_canonical_sample == 320  # canonical clock restarted
    frames = collect_frames(ingestion)
    assert frames[0][1] == 0


def test_a05_epoch_increment_via_frame_starts_fresh_timeline() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    assert ingestion.accept(pcm_frame(0, 0, 320, fmt, epoch=0)).status == "accepted"
    # Producer-declared epoch bump (browser seek) re-anchors without rotate call.
    outcome = ingestion.accept(pcm_frame(0, 44_100_000, 320, fmt, epoch=3))
    assert outcome.status == "accepted"
    assert outcome.ack is not None and outcome.ack.through_canonical_sample == 320


# ---------------------------------------------------------------------------
# Buffer budget and ACK semantics
# ---------------------------------------------------------------------------


def test_buffer_hard_limit_emits_explicit_gap_instead_of_silent_drop() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    events: list[tuple[str, dict]] = []
    ingestion = AudioIngestion(
        SESSION, realtime=True, buffer_warn_ms=2_000, buffer_hard_limit_ms=5_000,
        on_event=lambda t, p: events.append((t, p)),
    )
    ingestion.open_stream(STREAM, 0, fmt)
    seq = 0
    statuses = []
    # 6 s of audio with no consumer: crosses warn (2 s) then hard limit (5 s).
    while seq < 300:  # 300 x 320 samples = 6 s
        statuses.append(ingestion.accept(pcm_frame(seq, seq * 320, 320, fmt)))
        seq += 1
    assert any(t == "buffer_warning" for t, _ in events)
    gaps = [(t, p) for t, p in events if t == "audio_gap"]
    assert gaps and gaps[-1][1]["reason"] == "buffer_overrun"
    overrun = [o for o in statuses if o.status == "gap" and o.reason == "buffer_overrun"]
    assert overrun and overrun[0].gap is not None and overrun[0].gap.recoverable
    assert ingestion.buffered_ms < 5_000
    # Ingestion continues after the overrun with a fresh anchor.
    assert ingestion.accept(pcm_frame(seq, seq * 320, 320, fmt)).status == "accepted"


def test_file_mode_blocks_producer_until_drained() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1)
    ingestion = AudioIngestion(SESSION, realtime=False, block_timeout_s=3.0)
    ingestion.open_stream(STREAM, 0, fmt)
    import threading

    # Fill just below the 2 s soft limit (100 x 320 samples = 2 s); the
    # producer thread then pushes past it and must block until a consumer
    # drains (file-input back-pressure).
    for seq in range(99):  # 99 x 320 = 1.98 s < 2 s soft limit
        outcome = ingestion.accept(pcm_frame(seq, seq * 320, 320, fmt))
        assert outcome.status == "accepted"

    result: list[str] = []

    def producer() -> None:
        for seq in range(99, 104):
            outcome = ingestion.accept(pcm_frame(seq, seq * 320, 320, fmt))
            result.append(outcome.status)

    thread = threading.Thread(target=producer)
    thread.start()
    time.sleep(0.3)
    blocked_at = len(result)
    assert blocked_at < 5, "producer never blocked despite exceeding the soft limit"
    drained = 0
    while len(result) < 5:
        frames = ingestion.consume_frames(50)
        drained += len(frames)
        if not frames:
            time.sleep(0.01)
    thread.join(timeout=3.0)
    assert result == ["accepted"] * 5
    assert drained > 0


def test_ack_watermark_semantics() -> None:
    fmt = StreamFormat(sample_rate=48_000, channels=2)
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 0, fmt)
    # 960 per-channel frames at 48k = 20 ms = exactly one canonical 320-sample frame.
    outcome = ingestion.accept(pcm_frame(7, 4800, 960, fmt))
    assert outcome.status == "accepted"
    ack = outcome.ack
    assert ack is not None
    assert ack.stream_id == STREAM and ack.epoch == 0
    assert ack.through_chunk_seq == 7
    assert ack.through_sample == 5760  # input-rate axis
    # The canonical watermark counts whole delivered 20 ms frames only; a
    # sub-frame remainder stays pending in the normalizer.
    assert ack.through_canonical_sample == outcome.frames_produced * FRAME_SAMPLES
    assert ack.through_canonical_sample == 320
    # A half-frame chunk advances the input watermark but not the canonical one.
    partial = ingestion.accept(pcm_frame(8, 5760, 480, fmt))
    assert partial.status == "accepted"
    assert partial.ack is not None
    assert partial.ack.through_sample == 6240
    assert partial.ack.through_canonical_sample == 320


def test_canonical_clock_helper() -> None:
    assert canonical_ms(16_000) == 1000.0
    assert canonical_ms(160) == 10.0


# ---------------------------------------------------------------------------
# 40-byte binary frame contract (round-trip against contracts.py)
# ---------------------------------------------------------------------------


def test_frame_roundtrip_into_ingestion() -> None:
    fmt = StreamFormat(sample_rate=16_000, channels=1, encoding="pcm_s16le")
    payload = sine_payload(320, 16_000, 1)
    header = AudioFrameHeader(
        kind=1, stream_handle=3, epoch=2, chunk_seq=9,
        sample_start=2880, sample_count=320, payload_bytes=len(payload),
    )
    wire = pack_audio_frame(header, payload)
    assert len(wire) == AUDIO_HEADER_BYTES + len(payload)
    parsed, parsed_payload = parse_audio_frame(wire, bytes_per_sample=2, channels=1)
    assert parsed == header
    assert parsed_payload == payload
    # Feed the parsed wire frame through ingestion.
    ingestion = make_ingestion()
    ingestion.open_stream(STREAM, 2, fmt)
    outcome = ingestion.accept(
        InputAudioFrame(
            session_id=SESSION, stream_id=STREAM, epoch=parsed.epoch, audio_seq=parsed.chunk_seq,
            sample_start=parsed.sample_start, sample_count=parsed.sample_count,
            format=fmt, payload=parsed_payload,
        )
    )
    assert outcome.status == "accepted"
    assert outcome.ack is not None and outcome.ack.through_chunk_seq == 9


def test_malformed_frames_rejected() -> None:
    payload = b"\x00" * 640
    header = AudioFrameHeader(
        kind=1, stream_handle=1, epoch=0, chunk_seq=0,
        sample_start=0, sample_count=320, payload_bytes=len(payload),
    )
    good = pack_audio_frame(header, payload)
    with pytest.raises(AudioFrameError):
        parse_audio_frame(good[:20], bytes_per_sample=2, channels=1)  # short
    with pytest.raises(AudioFrameError):
        parse_audio_frame(b"XOLA" + good[4:], bytes_per_sample=2, channels=1)  # magic
    bad_version = bytearray(good)
    bad_version[4] = 2
    with pytest.raises(AudioFrameError):
        parse_audio_frame(bytes(bad_version), bytes_per_sample=2, channels=1)
    # payload_bytes inconsistent with sample_count x channels x bytes_per_sample
    with pytest.raises(AudioFrameError):
        parse_audio_frame(good, bytes_per_sample=4, channels=1)
    with pytest.raises(AudioFrameError):
        parse_audio_frame(good + b"\x00", bytes_per_sample=2, channels=1)


# ---------------------------------------------------------------------------
# Routing: loop detection and preflight
# ---------------------------------------------------------------------------


def test_route_virtual_input_same_endpoint_as_speech_output_is_unsafe() -> None:
    route = AudioRoute(
        input_mode="virtual_input",
        input_endpoint_id="wasapi:microphone:abc",
        speech_output_endpoint_id="wasapi:microphone:abc",
    )
    result = preflight_route(route)
    assert result.route.feedback_status == "unsafe"
    assert result.issues[0].code == "feedback_loop"
    # A distinct output endpoint validates (endpoints assumed present when no
    # directory is injected).
    safe = preflight_route(
        AudioRoute(
            input_mode="virtual_input",
            input_endpoint_id="wasapi:microphone:abc",
            speech_output_endpoint_id="wasapi:systemOutput:def",
        )
    )
    assert safe.route.feedback_status == "validated"


def test_route_process_exclude_requires_tree_and_capability() -> None:
    from nola_translator_engine.backend.capture_process_loopback import ProcessLoopbackCapability

    # No exclude tree: unsafe even if the OS supports the API.
    result = preflight_route(AudioRoute(input_mode="process_exclude", excluded_process_tree=()))
    assert result.route.feedback_status == "unsafe"
    assert result.issues[0].code == "missing_exclude_tree"

    unsupported = ProcessLoopbackCapability(
        supported=False, reason="os_build_too_old", stage="os",
        detail="requires build >= 20348", os_build=19041,
    )
    result = preflight_route(
        AudioRoute(input_mode="process_exclude", excluded_process_tree=(4242,)),
        probe_process_loopback=lambda: unsupported,
    )
    assert result.route.feedback_status == "unsafe"
    assert result.issues[0].code == "process_loopback_os_build_too_old"

    ok = ProcessLoopbackCapability(supported=True, reason="ok", stage="done")
    result = preflight_route(
        AudioRoute(input_mode="process_exclude", excluded_process_tree=(4242,)),
        probe_process_loopback=lambda: ok,
    )
    assert result.route.feedback_status == "validated"


def test_route_missing_endpoint_detected_via_directory() -> None:
    known = {"wasapi:microphone:aaa", "wasapi:systemOutput:bbb"}
    result = preflight_route(
        AudioRoute(
            input_mode="virtual_input",
            input_endpoint_id="wasapi:microphone:ghost",
            speech_output_endpoint_id="wasapi:systemOutput:bbb",
        ),
        known_endpoint_ids=lambda: known,
    )
    assert result.route.feedback_status == "unsafe"
    assert result.issues[0].code == "input_endpoint_missing"
    assert result.route.feedback_reason


def test_device_backend_delegates_to_capture() -> None:
    import asyncio

    from nola_translator_engine.audio.resample import AudioFrame

    class FakeCapture:
        started = stopped = False

        def start(self) -> None:
            self.started = True

        def stop(self) -> None:
            self.stopped = True

        async def frames(self):
            yield AudioFrame(np.zeros(FRAME_SAMPLES, dtype=np.float32), 0.0)

    fake = FakeCapture()
    backend = DeviceCaptureBackend(lambda: fake)
    assert backend.backend_kind == "device"

    async def run() -> list[AudioFrame]:
        await backend.start()
        collected = [frame async for frame in backend.frames()]
        backend.stop()
        return collected

    frames = asyncio.run(run())
    assert fake.started and fake.stopped
    assert len(frames) == 1


def test_browser_tab_backend_normalizes_pushed_pcm() -> None:
    import asyncio

    async def run():
        backend = BrowserTabCaptureBackend(sample_rate=48_000, channels=1)
        await backend.start()
        assert backend.push(sine_payload(960, 48_000, 1), captured_at_ms=0.0)
        backend.stop()
        return [frame async for frame in backend.frames()]

    frames = asyncio.run(run())
    # 960 samples at 48k = 320 canonical = exactly one 20 ms frame.
    assert len(frames) == 1 and frames[0].samples.size == FRAME_SAMPLES


# ---------------------------------------------------------------------------
# Real Windows process-loopback probe.
#
# Scope per M03 cost control: the full playback isolation tests (source A
# audible / excluded tree B silent via Alarm01.wav players) were verified by
# the M00 spike (m00-baseline-report §3: peak 0.34 vs 0.0) and are deferred
# to the M11 verification pass; here we only confirm probe() once on capable
# machines and that activation failure is explicit (never a silent downgrade
# to plain loopback, which would re-capture Nola's own TTS).
# ---------------------------------------------------------------------------


def _windows_build() -> int:
    try:
        return int(sys.getwindowsversion().build)
    except AttributeError:
        return 0


needs_process_loopback = pytest.mark.skipif(
    sys.platform != "win32" or _windows_build() < 20348,
    reason="process loopback requires Windows build >= 20348",
)


@needs_process_loopback
def test_probe_reports_supported_on_capable_machine() -> None:
    from nola_translator_engine.backend.capture_process_loopback import ProcessLoopbackCapture

    capability = ProcessLoopbackCapture.probe(os.getpid())
    assert capability.supported, f"{capability.reason}: {capability.detail}"
    assert capability.reason == "ok"
    assert capability.os_build >= 20348
    assert capability.format is not None
    assert capability.format.sample_rate > 0
    assert capability.format.channels >= 1


def test_capture_activation_failure_is_explicit_never_plain_loopback(monkeypatch) -> None:
    """When activation fails, start() must raise ProcessLoopbackError instead
    of silently capturing (a plain-loopback downgrade would re-capture Nola's
    own TTS). Deterministic: the COM activation call is stubbed."""
    from nola_translator_engine.backend import capture_process_loopback as cpl

    monkeypatch.setattr(cpl.sys, "platform", "win32", raising=False)
    monkeypatch.setattr(
        cpl,
        "_activate_process_loopback_client",
        lambda pid, mode, timeout: (None, "activate-result", "GetActivateResult hr=0x88890004", -2005467004, None),
    )
    capture = cpl.ProcessLoopbackCapture(1234, mode="exclude")
    with pytest.raises(cpl.ProcessLoopbackError) as info:
        capture.start()
    assert "activate" in str(info.value)
    assert capture.running is False
    assert capture.format is None


def test_probe_unsupported_platform_reports_structured_reason(monkeypatch) -> None:
    """Off-Windows (or old builds) the probe reports a structured reason
    instead of raising — routing preflight surfaces it to the user."""
    from types import SimpleNamespace

    from nola_translator_engine.backend import capture_process_loopback as cpl

    monkeypatch.setattr(cpl, "sys", SimpleNamespace(platform="linux"))
    capability = cpl.ProcessLoopbackCapture.probe()
    assert not capability.supported
    assert capability.reason == "unsupported_platform"

    monkeypatch.setattr(cpl, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(cpl, "_windows_build", lambda: 19041)
    capability = cpl.ProcessLoopbackCapture.probe()
    assert not capability.supported
    assert capability.reason == "os_build_too_old"
    assert capability.os_build == 19041
