"""标准输入/输出上的 JSONL 引擎入口。stdout 仅写协议事件。"""

from __future__ import annotations

import json
import sys
from uuid import uuid4

from pydantic import ValidationError

from .protocol import (
    MAX_PROTOCOL_LINE_BYTES,
    ErrorEvent,
    parse_command_line,
    serialize_event,
)
from .service import EngineService


def _request_id(raw_line: bytes) -> str:
    try:
        value = json.loads(raw_line.decode("utf-8"))
        request_id = value.get("requestId") if isinstance(value, dict) else None
        if isinstance(request_id, str) and request_id:
            return request_id[:128]
    except (UnicodeDecodeError, json.JSONDecodeError):
        pass
    return f"invalid-{uuid4()}"


def _write_error(request_id: str, code: str, details: dict[str, object] | None = None) -> None:
    event = ErrorEvent(
        protocolVersion=1,
        type="error",
        requestId=request_id,
        code=code,
        recoverable=True,
        details=details,
    )
    print(serialize_event(event), flush=True)


def main() -> int:
    service = EngineService()
    for raw_line in sys.stdin.buffer:
        raw_line = raw_line.rstrip(b"\r\n")
        request_id = _request_id(raw_line)
        if len(raw_line) > MAX_PROTOCOL_LINE_BYTES:
            _write_error(request_id, "lineTooLarge")
            continue

        try:
            command = parse_command_line(raw_line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, ValueError):
            try:
                value = json.loads(raw_line.decode("utf-8"))
                code = "unsupportedProtocol" if value.get("protocolVersion") != 1 else "invalidMessage"
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                code = "invalidMessage"
            _write_error(request_id, code)
            continue

        try:
            events = service.handle(command)
        except Exception as error:  # 防止单个命令让 sidecar 无响应；详细异常只写 stderr。
            print(f"engine command failed: {type(error).__name__}", file=sys.stderr, flush=True)
            _write_error(request_id, "internalError")
            continue

        for event in events:
            print(serialize_event(event), flush=True)
        if service.should_exit:
            return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
