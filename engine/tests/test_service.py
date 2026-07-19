from fluentcaptions_engine.protocol import parse_command_line
from fluentcaptions_engine.service import EngineService
from fluentcaptions_engine.audio.devices import AudioDeviceRecord


def test_service_performs_handshake_and_lists_devices() -> None:
    service = EngineService(
        device_enumerator=lambda: [
            AudioDeviceRecord(
                device_id="wasapi:systemOutput:abc",
                backend_index=33,
                name="扬声器",
                kind="systemOutput",
                is_default=True,
                sample_rate=48_000,
                channels=2,
            )
        ]
    )

    ready = service.handle(
        parse_command_line(
            '{"protocolVersion":1,"type":"hello","requestId":"hello-1","clientVersion":"0.1.0"}'
        )
    )
    devices = service.handle(
        parse_command_line('{"protocolVersion":1,"type":"listDevices","requestId":"devices-1"}')
    )

    assert ready[0].type == "ready"
    assert ready[0].requestId == "hello-1"
    assert devices[0].type == "devices"
    assert devices[0].devices[0].deviceId == "wasapi:systemOutput:abc"
    assert devices[0].devices[0].name == "扬声器"
    assert devices[0].devices[0].isDefault is True


def test_service_starts_and_stops_one_session() -> None:
    service = EngineService(device_enumerator=lambda: [_output_device()])
    started = service.handle(
        parse_command_line(
            """{"protocolVersion":1,"type":"startSession","requestId":"start-1","config":{
            "audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",
            "sourceLanguage":"auto","targetLanguages":["zh-CN"]}}"""
        )
    )

    assert [event.type for event in started] == ["sessionStarted", "status"]
    session_id = started[0].sessionId

    stopped = service.handle(
        parse_command_line(
            f'{{"protocolVersion":1,"type":"stopSession","requestId":"stop-1","sessionId":"{session_id}"}}'
        )
    )
    assert [event.type for event in stopped] == ["sessionStopped", "status"]


def test_service_returns_enumerable_error_code_for_invalid_state() -> None:
    service = EngineService(device_enumerator=lambda: [_output_device()])
    events = service.handle(
        parse_command_line(
            '{"protocolVersion":1,"type":"stopSession","requestId":"stop-1","sessionId":"missing"}'
        )
    )
    assert events[0].type == "error"
    assert events[0].code == "sessionNotRunning"


def test_service_acknowledges_shutdown() -> None:
    service = EngineService(device_enumerator=lambda: [_output_device()])
    events = service.handle(
        parse_command_line('{"protocolVersion":1,"type":"shutdown","requestId":"shutdown-1"}')
    )
    assert events[0].type == "shutdownComplete"
    assert service.should_exit is True


def test_service_does_not_replace_missing_selected_device_with_default() -> None:
    service = EngineService(device_enumerator=lambda: [_output_device()])
    events = service.handle(
        parse_command_line(
            """{"protocolVersion":1,"type":"startSession","requestId":"start-1","config":{
            "audioSource":{"kind":"microphone","deviceId":"missing-microphone"},
            "recognitionMode":"realtime","sourceLanguage":"auto","targetLanguages":[]}}"""
        )
    )
    assert events[0].type == "error"
    assert events[0].code == "audioDeviceUnavailable"


def _output_device() -> AudioDeviceRecord:
    return AudioDeviceRecord(
        device_id="wasapi:systemOutput:abc",
        backend_index=33,
        name="扬声器",
        kind="systemOutput",
        is_default=True,
        sample_rate=48_000,
        channels=2,
    )
