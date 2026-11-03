"""M03 wiring tests: the input WS delegates to AudioIngestion and the routing
preflight is reachable over the private REST surface.

These cover the three wiring items the M03 delivery left open (doc 11 M03):
input_ws -> AudioIngestion, preflight -> REST, and the process-exclude tree
requirement. They are deterministic: the preflight cases exercised here are the
topology checks that run before any COM capability probe.
"""

from __future__ import annotations

import json
import struct
import uuid
from contextlib import contextmanager
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.backend import create_app

TOKEN = "test-control-token"


def make_app(tmp_path=None):
    kwargs = {"control_token": TOKEN, "instance_id": "test-instance"}
    if tmp_path is not None:
        kwargs["journal_dir"] = tmp_path
    return create_app(command_effect=lambda _session, command: "running" if command.type == "start" else None, **kwargs)


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}


def cascade_config(**overrides) -> dict:
    config = {
        "pipeline": {"kind": "cascade", "asr_model": "resource:test-asr"},
        "input": {"kind": "microphone", "device_id": "mic-1"},
        "source_language": "auto",
        "target_languages": ["zh"],
        "required_outputs": ["source_text"],
    }
    config.update(overrides)
    return config


def create_session(client: TestClient) -> str:
    response = client.post(
        "/api/v2/sessions",
        headers=auth(),
        json={"command_id": f"cmd-{uuid.uuid4()}", "owner": "quick_interpret", "config": cascade_config()},
    )
    assert response.status_code == 201, response.text
    return response.json()["session_id"]


def frame(handle: int, epoch: int, seq: int, sample_start: int, samples: bytes) -> bytes:
    count = len(samples) // 2
    return struct.pack(
        "<4sBBHIIQQII", b"NOLA", 1, 1, 40, handle, epoch, seq, sample_start, count, len(samples)
    ) + samples


# ---------------------------------------------------------------------------
# input_ws -> AudioIngestion
# ---------------------------------------------------------------------------


def test_input_ws_feeds_session_ingestion() -> None:
    app = make_app()
    with TestClient(app) as client:
        sid = create_session(client)
        client.post(f"/api/v2/sessions/{sid}/commands", headers=auth(), json={"command_id": "c1", "type": "start"})

        with client.websocket_connect(f"/api/v2/sessions/{sid}/input", headers=auth()) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "stream_open",
                        "stream_handle": 3,
                        "epoch": 0,
                        "encoding": "pcm_s16le",
                        "sample_rate": 16000,
                        "channels": 1,
                    }
                )
            )
            assert json.loads(ws.receive_text())["frame"] == "stream_opened"

            payload = b"\x00\x01" * 320  # 320 samples = 20 ms @ 16 kHz
            ws.send_bytes(frame(3, 0, 0, 0, payload))
            ack = json.loads(ws.receive_text())
            assert ack["frame"] == "audio_accepted"
            assert ack["through_sample"] == 320

        # The session's AudioIngestion actually ingested the frame; the M04
        # pipeline will consume normalized frames/windows from this instance.
        ingestion = app.state.backend.ingestions[uuid.UUID(sid)]
        assert ingestion.accepted_frames == 1
        assert ingestion.gap_events == 0


def test_input_ws_gap_is_published_to_session_log() -> None:
    app = make_app()
    with TestClient(app) as client:
        sid = create_session(client)
        with client.websocket_connect(f"/api/v2/sessions/{sid}/input", headers=auth()) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "stream_open",
                        "stream_handle": 1,
                        "epoch": 0,
                        "encoding": "pcm_s16le",
                        "sample_rate": 16000,
                        "channels": 1,
                    }
                )
            )
            ws.receive_text()
            payload = b"\x00\x01" * 320
            ws.send_bytes(frame(1, 0, 0, 0, payload))
            assert json.loads(ws.receive_text())["frame"] == "audio_accepted"
            # Skip seq 1..4 -> transport gap on seq 5.
            ws.send_bytes(frame(1, 0, 5, 1600, payload))
            err = json.loads(ws.receive_text())
            assert err["frame"] == "error"
            assert err["error"]["code"] == "AUDIO_GAP"

        ingestion = app.state.backend.ingestions[uuid.UUID(sid)]
        assert ingestion.gap_events == 1


# ---------------------------------------------------------------------------
# preflight -> REST (deterministic topology checks, no COM probe)
# ---------------------------------------------------------------------------


def test_preflight_rejects_process_exclude_without_playback_tree() -> None:
    with TestClient(make_app()) as client:
        response = client.post(
            "/api/v2/audio/preflight",
            headers=auth(),
            json={"input_mode": "process_exclude", "excluded_process_tree": []},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["safe"] is False
        assert body["feedback_status"] == "unsafe"
        assert any(issue["code"] == "missing_exclude_tree" for issue in body["issues"])


def test_preflight_detects_feedback_loop() -> None:
    with TestClient(make_app()) as client:
        response = client.post(
            "/api/v2/audio/preflight",
            headers=auth(),
            json={
                "input_mode": "endpoint_loopback",
                "input_endpoint_id": "spk-1",
                "speech_output_endpoint_id": "spk-1",
            },
        )
        body = response.json()
        assert body["safe"] is False
        assert any(issue["code"] == "feedback_loop" for issue in body["issues"])


def test_preflight_validates_microphone_route() -> None:
    with TestClient(make_app()) as client:
        response = client.post(
            "/api/v2/audio/preflight",
            headers=auth(),
            json={"input_mode": "microphone", "input_endpoint_id": "mic-1"},
        )
        body = response.json()
        # known_endpoint_ids is best-effort (None here), so existence is not
        # checked and a well-formed microphone route validates.
        assert body["feedback_status"] == "validated"
        assert body["safe"] is True


def test_virtual_preflight_resolves_recording_endpoint_but_cannot_verify_chromium_sink(monkeypatch) -> None:
    from nola_translator_engine.audio.devices import AudioDeviceRegistry, AudioDeviceUnavailableError

    def resolve(_registry, kind, device_id):
        assert kind == "microphone"
        if device_id != "recording-endpoint":
            raise AudioDeviceUnavailableError(device_id)
        return SimpleNamespace(name="CABLE Output (VB-Audio Virtual Cable)")

    monkeypatch.setattr(AudioDeviceRegistry, "resolve", resolve)
    route = {
        "input_mode": "virtual_input",
        "input_endpoint_id": "recording-endpoint",
        "speech_output_endpoint_id": "chromium-sink",
        "speech_output_endpoint_is_opaque": True,
    }
    with TestClient(make_app()) as client:
        response = client.post("/api/v2/audio/preflight", headers=auth(), json=route).json()
        assert response["safe"] is False
        assert response["feedback_status"] == "unknown"
        assert response["issues"] == []
        assert response["recording_device_name"] == "CABLE Output (VB-Audio Virtual Cable)"

        route["input_endpoint_id"] = "removed-endpoint"
        response = client.post("/api/v2/audio/preflight", headers=auth(), json=route).json()
        assert response["feedback_status"] == "unsafe"
        assert response["issues"][0]["code"] == "input_endpoint_missing"


def test_preflight_rejects_unknown_input_mode() -> None:
    with TestClient(make_app()) as client:
        response = client.post(
            "/api/v2/audio/preflight", headers=auth(), json={"input_mode": "bogus"}
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVALID_CONFIG"


def test_preflight_requires_auth() -> None:
    with TestClient(make_app()) as client:
        assert client.post("/api/v2/audio/preflight", json={"input_mode": "microphone"}).status_code == 401


# ---------------------------------------------------------------------------
# route_from_input_config: the excluded tree comes verbatim from Electron
# ---------------------------------------------------------------------------


def test_route_from_input_config_carries_real_playback_tree() -> None:
    from nola_translator_engine.backend.contracts import InputConfig
    from nola_translator_engine.backend.routing import route_from_input_config

    config = InputConfig(
        kind="system_audio",
        capture_backend="windows_process_exclude",
        excluded_process_tree=(4242, 8080, 9090),
    )
    route = route_from_input_config(config, speech_output_endpoint_id="spk-1")
    assert route.input_mode == "process_exclude"
    # Electron's real playback tree is passed through unchanged (main + children).
    assert route.excluded_process_tree == (4242, 8080, 9090)
    assert route.speech_output_endpoint_id == "spk-1"


def test_route_from_input_config_never_autofills_backend_pid() -> None:
    from nola_translator_engine.backend.contracts import InputConfig
    from nola_translator_engine.backend.routing import preflight_route, route_from_input_config

    # An empty tree stays empty: preflight must flag it, not silently loop.
    config = InputConfig(kind="system_audio", capture_backend="windows_process_exclude")
    route = route_from_input_config(config)
    assert route.excluded_process_tree == ()
    result = preflight_route(route)
    assert result.safe is False
    assert any(issue.code == "missing_exclude_tree" for issue in result.issues)


def test_route_distinguishes_system_audio_and_selected_process() -> None:
    from nola_translator_engine.backend.contracts import InputConfig
    from nola_translator_engine.backend.routing import route_from_input_config

    assert route_from_input_config(InputConfig(kind="system_audio")).input_mode == "endpoint_loopback"
    selection = InputConfig(kind="process_audio", process_selection_id="selection")
    assert route_from_input_config(selection).input_mode == "process_include"
    mic = route_from_input_config(InputConfig(kind="microphone", device_id="mic-1"))
    assert mic.input_mode == "microphone" and mic.input_endpoint_id == "mic-1"


def test_process_list_is_private_and_selection_rejects_reused_pid(monkeypatch) -> None:
    from nola_translator_engine.backend import process_sources as sources

    monkeypatch.setattr(sources, "sys", SimpleNamespace(platform="win32"))
    monkeypatch.setattr(sources, "_windows_build", lambda: 26200)
    monkeypatch.setattr(sources, "_processes", lambda: {400: (0, "Player.exe"), 401: (400, "renderer.exe"), 402: (0, "Headless.exe")})
    monkeypatch.setattr(sources, "_windows", lambda: {400: "Player"})
    monkeypatch.setattr(sources, "_audio_sessions", lambda: {401: True, 402: False})
    monkeypatch.setattr(sources, "_selections", {})
    monkeypatch.setattr(sources, "_alive", lambda _: True)
    created = {400: 10, 402: 11}
    monkeypatch.setattr(sources, "_created", created.__getitem__)

    @contextmanager
    def fake_process(pid):
        yield pid

    monkeypatch.setattr(sources, "_process", fake_process)
    with TestClient(make_app()) as client:
        assert client.get("/api/v2/audio/processes").status_code == 401
        rows = client.get("/api/v2/audio/processes", headers=auth()).json()["processes"]
        from nola_translator_engine.backend.capture_process_loopback import ProcessLoopbackCapability, ProcessLoopbackCapture

        def probe(_class, pid, *, mode):
            assert pid == 400 and mode == "include"
            return ProcessLoopbackCapability(True, "ok")

        monkeypatch.setattr(ProcessLoopbackCapture, "probe", classmethod(probe))
        route = {"input_mode": "process_include", "process_selection_id": rows[0]["selection_id"]}
        assert client.post("/api/v2/audio/preflight", headers=auth(), json=route).json()["safe"] is True
    assert [(row["pid"], row["active"]) for row in rows] == [(400, True), (402, False)]
    token = rows[0]["selection_id"]
    with sources.open_selection(token) as (pid, alive):
        assert pid == 400 and alive()
    created[400] += 1
    with pytest.raises(sources.ProcessSourceError, match="process_exited"):
        with sources.open_selection(token):
            pytest.fail("reused PID was accepted")
