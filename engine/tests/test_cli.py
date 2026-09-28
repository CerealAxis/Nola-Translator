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
    """带超时读一行；协议事件写错流时测试要失败，而不是无限挂死。"""
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
    """funasr 的 check_for_update 在判断 disable 之前就会 print 版本号。

    stdout 是 JSONL 协议通道，客户端遇到非 JSON 行会判定协议损坏并杀掉引擎。
    这里锁住「噪声改走 stderr、协议事件留在原 stdout」这条不变式。
    """
    protocol_out = io.StringIO()
    log_out = io.StringIO()
    with mock.patch("sys.stdout", protocol_out), mock.patch("sys.stderr", log_out):
        saved = _redirect_third_party_stdout()
        assert saved is protocol_out
        assert sys.stdout is log_out

        print("funasr version: 1.4.16.")  # 第三方噪声
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
