import json
import subprocess
import sys

from nola_translator_engine.protocol import MAX_PROTOCOL_LINE_BYTES


def _send(process: subprocess.Popen[str], message: dict[str, object]) -> dict[str, object]:
    assert process.stdin is not None
    assert process.stdout is not None
    process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
    process.stdin.flush()
    return json.loads(process.stdout.readline())


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
