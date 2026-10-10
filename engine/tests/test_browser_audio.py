"""Browser PCM boundaries, timeline isolation, and responsive control with stalled inference."""

import asyncio
import base64
import json
import threading
from unittest.mock import AsyncMock

import numpy as np
import pytest
from pydantic import ValidationError

from nola_translator_engine.audio.capture import BrowserAudioCapture
from nola_translator_engine.protocol import (
    BrowserTimeline, PushAudioCommand, ResetStreamCommand, SessionConfig,
    ManageResourceCommand,
    ReleaseModelsCommand,
    FinishStreamCommand,
    SetSessionPausedCommand, StartSessionCommand, StopSessionCommand,
    parse_command_line, parse_event_line, serialize_event,
)
from nola_translator_engine.recognition.base import RecognitionUpdate
from nola_translator_engine.recognition.streaming import StreamingRecognizer
from nola_translator_engine.runtime import EngineRuntime
from nola_translator_engine.service import EngineService
from nola_translator_engine.translation.base import ProviderTranslation
from nola_translator_engine.translation.scheduler import TranslationScheduler


def config(**changes):
    return SessionConfig(**dict(dict(audioSource={"kind": "browserTab", "streamId": "tab-one"},
        browserTimeline={"epoch": 0, "videoTimeMs": 5000, "playbackRate": 1},
        recognitionMode="realtime", recognitionModelId="sensevoice-small",
        sourceLanguage="en", targetLanguages=[]), **changes))


def audio(session_id="session", **changes):
    return PushAudioCommand(**dict(dict(protocolVersion=1, type="pushAudio", requestId="pcm",
        sessionId=session_id, streamId="tab-one", epoch=0, sequence=0, sampleRate=16000,
        capturedAtMs=0, pcmBase64=base64.b64encode(bytes(640)).decode()), **changes))


def reset(session_id="session", epoch=0, video_time=5000, rate=1):
    return ResetStreamCommand(protocolVersion=1, type="resetStream", requestId="reset",
        sessionId=session_id, epoch=epoch, videoTimeMs=video_time, playbackRate=rate)


class FakeRecognizer:
    def __init__(self):
        self.on_update = None
        self.accept_started = asyncio.Event()
        self.flush_started = asyncio.Event()
        self.block_accept = False
        self.block_flush = False
        self.flush_release = asyncio.Event()
        self.flush_updates = []
        self.accepted_frames = 0
        self.closed = False

    async def accept(self, frame):
        self.accepted_frames += 1
        self.accept_started.set()
        if self.block_accept:
            await asyncio.Event().wait()
        return []

    async def flush(self, ended_at_ms):
        self.flush_started.set()
        if self.block_flush:
            await self.flush_release.wait()
        return self.flush_updates

    async def close(self):
        self.closed = True


async def started_runtime(tmp_path, monkeypatch, **changes):
    events = []
    runtime = EngineRuntime(tmp_path / "models", events.append)
    recognizer = FakeRecognizer()
    monkeypatch.setattr(runtime.resources, "is_installed", lambda _: True)
    monkeypatch.setattr(runtime, "_configure_device_plan", AsyncMock())
    monkeypatch.setattr(runtime, "_create_recognizer", AsyncMock(return_value=recognizer))
    monkeypatch.setattr(runtime, "_unload_session_models", AsyncMock())
    monkeypatch.setattr(runtime, "_fresh_recognizer", lambda: FakeRecognizer())
    monkeypatch.setattr(runtime.service.device_registry, "resolve", lambda *_: pytest.fail("WASAPI opened"))
    result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession",
        requestId="start", config=config(**changes)))
    assert result[0].type == "sessionStarted", result
    session_id = result[0].sessionId
    return runtime, events, session_id, recognizer


@pytest.mark.parametrize("changes", [
    {"pcmBase64": "!!!!"}, {"pcmBase64": "AQA="[:-1]}, {"pcmBase64": "AQ=="},
    {"pcmBase64": ""}, {"sampleRate": 7999}, {"sampleRate": 192001},
    {"sampleRate": 16000.5}, {"sampleRate": True}, {"epoch": -1}, {"sequence": -1},
    {"capturedAtMs": float("nan")}, {"capturedAtMs": float("inf")},
    {"pcmBase64": base64.b64encode(bytes(6402)).decode()},
])
def test_protocol_rejects_invalid_pcm(changes):
    with pytest.raises(ValidationError):
        audio(**changes)


def test_protocol_roundtrips_and_timeline_constraints():
    command = audio(sampleRate=48000, pcmBase64=base64.b64encode(bytes(1920)).decode())
    assert parse_command_line(command.model_dump_json()) == command
    with pytest.raises(ValidationError):
        config(audioSource={"kind": "microphone", "deviceId": "mic"})
    for changes in ({"epoch": -1}, {"playbackRate": 0}, {"videoTimeMs": float("nan")}):
        with pytest.raises(ValidationError):
            BrowserTimeline(**dict(dict(epoch=0, videoTimeMs=0, playbackRate=1), **changes))
    assert config(audioSource={"kind": "defaultOutput"}).browserTimeline is not None


@pytest.mark.asyncio
async def test_pcm_normalizes_and_bound_includes_inflight_chunk():
    capture = BrowserAudioCapture()
    capture.start()
    data = np.full(9600, 16384, dtype="<i2").tobytes()
    for index in range(10):
        assert capture.push(data, 48000, index * 200)
    assert not capture.push(data, 48000, 2000)
    frames = capture.frames()
    frame = await anext(frames)
    assert frame.samples.size == 320
    assert frame.started_at_ms == 0
    assert np.mean(frame.samples) == pytest.approx(0.5, abs=0.01)
    assert capture.buffered_ms == pytest.approx(2000)
    assert not capture.push(data, 48000, 2000)
    await frames.aclose()
    assert capture.buffered_ms == pytest.approx(1800)
    capture.stop()
    assert capture.buffered_ms == 0


@pytest.mark.asyncio
async def test_finish_preserves_partial_pcm_frame_without_accepting_more_input():
    capture = BrowserAudioCapture()
    capture.start()
    assert capture.push(np.full(160, 16384, dtype="<i2").tobytes(), 16000, 100)
    capture.finish()
    assert not capture.push(bytes(640), 16000, 110)
    frames = [frame async for frame in capture.frames()]
    assert len(frames) == 1 and frames[0].started_at_ms == 100
    assert np.all(frames[0].samples[:160] == 0.5)
    assert np.all(frames[0].samples[160:] == 0)
    assert capture.buffered_ms == 0


@pytest.mark.asyncio
async def test_start_waits_for_anchor_never_opens_device_or_records(tmp_path, monkeypatch):
    runtime, _, session_id, _ = await started_runtime(tmp_path, monkeypatch,
        recordingPath=str(tmp_path / "forbidden.wav"))
    assert runtime.recorder is None
    assert not (tmp_path / "forbidden.wav").exists()
    assert (await runtime.handle(audio(session_id)))[0].code == "invalidConfiguration"
    anchored = await runtime.handle(reset(session_id))
    assert parse_event_line(serialize_event(anchored[0])) == anchored[0]
    accepted = await runtime.handle(audio(session_id))
    assert accepted[0].type == "audioAccepted"
    assert parse_event_line(serialize_event(accepted[0])) == accepted[0]
    await runtime.close()


@pytest.mark.asyncio
async def test_bounded_queue_ack_sequences_and_stream_isolation(tmp_path, monkeypatch):
    runtime, _, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    pcm = base64.b64encode(bytes(6400)).decode()
    for sequence in range(10):
        event = (await runtime.handle(audio(session_id, sequence=sequence,
            capturedAtMs=sequence * 200, pcmBase64=pcm)))[0]
        assert event.type == "audioAccepted"
        assert event.sequence == sequence
    assert runtime.capture.buffered_ms == 2000
    overflow = (await runtime.handle(audio(session_id, sequence=10, capturedAtMs=2000, pcmBase64=pcm)))[0]
    assert overflow.code == "audioBufferOverflow"
    for changes, code in [({"sessionId": "other"}, "sessionNotRunning"),
            ({"streamId": "other"}, "invalidConfiguration"),
            ({"epoch": 1}, "invalidConfiguration"), ({"sequence": 9}, "invalidMessage"),
            ({"sequence": 11}, "invalidMessage")]:
        assert (await runtime.handle(audio(**dict(dict(sessionId=session_id), **changes))))[0].code == code
    await runtime.close()


@pytest.mark.asyncio
async def test_reset_fences_stalled_consumer_callback_and_translation(tmp_path, monkeypatch):
    runtime, emitted, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    old = runtime.recognizer
    old.block_accept = True
    old_callback = old.on_update
    await runtime.handle(audio(session_id))
    await asyncio.wait_for(old.accept_started.wait(), 1)
    blocked = asyncio.create_task(asyncio.Event().wait())
    runtime.translation_tasks["old"] = blocked
    result = await asyncio.wait_for(runtime.handle(reset(session_id, epoch=1, video_time=12000, rate=2)), 0.5)
    assert result[0].type == "streamReset"
    assert old.closed and blocked.cancelled()
    assert runtime.capture.buffered_ms == 0
    update = RecognitionUpdate("same-segment", 0, 100, 300, "hello", "en", True)
    await old_callback(update)
    assert not [event for event in emitted if event.type == "caption"]
    await runtime.recognizer.on_update(update)
    caption = emitted[-1]
    assert caption.streamEpoch == 1
    assert caption.videoStartedAtMs == 12200
    assert caption.videoEndedAtMs == 12600
    assert caption.segment.segmentId == "e1-same-segment"
    assert (await runtime.handle(audio(session_id, epoch=0)))[0].code == "invalidConfiguration"
    assert (await runtime.handle(audio(session_id, epoch=1)))[0].type == "audioAccepted"
    await asyncio.wait_for(runtime.close(), 0.5)
    await old_callback(update)
    assert len([event for event in emitted if event.type == "caption"]) == 1


@pytest.mark.asyncio
async def test_pause_flush_is_async_resume_requires_new_anchor(tmp_path, monkeypatch):
    runtime, _, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    old = runtime.recognizer
    old.block_flush = True
    pause = SetSessionPausedCommand(protocolVersion=1, type="setSessionPaused", requestId="pause",
        sessionId=session_id, paused=True)
    assert (await asyncio.wait_for(runtime.handle(pause), 0.5))[0].code == "paused"
    await asyncio.wait_for(old.flush_started.wait(), 1)
    await runtime.handle(pause.model_copy(update={"paused": False}))
    assert (await runtime.handle(audio(session_id)))[0].code == "invalidConfiguration"
    assert (await runtime.handle(reset(session_id)))[0].code == "invalidMessage"
    await asyncio.wait_for(runtime.handle(reset(session_id, epoch=1)), 0.5)
    assert old.closed
    assert (await runtime.handle(audio(session_id, epoch=1)))[0].type == "audioAccepted"
    await runtime.close()


@pytest.mark.asyncio
async def test_wrong_session_stop_does_not_teardown_live_stream(tmp_path, monkeypatch):
    runtime, _, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    command = StopSessionCommand(protocolVersion=1, type="stopSession", requestId="stop", sessionId="other")
    assert (await runtime.handle(command))[0].code == "sessionNotRunning"
    assert runtime.service.session_id == session_id
    assert runtime.capture.running
    await runtime.close()


@pytest.mark.asyncio
async def test_browser_start_keeps_model_capability_validation(tmp_path, monkeypatch):
    runtime = EngineRuntime(tmp_path / "models", lambda _: None)
    loader = AsyncMock()
    monkeypatch.setattr(runtime, "_configure_device_plan", loader)
    result = await runtime.handle(StartSessionCommand(protocolVersion=1, type="startSession", requestId="start",
        config=config(sourceLanguage="fr")))
    assert result[0].code == "invalidConfiguration"
    assert result[0].details["reason"] == "unsupportedRecognitionLanguage"
    loader.assert_not_awaited()


def test_service_browser_start_and_capability_without_device_enumeration():
    service = EngineService(device_enumerator=lambda: pytest.fail("device enumeration"))
    command = StartSessionCommand(protocolVersion=1, type="startSession", requestId="start", config=config())
    assert service.handle(command)[0].type == "sessionStarted"
    ready = service.handle(parse_command_line(json.dumps(dict(protocolVersion=1, type="hello",
        requestId="hello", clientVersion="test"))))[0]
    assert "browserAudio" in ready.capabilities


def test_system_timeline_uses_monotonic_anchor_and_keeps_desktop_timestamps(tmp_path):
    runtime = EngineRuntime(tmp_path / "models", lambda _: None)
    runtime.service.session_id = "session-system"
    runtime.session_started_at_ms = 1000
    runtime._timeline_origin_ms = 5000
    runtime._timeline = BrowserTimeline(epoch=3, videoTimeMs=30000, playbackRate=1.5)
    runtime._stream_epoch = 3
    update = RecognitionUpdate("segment", 0, 5200, 5800, "hello", "en", True)
    event = runtime._caption_event(update, [])
    assert event.segment.startedAtMs == 4200
    assert event.segment.endedAtMs == 4800
    assert event.videoStartedAtMs == 30300
    assert event.videoEndedAtMs == 31200
    assert event.streamEpoch == 3
    serialized = json.loads(serialize_event(event))
    assert "streamEpoch" in serialized and "streamEpoch" not in serialized["segment"]
    runtime._timeline = None
    runtime._stream_epoch = None
    serialized = json.loads(serialize_event(runtime._caption_event(update, [])))
    assert not {"streamEpoch", "videoStartedAtMs", "videoEndedAtMs"}.intersection(serialized)


class ThreadLockedModel:
    """Use the same inference-lock ownership as native ASR without loading model weights."""

    def __init__(self):
        self.loaded = True
        self.lock = threading.Lock()
        self.started = threading.Event()
        self.release = threading.Event()
        self.unload_started = threading.Event()
        self.idle_started = threading.Event()

    def describe(self):
        return "loaded" if self.loaded else "unloaded"

    def transcribe(self, samples, *, prefix=None, language=None):
        with self.lock:
            self.started.set()
            self.release.wait(5)
            return "late native result", "en"

    def unload(self):
        self.unload_started.set()
        with self.lock:
            self.loaded = False

    def wait_idle(self):
        self.idle_started.set()
        with self.lock:
            pass


async def locked_runtime(tmp_path, monkeypatch):
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    model = ThreadLockedModel()
    runtime._active_recognition_runtime = model
    monkeypatch.setattr(runtime.resources, "is_installed", lambda _: True)
    monkeypatch.setattr(runtime, "_configure_device_plan", AsyncMock())

    async def create_recognizer(_command):
        return StreamingRecognizer(model, block_ms=20)

    monkeypatch.setattr(runtime, "_create_recognizer", create_recognizer)
    monkeypatch.setattr(runtime, "_fresh_recognizer", lambda: StreamingRecognizer(model, block_ms=20))
    start = StartSessionCommand(protocolVersion=1, type="startSession", requestId="start", config=config())
    session_id = (await runtime.handle(start))[0].sessionId
    await runtime.handle(reset(session_id))
    pcm = base64.b64encode(np.full(320, 16384, dtype="<i2").tobytes()).decode()
    await runtime.handle(audio(session_id, pcmBase64=pcm))
    assert await asyncio.to_thread(model.started.wait, 1)
    return runtime, emitted, model, session_id, start


@pytest.mark.asyncio
async def test_stop_replies_while_real_streaming_inference_lock_is_held(tmp_path, monkeypatch):
    runtime, emitted, model, session_id, start = await locked_runtime(tmp_path, monkeypatch)
    try:
        stop = StopSessionCommand(protocolVersion=1, type="stopSession", requestId="stop", sessionId=session_id)
        result = await asyncio.wait_for(runtime.handle(stop), 0.3)
        assert result[0].type == "sessionStopped"
        assert runtime.capture is None and runtime.recognizer is None
        assert runtime.service.session_id is None
        assert model.loaded and not model.release.is_set()
        assert await asyncio.to_thread(model.idle_started.wait, 1)
        busy = (await runtime.handle(start))[0]
        assert busy.code == "resourceBusy" and busy.details["reason"] == "modelCleanupPending"
        remove = ManageResourceCommand(protocolVersion=1, type="manageResource", requestId="remove",
            resourceId="sensevoice-small", action="remove")
        assert (await runtime.handle(remove))[0].code == "resourceBusy"
        model.release.set()
        await asyncio.wait_for(runtime._model_cleanup_task, 1)
        assert model.loaded and not model.unload_started.is_set()
        assert not [event for event in emitted if event.type == "caption"]
        assert (await runtime.handle(start))[0].type == "sessionStarted"
    finally:
        model.release.set()
        await runtime.close()


@pytest.mark.asyncio
async def test_release_models_defers_unload_until_cancelled_native_job_finishes(tmp_path, monkeypatch):
    runtime, _, model, session_id, _ = await locked_runtime(tmp_path, monkeypatch)
    try:
        await runtime.handle(StopSessionCommand(protocolVersion=1, type='stopSession', requestId='stop', sessionId=session_id))
        result = await runtime.handle(ReleaseModelsCommand(protocolVersion=1, type='releaseModels', requestId='release'))
        assert result[0].type == 'modelsReleased' and result[0].deferred
        assert model.loaded and runtime._model_cleanup_pending()
        model.release.set()
        await asyncio.wait_for(runtime._model_cleanup_task, 1)
        assert not model.loaded
    finally:
        model.release.set()
        await runtime.close()


@pytest.mark.asyncio
async def test_close_bounds_cleanup_wait_without_releasing_model_reservation(tmp_path, monkeypatch):
    runtime, _, model, _, start = await locked_runtime(tmp_path, monkeypatch)
    runtime.model_cleanup_timeout = 0.02
    try:
        await asyncio.wait_for(runtime.close(), 0.3)
        assert runtime._model_cleanup_pending()
        assert (await runtime.handle(start))[0].code == "resourceBusy"
    finally:
        model.release.set()
        await asyncio.wait_for(runtime._model_cleanup_task, 1)
    assert not (tmp_path / "models" / ".runtime" / "engine-status.json").exists()


@pytest.mark.asyncio
async def test_stop_finalizes_already_recognized_partial_before_stopping(tmp_path, monkeypatch):
    runtime, emitted, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id, video_time=10000, rate=2))
    runtime._last_frame_end_ms = 300
    await runtime.recognizer.on_update(RecognitionUpdate("tail", 0, 100, None, "known words", "en", False))
    result = await asyncio.wait_for(runtime.handle(StopSessionCommand(protocolVersion=1, type="stopSession",
        requestId="stop", sessionId=session_id)), 0.3)
    assert result[0].type == "sessionStopped"
    final = emitted[-1]
    assert final.segment.isFinal
    assert final.segment.sourceText == "known words"
    assert final.videoStartedAtMs == 10200 and final.videoEndedAtMs == 10600
    await runtime.close()


def finish_command(session_id, epoch=0):
    return FinishStreamCommand(protocolVersion=1, type="finishStream", requestId="finish",
        sessionId=session_id, epoch=epoch)


@pytest.mark.asyncio
async def test_finish_drains_accepted_pcm_and_emits_final_before_completion(tmp_path, monkeypatch):
    runtime, emitted, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    recognizer = runtime.recognizer
    recognizer.block_flush = True
    recognizer.flush_updates = [RecognitionUpdate("end-tail", 0, 0, 200, "last words", "en", True)]
    await runtime.handle(audio(session_id, pcmBase64=base64.b64encode(bytes(6400)).decode()))
    command = finish_command(session_id)
    assert parse_command_line(command.model_dump_json()) == command
    assert await asyncio.wait_for(runtime.handle(command), 0.3) == []
    await asyncio.wait_for(recognizer.flush_started.wait(), 1)
    assert recognizer.accepted_frames == 10
    assert not [event for event in emitted if event.type == "streamFinished"]
    assert (await runtime.handle(audio(session_id, sequence=1, capturedAtMs=200)))[0].code == "invalidConfiguration"
    recognizer.flush_release.set()
    await asyncio.wait_for(runtime._finish_stream_task, 1)
    assert [event.type for event in emitted[-2:]] == ["caption", "streamFinished"]
    assert emitted[-2].segment.isFinal and emitted[-2].segment.sourceText == "last words"
    assert emitted[-1].sessionId == session_id and emitted[-1].epoch == 0
    assert parse_event_line(serialize_event(emitted[-1])) == emitted[-1]
    await runtime.close()
    assert len([event for event in emitted if event.type == "caption"]) == 1


@pytest.mark.asyncio
async def test_finish_waits_for_final_translation_without_blocking_commands(tmp_path, monkeypatch):
    runtime, emitted, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    runtime.active_config = runtime.active_config.model_copy(update={"translationProvider": "cloud", "targetLanguages": ["zh"]})

    class DelayedProvider:
        name = "delayed"

        def __init__(self):
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def translate(self, text, source, target):
            self.started.set()
            await self.release.wait()
            return ProviderTranslation("最后一句", (source, target))

    provider = DelayedProvider()
    runtime.translation_scheduler = TranslationScheduler(provider)
    runtime.recognizer.flush_updates = [RecognitionUpdate("tail", 0, 0, 200, "last words", "en", True)]
    await asyncio.wait_for(runtime.handle(finish_command(session_id)), 0.3)
    await asyncio.wait_for(provider.started.wait(), 1)
    assert not [event for event in emitted if event.type == "streamFinished"]
    provider.release.set()
    await asyncio.wait_for(runtime._finish_stream_task, 1)
    assert emitted[-2].segment.translations[0].state == "complete"
    assert emitted[-1].type == "streamFinished"
    await runtime.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("control", ["stop", "reset"])
async def test_stop_and_reset_cancel_delayed_finish_without_waiting(tmp_path, monkeypatch, control):
    runtime, emitted, session_id, _ = await started_runtime(tmp_path, monkeypatch)
    await runtime.handle(reset(session_id))
    recognizer = runtime.recognizer
    recognizer.block_flush = True
    recognizer.flush_updates = [RecognitionUpdate("late-tail", 0, 0, 200, "stale", "en", True)]
    await runtime.handle(finish_command(session_id))
    await asyncio.wait_for(recognizer.flush_started.wait(), 1)
    finish_task = runtime._finish_stream_task
    command = (StopSessionCommand(protocolVersion=1, type="stopSession", requestId="stop", sessionId=session_id)
        if control == "stop" else reset(session_id, epoch=1))
    await asyncio.wait_for(runtime.handle(command), 0.3)
    assert finish_task.cancelled()
    recognizer.flush_release.set()
    await asyncio.sleep(0)
    assert not [event for event in emitted if event.type in ("caption", "streamFinished")]
    await runtime.close()


@pytest.mark.asyncio
async def test_pause_during_real_finish_keeps_flush_and_completion_alive(tmp_path, monkeypatch):
    runtime, emitted, model, session_id, _ = await locked_runtime(tmp_path, monkeypatch)
    try:
        flush_started = asyncio.Event()
        original_flush = runtime.recognizer.flush

        async def observe_flush(ended_at_ms):
            flush_started.set()
            return await original_flush(ended_at_ms)

        monkeypatch.setattr(runtime.recognizer, "flush", observe_flush)
        for sequence, captured_at, samples in ((1, 20, 3200), (2, 220, 1600)):
            pcm = base64.b64encode(np.full(samples, 16384, dtype="<i2").tobytes()).decode()
            await runtime.handle(audio(session_id, sequence=sequence, capturedAtMs=captured_at, pcmBase64=pcm))
        await runtime.handle(finish_command(session_id))
        await asyncio.wait_for(flush_started.wait(), 1)
        finish_task = runtime._finish_stream_task
        consumer = runtime.session_task
        pause = SetSessionPausedCommand(protocolVersion=1, type="setSessionPaused", requestId="pause",
            sessionId=session_id, paused=True)
        assert (await asyncio.wait_for(runtime.handle(pause), 0.3))[0].code == "paused"
        assert runtime.session_task is consumer and not consumer.cancelled()
        resume = await runtime.handle(pause.model_copy(update={"paused": False}))
        assert resume[0].code == "invalidConfiguration"
        assert resume[0].details["reason"] == "streamFinishing"
        model.release.set()
        await asyncio.wait_for(finish_task, 1)
        finals = [event for event in emitted if event.type == "caption" and event.segment.isFinal]
        assert finals and finals[-1].segment.sourceText == "late native result"
        assert emitted[-1].type == "streamFinished"
        assert runtime.session_paused
    finally:
        model.release.set()
        await runtime.close()
