import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from threading import Event
from time import monotonic, sleep
from types import SimpleNamespace
from uuid import uuid4

import numpy as np
import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.audio.devices import AudioDeviceRegistry, _stable_device_id
from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.backend import api, meeting, meeting_audio
from nola_translator_engine.backend.app import create_app
from nola_translator_engine.backend.gateway.adapters import AdapterRegistry
from nola_translator_engine.backend.gateway.bootstrap import register_s2s
from nola_translator_engine.backend.gateway.capabilities import Operation
from nola_translator_engine.backend.gateway.gateway import ModelGateway, ModelRegistry
from nola_translator_engine.backend.gateway.operations import AsrObservation, SynthesisChunk, SynthesisResult
from nola_translator_engine.backend.s2s_provider import MODELS, S2SObservation, S2SProtocolError
from nola_translator_engine.recognition.volume_gate import SileroVadSegmenter
from test_m05_translation import FakeGateway
from test_m07_s2s_pipeline import Provider


AUTH = {"authorization": "Bearer test", "x-nola-provider-key": "test", "x-nola-provider-workspace": "test"}
OUTPUT_NAMES = ("CABLE-A Input (VB-Audio)", "Headphones")
INPUT_NAMES = ("Microphone", "CABLE-B Output (VB-Audio)")


def config(kind="s2s"):
    pipeline = ({"kind": "s2s", "s2s_model": MODELS[0]} if kind == "s2s" else {
        "kind": "cascade", "asr_model": "resource:test-asr", "translation_model": "model:pinned-mt",
        "tts_model": "voice",
    })
    body = {"command_id": str(uuid4()), "duck_volume": 0.25, "passthrough_key": "F8"}
    for i, lane in enumerate(("uplink", "downlink")):
        target = ("en", "zh")[i]
        body[lane] = {
            "pipeline": pipeline, "input": {"kind": ("microphone", "virtual_input")[i], "device_id": INPUT_NAMES[i]},
            "source_language": "auto" if kind == "s2s" else ("zh", "en")[i],
            "target_languages": [target], "speech_target_language": target,
            "required_outputs": ["audio"], "silence_end_ms": 300,
        }
        body[f"{lane}_output_id"] = _stable_device_id("systemOutput", OUTPUT_NAMES[i])
    return body


class Stream:
    def __init__(self, callback):
        self.callback = callback
        self.closed = False

    def is_active(self):
        return not self.closed

    def close(self):
        self.closed = True

    def render(self, frames=320):
        pcm, _ = self.callback(None, frames, {"current_time": 0, "output_buffer_dac_time": 0}, 0)
        return np.frombuffer(pcm, dtype=np.float32)


class AudioBackend:
    def get_host_api_info_by_type(self, _kind):
        return {"index": 0, "deviceCount": len(OUTPUT_NAMES)}

    def get_device_info_by_host_api_device_index(self, _host, index):
        return {"index": index, "name": OUTPUT_NAMES[index], "maxOutputChannels": 1, "defaultSampleRate": 16000}

    def open(self, *, stream_callback, **_options):
        return Stream(stream_callback)

    def terminate(self):
        pass


class Capture:
    def __init__(self):
        self.pending = asyncio.Queue()
        self.closed = False

    async def start(self):
        pass

    def stop(self):
        self.closed = True

    def put(self, value):
        self.pending.put_nowait(AudioFrame(np.full(320, value, np.float32), monotonic() * 1000))

    async def frames(self):
        while not self.closed:
            yield await self.pending.get()


class Gateway:
    def __init__(self, block=False, fail=False):
        self.providers = []
        self.second = Event()
        self.block, self.fail = block, fail
        self.active = 0

    @asynccontextmanager
    async def s2s_session(self, ctx, *, request, config):
        assert config["api_key"] == "test"
        provider = Provider([])
        self.providers.append(provider)
        self.active += 1
        try:
            if self.active == 2:
                self.second.set()
                if self.block:
                    await asyncio.Event().wait()
                if self.fail:
                    raise S2SProtocolError("fixture")
            yield provider
        finally:
            await provider.close()
            self.active -= 1

    async def shutdown(self):
        pass


@pytest.fixture
def audio(monkeypatch):
    outputs = dict(zip((config()["uplink_output_id"], config()["downlink_output_id"]), OUTPUT_NAMES))
    monkeypatch.setattr(AudioDeviceRegistry, "refresh", lambda _: [
        SimpleNamespace(device_id=id_, name=name) for id_, name in [*outputs.items(), *((n, n) for n in INPUT_NAMES)]
    ])
    captures = dict(zip(INPUT_NAMES, (Capture(), Capture())))
    monkeypatch.setattr(meeting, "_desktop_backend", lambda config: captures[config.device_id])
    monkeypatch.setattr(meeting_audio.pyaudio, "PyAudio", AudioBackend)
    key = Event()
    monkeypatch.setattr(api, "_key_reader", lambda _: key.is_set)
    return captures, key


def wait_until(predicate):
    deadline = monotonic() + 5
    while not predicate():
        assert monotonic() < deadline
        sleep(0.01)


def test_meeting_two_provider_routes_hold_fence_restore_and_release(audio):
    captures, key = audio
    gateway = Gateway()
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        body = config()
        response = client.post("/api/v2/meetings", json=body, headers=AUTH)
        assert response.status_code == 201, response.text
        state = response.json()
        url = f"/api/v2/meetings/{body['command_id']}"
        assert state["meeting_id"] == body["command_id"] and gateway.active == 2
        assert state["uplink"]["session_id"] != state["downlink"]["session_id"]
        assert client.post("/api/v2/meetings", json=body, headers=AUTH).json() == state
        assert client.post("/api/v2/sessions", json={
            "command_id": "quick", "owner": "quick_interpret", "config": body["uplink"],
        }, headers=AUTH).json()["error"]["safe_details"]["current_owner"] == "meeting"
        group = app.state.backend.meetings[next(iter(app.state.backend.meetings))]
        up, down = group.routes

        def audio_packet(route):
            playback = group.ctx.pipeline_registry.playbacks[route.session.session_id]
            return playback.accept(
                S2SObservation("audio", "target", "reply", pcm=b"\x00\x40" * 320, sample_rate=16000),
                "translation", None,
            )

        for route in (up, down):
            client.portal.call(audio_packet, route)
        assert up.output.translation_samples == down.output.translation_samples == 320

        key.set()
        wait_until(lambda: client.get(url, headers=AUTH).json()["passthrough_active"])
        assert up.output.translation_samples == 0 and down.output.translation_samples == 320
        client.portal.call(audio_packet, up)
        assert up.output.translation_samples == 0
        client.portal.call(captures[INPUT_NAMES[0]].put, 0.25)
        client.portal.call(captures[INPUT_NAMES[1]].put, 0.125)
        wait_until(lambda: bool(up.output.original) and bool(down.output.original))
        telemetry = client.get(url, headers=AUTH).json()["telemetry"]
        assert telemetry["uplink"]["input_peak"] == pytest.approx(0.25)
        assert telemetry["downlink"]["input_peak"] == pytest.approx(0.125)
        assert telemetry["uplink"]["input_age_ms"] is not None
        assert np.allclose(up.output.stream.render(), 0.25)
        assert np.all(down.output.stream.render() > 0.5)
        assert not gateway.providers[0].input
        wait_until(lambda: bool(gateway.providers[1].input))

        fenced_generation = up.session.playback_generation
        key.clear()
        wait_until(lambda: gateway.active == 2 and len(gateway.providers) == 3 and up.output.enabled)
        assert up.session.epoch == 1 and down.session.epoch == 0
        assert up.session.playback_generation > fenced_generation
        assert np.allclose(up.output.stream.render(), 0)
        client.portal.call(captures[INPUT_NAMES[0]].put, 0.3)
        wait_until(lambda: bool(gateway.providers[2].input))
        assert client.delete(url, headers=AUTH).json()["state"] == "closed"
        assert gateway.active == 0 and all(capture.closed for capture in captures.values())
        assert app.state.backend.session_manager.slot_holder is None


@pytest.mark.parametrize("cancel", [True, False])
def test_meeting_second_lane_failure_or_cancel_releases_everything(audio, cancel):
    captures, _ = audio
    gateway = Gateway(block=cancel, fail=not cancel)
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client, ThreadPoolExecutor(max_workers=1) as executor:
        body = config()
        request = executor.submit(client.post, "/api/v2/meetings", json=body, headers=AUTH)
        assert gateway.second.wait(5)
        url = f"/api/v2/meetings/{body['command_id']}"
        if cancel:
            assert client.delete(url, headers=AUTH).json()["state"] == "closed"
            assert request.result(timeout=5).json()["state"] == "closed"
        else:
            assert request.result(timeout=5).json()["error"]["safe_details"]["direction"] == "downlink"
            assert client.get(url, headers=AUTH).json()["state"] == "failed"
        assert gateway.active == 0 and all(capture.closed for capture in captures.values())
        assert app.state.backend.session_manager.slot_holder is None
        assert not app.state.backend.pipeline_registry.provider_connections


async def test_native_mix_ducks_during_speech_and_restores_afterwards(audio):
    output = meeting_audio.MeetingOutput(config()["downlink_output_id"], 0.25, monitor=True)
    try:
        output.set_route(True)
        output.add_original(np.full(320, 0.4, np.float32))
        done = output.add_translation(b"\x00\x20" * 320, 16000, 1, last=True)
        block = output.stream.render()
        assert 0.35 < block[-1] < block[0] < 0.65
        assert await asyncio.wait_for(done, 1)
        for _ in range(30):
            output.add_original(np.full(320, 0.4, np.float32))
            block = output.stream.render()
        assert block[-1] == pytest.approx(0.4, abs=0.001)
    finally:
        output.close()


@pytest.mark.parametrize("last_source,translation,expected", [
    ({"segment_id": "next", "source_revision": 1}, {}, None),
    ({"segment_id": "first", "source_revision": 2}, {}, None),
    ({}, {}, "Translated phrase"),
    ({}, {"source_refs": ["first"], "segment_id": "s2s-target", "origin": "s2s"}, "Translated phrase"),
    ({}, {"source_refs": ["first", "second"], "origin": "s2s"}, None),
    ({}, {"source_refs": [], "segment_id": "s2s-target", "origin": "s2s"}, None),
    ({}, {"target_language": "ja"}, None),
])
def test_route_telemetry_only_pairs_translation_with_current_source_revision(last_source, translation, expected):
    source = {"segment_id": "first", "source_revision": 1, "text": "Spoken phrase"}
    translated = {"segment_id": "first", "based_on_source_revision": 1, "text": "Translated phrase",
                  "target_language": "en", **translation}
    events = [SimpleNamespace(epoch=0, event_type="source_text", payload=source),
              SimpleNamespace(epoch=0, event_type="translated_text", payload=translated)]
    if last_source:
        events.append(SimpleNamespace(epoch=0, event_type="source_text", payload={**source, **last_source}))
    for i, event in enumerate(events):
        event.event_seq = i + 1
        event.emitted_at_unix_ms = 1000 + i
    session = SimpleNamespace(session_id="fixture", epoch=0, _log=SimpleNamespace(_ring=events),
                              config=SimpleNamespace(speech_target_language="en"))
    route = meeting._Route(session, None, "uplink", "output")
    assert route.telemetry().get("translated_text") == expected
    assert route.telemetry()["source_text"] == "Spoken phrase"
    session.epoch = 1
    assert "source_text" not in route.telemetry() and "translated_text" not in route.telemetry()


def test_cascade_transcribes_translates_and_synthesizes_both_directions(audio, monkeypatch):
    class Cascade(FakeGateway):
        def __init__(self):
            super().__init__()
            del self.release
            self.transcribed = []
            self.synthesized = []
            self.asr_slot = asyncio.Lock()

        async def acquire(self, request):
            assert request.model_id == "resource:test-asr"
            return None, None, None, None

        async def release(self, instance, lease):
            pass

        async def transcribe(self, ctx, *, audio, language, request):
            async with self.asr_slot:
                await asyncio.sleep(0.01)
                assert np.frombuffer(audio, dtype="<i2").max() > 0
                self.transcribed.append(ctx.pipeline_id)
                return AsrObservation("Spoken phrase", language=language, is_final=True)

        async def synthesize(self, ctx, *, text, voice, request):
            self.synthesized.append((ctx.pipeline_id, text))
            return SynthesisResult([SynthesisChunk(b"\x00\x20" * 320, 16000, terminal=True)])

        async def shutdown(self):
            pass

    captures, _ = audio
    monkeypatch.setattr(SileroVadSegmenter, "load", lambda self: None)
    monkeypatch.setattr(SileroVadSegmenter, "_speech_probability", lambda self, samples: 0.9 if np.any(samples) else 0.0)
    monkeypatch.setattr("nola_translator_engine.recognition.speaker.SpeakerEmbedder", lambda: None)
    gateway = Cascade()
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        body = config("cascade")
        response = client.post("/api/v2/meetings", json=body, headers=AUTH)
        assert response.status_code == 201, response.text
        group = next(iter(app.state.backend.meetings.values()))

        def put_utterances():
            for capture in captures.values():
                for value in [0.25] * 20 + [0] * 30:
                    capture.put(value)

        client.portal.call(put_utterances)
        wait_until(lambda: all(route.output.translation_samples for route in group.routes))
        assert len(set(gateway.transcribed)) == 2
        assert {text for _, text in gateway.synthesized} == {"en:Spoken phrase", "zh:Spoken phrase"}
        telemetry = group.snapshot()["telemetry"]
        assert telemetry["uplink"]["source_text"] == "Spoken phrase"
        assert telemetry["uplink"]["translated_text"] == "en:Spoken phrase"
        assert telemetry["downlink"]["translated_text"] == "zh:Spoken phrase"
        assert all(route["playback"] == "playing" for route in telemetry.values())
        assert all(np.max(route.output.stream.render()) >= 0.25 for route in group.routes)
        wait_until(lambda: all(route["playback"] == "finished" for route in group.snapshot()["telemetry"].values()))


def test_meeting_rejects_invalid_topology_and_closes_on_device_loss(audio):
    captures, _ = audio
    gateway = Gateway()
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        body = config()
        invalid = {**body, "uplink_output_id": "not-a-cable"}
        assert client.post("/api/v2/meetings", json=invalid, headers=AUTH).json()["error"]["message_key"] == "meeting.audioOutputUnavailable"
        assert not gateway.providers
        assert client.post("/api/v2/meetings", json=body, headers=AUTH).status_code == 201
        group = next(iter(app.state.backend.meetings.values()))
        client.portal.call(group.routes[1].output.stream.close)
        wait_until(lambda: group.state == "failed")
        assert group.last_error.code == "PLAYBACK_DEVICE_LOST"
        assert group.last_error.safe_details["direction"] == "downlink"
        assert gateway.active == 0 and all(capture.closed for capture in captures.values())


async def test_meeting_post_disconnect_cancels_partially_started_group(audio):
    captures, _ = audio
    gateway = Gateway(block=True)
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    body = config()
    messages = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": json.dumps(body).encode(), "more_body": False}
        assert await asyncio.to_thread(gateway.second.wait, 5)
        return {"type": "http.disconnect"}

    async def send(message):
        messages.append(message)

    async with app.router.lifespan_context(app):
        await asyncio.wait_for(app({
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "scheme": "http",
            "method": "POST", "path": "/api/v2/meetings", "root_path": "", "query_string": b"",
            "headers": [(key.encode(), value.encode()) for key, value in {**AUTH, "content-type": "application/json"}.items()],
        }, receive, send), timeout=6)
        assert gateway.active == 0 and all(capture.closed for capture in captures.values())
        assert app.state.backend.session_manager.slot_holder is None


def test_registered_livetranslate_model_admits_two_live_sessions(audio, monkeypatch):
    registry, adapters = ModelRegistry(), AdapterRegistry()
    register_s2s(registry, adapters)
    adapter = adapters.resolve(Operation.S2S_SESSION, "aliyun-livetranslate")
    providers = []

    async def open_simulated(instance, ctx, *, config):
        assert instance.definition.model_id == MODELS[0]
        providers.append(Provider([]))
        return providers[-1]

    monkeypatch.setattr(adapter, "open", open_simulated)
    gateway = ModelGateway(registry=registry, adapters=adapters)
    with TestClient(create_app(control_token="test", gateway=gateway, enable_gateway=True)) as client:
        body = config()
        response = client.post("/api/v2/meetings", json=body, headers=AUTH)
        assert response.status_code == 201, response.text
        assert len(providers) == 2 and not any(provider.closed for provider in providers)
        assert client.delete(f"/api/v2/meetings/{body['command_id']}", headers=AUTH).json()["state"] == "closed"
        assert all(provider.closed for provider in providers)


@pytest.mark.parametrize("enabled", ["uplink", "downlink"])
def test_single_direction_allocates_only_one_session_and_releases(audio, enabled):
    gateway = Gateway()
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        body = config()
        disabled = "downlink" if enabled == "uplink" else "uplink"
        del body[disabled]
        body[f"{disabled}_output_id"] = ""
        response = client.post("/api/v2/meetings", json=body, headers=AUTH)
        assert response.status_code == 201, response.text
        result = response.json()
        assert enabled in result and disabled not in result
        assert gateway.active == 1
        assert client.patch(f"/api/v2/meetings/{body['command_id']}", json={"paused": True}, headers=AUTH).json()["paused"]
        assert gateway.active == 0
        resumed = client.patch(f"/api/v2/meetings/{body['command_id']}", json={"paused": False}, headers=AUTH)
        assert resumed.status_code == 200, resumed.text
        assert resumed.json()["state"] == "running" and not resumed.json()["paused"]
        assert gateway.active == 1
        assert client.delete(f"/api/v2/meetings/{body['command_id']}", headers=AUTH).status_code == 200
        assert gateway.active == 0


def test_transcript_revisions_speaker_updates_epoch_and_direction_are_isolated():
    session = SimpleNamespace(session_id=uuid4(), epoch=0, config=SimpleNamespace(speech_target_language="en"))
    session._log = SimpleNamespace(_ring=[], epoch=0)
    def submit(kind, payload):
        session._log._ring.append(SimpleNamespace(event_type=kind, payload=payload, epoch=session._log.epoch,
            event_seq=len(session._log._ring) + 1, emitted_at_unix_ms=1000 + len(session._log._ring)))
    route = meeting._Route(session, None, "uplink", "output")
    submit("source_text", {"segment_id": "same", "source_revision": 1, "text": "First", "audio_span": {"start_sample": 16000, "end_sample": 32000}})
    submit("translated_text", {"segment_id": "same", "based_on_source_revision": 1, "target_revision": 1, "target_language": "en", "text": "One"})
    assert len(route.transcript()) == 1
    assert route.transcript()[0]["startedAtMs"] == 1000
    submit("source_committed", {"segment_id": "same", "source_revision": 2, "text": "Final"})
    submit("translated_text", {"segment_id": "same", "based_on_source_revision": 1, "target_revision": 2, "target_language": "en", "text": "Stale"})
    submit("speaker_changed", {"segment_id": "same", "speaker_id": "speaker-2", "speaker_metadata_revision": 2})
    submit("speaker_changed", {"segment_id": "same", "speaker_id": "stale", "speaker_metadata_revision": 1})
    row = route.transcript()[0]
    assert row["sourceText"] == "Final" and row["isFinal"] and not row["translations"]
    assert row["speakerId"] == "speaker-2" and row["direction"] == "uplink"
    assert route.transcript() == [row]
    session.epoch = 1
    session._log.epoch = 1
    submit("source_committed", {"segment_id": "same", "source_revision": 1, "text": "New epoch"})
    assert len(route.transcript()) == 2
    assert route.transcript()[0]["segmentId"] != route.transcript()[1]["segmentId"]


def test_application_audio_does_not_monitor_original_and_accepts_one_standard_cable(audio, monkeypatch):
    captures, _ = audio
    body = config()
    body["downlink"]["input"] = {"kind": "process_audio", "capture_backend": "windows_process_include", "process_selection_id": "fixture"}
    capture = Capture()
    monkeypatch.setattr(meeting, "_desktop_backend", lambda config: capture if config.kind == "process_audio" else captures[config.device_id])
    gateway = Gateway()
    app = create_app(control_token="test", gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        response = client.post("/api/v2/meetings", json=body, headers=AUTH)
        assert response.status_code == 201, response.text
        group = next(iter(app.state.backend.meetings.values()))
        down = next(route for route in group.routes if route.name == "downlink")
        assert down.original_since == float("inf")
        assert client.delete(f"/api/v2/meetings/{body['command_id']}", headers=AUTH).status_code == 200
