import io
import json
import queue
import subprocess
import sys
import threading
from unittest import mock

from nola_translator_engine.__main__ import _redirect_third_party_stdout
from nola_translator_engine.protocol import MAX_PROTOCOL_LINE_BYTES


def _read_line(stream, timeout: float = 15.0) -> str:
    """Reads a line with a timeout, so a protocol event written to the wrong stream fails the test instead of hanging forever."""
    result: queue.Queue[str] = queue.Queue()
    threading.Thread(target=lambda: result.put(stream.readline()), daemon=True).start()
    try:
        line = result.get(timeout=timeout)
    except queue.Empty as error:
        raise AssertionError("引擎在超时内没有回协议行——事件可能被写到了 stderr") from error
    return line


def _send(process: subprocess.Popen[str], message: dict[str, object]) -> dict[str, object]:
    assert process.stdin is not None
    assert process.stdout is not None
    process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
    process.stdin.flush()
    return json.loads(_read_line(process.stdout))


def test_third_party_stdout_noise_never_reaches_protocol_channel() -> None:
    """funasr's check_for_update prints its version before the disable flag is even consulted.

    stdout is the JSONL protocol channel, and a non-JSON line there makes the client
    treat the engine as protocol-corrupt and kill it. This pins the invariant that
    third-party noise goes to stderr while protocol events stay on stdout.
    """
    protocol_out = io.StringIO()
    log_out = io.StringIO()
    with mock.patch("sys.stdout", protocol_out), mock.patch("sys.stderr", log_out):
        saved = _redirect_third_party_stdout()
        assert saved is protocol_out
        assert sys.stdout is log_out

        print("funasr version: 1.4.16.")
        print('{"protocolVersion":1,"type":"ready"}', file=saved, flush=True)

    assert log_out.getvalue() == "funasr version: 1.4.16.\n"
    assert "funasr" not in protocol_out.getvalue()
    assert json.loads(protocol_out.getvalue())["type"] == "ready"


def test_jsonl_cli_handles_handshake_errors_size_limit_and_shutdown() -> None:
    process = subprocess.Popen(
        [sys.executable, "-m", "nola_translator_engine"],
        cwd="engine",
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    try:
        ready = _send(
            process,
            {
                "protocolVersion": 1,
                "type": "hello",
                "requestId": "hello-1",
                "clientVersion": "0.1.0",
            },
        )
        assert ready["type"] == "ready"

        unsupported = _send(
            process,
            {"protocolVersion": 2, "type": "hello", "requestId": "hello-2", "clientVersion": "0.1.0"},
        )
        assert unsupported["code"] == "unsupportedProtocol"

        oversized = _send(
            process,
            {
                "protocolVersion": 1,
                "type": "hello",
                "requestId": "large-1",
                "clientVersion": "x" * MAX_PROTOCOL_LINE_BYTES,
            },
        )
        assert oversized["code"] == "lineTooLarge"

        stopped = _send(
            process,
            {"protocolVersion": 1, "type": "shutdown", "requestId": "shutdown-1"},
        )
        assert stopped["type"] == "shutdownComplete"
        assert process.wait(timeout=2) == 0
        assert process.stdout is not None
        assert process.stdout.read() == ""
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=2)
