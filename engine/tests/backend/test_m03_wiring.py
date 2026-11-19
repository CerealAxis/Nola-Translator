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


def test_settings_preview_streams_only_levels_and_releases_capture(monkeypatch):
    import numpy as np
    from nola_translator_engine.audio.resample import AudioFrame
    from nola_translator_engine.backend import desktop_capture

    class Capture:
        async def start(self):
            calls.append("start")

        async def frames(self):
            yield AudioFrame(np.array([-0.45, 0.1], dtype=np.float32), 0)

        def stop(self):
            calls.append("stop")

    calls = []

    def open_selected(config):
        assert (config.kind, config.device_id) == ("microphone", "mic-1")
        return Capture()

    monkeypatch.setattr(desktop_capture, "_desktop_backend", open_selected)
    with TestClient(make_app()) as client:
        route = "/api/v2/audio/input-levels"
        config = {"kind": "microphone", "device_id": "mic-1", "capture_backend": "device"}
        assert client.post(route, json=config).status_code == 401
        assert client.post(route, headers=auth(), json=config).text == "0\n45\n"
        assert calls == ["start", "stop"]
        create_session(client)
        assert client.post(route, headers=auth(), json=config).text == "error\n"
        assert calls == ["start", "stop"]


@pytest.mark.parametrize("failure,stage,code,message_key,exception", [
    ("vad", "vad", "MODEL_NOT_READY", "gateway.LOAD_FAILED", "GatewayError"),
    ("missing_device", "capture", "AUDIO_SOURCE_UNAVAILABLE", "audio.deviceUnavailable", "AudioDeviceUnavailableError"),
    ("host_error", "capture", "AUDIO_SOURCE_UNAVAILABLE", "audio.captureStartFailed", "OSError"),
    ("unknown", "capture", "INTERNAL_ERROR", "pipeline.startFailed", "RuntimeError"),
])
def test_start_failure_reports_stage_and_allows_retry(monkeypatch, failure, stage, code, message_key, exception):
    from nola_translator_engine.audio.devices import AudioDeviceRegistry, AudioDeviceUnavailableError
    from nola_translator_engine.backend.asr_pipeline import AsrPipeline
    from nola_translator_engine.recognition.volume_gate import SileroVadSegmenter
    from onnxruntime.capi.onnxruntime_pybind11_state import Fail

    async def acquire(_request):
        return None, None, None, None

    async def no_op(*_args):
        pass

    def load(_gate):
        raise Fail("private ONNX error detail")

    async def fail_cleanup(_pipeline):
        raise RuntimeError("cleanup failed as well")

    def resolve(_registry, _kind, _device_id):
        if failure == "host_error":
            raise OSError(-9999, "private device detail")
        if failure == "unknown":
            raise RuntimeError("private device detail")
        raise AudioDeviceUnavailableError("Selected microphone is unavailable")

    if failure == "vad":
        monkeypatch.setattr(SileroVadSegmenter, "load", load)
        monkeypatch.setattr(AsrPipeline, "close", fail_cleanup)
    else:
        monkeypatch.setattr(AsrPipeline, "prepare", no_op)
    monkeypatch.setattr(AudioDeviceRegistry, "resolve", resolve)
    gateway = SimpleNamespace(shutdown=no_op, acquire=acquire, release=no_op)
    app = create_app(control_token=TOKEN, gateway=gateway, enable_gateway=True)
    with TestClient(app) as client:
        session_id = create_session(client)
        response = client.post(f"/api/v2/sessions/{session_id}/commands", headers=auth(),
                               json={"command_id": "start", "type": "start"})
        assert response.status_code == 202
        assert response.json()["result_state"] == "failed"
        error = client.get(f"/api/v2/sessions/{session_id}", headers=auth()).json()["last_error"]
        assert (error["code"], error["stage"], error["message_key"]) == (code, stage, message_key)
        assert uuid.UUID(error["correlation_id"])
        details = error["safe_details"]
        assert details["exception"] == exception
        if failure == "vad":
            assert details["cause_exception"] == "Fail"
            assert ".load:" in details["cause_origin"]
        if failure == "host_error":
            assert details["errno"] == -9999
        assert "private" not in json.dumps(error)
        assert create_session(client) != session_id


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
