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
        self.read_stopped = threading.Event()
        self._read_lock = threading.Lock()
        self._pending_read = None

    def read(self, size: int) -> bytes:
        try:
            with self._read_lock:
                if self.read_stopped.is_set():
                    return b""
                operation, _ = self.api.ReadFile(self.handle, size, overlapped=True)
                self._pending_read = operation
            count, error = operation.GetOverlappedResult(True)
            if error == self.api.ERROR_BROKEN_PIPE or self.read_stopped.is_set():
                return b""
            if error:
                raise OSError(error, "Native pipe read failed")
            return operation.getbuffer()[:count]
        except OSError as error:
            if self.read_stopped.is_set() or getattr(error, "winerror", None) == self.api.ERROR_BROKEN_PIPE:
                return b""
            raise
        finally:
            with self._read_lock:
                self._pending_read = None

    def cancel_read(self) -> None:
        with self._read_lock:
            self.read_stopped.set()
            if self._pending_read is not None:
                self._pending_read.cancel()

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
    # The desktop pipe uses newline framing, unlike the browser's length framing.
    return json.dumps(json.loads(payload), ensure_ascii=False, separators=(",", ":")).encode("utf-8")


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
                        while not pipe.read_stopped.is_set() and b"\n" in buffer:
                            payload, _, rest = buffer.partition(b"\n")
                            buffer = bytearray(rest)
                            write_message(sys.stdout.buffer, payload)
                except (OSError, ValueError) as error:
                    if pipe.read_stopped.is_set():
                        return
                    # The browser collects the host's stderr, so a failure is named there instead
                    # of ending the process as if it had closed normally.
                    print(f"Nola native host stopped: {error}", file=sys.stderr)
                    sys.stderr.flush()
                    os._exit(1)
                # Browser stdin may remain open after the desktop exits.
                if not pipe.read_stopped.is_set():
                    os._exit(0)

            receiver = threading.Thread(target=receive, daemon=True)
            receiver.start()
            exit_code = 1
            try:
                while True:
                    pipe.write(read_message(sys.stdin.buffer) + b"\n")
            except EOFError:
                exit_code = 0
                return exit_code
            finally:
                pipe.cancel_read()
                receiver.join(timeout=2)
                # A browser that stopped reading stdout can keep the receiver blocked there.
                if receiver.is_alive():
                    os._exit(exit_code)
    except (OSError, ValueError, KeyError) as error:
        print(f"Nola native connection failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
