from fluentcaptions_engine.protocol import parse_command_line
from fluentcaptions_engine.service import EngineService


def test_service_performs_handshake_and_lists_devices() -> None:
    service = EngineService()

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
    assert devices[0].devices == []


def test_service_starts_and_stops_one_session() -> None:
    service = EngineService()
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
    service = EngineService()
    events = service.handle(
        parse_command_line(
            '{"protocolVersion":1,"type":"stopSession","requestId":"stop-1","sessionId":"missing"}'
        )
    )
    assert events[0].type == "error"
    assert events[0].code == "sessionNotRunning"


def test_service_acknowledges_shutdown() -> None:
    service = EngineService()
    events = service.handle(
        parse_command_line('{"protocolVersion":1,"type":"shutdown","requestId":"shutdown-1"}')
    )
    assert events[0].type == "shutdownComplete"
    assert service.should_exit is True
