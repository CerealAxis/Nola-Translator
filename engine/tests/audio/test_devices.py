import pytest

from nola_translator_engine.audio.devices import (
    AudioDeviceRecord,
    AudioDeviceRegistry,
    AudioDeviceUnavailableError,
    enumerate_wasapi_devices,
)


class FakePyAudio:
    def __init__(self, *, moved_indices: bool = False) -> None:
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
                "maxInputChannels": 2,
                "maxOutputChannels": 0,
                "defaultSampleRate": 48000.0,
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
