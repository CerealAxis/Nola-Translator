import asyncio
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.audio.devices import AudioDeviceRegistry
from nola_translator_engine.audio.resample import AudioFrame, TARGET_SAMPLE_RATE
from nola_translator_engine.backend import desktop_capture, meeting_audio
from nola_translator_engine.backend.app import create_app
from nola_translator_engine.backend.meeting import MeetingAudioTestRequest
from nola_translator_engine.backend.sessions import SessionError


AUTH = {"authorization": "Bearer test"}
DEVICES = [
    SimpleNamespace(device_id="mic", kind="microphone", name="Microphone"),
    SimpleNamespace(device_id="phones", kind="systemOutput", name="Headphones"),
    SimpleNamespace(device_id="a-in", kind="systemOutput", name="CABLE-A Input (VB-Audio Cable A)"),
    SimpleNamespace(device_id="a-out", kind="microphone", name="CABLE-A Output (VB-Audio Cable A)"),
    SimpleNamespace(device_id="b-in", kind="systemOutput", name="CABLE-B Input (VB-Audio Cable B)"),
]


@pytest.fixture
def probe(monkeypatch):
    state = SimpleNamespace(played=[], captures=[], signal=None, mode="signal", playback_fail=False)
    monkeypatch.setattr(AudioDeviceRegistry, "refresh", lambda _: DEVICES)

    class Capture:
        def __init__(self, config):
            self.config, self.closed = config, False
            state.captures.append(self)

        async def start(self):
            pass

        def stop(self):
            self.closed = True

        async def frames(self):
            if self.config.device_id == "a-out":
                while state.signal is None:
                    await asyncio.sleep(0)
                signal = np.pad(state.signal, (1600, TARGET_SAMPLE_RATE * 2 - 1600 - state.signal.size))
            elif state.mode == "blocked":
                await asyncio.Event().wait()
            else:
                signal = np.full(TARGET_SAMPLE_RATE * 2, 0.05 if state.mode == "signal" else 0, np.float32)
            if state.mode == "noise":
                signal = np.random.default_rng(42).normal(0, 0.1, TARGET_SAMPLE_RATE * 2).astype(np.float32)
            for offset in range(0, signal.size, 320):
                yield AudioFrame(signal[offset:offset + 320], 0)

    async def play(device, signal):
        state.played.append((device, signal.copy()))
        state.signal = signal
        if state.playback_fail:
            raise OSError("fixture")

    monkeypatch.setattr(desktop_capture, "_desktop_backend", Capture)
    monkeypatch.setattr(meeting_audio, "_play_test_audio", play)
    return state


async def test_microphone_samples_actual_input_and_replays_to_selected_headphones(probe):
    result = await meeting_audio.test_meeting_audio(MeetingAudioTestRequest(
        kind="microphone", device_id="mic", playback_device_id="phones",
    ))
    assert result["has_signal"] and result["playback_sent"] and result["peak"] == pytest.approx(0.05)
    assert probe.played[0][0] == "phones"
    assert probe.played[0][1].size == TARGET_SAMPLE_RATE * 2
    assert all(capture.closed for capture in probe.captures)
    probe.mode = "silent"
    result = await meeting_audio.test_meeting_audio(MeetingAudioTestRequest(kind="microphone", device_id="mic"))
    assert result == {"kind": "microphone", "peak": 0, "has_signal": False, "playback_sent": False}


async def test_cable_requires_matching_test_signal_in_the_actual_partner(probe):
    request = MeetingAudioTestRequest(kind="cable", device_id="a-in")
    result = await meeting_audio.test_meeting_audio(request)
    assert result["has_signal"] and result["correlation"] > 0.99
    assert probe.captures[0].config.device_id == "a-out"
    assert probe.played[0][0] == "a-in"
    probe.mode = "noise"
    result = await meeting_audio.test_meeting_audio(request)
    assert result["peak"] > 0.01 and not result["has_signal"] and result["correlation"] < 0.1
    assert all(capture.closed for capture in probe.captures)


@pytest.mark.parametrize("kind,device,playback", [
    ("cable", "b-in", None), ("cable", "a-out", None),
    ("microphone", "a-in", None), ("microphone", "mic", "a-out"),
])
async def test_probe_rejects_wrong_endpoint_kinds_or_unpaired_cables(probe, kind, device, playback):
    with pytest.raises(SessionError):
        await meeting_audio.test_meeting_audio(MeetingAudioTestRequest(
            kind=kind, device_id=device, playback_device_id=playback,
        ))
    assert not probe.played and not probe.captures


async def test_probe_cancellation_and_output_failure_release_capture(probe):
    probe.playback_fail = True
    with pytest.raises(SessionError) as error:
        await meeting_audio.test_meeting_audio(MeetingAudioTestRequest(kind="cable", device_id="a-in"))
    assert error.value.payload.code == "PLAYBACK_DEVICE_LOST"
    assert all(capture.closed for capture in probe.captures)
    probe.mode = "blocked"
    task = asyncio.create_task(meeting_audio.test_meeting_audio(MeetingAudioTestRequest(kind="microphone", device_id="mic")))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert all(capture.closed for capture in probe.captures)


def test_probe_api_requires_auth_and_free_realtime_slot(probe):
    with TestClient(create_app(control_token="test")) as client:
        body = {"kind": "headphones", "device_id": "phones"}
        assert client.post("/api/v2/meetings/audio-test", json=body).status_code == 401
        response = client.post("/api/v2/meetings/audio-test", json=body, headers=AUTH)
        assert response.json() == {"kind": "headphones", "has_signal": False, "peak": 0, "playback_sent": True}
        assert client.post("/api/v2/meetings/audio-test", json={**body, "kind": "other"}, headers=AUTH).status_code == 422
        assert client.post("/api/v2/sessions", json={
            "command_id": "quick", "owner": "quick_interpret",
            "config": {"input": {"kind": "microphone"}, "pipeline": {"kind": "cascade", "asr_model": "model"}},
        }, headers=AUTH).status_code == 201
        response = client.post("/api/v2/meetings/audio-test", json=body, headers=AUTH)
        assert response.json()["error"]["code"] == "SESSION_SLOT_BUSY"
        assert len(probe.played) == 1


async def test_native_test_output_waits_for_playback_and_closes(monkeypatch):
    outputs = []

    class Output:
        def __init__(self, device_id, _duck, *, monitor):
            self.device_id, self.closed = device_id, False
            assert not monitor
            outputs.append(self)

        def set_route(self, enabled):
            assert enabled

        def add_translation(self, pcm, rate, channels, *, last):
            assert len(pcm) > 0 and rate == TARGET_SAMPLE_RATE and channels == 1 and last
            done = asyncio.get_running_loop().create_future()
            asyncio.get_running_loop().call_soon(done.set_result, True)
            return done

        def close(self):
            self.closed = True

    monkeypatch.setattr(meeting_audio, "MeetingOutput", Output)
    await meeting_audio._play_test_audio("phones", meeting_audio._test_signal())
    assert outputs[0].device_id == "phones" and outputs[0].closed
