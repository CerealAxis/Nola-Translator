import asyncio
from contextlib import asynccontextmanager
import json
from time import monotonic, sleep
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.audio.resample import AudioFrame
from nola_translator_engine.backend.contracts import EVENT_TYPE_TO_PAYLOAD, parse_audio_frame
from nola_translator_engine.backend.s2s_pipeline import S2SPipeline
from nola_translator_engine.backend.s2s_provider import S2SObservation, S2SProtocolError
from nola_translator_engine.backend.app import create_app
from nola_translator_engine.backend.s2s_provider import MODELS
from test_m03_wiring import TOKEN, auth
from test_m03_wiring import frame as pcm_frame


class Provider:
    def __init__(self, observations):
        self.events = observations
        self.input = []
        self.finished = asyncio.Event()
        self.closed = False

    async def append_audio(self, pcm):
        self.input.append(pcm)

    async def finish(self):
        self.finished.set()

    async def close(self):
        self.closed = True

    async def observations(self):
        await self.finished.wait()
        for observation in self.events:
            yield observation


def new_session():
    return SimpleNamespace(
        epoch=0, pipeline_id="pipeline", source_revision_watermark=0, target_revision_watermark=0,
        config=SimpleNamespace(source_language="auto", target_languages=("en",), speech_target_language="en"),
    )


def test_s2s_maps_provider_events_and_sends_silence_without_vad():
    async def run():
        provider = Provider([
            S2SObservation("source", "source", ended_at_ms=20, speech_stopped=True),
            S2SObservation("source", "source", ended_at_ms=20, speech_stopped=True),
            S2SObservation("source", "source", text="Salut", final=True, speaker_id=1,
                           started_at_ms=0, ended_at_ms=20, language="fr"),
            S2SObservation("audio", "target", "response", source_ids=("source",), pcm=b"\0\0", sample_rate=24000),
            S2SObservation("target", "target", "response", text="Hel"),
            S2SObservation("target", "target", "response", text="Hello", final=True, source_ids=("source",)),
            S2SObservation("response", response_id="response", status="completed"),
            S2SObservation("target", "another-target", "another-response", text="No source", final=True),
            S2SObservation("source", "another-source", text="No separate stop", final=True),
        ])
        events = []
        audio = []

        def emit(kind, payload):
            events.append((kind, EVENT_TYPE_TO_PAYLOAD[kind].model_validate(payload)))

        async def on_audio(observation, translation_id, segment_id):
            audio.append((observation, translation_id, segment_id))

        pipeline = S2SPipeline(new_session(), provider, emit, on_audio=on_audio, latency_detection=True)
        await pipeline.accept(AudioFrame(np.zeros(320, dtype=np.float32), 10), 160)
        await pipeline.finish()
        await pipeline.close()

        assert provider.input == [bytes(640)] and provider.closed
        committed_source = next(payload for kind, payload in events if kind == "source_committed")
        (boundary,) = [payload for kind, payload in events if kind == "latency_observation"]
        assert events[0][1] is boundary
        assert boundary.kind == "segment_boundary" and boundary.segment_id == committed_source.segment_id
        assert committed_source.cutoff_sample == 480
        assert committed_source.speaker_id == "provider:1"
        target, no_source = (payload for kind, payload in events if kind == "translation_committed")
        assert target.source_refs == (committed_source.segment_id,)
        assert target.based_on_source_revision == 1
        assert target.translation_id == audio[0][1]
        assert audio[0][2] == committed_source.segment_id
        assert audio[1][0].status == "completed"
        assert no_source.source_refs == ()
        assert no_source.based_on_source_revision == 0
        assert all(kind != "synthesis_state" for kind, _ in events)

    asyncio.run(run())


def test_s2s_close_stops_output_and_gap_does_not_become_contiguous_input():
    async def run():
        provider = Provider([S2SObservation("source", "source", text="Late", final=True)])
        events = []
        pipeline = S2SPipeline(new_session(), provider, lambda kind, payload: events.append(kind))
        frame = AudioFrame(np.zeros(320, dtype=np.float32), 0)
        await pipeline.accept(frame, 0)
        with pytest.raises(S2SProtocolError, match="provider_input_gap"):
            await pipeline.accept(frame, 640)
        await pipeline.close()
        provider.finished.set()
        await asyncio.sleep(0)
        assert provider.closed and not events and provider.input == [bytes(640)]

    asyncio.run(run())


@pytest.mark.parametrize("disconnect", [False, True])
def test_fastapi_s2s_starts_and_releases_provider_on_stop(disconnect):
    class DisconnectedProvider(Provider):
        async def observations(self):
            raise S2SProtocolError("provider_connection_closed")
            yield

    class Gateway:
        attempts = 0

        @asynccontextmanager
        async def s2s_session(self, ctx, *, request, config):
            if request.model_id != MODELS[0] or config["api_key"] != "fixture-key":
                raise ValueError("unexpected configuration")
            self.attempts += 1
            self.provider = DisconnectedProvider([]) if disconnect and self.attempts == 1 else Provider([])
            try:
                yield self.provider
            finally:
                self.released = True

        async def shutdown(self):
            pass

    gateway = Gateway()
    app = create_app(control_token=TOKEN, gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        response = client.post("/api/v2/sessions", headers=auth(), json={
            "command_id": "s2s-create", "owner": "quick_interpret", "config": {
                "pipeline": {"kind": "s2s", "s2s_model": MODELS[0]},
                "input": {"kind": "microphone"}, "target_languages": ["en"],
                "required_outputs": ["source_text", "translated_text"],
            },
        })
        session_id = response.json()["session_id"]
        route = f"/api/v2/sessions/{session_id}/commands"
        start = client.post(route, headers={
            **auth(), "x-nola-provider-key": "fixture-key", "x-nola-provider-workspace": "fixture",
        }, json={"command_id": "s2s-start", "type": "start"})
        assert start.json()["result_state"] == "running"
        assert "fixture-key" not in start.text
        if disconnect:
            deadline = monotonic() + 3
            while True:
                snapshot = client.get(f"/api/v2/sessions/{session_id}", headers=auth()).json()
                if snapshot["state"] == "running" and snapshot["epoch"] == 1:
                    break
                assert monotonic() < deadline, snapshot
                sleep(0.01)
            assert gateway.attempts == 2 and gateway.provider.input == []
        stop = client.post(route, headers=auth(), json={"command_id": "s2s-stop", "type": "stop"})
        assert stop.json()["result_state"] == "closed"
        assert gateway.provider.closed and gateway.released
        assert not app.state.backend.pipeline_registry.provider_connections


@pytest.mark.parametrize("model", MODELS)
def test_fastapi_s2s_delivers_native_pcm_without_synthesis(model):
    class Gateway:
        @asynccontextmanager
        async def s2s_session(self, ctx, *, request, config):
            assert request.model_id == model and "speech" in request.required_outputs
            assert "audio" in config["outputs"]
            yield Provider([
                S2SObservation("audio", "target", "response", pcm=b"\x01\x00" * 240, sample_rate=24000),
                S2SObservation("audio", "target", "response", chunk_seq=1, sample_rate=24000, audio_done=True),
                S2SObservation("response", response_id="response", status="completed"),
            ])

        async def shutdown(self):
            pass

    with TestClient(create_app(control_token=TOKEN, gateway=Gateway(), enable_gateway=True)) as client:
        response = client.post("/api/v2/sessions", headers=auth(), json={
            "command_id": "create-s2s-audio", "owner": "quick_interpret", "config": {
                "pipeline": {"kind": "s2s", "s2s_model": model}, "input": {"kind": "microphone"},
                "target_languages": ["en"], "speech_target_language": "en", "required_outputs": ["audio"],
            },
        })
        route = f"/api/v2/sessions/{response.json()['session_id']}"
        start = client.post(route + "/commands", headers={
            **auth(), "x-nola-provider-key": "fixture-key", "x-nola-provider-workspace": "fixture",
        }, json={"command_id": "start-s2s-audio", "type": "start"})
        assert start.json()["result_state"] == "running"
        with client.websocket_connect(route + "/audio", headers=auth()) as audio:
            audio.send_json({"frame": "hello", "consumer_id": "native-owner"})
            assert audio.receive_json()["playback_owner_id"] == "native-owner"
            with client.websocket_connect(route + "/input", headers=auth()) as stream:
                stream.send_json({"frame": "stream_open", "stream_handle": 1, "epoch": 0,
                                  "sample_rate": 16000, "channels": 1, "encoding": "pcm_s16le"})
                assert stream.receive_json()["frame"] == "stream_opened"
                stream.send_bytes(pcm_frame(1, 0, 0, 0, bytes(640)))
                assert stream.receive_json()["frame"] == "audio_accepted"
                stream.send_json({"frame": "stream_close", "stream_handle": 1, "eof": True})
                packets = []
                while len(packets) < 2:
                    message = audio.receive()
                    if "bytes" in message:
                        header, payload = parse_audio_frame(message["bytes"], bytes_per_sample=2, channels=1)
                        packets.append((header.sample_start, len(payload)))
                    else:
                        event = json.loads(message["text"])
                        if event.get("event_type") == "audio_stream_opened":
                            assert event["payload"]["origin"] == "s2s"
                        assert event.get("event_type") != "synthesis_state"
                assert packets == [(0, 480), (240, 0)]
