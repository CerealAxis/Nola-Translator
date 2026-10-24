import pytest

from nola_translator_engine.audio.devices import (
    AudioDeviceRecord,
    AudioDeviceRegistry,
    AudioDeviceUnavailableError,
    enumerate_wasapi_devices,
    _legacy_device_id,
    resolve_capture_device,
)


class FakePyAudio:
    def __init__(self, *, moved_indices: bool = False, loopback_channels: int = 2,
                 loopback_sample_rate: float = 48000.0) -> None:
        offset = 100 if moved_indices else 0
        self.host_api = {
            "index": 2,
            "deviceCount": 3,
            "defaultInputDevice": 27 + offset,
            "defaultOutputDevice": 24 + offset,
        }
        self.native_devices = [
            {
                "index": 27 + offset,
                "name": "内置麦克风",
                "hostApi": 2,
                "maxInputChannels": 2,
                "maxOutputChannels": 0,
                "defaultSampleRate": 48000.0,
                "isLoopbackDevice": False,
            },
            {
                "index": 28 + offset,
                "name": "USB 麦克风",
                "hostApi": 2,
                "maxInputChannels": 1,
                "maxOutputChannels": 0,
                "defaultSampleRate": 44100.0,
                "isLoopbackDevice": False,
            },
            {
                "index": 24 + offset,
                "name": "扬声器",
                "hostApi": 2,
                "maxInputChannels": 0,
                "maxOutputChannels": 2,
                "defaultSampleRate": 48000.0,
                "isLoopbackDevice": False,
            },
        ]
        self.loopbacks = [
            {
                "index": 33 + offset,
                "name": "扬声器 [Loopback]",
                "hostApi": 2,
                "maxInputChannels": loopback_channels,
                "maxOutputChannels": 0,
                "defaultSampleRate": loopback_sample_rate,
                "isLoopbackDevice": True,
            }
        ]
        self.terminated = False

    def get_host_api_info_by_type(self, _api_type: int) -> dict[str, object]:
        return self.host_api

    def get_device_info_by_host_api_device_index(self, _host_index: int, index: int) -> dict[str, object]:
        return self.native_devices[index]

    def get_loopback_device_info_generator(self):
        yield from self.loopbacks

    def get_default_wasapi_loopback(self) -> dict[str, object]:
        return self.loopbacks[0]

    def terminate(self) -> None:
        self.terminated = True


def test_enumerates_default_loopback_and_real_microphones() -> None:
    backend = FakePyAudio()
    devices = enumerate_wasapi_devices(lambda: backend)

    assert [(item.kind, item.name, item.is_default) for item in devices] == [
        ("systemOutput", "扬声器", True),
        ("microphone", "内置麦克风", True),
        ("microphone", "USB 麦克风", False),
    ]
    assert len({item.device_id for item in devices}) == 3
    assert backend.terminated is True


def test_stable_ids_do_not_use_temporary_portaudio_indices() -> None:
    before = enumerate_wasapi_devices(lambda: FakePyAudio(moved_indices=False))
    after = enumerate_wasapi_devices(lambda: FakePyAudio(moved_indices=True))
    assert [item.device_id for item in before] == [item.device_id for item in after]
    assert [item.backend_index for item in before] != [item.backend_index for item in after]


def test_stable_output_id_survives_mix_format_changes() -> None:
    before = enumerate_wasapi_devices(lambda: FakePyAudio(loopback_channels=6))
    after = enumerate_wasapi_devices(
        lambda: FakePyAudio(loopback_channels=8, loopback_sample_rate=44100.0)
    )

    assert before[0].device_id == after[0].device_id
    assert (before[0].channels, before[0].sample_rate) == (6, 48000)
    assert (after[0].channels, after[0].sample_rate) == (8, 44100)

    registry = AudioDeviceRegistry(lambda: after)
    resolved = registry.resolve("systemOutput", before[0].device_id)
    assert resolved.device_id == before[0].device_id
    assert (resolved.channels, resolved.sample_rate) == (8, 44100)

    capture_device = resolve_capture_device(FakePyAudio(loopback_channels=8), before[0])
    assert capture_device.device_id == before[0].device_id
    assert (capture_device.channels, capture_device.sample_rate) == (8, 48000)


def test_registry_accepts_previously_persisted_format_based_id() -> None:
    current = enumerate_wasapi_devices(lambda: FakePyAudio(loopback_channels=6))
    previous_id = _legacy_device_id("systemOutput", current[0].name, current[0].sample_rate, current[0].channels)

    resolved = AudioDeviceRegistry(lambda: current).resolve("systemOutput", previous_id)
    assert resolved.device_id == current[0].device_id


def test_registry_remaps_cached_device_id_after_mix_format_changes() -> None:
    before = enumerate_wasapi_devices(lambda: FakePyAudio(loopback_channels=6))
    after = enumerate_wasapi_devices(lambda: FakePyAudio(loopback_channels=8))
    snapshots = iter([before, after])
    registry = AudioDeviceRegistry(lambda: next(snapshots))

    assert registry.refresh()[0].device_id == before[0].device_id
    resolved = registry.resolve("systemOutput", before[0].device_id)
    assert resolved.device_id == after[0].device_id
    assert resolved.channels == 8



def test_enumeration_failure_records_native_error_and_releases_backend(monkeypatch):
    from nola_translator_engine.audio import devices as devices_module

    observations = []
    backend = FakePyAudio()
    monkeypatch.setattr(devices_module, "write_debug", lambda layer, event, data: observations.append((event, data)))

    def unavailable():
        raise OSError(-9996, "default WASAPI endpoint unavailable")

    monkeypatch.setattr(backend, "get_default_wasapi_loopback", unavailable)
    enumerate_wasapi_devices(lambda: backend)
    event, data = next(item for item in observations if item[0] == "audio.devices.default.failed")
    assert event == "audio.devices.default.failed"
    assert data["stage"] == "defaultLoopback"
    assert data["errorCode"] == -9996
    assert "default WASAPI endpoint unavailable" in data["message"]
    assert backend.terminated


def test_missing_default_loopback_does_not_hide_explicit_outputs_or_microphones(monkeypatch):
    backend = FakePyAudio()

    def missing_default():
        raise LookupError("default playback endpoint has no loopback")

    monkeypatch.setattr(backend, "get_default_wasapi_loopback", missing_default)
    devices = enumerate_wasapi_devices(lambda: backend)
    assert any(device.kind == "systemOutput" for device in devices)
    assert any(device.kind == "microphone" and device.is_default for device in devices)
    assert all(not device.is_default for device in devices if device.kind == "systemOutput")
    assert backend.terminated


@pytest.mark.parametrize("name", ["", "   ", "[Loopback]", " [Loopback] "])
@pytest.mark.parametrize("kind", ["systemOutput", "microphone"])
def test_unnamed_devices_do_not_break_protocol_or_default_capture(name: str, kind: str) -> None:
    from nola_translator_engine.protocol import ListDevicesCommand
    from nola_translator_engine.service import EngineService

    backend = FakePyAudio()
    endpoint = backend.loopbacks[0] if kind == "systemOutput" else backend.native_devices[0]
    endpoint["name"] = name
    enumerate_devices = lambda: enumerate_wasapi_devices(lambda: backend)
    service = EngineService(device_enumerator=enumerate_devices)

    events = service.handle(ListDevicesCommand(
        protocolVersion=1, type="listDevices", requestId="unnamed-devices",
    ))

    assert events[0].type == "devices"
    assert len(events[0].devices) == 3
    assert all(device.name.strip() for device in events[0].devices)
    default = service.device_registry.resolve("systemOutput")
    assert default.backend_index == 33
    moved = FakePyAudio(moved_indices=True)
    moved_endpoint = moved.loopbacks[0] if kind == "systemOutput" else moved.native_devices[0]
    moved_endpoint["name"] = name
    assert [device.device_id for device in enumerate_devices()] == [
        device.device_id for device in enumerate_wasapi_devices(lambda: moved)
    ]


def _record(device_id: str, *, default: bool) -> AudioDeviceRecord:
    return AudioDeviceRecord(
        device_id=device_id,
        backend_index=33,
        name=device_id,
        kind="systemOutput",
        is_default=default,
        sample_rate=48_000,
        channels=2,
    )


def test_registry_resolves_default_or_exact_device_without_fallback() -> None:
    devices = [_record("default", default=True), _record("selected", default=False)]
    registry = AudioDeviceRegistry(lambda: devices)
    assert registry.resolve("systemOutput").device_id == "default"
    assert registry.resolve("systemOutput", "selected").device_id == "selected"
    with pytest.raises(AudioDeviceUnavailableError):
        registry.resolve("systemOutput", "missing")


@pytest.mark.asyncio
async def test_reconnect_follows_new_default_but_specific_device_waits_for_itself() -> None:
    calls = 0

    def changing_devices() -> list[AudioDeviceRecord]:
        nonlocal calls
        calls += 1
        if calls == 1:
            return []
        return [_record("new-default", default=True)]

    registry = AudioDeviceRegistry(changing_devices)
    reconnected = await registry.wait_until_available("systemOutput", poll_interval=0.001)
    assert reconnected.device_id == "new-default"

    specific_calls = 0

    def selected_returns_later() -> list[AudioDeviceRecord]:
        nonlocal specific_calls
        specific_calls += 1
        if specific_calls == 1:
            return [_record("wrong-default", default=True)]
        return [_record("selected", default=False)]

    registry = AudioDeviceRegistry(selected_returns_later)
    selected = await registry.wait_until_available(
        "systemOutput", device_id="selected", poll_interval=0.001
    )
    assert selected.device_id == "selected"
