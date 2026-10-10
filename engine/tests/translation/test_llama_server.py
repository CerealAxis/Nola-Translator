"""llama_server unit tests: all against a fake llama-server, plus one real local HTTP server covering the JSON path."""

from __future__ import annotations

import json
import io
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from nola_translator_engine.translation.llama_server import (
    LlamaServerError,
    LlamaServerManager,
    resolve_llama_dir,
)

_MIB = 1024 * 1024


class FakeProcess:
    def __init__(self, *, alive: bool = True, pid: int = 424242) -> None:
        self.returncode = None if alive else 3
        self.pid = pid
        self.terminated = False
        self.waited = 0
        self.stderr = io.StringIO("offloaded 20/20 layers\n")

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.terminated = True
        self.returncode = -15

    def wait(self, timeout: float | None = None) -> int | None:
        self.waited += 1
        return self.returncode


class FakePopen:
    def __init__(self, factory=None) -> None:
        self.calls: list[dict] = []
        self._factory = factory or (lambda _args: FakeProcess())

    def __call__(self, args, **kwargs):
        self.calls.append({"args": list(args), "kwargs": kwargs})
        return self._factory(list(args))


def scripted(values):
    iterator = iter(values)

    def next_value():
        return next(iterator, 0)

    return next_value


def scripted_health(values, log: list[str] | None = None):
    iterator = iter(values)

    def health(url: str, timeout: float) -> int:
        if log is not None:
            log.append(url)
        threading.Event().wait(0.01)
        return next(iterator, 0)

    return health


def make_manager(tmp_path, popen, *, health=None, vram=None, sleep=None):
    llama_dir = tmp_path / "llama"
    llama_dir.mkdir(exist_ok=True)
    (llama_dir / "llama-server.exe").write_bytes(b"MZ")
    gguf = tmp_path / "Hy-MT2.gguf"
    gguf.write_bytes(b"GGUF")

    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    manager = LlamaServerManager(
        llama_dir,
        gguf,
        popen=popen,
        health_get=health,
        vram_delta_fn=vram,
        sleep=sleep or fake_sleep,
    )
    return manager, llama_dir, sleeps


async def test_start_gpu_becomes_ready_with_cuda_device(tmp_path) -> None:
    popen = FakePopen()
    health_log: list[str] = []
    manager, llama_dir, sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([0, 0, 200], health_log),
        vram=scripted([0, 900 * _MIB]),
    )
    assert manager.ready is False and manager.device is None

    device = await manager.start(timeout_s=5)

    assert device == "cuda"
    assert manager.ready is True and manager.device == "cuda"
    assert len(popen.calls) == 1
    args = popen.calls[0]["args"]
    assert args[args.index("--host") + 1] == "127.0.0.1"
    assert args[args.index("-ngl") + 1] == "auto"
    assert "--jinja" in args
    assert "--no-warmup" in args
    assert args[args.index("-c") + 1] == "2048"
    assert args[args.index("-np") + 1] == "1"
    assert args[args.index("-b") + 1] == "128"
    assert 1 <= int(args[args.index("-t") + 1]) <= (os.cpu_count() or 2)
    assert popen.calls[0]["kwargs"]["cwd"] == str(llama_dir)
    assert health_log and all(url.startswith("http://127.0.0.1:") for url in health_log)
    assert sleeps == [0.25, 0.25]


async def test_gpu_early_exit_retries_with_cpu(tmp_path) -> None:
    processes: list[FakeProcess] = []

    def factory(_args):
        process = FakeProcess(alive=bool(processes))  # The first process is already dead; the retry stays alive.
        if not processes:
            process.stderr = io.StringIO("CUDA error: failed to allocate\n")
        processes.append(process)
        return process

    popen = FakePopen(factory)
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([200]),
        vram=scripted([0]),
    )

    device = await manager.start(timeout_s=5)

    assert device == "cpu"
    assert len(popen.calls) == 2
    assert popen.calls[1]["args"][popen.calls[1]["args"].index("-ngl") + 1] == "0"
    assert processes[0].waited >= 1


async def test_gpu_health_timeout_then_cpu_failure_raises(tmp_path) -> None:
    processes: list[FakeProcess] = []
    popen = FakePopen(lambda _args: processes.append(FakeProcess()) or processes[-1])
    health_log: list[str] = []
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([0], health_log),
        vram=scripted([0]),
    )

    with pytest.raises(LlamaServerError) as info:
        await manager.start(timeout_s=0)

    message = str(info.value)
    assert "ngl=auto" in message and "健康检查超时" in message
    assert len(popen.calls) == 1
    assert all(process.terminated for process in processes)
    assert manager.ready is False and manager.device is None
    assert len(health_log) == 1


async def test_silent_cpu_fallback_reports_cpu_device(tmp_path) -> None:
    process = FakeProcess()
    process.stderr = io.StringIO("offloaded 0/20 layers\n")
    popen = FakePopen(lambda _args: process)
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([200]),
        vram=scripted([0, 1 * _MIB]),
    )

    device = await manager.start(timeout_s=5)

    assert device == "cpu"
    assert manager.ready is True
    assert len(popen.calls) == 1


async def test_auto_layers_work_without_cuda(tmp_path) -> None:
    process = FakeProcess()
    process.stderr = io.StringIO()
    popen = FakePopen(lambda _args: process)
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path, popen, health=scripted_health([200]), vram=lambda: None
    )

    assert await manager.start(timeout_s=5) == "unknown"
    assert popen.calls[0]["args"][popen.calls[0]["args"].index("-ngl") + 1] == "auto"


async def test_start_is_idempotent(tmp_path) -> None:
    popen = FakePopen()
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([200]),
        vram=scripted([0, 900 * _MIB]),
    )

    first = await manager.start(timeout_s=5)
    second = await manager.start(timeout_s=5)

    assert first == second == "cuda"
    assert len(popen.calls) == 1


async def test_stop_terminates_and_is_idempotent(tmp_path) -> None:
    process = FakeProcess()
    popen = FakePopen(lambda _args: process)
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path,
        popen,
        health=scripted_health([200]),
        vram=scripted([0, 900 * _MIB]),
    )
    await manager.start(timeout_s=5)

    await manager.stop()

    assert process.terminated is True and process.waited >= 1
    assert manager.ready is False and manager.device is None
    with pytest.raises(LlamaServerError):
        manager.chat_sync([{"role": "user", "content": "hi"}])

    await manager.stop()


async def test_stop_before_start_is_noop(tmp_path) -> None:
    popen = FakePopen()
    manager, _llama_dir, _sleeps = make_manager(tmp_path, popen, vram=scripted([0]))
    await manager.stop()
    assert popen.calls == []


def _server_factory(captured: dict, fail_chat: list[bool], servers: list):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args) -> None:
            return None

        def do_GET(self) -> None:
            body = b"ok"
            self.send_response(200 if self.path == "/health" else 404)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self) -> None:
            length = int(self.headers.get("Content-Length") or 0)
            captured["payload"] = json.loads(self.rfile.read(length).decode("utf-8"))
            if fail_chat[0]:
                body = b""
                self.send_response(500)
            else:
                body = json.dumps(
                    {"choices": [{"message": {"content": "  你好，世界。 "}}]}
                ).encode("utf-8")
                self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def factory(args: list[str]) -> FakeProcess:
        port = int(args[args.index("--port") + 1])
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        servers.append(server)
        return FakeProcess()

    return factory


def _shutdown(servers: list) -> None:
    for server in servers:
        server.shutdown()
        server.server_close()


async def test_chat_sync_parses_content_from_real_server(tmp_path) -> None:
    captured: dict = {}
    servers: list = []
    popen = FakePopen(_server_factory(captured, [False], servers))
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path, popen, vram=scripted([0, 900 * _MIB])
    )
    try:
        await manager.start(timeout_s=5)
        content = manager.chat_sync([{"role": "user", "content": "Hello"}])
        assert content == "你好，世界。"
        payload = captured["payload"]
        assert payload["temperature"] == 0
        assert payload["stream"] is False
        assert payload["messages"] == [{"role": "user", "content": "Hello"}]
    finally:
        _shutdown(servers)


async def test_chat_sync_non_2xx_raises(tmp_path) -> None:
    captured: dict = {}
    servers: list = []
    popen = FakePopen(_server_factory(captured, [True], servers))
    manager, _llama_dir, _sleeps = make_manager(
        tmp_path, popen, vram=scripted([0, 900 * _MIB])
    )
    try:
        await manager.start(timeout_s=5)
        with pytest.raises(LlamaServerError):
            manager.chat_sync([{"role": "user", "content": "Hello"}])
    finally:
        _shutdown(servers)


async def test_missing_exe_raises_with_path_context(tmp_path) -> None:
    llama_dir = tmp_path / "empty"
    llama_dir.mkdir()
    gguf = tmp_path / "model.gguf"
    gguf.write_bytes(b"GGUF")
    popen = FakePopen()
    manager = LlamaServerManager(llama_dir, gguf, popen=popen, sleep=_noop_sleep)

    with pytest.raises(LlamaServerError) as info:
        await manager.start()

    assert "llama-server.exe" in str(info.value)
    assert str(llama_dir) in str(info.value)
    assert popen.calls == []


async def test_inventory_memory_changes_do_not_restart_resident_server(tmp_path) -> None:
    from dataclasses import replace
    from nola_translator_engine.compute import ComputeDevice, ComputeOptions

    popen = FakePopen()
    manager, _, _ = make_manager(tmp_path, popen, health=scripted_health([200]))
    device = ComputeDevice('gpu', 'GPU', 'cuda', llamaDevice='CUDA0', freeMemoryMb=8000)
    manager.configure_compute(device, ComputeOptions())
    await manager.start()
    manager.configure_compute(replace(device, freeMemoryMb=3000, score=500), ComputeOptions())
    await manager.start()
    assert len(popen.calls) == 1


async def _noop_sleep(seconds: float) -> None:
    return None


def test_resolve_llama_dir_env_precedence(monkeypatch, tmp_path) -> None:
    custom = tmp_path / "custom-llama"
    custom.mkdir()
    monkeypatch.setenv("NOLA_TRANSLATOR_LLAMA_DIR", str(custom))
    assert resolve_llama_dir() == custom


def test_resolve_llama_dir_dev_fallback(monkeypatch) -> None:
    monkeypatch.setenv("NOLA_TRANSLATOR_LLAMA_DIR", "   ")
    resolved = resolve_llama_dir()
    assert resolved == Path(__file__).resolve().parents[3] / "vendor" / "llama"


def test_resolve_llama_dir_packaged(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("NOLA_TRANSLATOR_LLAMA_DIR", raising=False)
    resources = tmp_path / "resources"
    engine_dir = resources / "engine"
    engine_dir.mkdir(parents=True)
    exe = engine_dir / "NolaTranslatorEngine.exe"
    exe.write_bytes(b"MZ")
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(exe))
    assert resolve_llama_dir() == resources / "llama"

async def test_openvino_passes_native_device_to_child(tmp_path):
    from nola_translator_engine.compute import ComputeDevice, ComputeOptions
    popen = FakePopen()
    manager, _, _ = make_manager(tmp_path, popen, health=scripted_health([200]))
    manager.configure_compute(ComputeDevice("ov", "Intel GPU", "openvino", llamaDevice="OPENVINO1", llamaDeviceNative="GPU.0"), ComputeOptions())
    assert await manager.start(timeout_s=5) == "Intel GPU"
    assert popen.calls[0]["kwargs"]["env"]["GGML_OPENVINO_DEVICE"] == "GPU.0"
    assert popen.calls[0]["args"][popen.calls[0]["args"].index("--device") + 1] == "OPENVINO1"
