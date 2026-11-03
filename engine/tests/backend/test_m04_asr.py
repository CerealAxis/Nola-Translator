import asyncio
from time import monotonic, sleep
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.backend.app import create_app
from nola_translator_engine.audio.resample import AudioFrame, StreamingAudioNormalizer
from nola_translator_engine.backend.asr_pipeline import AsrPipeline, CloudAsrPipeline, SileroVadSegmenter
from nola_translator_engine.backend.contracts import SessionConfig
from nola_translator_engine.backend.gateway.bootstrap import BUNDLED_ASR_ID, build_default_gateway
from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode
from nola_translator_engine.backend.gateway.operations import AsrObservation
from nola_translator_engine.recognition.base import RecognitionUpdate
from nola_translator_engine.recognition.volume_gate import SegmentSnapshot, VolumeGateSegment
from nola_translator_engine.backend.source_agreement import SourceAgreement

from test_m03_wiring import TOKEN, auth, cascade_config, frame
from test_m02_gateway import _model_root
from test_m05_translation import FakeGateway


@pytest.mark.parametrize("text,reason,silence_ms", [
    ("Ready?", "soft_silence_boundary", 500),
    ("Ready", "hard_silence", 900),
])
async def test_stable_punctuation_shortens_silero_silence(monkeypatch, text, reason, silence_ms):
    monkeypatch.setattr(SileroVadSegmenter, "_speech_probability", lambda self, samples: float(samples.any()))
    observed_ms = 0
    monkeypatch.setattr("nola_translator_engine.backend.asr_pipeline.unix_ms", lambda: observed_ms)

    class Gateway:
        async def transcribe(self, *args, **kwargs):
            return AsrObservation(text, language="en")

    session = SimpleNamespace(
        session_id=UUID(int=1), pipeline_id="silence", epoch=0, source_revision_watermark=0,
        config=SessionConfig.model_validate(cascade_config()),
    )
    events = []
    pipeline = AsrPipeline(session, Gateway(), lambda kind, payload: events.append((kind, payload)),
                           latency_detection=True)
    voiced_frames = 100
    for index in range(voiced_frames + silence_ms // 20):
        observed_ms = (index + 1) * 20
        samples = np.full(320, 0.25 if index < voiced_frames else 0, dtype=np.float32)
        await pipeline.accept(AudioFrame(samples, index * 20), index * 320)
        await asyncio.sleep(0)
        if index == voiced_frames - 1 and text == "Ready?":
            assert any(kind == "source_text" and payload["text_state"] == "stable" for kind, payload in events)
        if observed_ms < voiced_frames * 20 + silence_ms:
            assert all(kind != "latency_observation" for kind, _ in events)
    (boundary,) = [payload for kind, payload in events if kind == "latency_observation"]
    await pipeline.finish()
    commits = [payload for kind, payload in events if kind == "source_committed"]
    assert [(commit["boundary_reason"], commit["cutoff_sample"]) for commit in commits] == [
        (reason, voiced_frames * 320),
    ]
    assert boundary == {
        "kind": "segment_boundary", "at_ms": voiced_frames * 20 + silence_ms,
        "segment_id": commits[0]["segment_id"],
    }


async def test_cloud_boundary_uses_observed_timestamp_once_and_never_uses_final_as_boundary(monkeypatch):
    def recognizer(config, *, latency_detection):
        assert latency_detection
        return SimpleNamespace()

    monkeypatch.setattr("nola_translator_engine.backend.asr_pipeline.create_cloud_recognizer", recognizer)
    config = SimpleNamespace(source_language="en", recognitionProvider="aliyun")
    session = SimpleNamespace(config=config, source_revision_watermark=0)
    events = []
    pipeline = CloudAsrPipeline(session, config, lambda kind, payload: events.append((kind, payload)),
                                latency_detection=True)
    await pipeline._update(RecognitionUpdate("cloud1", 1, 0, None, "Hel", "en", False))
    await pipeline._update(RecognitionUpdate("cloud1", 2, 0, 100, "Hel", "en", False, boundary_at_ms=1234))
    await pipeline._update(RecognitionUpdate("cloud1", 3, 0, 100, "Hello", "en", True, boundary_at_ms=1234))
    await pipeline._update(RecognitionUpdate("cloud2", 1, 100, 200, "Next", "en", True))
    (boundary,) = [payload for kind, payload in events if kind == "latency_observation"]
    committed = [payload for kind, payload in events if kind == "source_committed"]
    assert boundary == {"kind": "segment_boundary", "at_ms": 1234, "segment_id": committed[0]["segment_id"]}
    assert len(committed) == 2


def test_agreement_rolls_back_and_commit_is_immutable():
    agreement = SourceAgreement()
    for index, text in enumerate(("ice cream", "ice cream is", "ice cream is good"), start=1):
        snapshot = agreement.observe(AsrObservation(text), 8_000 * index)
    assert snapshot.text[:snapshot.stable_end] == "ice cream"
    rollback = agreement.observe(AsrObservation("I scream"), 32_000)
    assert rollback.stable_end == 0
    assert rollback.revision > snapshot.revision
    commit = agreement.commit("Ice cream is good.")
    assert agreement.observe(AsrObservation("another result"), 40_000) == commit


def test_agreement_reaches_dwell_at_minimum_observation_cadence():
    agreement = SourceAgreement()
    for index in range(3):
        assert agreement.observe(AsrObservation("Ready?"), 2_560 * index).stable_end == 0
    assert agreement.observe(AsrObservation("Ready?"), 7_680).stable_end == len("Ready?")


async def test_speaker_change_requires_consistent_embeddings_and_keeps_known_identity():
    config = SessionConfig.model_validate(cascade_config())
    events = []
    pipeline = AsrPipeline(SimpleNamespace(config=config), None, lambda kind, payload: events.append(payload))
    vectors = iter(np.array(row, dtype=np.float32) for row in (
        [1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [0, 1], [1, 0], [1, 0],
    ))
    pipeline.speaker_embedder = SimpleNamespace(embed=lambda samples: next(vectors))
    audio = np.zeros(32_000, dtype=np.float32)
    span = {"start_sample": 0, "end_sample": audio.size}
    first = await pipeline._identify_speaker(audio, span)
    uncertain = await pipeline._identify_speaker(audio, span)
    second = await pipeline._identify_speaker(audio, span)
    returning = await pipeline._identify_speaker(audio, span)
    assert first and second and first != second
    assert uncertain is None
    assert returning == first
    assert [event["speaker_id"] for event in events] == [first, second, first]


@pytest.mark.asyncio
async def test_slow_preview_does_not_block_frames_and_keeps_inflight_observation() -> None:
    class Segmenter:
        max_segment_ms = 10_000

        def __init__(self):
            self.frames = 0

        def accept(self, frame):
            self.frames += 1
            return []

        def current_bounds(self):
            return (0.0, self.frames * 20.0) if self.frames else None

        def current_segment(self):
            return SegmentSnapshot(0, self.frames * 20.0, np.ones(self.frames * 320, dtype=np.float32))

        def close_on_silence(self, minimum_ms):
            return None

        def flush(self):
            return []

    class SlowGateway:
        def __init__(self):
            self.started = asyncio.Event()
            self.second_started = asyncio.Event()
            self.release = asyncio.Event()
            self.calls = 0
            self.active = 0
            self.max_active = 0

        async def transcribe(self, ctx, *, audio, language, request):
            self.calls += 1
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            if self.calls == 1:
                self.started.set()
                await self.release.wait()
            elif self.calls == 2:
                self.second_started.set()
            self.active -= 1
            return AsrObservation(f"hypothesis {self.calls}", language="en")

    gateway = SlowGateway()
    session = SimpleNamespace(
        session_id=UUID(int=1), pipeline_id="nonblocking", epoch=0, source_revision_watermark=0,
        config=SessionConfig.model_validate(cascade_config()),
    )
    events = []
    pipeline = AsrPipeline(session, gateway, lambda kind, payload: events.append((kind, payload)), segmenter=Segmenter())
    for index in range(25):
        await asyncio.wait_for(pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), index * 20), index * 320), 0.05)
    await asyncio.wait_for(gateway.started.wait(), 1)

    for index in range(25, 58):
        await asyncio.wait_for(pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), index * 20), index * 320), 0.05)
    gateway.release.set()
    await asyncio.wait_for(gateway.second_started.wait(), 1)
    await pipeline.finish()

    hypotheses = [payload["text"] for kind, payload in events if kind == "source_text"]
    assert hypotheses == ["hypothesis 1", "hypothesis 2"]
    assert gateway.max_active == 1
    await pipeline.close()


@pytest.mark.asyncio
async def test_backpressure_fences_inflight_preview() -> None:
    class Segmenter:
        max_segment_ms = 10_000

        def __init__(self):
            self.frames = 0

        def accept(self, frame):
            self.frames += 1
            return []

        def current_bounds(self):
            return (0.0, self.frames * 20.0) if self.frames else None

        def current_segment(self):
            return SegmentSnapshot(0, self.frames * 20.0, np.ones(self.frames * 320, dtype=np.float32))

        def close_on_silence(self, minimum_ms):
            return None

        def flush(self):
            return []

    class SlowGateway:
        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def transcribe(self, *args, **kwargs):
            self.started.set()
            await self.release.wait()
            return AsrObservation("stale", language="en")

    gateway = SlowGateway()
    session = SimpleNamespace(
        session_id=UUID(int=1), pipeline_id="backpressure", epoch=0, source_revision_watermark=0,
        config=SessionConfig.model_validate(cascade_config()),
    )
    events = []
    pipeline = AsrPipeline(session, gateway, lambda kind, payload: events.append((kind, payload)), segmenter=Segmenter())
    for index in range(25):
        await pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), index * 20), index * 320)
    await asyncio.wait_for(gateway.started.wait(), 1)
    await pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), 500), 8_000, allow_preview=False)
    gateway.release.set()
    await pipeline.finish()

    assert not [payload for kind, payload in events if kind == "source_text"]
    await pipeline.close()


@pytest.mark.asyncio
async def test_final_queue_overflow_raises_resource_exhausted() -> None:
    class Segmenter:
        max_segment_ms = 10_000

        def accept(self, frame):
            return [VolumeGateSegment(0, 20, np.ones(320, dtype=np.float32))]

        def current_bounds(self):
            return None

        def close_on_silence(self, minimum_ms):
            return None

        def flush(self):
            return []

    class Gateway:
        async def transcribe(self, *args, **kwargs):
            await asyncio.Event().wait()

    session = SimpleNamespace(
        session_id=UUID(int=1), pipeline_id="overflow", epoch=0, source_revision_watermark=0,
        config=SessionConfig.model_validate(cascade_config()),
    )
    pipeline = AsrPipeline(session, Gateway(), lambda *args: None, segmenter=Segmenter())
    pipeline._max_pending_finals = 1
    await pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), 0), 0)
    with pytest.raises(GatewayError) as error:
        await pipeline.accept(AudioFrame(np.ones(320, dtype=np.float32), 20), 320)
    assert error.value.code == GatewayErrorCode.RESOURCE_EXHAUSTED
    await pipeline.close()


@pytest.mark.parametrize(("output", "pause"), [("asr", False), ("mt", False), ("tts", False), ("tts", True), ("mimo", False)])
def test_production_asr_pipeline_commits_accepted_pcm_on_eof_or_pause(monkeypatch, tmp_path, output, pause):
    from contextlib import ExitStack
    import json

    from nola_translator_engine.backend.contracts import AUDIO_KIND_OUTPUT, parse_audio_frame
    from nola_translator_engine.backend.gateway.adapters import MIMO_TTS_MODEL
    from nola_translator_engine.backend.gateway.operations import SynthesisChunk, SynthesisResult

    class Gateway:
        def __init__(self):
            self.mt = FakeGateway()

        def match(self, request):
            return self.mt.match(request)

        async def translate(self, *args, **kwargs):
            return await self.mt.translate(*args, **kwargs)

        async def synthesize(self, ctx, *, text, voice, request):
            assert text == "zh:Recognized audio."
            assert ctx.provider_options == ({"api_key": "mimo-test-key"} if output == "mimo" else {})
            return SynthesisResult([SynthesisChunk(b"\x00\x01" * 240, 24000, terminal=True)])

        async def acquire(self, request):
            assert request.model_id == "resource:test-asr"
            return None, None, None, None

        async def release(self, instance, lease):
            pass

        async def transcribe(self, ctx, *, audio, language, request):
            assert audio and np.frombuffer(audio, dtype="<i2").max() > 0
            return AsrObservation("Recognized audio.", language="en", is_final=True)

        async def shutdown(self):
            pass

    monkeypatch.setattr(SileroVadSegmenter, "load", lambda self: None)
    monkeypatch.setattr(SileroVadSegmenter, "_speech_probability", lambda self, samples: 0.9)
    gateway = Gateway()
    app = create_app(control_token=TOKEN, gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        config = cascade_config(input={"kind": "microphone"})
        recording = tmp_path / "audio.mp3"
        config["recording_path"] = str(recording)
        if output != "asr":
            config["pipeline"]["translation_model"] = "model:pinned-mt"
            config["required_outputs"].append("translated_text")
        if output in ("tts", "mimo"):
            config["pipeline"]["tts_model"] = MIMO_TTS_MODEL if output == "mimo" else "model:pinned-tts"
            config["required_outputs"].append("audio")
            config["speech_target_language"] = "zh"
        response = client.post("/api/v2/sessions", headers=auth(), json={
            "command_id": "create-asr", "owner": "quick_interpret",
            "config": config,
        })
        sid = response.json()["session_id"]
        route = f"/api/v2/sessions/{sid}"
        headers = {**auth(), "x-nola-tts-key": "mimo-test-key"} if output == "mimo" else auth()
        ack = client.post(route + "/commands", headers=headers, json={"command_id": "s", "type": "start"})
        assert ack.json()["result_state"] == "running"
        with ExitStack() as stack:
            audio = None
            if output in ("tts", "mimo"):
                audio = stack.enter_context(client.websocket_connect(route + "/audio", headers=auth()))
                audio.send_json({"frame": "hello", "consumer_id": "playback"})
                assert audio.receive_json()["playback_owner_id"] == "playback"
            ws = stack.enter_context(client.websocket_connect(route + "/input", headers=auth()))
            ws.send_json({
                "frame": "stream_open", "stream_handle": 3, "epoch": 0,
                "encoding": "pcm_s16le", "sample_rate": 16000, "channels": 1,
            })
            assert ws.receive_json()["frame"] == "stream_opened"
            ws.send_bytes(frame(3, 0, 0, 0, b"\x00\x01" * 320))
            assert ws.receive_json()["frame"] == "audio_accepted"
            if pause:
                paused = client.post(route + "/commands", headers=auth(), json={"command_id": "p", "type": "pause"})
                assert paused.json()["result_state"] == "paused"
                events = app.state.backend.session_manager.get(UUID(sid))._log.replay_from(0)
                assert {"source_committed", "translation_committed"} <= {event.event_type for event in events}
                resumed = client.post(route + "/commands", headers=auth(), json={"command_id": "r", "type": "resume"})
                assert resumed.json()["result_state"] == "running"
            else:
                ws.send_json({"frame": "stream_close", "stream_handle": 3, "eof": True})
            if audio is not None:
                claim = None
                while True:
                    message = audio.receive()
                    if "bytes" in message:
                        header, pcm = parse_audio_frame(message["bytes"], bytes_per_sample=2, channels=1)
                        assert header.kind == AUDIO_KIND_OUTPUT and len(pcm) == 480
                        break
                    event = json.loads(message["text"])
                    if event.get("event_type") == "playback_state" and event["payload"]["state"] == "claimed":
                        claim = event["payload"]
                assert claim is not None
                for state, offset in (("started", 0), ("finished", 240)):
                    audio.send_json({
                        "frame": "playback_ack", "owner_id": "playback", "claim_id": claim["claim_id"],
                        "playback_generation": claim["playback_generation"], "audio_stream_id": claim["audio_stream_id"],
                        "state": state, "played_sample_offset": offset,
                    })
            if pause:
                stopped = client.post(route + "/commands", headers=auth(), json={"command_id": "x", "type": "stop"})
                assert stopped.json()["result_state"] == "closed"
            deadline = monotonic() + 2
            while client.get(route, headers=auth()).json()["state"] != "closed":
                assert monotonic() < deadline
                sleep(0.01)
        events = app.state.backend.session_manager.get(UUID(sid))._log.replay_from(0)
        commit = next(event for event in events if event.event_type == "source_committed")
        assert commit.payload["text"] == "Recognized audio."
        assert commit.payload["cutoff_sample"] == 320
        assert recording.stat().st_size > 0
        if output != "asr":
            target = next(event for event in events if event.event_type == "translation_committed")
            assert target.payload["text"] == "zh:Recognized audio."
            assert target.payload["segment_id"] == commit.payload["segment_id"]


async def test_speaker_cut_keeps_both_sides_of_short_pause_with_legacy_opt_out(monkeypatch):
    monkeypatch.setattr(SileroVadSegmenter, "_speech_probability", lambda _, pcm: float(pcm.any()))

    class Gateway:
        async def acquire(self, request):
            return None, None, None, None

        async def release(self, instance, lease):
            pass

        async def transcribe(self, *args, **kwargs):
            return AsrObservation("Speech.", language="en", is_final=True)

    class Embedder:
        def embed(self, pcm):
            return np.array([1, 0]) if pcm.mean() > 0 else np.array([0, 1])

    monkeypatch.setattr(SileroVadSegmenter, "load", lambda self: None)
    monkeypatch.setattr("nola_translator_engine.recognition.speaker.SpeakerEmbedder", Embedder)
    config = SessionConfig.model_validate(cascade_config(
        silence_end_ms=800, speaker_detection={"enabled": False},
    ))
    session = SimpleNamespace(session_id=UUID(int=2), pipeline_id="speaker", epoch=0,
                              config=config, source_revision_watermark=0)
    commits = []
    pipeline = AsrPipeline(session, Gateway(), lambda kind, data: commits.append(data) if kind == "source_committed" else None)
    await pipeline.prepare()
    for index, amplitude in enumerate([1] * 90 + [0] * 10 + [-1] * 90):
        await pipeline.accept(AudioFrame(np.full(320, amplitude, dtype=np.float32), index * 20), index * 320)
    await pipeline.finish()
    assert [commit["boundary_reason"] for commit in commits] == ["speaker_change", "input_end"]
    assert commits[0]["audio_span"]["end_sample"] == commits[1]["audio_span"]["start_sample"] == 32_000
    assert commits[1]["audio_span"]["end_sample"] == 60_800


@pytest.mark.skipif(_model_root() is None, reason="SenseVoice weights are unavailable")
async def test_real_silero_and_sensevoice_commit_bundled_speech():
    source = Path(__file__).resolve().parents[3] / "src/renderer/features/workbench/assets/speech-preview.wav"
    with wave.open(str(source), "rb") as wav:
        normalizer = StreamingAudioNormalizer(wav.getframerate(), wav.getnchannels())
        frames = normalizer.accept_int16(wav.readframes(wav.getnframes()), 0) + normalizer.finish()
    config = SessionConfig.model_validate(cascade_config(
        pipeline={"kind": "cascade", "asr_model": BUNDLED_ASR_ID},
    ))
    session = SimpleNamespace(
        session_id=UUID(int=1), pipeline_id="real-asr", epoch=0,
        config=config, source_revision_watermark=0,
    )
    events = []
    gateway = build_default_gateway(model_dir=_model_root())
    try:
        pipeline = AsrPipeline(session, gateway, lambda kind, payload: events.append((kind, payload)))
        await pipeline.prepare()
        for audio in frames:
            await pipeline.accept(audio, round(audio.started_at_ms * 16))
        await pipeline.finish()
        assert any(kind == "source_committed" and payload["text"] for kind, payload in events)
    finally:
        await gateway.shutdown()
