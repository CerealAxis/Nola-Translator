"""JSONL engine entry point on stdin/stdout. stdout carries protocol events only."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
import sys
import traceback
from typing import TextIO
from uuid import uuid4

from pydantic import ValidationError

from .protocol import (
    MAX_PROTOCOL_LINE_BYTES,
    ListComputeDevicesCommand,
    ListDevicesCommand,
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


def _force_utf8_streams() -> None:
    """Pin the text streams to UTF-8 so non-ASCII diagnostics survive the pipe.

    The desktop decodes this process's stdout and stderr as UTF-8, while a zh-CN Windows
    install defaults them to GBK. Every Chinese error message then crosses the pipe as bytes
    the reader cannot decode, so the exported diagnostic log keeps replacement characters
    instead of the reason the run failed. ``errors="replace"`` keeps a lone unencodable
    character from raising out of a diagnostic write.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass


def _redirect_third_party_stdout() -> TextIO:
    """Point ``sys.stdout`` at stderr and hand back the real protocol stream.

    stdout is the JSONL protocol channel and only protocol events may go there, yet
    third-party libraries just ``print``. funasr's ``check_for_update`` prints
    ``funasr version: x.y.z.`` unconditionally, *before* it looks at ``disable``; the client
    sees a non-JSON line, declares the protocol corrupt, and kills the engine, so a session
    with SenseVoiceSmall selected never starts. All of that noise goes to stderr instead.
    """
    protocol_out = sys.stdout
    sys.stdout = sys.stderr
    return protocol_out


def _write_error(protocol_out: TextIO, request_id: str, code: str, details: dict[str, object] | None = None) -> None:
    event = ErrorEvent(
        protocolVersion=1,
        type="error",
        requestId=request_id,
        code=code,
        recoverable=True,
        details=details,
    )
    print(serialize_event(event), file=protocol_out, flush=True)


async def _run() -> int:
    protocol_out = _redirect_third_party_stdout()

    def write_event(event) -> None:
        print(serialize_event(event), file=protocol_out, flush=True)

    protocol_only = os.environ.get("NOLA_TRANSLATOR_PROTOCOL_ONLY") == "1"
    if protocol_only:
        service = EngineService()

        async def handle(command):
            return service.handle(command)

        async def close() -> None:
            return None
    else:
        if os.environ.get('NOLA_GATEWAY_ADDRESS'):
            from .gateway_session_runtime import GatewaySessionRuntime as EngineRuntime
        else:
            from .runtime import EngineRuntime

        model_root = Path(
            os.environ.get(
                "NOLA_TRANSLATOR_MODEL_DIR",
                Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Nola Translator" / "models",
            )
        )
        runtime = EngineRuntime(model_root, write_event)
        service = runtime.service
        handle = runtime.handle
        close = runtime.close

    background_commands: set[asyncio.Task[None]] = set()

    async def process_command(command) -> None:
        try:
            events = await handle(command)
        except Exception as error:  # one bad command must not wedge the sidecar; the detail only goes to stderr.
            print(f"engine command failed: {type(error).__name__}", file=sys.stderr, flush=True)
            details: dict[str, object] = {
                "requestId": command.requestId,
                "commandType": type(command).__name__,
                "exceptionType": type(error).__name__,
                "frames": [
                    {"file": frame.filename, "line": frame.lineno, "function": frame.name}
                    for frame in traceback.extract_tb(error.__traceback__)[-12:]
                ],
            }
            if isinstance(error, ValidationError):
                details["validationErrors"] = [
                    {
                        "location": [
                            part if isinstance(part, int) or (isinstance(part, str) and part.isidentifier()) else "[value]"
                            for part in item["loc"]
                        ],
                        "type": item["type"],
                        "message": item["msg"][:256],
                    }
                    for item in error.errors(include_input=False, include_context=False)[:32]
                ]
            diagnostic = {"layer": "engine", "event": "command.failed", "data": details}
            print("NOLA_DIAGNOSTIC " + json.dumps(diagnostic, ensure_ascii=True), file=sys.stderr, flush=True)
            _write_error(protocol_out, command.requestId, "internalError")
            return

        for event in events:
            write_event(event)

    def schedule_device_probe(command: ListComputeDevicesCommand | ListDevicesCommand) -> None:
        task = asyncio.create_task(process_command(command))
        background_commands.add(task)
        task.add_done_callback(background_commands.discard)

    while raw_with_newline := await asyncio.to_thread(sys.stdin.buffer.readline):
        raw_line = raw_with_newline
        raw_line = raw_line.rstrip(b"\r\n")
        request_id = _request_id(raw_line)
        if len(raw_line) > MAX_PROTOCOL_LINE_BYTES:
            _write_error(protocol_out, request_id, "lineTooLarge")
            continue

        try:
            command = parse_command_line(raw_line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, ValidationError, ValueError):
            try:
                value = json.loads(raw_line.decode("utf-8"))
                code = "unsupportedProtocol" if value.get("protocolVersion") != 1 else "invalidMessage"
            except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
                code = "invalidMessage"
            _write_error(protocol_out, request_id, code)
            continue

        if isinstance(command, (ListComputeDevicesCommand, ListDevicesCommand)):
            # Driver and WASAPI probes can block on cold startup. Keep the JSONL loop free
            # so resource queries and other independent requests continue to make progress.
            schedule_device_probe(command)
        else:
            await process_command(command)
        if service.should_exit:
            if background_commands:
                await asyncio.gather(*background_commands)
            await close()
            return 0
    if background_commands:
        await asyncio.gather(*background_commands)
    await close()
    return 0


def main() -> int:
    _force_utf8_streams()
    if os.environ.get("NOLA_TRANSLATOR_RUNTIME_PROBE") == "1":
        protocol_out = _redirect_third_party_stdout()
        try:
            import torch
            import transformers
            import pyaudiowpatch
            from . import runtime
            xpu_compiled = getattr(getattr(torch, "xpu", None), "_is_compiled", lambda: False)()
            backend = "rocm" if torch.version.hip else "cuda" if torch.version.cuda else "xpu" if xpu_compiled else "cpu"
            print(json.dumps({"torch": torch.__version__, "transformers": transformers.__version__, "backend": backend,
                              "cudaAvailable": torch.cuda.is_available()}), file=protocol_out, flush=True)
            return 0
        except Exception as error:
            print(f"runtime import failed: {type(error).__name__}: {error}", file=sys.stderr, flush=True)
            return 1
    if os.environ.get("NOLA_TRANSLATOR_SELF_TEST") == "1":
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
