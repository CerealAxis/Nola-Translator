import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from fluentcaptions_engine.protocol import (
    MAX_PROTOCOL_LINE_BYTES,
    StatusEvent,
    parse_command_line,
    parse_event_line,
    serialize_event,
)


FIXTURE_PATH = Path(__file__).parents[2] / "tests" / "fixtures" / "protocol" / "messages.json"


@pytest.fixture(scope="module")
def messages() -> dict[str, list[dict[str, object]]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_accepts_shared_command_samples(messages: dict[str, list[dict[str, object]]]) -> None:
    for command in messages["commands"]:
        assert parse_command_line(json.dumps(command, ensure_ascii=False)).type == command["type"]


def test_accepts_shared_event_samples(messages: dict[str, list[dict[str, object]]]) -> None:
    for event in messages["events"]:
        assert parse_event_line(json.dumps(event, ensure_ascii=False)).type == event["type"]


def test_rejects_unknown_type_missing_request_id_and_negative_revision(
    messages: dict[str, list[dict[str, object]]],
) -> None:
    with pytest.raises(ValidationError):
        parse_command_line('{"protocolVersion":1,"type":"unknown","requestId":"req-1"}')
    with pytest.raises(ValidationError):
        parse_command_line('{"protocolVersion":1,"type":"listDevices"}')

    caption = json.loads(json.dumps(messages["events"][1]))
    caption["segment"]["revision"] = -1
    with pytest.raises(ValidationError):
        parse_event_line(json.dumps(caption, ensure_ascii=False))


def test_ignores_unknown_optional_fields(messages: dict[str, list[dict[str, object]]]) -> None:
    command = {**messages["commands"][0], "futureOptionalField": True}
    parsed = parse_command_line(json.dumps(command))
    assert "futureOptionalField" not in parsed.model_dump()


def test_rejects_lines_larger_than_32_kib() -> None:
    oversized = json.dumps(
        {
            "protocolVersion": 1,
            "type": "hello",
            "requestId": "req-large",
            "clientVersion": "x" * MAX_PROTOCOL_LINE_BYTES,
        }
    )
    with pytest.raises(ValueError, match="32 KiB"):
        parse_command_line(oversized)


def test_serialization_omits_optional_none_fields() -> None:
    event = StatusEvent(
        protocolVersion=1,
        type="status",
        requestId="status-1",
        code="listening",
    )
    assert "details" not in json.loads(serialize_event(event))


def test_accepts_explicit_resource_management_command() -> None:
    command = parse_command_line(
        '{"protocolVersion":1,"type":"manageResource","requestId":"install-1",'
        '"resourceId":"sherpa-zh-en-small","action":"install"}'
    )
    assert command.type == "manageResource"
    assert command.action == "install"
