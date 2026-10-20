"""Restricted stdio-to-pipe transport; all feature commands are validated by Electron."""
from __future__ import annotations

import json
import os
import struct
import sys
import threading
from pathlib import Path
from typing import BinaryIO

EXTENSION_ID = "cgbjfdpkcoapeiefeflikdolennbdcbe"
FIREFOX_EXTENSION_ID = "captions@nola-translator.app"
MAX_MESSAGE_BYTES = 160 * 1024


class WindowsPipe:
    """Use CPython's overlapped Win32 I/O so reads cannot lock out writes."""
    def __init__(self, name: str):
        import _winapi
        self.api = _winapi
        self.handle = _winapi.CreateFile(name, _winapi.GENERIC_READ | _winapi.GENERIC_WRITE,
                                        0, _winapi.NULL, _winapi.OPEN_EXISTING,
                                        _winapi.FILE_FLAG_OVERLAPPED, _winapi.NULL)

    def read(self, size: int) -> bytes:
        operation, _ = self.api.ReadFile(self.handle, size, overlapped=True)
        count, error = operation.GetOverlappedResult(True)
        if error:
            raise OSError(error, "Native pipe read failed")
        return operation.getbuffer()[:count]

    def write(self, data: bytes) -> None:
        offset = 0
        while offset < len(data):
            operation, _ = self.api.WriteFile(self.handle, data[offset:], overlapped=True)
            count, error = operation.GetOverlappedResult(True)
            if error or count == 0:
                raise OSError(error, "Native pipe write failed")
            offset += count

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.api.CloseHandle(self.handle)


def read_exact(stream: BinaryIO, size: int) -> bytes:
    result = bytearray()
    while len(result) < size:
        chunk = stream.read(size - len(result))
        if not chunk:
            raise EOFError
        result.extend(chunk)
    return bytes(result)


def read_message(stream: BinaryIO) -> bytes:
    size = struct.unpack("<I", read_exact(stream, 4))[0]
    if size < 2 or size > MAX_MESSAGE_BYTES:
        raise ValueError("Invalid native message size")
    payload = read_exact(stream, size)
    json.loads(payload)
    return payload


def write_message(stream: BinaryIO, payload: bytes) -> None:
    if len(payload) > MAX_MESSAGE_BYTES:
        raise ValueError("Invalid native message size")
    stream.write(struct.pack("<I", len(payload)))
    stream.write(payload)
    stream.flush()


def authorized_caller(arguments: list[str]) -> bool:
    # Mozilla passes the manifest path followed by the add-on ID; Chromium passes its origin.
    return (len(arguments) >= 1 and arguments[0] == f"chrome-extension://{EXTENSION_ID}/") or (len(arguments) == 2 and arguments[1] == FIREFOX_EXTENSION_ID)


def main() -> int:
    if not authorized_caller(sys.argv[1:]):
        return 1
    if os.name != "nt":
        return 1
    # Chrome reads this process's stderr as UTF-8, while a localized Windows install
    # encodes it with the system code page, so a non-ASCII path in a failure message
    # would reach the browser log as replacement characters.
    reconfigure = getattr(sys.stderr, "reconfigure", None)
    if reconfigure is not None:
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (ValueError, OSError):
            pass
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    descriptor = Path(os.environ["LOCALAPPDATA"]) / "Nola" / "Browser" / "connection.json"
    try:
        connection = json.loads(descriptor.read_text(encoding="utf-8"))
        if connection["extensionId"] != EXTENSION_ID or connection["protocolVersion"] != 1:
            return 1
        pipe_name = connection["pipe"]
        if not pipe_name.startswith("\\\\.\\pipe\\nola-browser-"):
            return 1
        # Synchronous Windows pipe handles serialize I/O even when duplicated. CPython's
        # multiprocessing connection uses the same overlapped API for independent directions.
        with WindowsPipe(pipe_name) as pipe:
            authentication = json.dumps({key: connection[key] for key in ("extensionId", "protocolVersion", "token")}).encode("utf-8")
            pipe.write(authentication + b"\n")

            def receive() -> None:
                try:
                    buffer = bytearray()
                    while True:
                        chunk = pipe.read(4096)
                        if not chunk:
                            break
                        buffer.extend(chunk)
                        while b"\n" in buffer:
                            payload, _, rest = buffer.partition(b"\n")
                            buffer = bytearray(rest)
                            write_message(sys.stdout.buffer, payload)
                except (OSError, ValueError) as error:
                    # The browser collects the host's stderr, so a failure is named there instead
                    # of ending the process as if it had closed normally.
                    print(f"Nola native host stopped: {error}", file=sys.stderr)
                    sys.stderr.flush()
                    os._exit(1)
                # Browser stdin may remain open after the desktop exits.
                os._exit(0)

            threading.Thread(target=receive, daemon=True).start()
            while True:
                pipe.write(read_message(sys.stdin.buffer) + b"\n")
    except EOFError:
        return 0
    except (OSError, ValueError, KeyError) as error:
        print(f"Nola native connection failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
