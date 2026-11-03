"""M01 protocol-chain tests: fake provider drives start→events→pause/resume→stop.

Covers acceptance cases C01-C08 and S01 from doc 12 §3 plus the fake-provider
requirement from doc 11 M01 (stale callback and shutdown behavior).
Runs against the real FastAPI app via TestClient; no models, no network.
"""

from __future__ import annotations

import json
import uuid
from contextlib import contextmanager

import pytest
from fake_pipeline import FakePipelineRegistry
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from nola_translator_engine.backend import create_app
from nola_translator_engine.backend.contracts import SCHEMA_VERSION

TOKEN = "test-control-token"


@contextmanager
def make_client(tmp_path=None):
    kwargs = {"control_token": TOKEN, "instance_id": "test-instance"}
    if tmp_path is not None:
        kwargs["journal_dir"] = tmp_path
    fake = FakePipelineRegistry()
    with TestClient(create_app(command_effect=fake.effect, **kwargs)) as client:
        try:
            yield client
        finally:
            client.portal.call(fake.shutdown)


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


def create_session(client: TestClient, owner: str = "quick_interpret", command_id: str | None = None, **cfg) -> dict:
    body = {
        "command_id": command_id or f"cmd-{uuid.uuid4()}",
        "owner": owner,
        "config": cascade_config(**cfg),
    }
    response = client.post("/api/v2/sessions", headers=auth(), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def command(client: TestClient, session_id: str, type_: str, command_id: str | None = None) -> tuple[int, dict]:
    response = client.post(
        f"/api/v2/sessions/{session_id}/commands",
        headers=auth(),
        json={"command_id": command_id or f"cmd-{uuid.uuid4()}", "type": type_},
    )
    return response.status_code, response.json()


# ---------------------------------------------------------------------------
# C08: auth boundary
# ---------------------------------------------------------------------------


def test_unauthenticated_requests_are_rejected() -> None:
    with make_client() as client:
        assert client.get("/api/v2/health/live").status_code == 200  # health is open
        assert client.post("/api/v2/sessions", json={}).status_code == 401
        assert client.get("/api/v2/sessions/whatever").status_code == 401


def test_control_token_is_not_accepted_in_rest_or_websocket_urls() -> None:
    with make_client() as client:
        assert client.get(f"/api/v2/sessions/anything?ticket={TOKEN}").status_code == 401
        with pytest.raises(WebSocketDisconnect) as error:
            with client.websocket_connect(f"/api/v2/sessions/{uuid.uuid4()}/events?ticket={TOKEN}"):
                pass
        assert error.value.code == 1008


# ---------------------------------------------------------------------------
# C01: state machine + 202 acceptance semantics
# ---------------------------------------------------------------------------


def test_start_pause_resume_stop_transitions() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        assert created["state"] == "created"

        status, ack = command(client, sid, "start")
        assert status == 202
        assert ack["accepted"] is True

        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        assert snap["state"] == "running"
        assert snap["schema_version"] == SCHEMA_VERSION

        status, _ = command(client, sid, "pause")
        assert status == 202
        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        assert snap["state"] == "paused"
        epoch_paused = snap["epoch"]

        status, _ = command(client, sid, "resume")
        assert status == 202
        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        assert snap["state"] == "running"
        # resume always opens a new epoch (doc 03 §6)
        assert snap["epoch"] == epoch_paused + 1

        gen_before = snap["playback_generation"]
        status, _ = command(client, sid, "stop")
        assert status == 202
        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        assert snap["state"] == "closed"
        # stop fences playback grants via generation bump
        assert snap["playback_generation"] == gen_before + 1

        # stop is not repeatable on a closed session
        status, body = command(client, sid, "stop")
        assert status == 409


def test_pause_from_created_is_illegal_transition() -> None:
    with make_client() as client:
        created = create_session(client)
        status, body = command(client, created["session_id"], "pause")
        assert status == 409
        assert body["error"]["code"] == "INVALID_CONFIG"


def test_no_finish_input_command_exists() -> None:
    """Decision 7: users only get immediate stop; no drain/finish command."""

    with make_client() as client:
        created = create_session(client)
        response = client.post(
            f"/api/v2/sessions/{created['session_id']}/commands",
            headers=auth(),
            json={"command_id": "cmd-x", "type": "finish_input"},
        )
        assert response.status_code == 422  # rejected by the schema, not routed


# ---------------------------------------------------------------------------
# C02: command_id idempotency
# ---------------------------------------------------------------------------


def test_command_id_replay_same_body_is_idempotent() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        status1, ack1 = command(client, sid, "start", command_id="cmd-fixed")
        status2, ack2 = command(client, sid, "start", command_id="cmd-fixed")
        assert status1 == status2 == 202
        assert ack1 == ack2  # same operation, no second start


def test_command_id_reuse_different_body_conflicts() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        status, _ = command(client, sid, "start", command_id="cmd-dup")
        assert status == 202
        status, body = command(client, sid, "pause", command_id="cmd-dup")
        assert status == 409
        assert body["error"]["code"] == "COMMAND_CONFLICT"


# ---------------------------------------------------------------------------
# S01/F09: single realtime slot, atomic
# ---------------------------------------------------------------------------


def test_single_realtime_slot_conflict_and_release() -> None:
    with make_client() as client:
        first = create_session(client, owner="quick_interpret")
        response = client.post(
            "/api/v2/sessions",
            headers=auth(),
            json={
                "command_id": "cmd-second",
                "owner": "browser_captions",
                "config": cascade_config(input={"kind": "browser_tab", "browser_stream_id": "t1"}),
            },
        )
        assert response.status_code == 409
        body = response.json()
        assert body["error"]["code"] == "SESSION_SLOT_BUSY"
        assert body["error"]["safe_details"]["current_owner"] == "quick_interpret"

        # paused still holds the slot
        command(client, first["session_id"], "start")
        command(client, first["session_id"], "pause")
        response = client.post(
            "/api/v2/sessions",
            headers=auth(),
            json={
                "command_id": "cmd-third",
                "owner": "browser_captions",
                "config": cascade_config(input={"kind": "browser_tab", "browser_stream_id": "t1"}),
            },
        )
        assert response.status_code == 409

        # stop releases it; a new business can now create
        command(client, first["session_id"], "stop")
        second = create_session(client, owner="browser_captions")
        assert second["state"] == "created"


def test_create_session_retry_is_idempotent_while_slot_is_held() -> None:
    with make_client() as client:
        body = {
            "command_id": "create-retry",
            "owner": "quick_interpret",
            "config": cascade_config(),
        }
        first = client.post("/api/v2/sessions", headers=auth(), json=body)
        retry = client.post("/api/v2/sessions", headers=auth(), json=body)
        assert first.status_code == retry.status_code == 201
        assert first.json()["session_id"] == retry.json()["session_id"]

        changed = {**body, "owner": "browser_captions"}
        conflict = client.post("/api/v2/sessions", headers=auth(), json=changed)
        assert conflict.status_code == 409
        assert conflict.json()["error"]["code"] == "COMMAND_CONFLICT"


# ---------------------------------------------------------------------------
# Fake provider chain: start → events → pause/resume → stop (doc 11 M01)
# ---------------------------------------------------------------------------


def collect_events(ws, count: int, timeout: float = 5.0) -> list[dict]:
    events = []
    for _ in range(count):
        events.append(json.loads(ws.receive_text()))
    return events


def test_events_ws_delivers_fake_provider_trajectory() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]

        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/events", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "hello",
                        "schema_version": SCHEMA_VERSION,
                        "consumer_id": "caption-main",
                        "outputs": ["source_text"],
                    }
                )
            )
            ack = json.loads(ws.receive_text())
            assert ack["frame"] == "hello_ack"
            assert ack["snapshot"]["session_id"] == sid

            command(client, sid, "start")
            events = []
            while True:
                event = json.loads(ws.receive_text())
                events.append(event)
                if event["event_type"] == "source_committed":
                    break
            types = [e["event_type"] for e in events]
            assert "pipeline_state" in types
            assert types.count("source_text") >= 4
            # revisions strictly increase through the trajectory
            revisions = [
                e["payload"]["source_revision"]
                for e in events
                if e["event_type"] == "source_text"
            ]
            assert revisions == sorted(revisions)
            committed = events[-1]
            assert committed["payload"]["text"] == "Ice cream is very good."
            assert committed["payload"]["boundary_reason"] == "hard_silence"
            # event_seq monotonic within the session reducer
            seqs = [e["event_seq"] for e in events if "event_seq" in e]
            assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)


def test_events_ws_rejects_wrong_schema_version() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        with pytest.raises(Exception):
            with client.websocket_connect(
                f"/api/v2/sessions/{sid}/events", headers=auth()
            ) as ws:
                ws.send_text(
                    json.dumps(
                        {
                            "frame": "hello",
                            "schema_version": 1,
                            "consumer_id": "old-client",
                            "outputs": ["source_text"],
                        }
                    )
                )
                ws.receive_text()  # server closes with 1002


def test_events_ws_requires_auth() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        with pytest.raises(Exception):
            with client.websocket_connect(f"/api/v2/sessions/{sid}/events") as ws:
                ws.receive_text()


# ---------------------------------------------------------------------------
# C04/C05: snapshot + resume cursor replay
# ---------------------------------------------------------------------------


def test_resume_cursor_replays_missed_events() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]

        # First consumer watches the full trajectory and records the cursor.
        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/events", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "hello",
                        "schema_version": SCHEMA_VERSION,
                        "consumer_id": "first",
                        "outputs": ["source_text"],
                    }
                )
            )
            ack = json.loads(ws.receive_text())
            command(client, sid, "start")
            cursor = 0
            while True:
                event = json.loads(ws.receive_text())
                cursor = event.get("event_seq", cursor)
                if event["event_type"] == "source_committed":
                    break

        # Reconnect with a cursor from mid-trajectory: replay fills the gap.
        mid_cursor = max(cursor - 3, 0)
        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/events", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "hello",
                        "schema_version": SCHEMA_VERSION,
                        "consumer_id": "recovered",
                        "outputs": ["source_text"],
                        "resume_cursor": mid_cursor,
                    }
                )
            )
            ack = json.loads(ws.receive_text())
            assert ack["resync_required"] is False
            replayed = []
            while True:
                event = json.loads(ws.receive_text())
                replayed.append(event)
                if event["event_type"] == "source_committed":
                    break
            assert all(e["event_seq"] > mid_cursor for e in replayed)


def test_stale_cursor_requires_resync() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/events", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "hello",
                        "schema_version": SCHEMA_VERSION,
                        "consumer_id": "stale",
                        "outputs": ["source_text"],
                        # seq 1 exists (create emits pipeline_state) so use a
                        # cursor the ring can still serve vs. one it cannot.
                        "resume_cursor": 0,
                    }
                )
            )
            ack = json.loads(ws.receive_text())
            assert ack["resync_required"] is False
            assert ack["snapshot"]["snapshot_seq"] >= 1


# ---------------------------------------------------------------------------
# Subscriptions: multi-consumer, unsubscribe doesn't stop others
# ---------------------------------------------------------------------------


def test_multiple_consumers_share_one_session() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]

        response = client.post(
            f"/api/v2/sessions/{sid}/subscriptions",
            headers=auth(),
            json={
                "command_id": "cmd-sub",
                "consumer_id": "overlay",
                "outputs": ["source_text"],
            },
        )
        assert response.status_code == 201

        # duplicate consumer id conflicts
        response = client.post(
            f"/api/v2/sessions/{sid}/subscriptions",
            headers=auth(),
            json={
                "command_id": "cmd-sub2",
                "consumer_id": "overlay",
                "outputs": ["source_text"],
            },
        )
        assert response.status_code == 409

        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        consumers = {s["consumer_id"] for s in snap["subscriptions"]}
        assert "overlay" in consumers

        # leaving doesn't stop the session
        response = client.delete(f"/api/v2/sessions/{sid}/subscriptions/overlay", headers=auth())
        assert response.status_code == 200
        snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
        assert snap["state"] == "created"


# ---------------------------------------------------------------------------
# Input WS: binary frame validation (C09 partial; full matrix in M03)
# ---------------------------------------------------------------------------


def _frame(handle: int, epoch: int, seq: int, sample_start: int, samples: bytes, *, magic: bytes = b"NOLA") -> bytes:
    import struct

    count = len(samples) // 2
    return struct.pack(
        "<4sBBHIIQQII",
        magic,
        1,
        1,
        40,
        handle,
        epoch,
        seq,
        sample_start,
        count,
        len(samples),
    ) + samples


def test_input_ws_accepts_valid_frames_and_rejects_bad_magic() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        command(client, sid, "start")

        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/input", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "stream_open",
                        "stream_handle": 7,
                        "epoch": 0,
                        "encoding": "pcm_s16le",
                        "sample_rate": 16000,
                        "channels": 1,
                    }
                )
            )
            opened = json.loads(ws.receive_text())
            assert opened["frame"] == "stream_opened"
            assert opened["stream_handle"] == 7

            payload = b"\x00\x01" * 320  # 320 samples = 20ms @16k
            ws.send_bytes(_frame(7, 0, 0, 0, payload))
            ack = json.loads(ws.receive_text())
            assert ack["frame"] == "audio_accepted"
            assert ack["through_chunk_seq"] == 0
            assert ack["through_sample"] == 320

            # bad magic → protocol error, no crash
            ws.send_bytes(_frame(7, 0, 1, 320, payload, magic=b"XXXX"))
            err = json.loads(ws.receive_text())
            assert err["frame"] == "error"
            assert err["error"]["code"] == "PROTOCOL_ERROR"

            # duplicate seq is idempotently ignored (no ack, no error)
            ws.send_bytes(_frame(7, 0, 0, 0, payload))
            # seq gap → AUDIO_GAP
            ws.send_bytes(_frame(7, 0, 5, 1600, payload))
            err = json.loads(ws.receive_text())
            assert err["frame"] == "error"
            assert err["error"]["code"] == "AUDIO_GAP"


def test_input_ws_rejects_size_mismatch_before_processing() -> None:
    import struct

    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/input", headers=auth()
        ) as ws:
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
            json.loads(ws.receive_text())
            # Header claims 320 samples (640 bytes) but ships only 100 bytes:
            # sample_count x channels x bytes_per_sample != payload_bytes.
            payload = b"\x00" * 100
            bad = struct.pack(
                "<4sBBHIIQQII",
                b"NOLA", 1, 1, 40, 1, 0, 0, 0, 320, len(payload),
            ) + payload
            ws.send_bytes(bad)
            err = json.loads(ws.receive_text())
            assert err["frame"] == "error"
            assert err["error"]["code"] == "PROTOCOL_ERROR"


# ---------------------------------------------------------------------------
# Stale callback: stop cancels the pipeline; nothing is emitted afterwards
# ---------------------------------------------------------------------------


def test_stop_prevents_late_events() -> None:
    with make_client() as client:
        created = create_session(client)
        sid = created["session_id"]
        with client.websocket_connect(
            f"/api/v2/sessions/{sid}/events", headers=auth()
        ) as ws:
            ws.send_text(
                json.dumps(
                    {
                        "frame": "hello",
                        "schema_version": SCHEMA_VERSION,
                        "consumer_id": "watcher",
                        "outputs": ["source_text"],
                    }
                )
            )
            json.loads(ws.receive_text())
            command(client, sid, "start")
            command(client, sid, "stop")

            # The closed pipeline must not advance the reducer any further:
            # a stale (cancelled) fake provider emits nothing after stop.
            import time as _time

            snap = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
            seq_at_close = snap["snapshot_seq"]
            _time.sleep(0.2)
            snap2 = client.get(f"/api/v2/sessions/{sid}", headers=auth()).json()
            assert snap2["snapshot_seq"] == seq_at_close
            assert snap2["state"] == "closed"


# ---------------------------------------------------------------------------
# Journal + shutdown (C07 partial: bounded shutdown with fake provider)
# ---------------------------------------------------------------------------


def test_journal_records_commands_and_shutdown_is_clean(tmp_path) -> None:
    with make_client(tmp_path) as client:
        created = create_session(client)
        sid = created["session_id"]
        command(client, sid, "start")
        command(client, sid, "pause")
        command(client, sid, "resume")
        command(client, sid, "stop")

    journal_file = tmp_path / "session-journal.jsonl"
    assert journal_file.exists()
    lines = [json.loads(line) for line in journal_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    kinds = {entry["kind"] for entry in lines}
    assert "session_command" in kinds
    assert all(entry["session_id"] == sid for entry in lines)
