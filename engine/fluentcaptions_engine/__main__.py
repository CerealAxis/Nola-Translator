"""标准输入/输出上的 JSONL 引擎入口。stdout 仅写协议事件。"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
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


async def _run() -> int:
    def write_event(event) -> None:
        print(serialize_event(event), flush=True)

    protocol_only = os.environ.get("FLUENTCAPTIONS_PROTOCOL_ONLY") == "1"
    if protocol_only:
        service = EngineService()

        async def handle(command):
            return service.handle(command)

        async def close() -> None:
            return None
    else:
        from .runtime import EngineRuntime

        model_root = Path(
            os.environ.get(
                "FLUENTCAPTIONS_MODEL_DIR",
                Path(os.environ.get("LOCALAPPDATA", Path.home())) / "FluentCaptions" / "models",
            )
        )
        runtime = EngineRuntime(model_root, write_event)
        service = runtime.service
        handle = runtime.handle
        close = runtime.close

    while raw_with_newline := await asyncio.to_thread(sys.stdin.buffer.readline):
        raw_line = raw_with_newline
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
            events = await handle(command)
        except Exception as error:  # 防止单个命令让 sidecar 无响应；详细异常只写 stderr。
            print(f"engine command failed: {type(error).__name__}", file=sys.stderr, flush=True)
            _write_error(request_id, "internalError")
            continue

        for event in events:
            print(serialize_event(event), flush=True)
        if service.should_exit:
            await close()
            return 0
    await close()
    return 0


def main() -> int:
    if os.environ.get("FLUENTCAPTIONS_SELF_TEST") == "1":
        checks: dict[str, object] = {}
        stage = "imports"
        try:
            import torch

            import bitsandbytes
            import transformers

            from .audio.devices import AudioDeviceRegistry

            stage = "devices"
            checks["devices"] = len(AudioDeviceRegistry().refresh())
            stage = "versions"
            checks["cudaDevices"] = torch.cuda.device_count()
            checks["torch"] = torch.__version__
            checks["transformers"] = transformers.__version__
            checks["bitsandbytes"] = getattr(bitsandbytes, "__version__", "loaded")
        except Exception as error:
            checks["stage"] = stage
            checks["error"] = type(error).__name__
            checks["message"] = str(error)[:256]
            print(json.dumps(checks, ensure_ascii=False), flush=True)
            return 1
        print(json.dumps(checks, ensure_ascii=False), flush=True)
        return 0
    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main())
