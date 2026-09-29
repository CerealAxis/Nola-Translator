"""WASAPI device enumeration via PyAudioWPatch, with stable in-app device id mapping."""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from hashlib import blake2s
import re
import unicodedata
from typing import Any, Literal, Protocol

import pyaudiowpatch as pyaudio


DeviceKind = Literal["systemOutput", "microphone"]


class PyAudioBackend(Protocol):
    def get_host_api_info_by_type(self, api_type: int) -> dict[str, Any]: ...
    def get_device_info_by_host_api_device_index(self, host_index: int, index: int) -> dict[str, Any]: ...
    def get_loopback_device_info_generator(self) -> Iterable[dict[str, Any]]: ...
    def get_default_wasapi_loopback(self) -> dict[str, Any]: ...
    def terminate(self) -> None: ...


@dataclass(frozen=True, slots=True)
class AudioDeviceRecord:
    device_id: str
    backend_index: int
    name: str
    kind: DeviceKind
    is_default: bool
    sample_rate: int
    channels: int


class AudioDeviceUnavailableError(RuntimeError):
    """The user's selected device doesn't exist right now."""


class AudioDeviceRegistry:
    """Each refresh re-maps the transient PortAudio index; the index itself is never persisted."""

    def __init__(
        self,
        enumerator: Callable[[], list[AudioDeviceRecord]] = lambda: enumerate_wasapi_devices(),
    ) -> None:
        self.enumerator = enumerator
        self.devices: list[AudioDeviceRecord] = []

    def refresh(self) -> list[AudioDeviceRecord]:
        self.devices = self.enumerator()
        return self.devices

    def resolve(self, kind: DeviceKind, device_id: str | None = None) -> AudioDeviceRecord:
        devices = [device for device in self.refresh() if device.kind == kind]
        if device_id is not None:
            match = next((device for device in devices if device.device_id == device_id), None)
        else:
            match = next((device for device in devices if device.is_default), None)
        if match is None:
            raise AudioDeviceUnavailableError(device_id or f"default:{kind}")
        return match

    async def wait_until_available(
        self,
        kind: DeviceKind,
        device_id: str | None = None,
        poll_interval: float = 2.0,
    ) -> AudioDeviceRecord:
        """A default source follows the new system default; a named source only waits for its own id to come back."""

        while True:
            try:
                return self.resolve(kind, device_id)
            except (AudioDeviceUnavailableError, OSError):
                await asyncio.sleep(poll_interval)


def _friendly_loopback_name(name: str) -> str:
    return re.sub(r"\s*\[Loopback\]\s*$", "", name, flags=re.IGNORECASE).strip()


def _stable_device_id(kind: DeviceKind, name: str, sample_rate: int, channels: int) -> str:
    normalized = " ".join(unicodedata.normalize("NFKC", name).casefold().split())
    signature = f"wasapi|{kind}|{normalized}|{sample_rate}|{channels}".encode("utf-8")
    digest = blake2s(signature, digest_size=10).hexdigest()
    return f"wasapi:{kind}:{digest}"


def _record(info: dict[str, Any], kind: DeviceKind, is_default: bool) -> AudioDeviceRecord:
    name = str(info["name"])
    if kind == "systemOutput":
        name = _friendly_loopback_name(name)
    sample_rate = round(float(info["defaultSampleRate"]))
    channels = max(1, int(info["maxInputChannels"]))
    return AudioDeviceRecord(
        device_id=_stable_device_id(kind, name, sample_rate, channels),
        backend_index=int(info["index"]),
        name=name,
        kind=kind,
        is_default=is_default,
        sample_rate=sample_rate,
        channels=channels,
    )


def enumerate_wasapi_devices(
    backend_factory: Callable[[], PyAudioBackend] = pyaudio.PyAudio,
) -> list[AudioDeviceRecord]:
    """List WASAPI loopback and real input devices, releasing PortAudio before returning."""

    backend = backend_factory()
    try:
        host = backend.get_host_api_info_by_type(pyaudio.paWASAPI)
        host_index = int(host["index"])
        default_input_index = int(host.get("defaultInputDevice", -1))
        default_loopback_index = int(backend.get_default_wasapi_loopback()["index"])

        outputs = [
            _record(info, "systemOutput", int(info["index"]) == default_loopback_index)
            for info in backend.get_loopback_device_info_generator()
        ]

        microphones: list[AudioDeviceRecord] = []
        for host_device_index in range(int(host["deviceCount"])):
            info = backend.get_device_info_by_host_api_device_index(host_index, host_device_index)
            if bool(info.get("isLoopbackDevice")) or int(info.get("maxInputChannels", 0)) <= 0:
                continue
            microphones.append(
                _record(info, "microphone", int(info["index"]) == default_input_index)
            )

        outputs.sort(key=lambda device: (not device.is_default, device.name.casefold()))
        microphones.sort(key=lambda device: (not device.is_default, device.name.casefold()))
        return outputs + microphones
    finally:
        backend.terminate()
