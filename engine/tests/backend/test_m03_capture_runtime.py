import asyncio

import numpy as np
import pytest

from nola_translator_engine.audio.resample import FRAME_SAMPLES, AudioFrame
from nola_translator_engine.backend import desktop_capture
from nola_translator_engine.backend.contracts import InputConfig
from nola_translator_engine.backend.ingestion import AudioIngestion


class DummyCapture:
    def __init__(self):
        self.started = asyncio.Event()
        self.ready = asyncio.Event()
        self.emitted = asyncio.Event()
        self.ended = asyncio.Event()
        self.stop_calls = 0

    async def start(self):
        self.started.set()
        await self.ready.wait()

    async def frames(self):
        for sample in (0.25, -0.5):
            yield AudioFrame(np.full(FRAME_SAMPLES, sample, dtype=np.float32), 50_000)
        self.emitted.set()
        await self.ended.wait()

    def stop(self):
        self.stop_calls += 1
        self.ended.set()


@pytest.mark.parametrize("eof", [False, True])
async def test_pumps_canonical_samples_and_stops_once(eof):
    backend = DummyCapture()
    backend.ready.set()
    ingestion = AudioIngestion("session")
    capture = await desktop_capture.start_desktop_capture(
        InputConfig(kind="microphone"), ingestion, 3, backend_factory=lambda _: backend
    )
    task = asyncio.create_task(capture.pump())
    await asyncio.wait_for(backend.emitted.wait(), 1)
    await capture.stop(eof=eof)
    await task
    await capture.stop()

    assert backend.stop_calls == 1
    assert ingestion.input_finished is eof
    frames = ingestion.consume_frames()
    assert [start for _, start in frames] == [0, FRAME_SAMPLES]
    np.testing.assert_array_equal(frames[0][0].samples, np.full(FRAME_SAMPLES, 0.25, dtype=np.float32))
    np.testing.assert_array_equal(frames[1][0].samples, np.full(FRAME_SAMPLES, -0.5, dtype=np.float32))


async def test_cancelled_start_waits_for_activation_then_cleans_up():
    backend = DummyCapture()
    ingestion = AudioIngestion("session")
    startup = asyncio.create_task(desktop_capture.start_desktop_capture(
        InputConfig(kind="microphone"), ingestion, 0, backend_factory=lambda _: backend
    ))
    await backend.started.wait()
    startup.cancel()
    await asyncio.sleep(0)
    assert backend.stop_calls == 0
    assert not startup.done()
    backend.ready.set()
    with pytest.raises(asyncio.CancelledError):
        await startup
    assert backend.stop_calls == 1


async def test_explicit_exclusion_requires_the_playback_pid(monkeypatch):
    backend = DummyCapture()
    backend.ready.set()
    targets = []

    def exclude(pid):
        targets.append(pid)
        return backend

    monkeypatch.setattr(desktop_capture, "ProcessExcludeCaptureBackend", exclude)
    ingestion = AudioIngestion("session")
    with pytest.raises(ValueError, match="Electron main PID"):
        await desktop_capture.start_desktop_capture(InputConfig(kind="system_audio", capture_backend="windows_process_exclude"), ingestion, 0)
    capture = await desktop_capture.start_desktop_capture(
        InputConfig(kind="system_audio", capture_backend="windows_process_exclude", excluded_process_tree=(12345, 67890)), ingestion, 0
    )
    assert targets == [12345]
    await capture.stop()


async def test_selected_application_gap_keeps_a_discontinuous_sample_clock(monkeypatch):
    class CaptureWithGap(DummyCapture):
        async def frames(self):
            yield AudioFrame(np.zeros(FRAME_SAMPLES, dtype=np.float32), 0)
            yield AudioFrame(np.zeros(FRAME_SAMPLES, dtype=np.float32), 40, lost_samples_before=FRAME_SAMPLES)
            self.emitted.set()
            await self.ended.wait()

    backend = CaptureWithGap()
    backend.ready.set()
    selection = "selected-process"
    monkeypatch.setattr(desktop_capture, "ProcessIncludeCaptureBackend", lambda token: backend if token == selection else None)
    events = []
    ingestion = AudioIngestion("session", on_event=lambda kind, payload: events.append((kind, payload)))
    capture = await desktop_capture.start_desktop_capture(InputConfig(kind="process_audio", process_selection_id=selection), ingestion, 0)
    task = asyncio.create_task(capture.pump())
    await asyncio.wait_for(backend.emitted.wait(), 1)
    await capture.stop()
    await task
    assert [start for _, start in ingestion.consume_frames()] == [0, FRAME_SAMPLES * 2]
    assert [(payload["lost_start_sample"], payload["lost_end_sample"]) for kind, payload in events if kind == "audio_gap"] == [(FRAME_SAMPLES, FRAME_SAMPLES * 2)]


@pytest.mark.parametrize("kind", ["microphone", "browser_tab"])
async def test_unspecified_mic_and_browser_use_external_pcm(kind):
    assert await desktop_capture.start_desktop_capture(InputConfig(kind=kind), AudioIngestion("session"), 0) is None
