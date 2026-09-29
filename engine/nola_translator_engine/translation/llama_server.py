"""llama.cpp llama-server process lifecycle: start, readiness polling, device detection, OpenAI-compatible calls."""

from __future__ import annotations

import asyncio
import json
import os
import socket
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LLAMA_DIR_ENV = "NOLA_TRANSLATOR_LLAMA_DIR"
DEFAULT_GGUF_RELATIVE = Path("hy-mt2-1.8b-q4-k-m") / "Hy-MT2-1.8B-Q4_K_M.gguf"
_HOST = "127.0.0.1"
_HEALTH_POLL_INTERVAL_S = 0.25
_VRAM_THRESHOLD_BYTES = 400 * 1024 * 1024


class LlamaServerError(RuntimeError):
    """llama-server failed to start, or to serve a request."""


def resolve_llama_dir() -> Path | None:
    """Resolve the llama.cpp runtime directory: env → packaged → dev."""
    env_value = os.environ.get(LLAMA_DIR_ENV, "").strip()
    if env_value:
        return Path(env_value)
    if getattr(sys, "frozen", False):
        # packaged exe sits in <resources>/engine/, the llama runtime in <resources>/llama/
        return Path(sys.executable).resolve().parent.parent / "llama"
    dev_dir = Path(__file__).resolve().parents[3] / "vendor" / "llama"
    return dev_dir if dev_dir.is_dir() else None


def default_gguf_path() -> Path:
    """Resolve the default Hy-MT2 GGUF path (NOLA_TRANSLATOR_MODEL_DIR or LOCALAPPDATA)."""
    model_root = Path(
        os.environ.get(
            "NOLA_TRANSLATOR_MODEL_DIR",
            Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Nola Translator" / "models",
        )
    )
    return model_root / DEFAULT_GGUF_RELATIVE


def _default_health_get(url: str, timeout: float) -> int:
    """GET /health; a failed connection returns 0 (not ready yet), an HTTP error returns its status code."""
    try:
        with urlopen(url, timeout=timeout) as response:  # noqa: S310 - loopback only
            return int(response.status)
    except HTTPError as error:
        return int(error.code)
    except (URLError, OSError):
        return 0


def _post_chat(url: str, payload: object, timeout: float) -> Any:
    """POST JSON to the local llama-server; a non-2xx response or network failure raises LlamaServerError."""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=UTF-8"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:  # noqa: S310 - loopback only
            raw = response.read()
    except HTTPError as error:
        raise LlamaServerError(f"llama-server 返回 HTTP {error.code}") from error
    except (URLError, OSError) as error:
        raise LlamaServerError(f"llama-server 请求失败：{error}") from error
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LlamaServerError("llama-server 响应不是有效 JSON") from error


def _default_vram_used() -> float | None:
    """VRAM bytes currently in use; None when torch/CUDA is unavailable."""
    try:
        import torch

        if not torch.cuda.is_available():
            return None
        free, total = torch.cuda.mem_get_info()
    except Exception:
        return None
    return float(total - free)


def _pick_free_port() -> int:
    """Grab a free port on 127.0.0.1 (bound, then released immediately)."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind((_HOST, 0))
        return int(probe.getsockname()[1])


class LlamaServerManager:
    """Single llama-server instance: GPU first, a fixed CPU fallback on failure, loopback only."""

    def __init__(
        self,
        llama_dir: Path | None = None,
        gguf_path: Path | None = None,
        *,
        popen: Callable[..., Any] | None = None,
        health_get: Callable[[str, float], int] | None = None,
        vram_delta_fn: Callable[[], float | None] | None = None,
        sleep: Callable[[float], Any] | None = None,
    ) -> None:
        # injection points, all for tests: popen/health_get/vram_delta_fn/sleep
        self._llama_dir_explicit = llama_dir
        self._gguf_path_explicit = gguf_path
        self._popen = popen if popen is not None else subprocess.Popen
        self._health_get = health_get if health_get is not None else _default_health_get
        # returns "VRAM currently in use" (None = unavailable); start() samples it once
        # before launch and once after, and takes the difference.
        self._vram_used = vram_delta_fn if vram_delta_fn is not None else _default_vram_used
        self._sleep = sleep if sleep is not None else asyncio.sleep
        self._process: Any | None = None
        self._port: int | None = None
        self._ready = False
        self._device: str | None = None

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def device(self) -> str | None:
        return self._device

    def switch_gguf(self, gguf_path: Path) -> bool:
        """Switch to another Hy-MT2 quantization; returns whether anything actually changed.

        llama-server cannot hot-swap models, so this clears the ready flag and lets the
        next start() relaunch with the new GGUF. stop() is async, so this only invalidates
        synchronously and leaves the process to that same start() rebuild path — the one
        outside the "already ready, return early" branch.
        """
        resolved = Path(gguf_path)
        if self._gguf_path_explicit is not None and self._gguf_path_explicit == resolved:
            return False
        self._gguf_path_explicit = resolved
        self._ready = False
        self._device = None
        self._port = None
        process, self._process = self._process, None
        if process is not None:
            self._terminate(process)
        return True

    async def start(self, *, timeout_s: float = 45.0) -> str:
        """Start llama-server and wait until ready; returns the actual device, raises LlamaServerError on failure."""
        if (
            self._ready
            and self._device is not None
            and self._process is not None
            and self._process.poll() is None
        ):
            return self._device
        self._ready = False
        llama_dir = self._llama_dir_explicit or resolve_llama_dir()
        if llama_dir is None:
            raise LlamaServerError(f"未找到 llama.cpp 运行目录（{LLAMA_DIR_ENV} 未设置且开发/打包目录不存在）")
        exe = Path(llama_dir) / "llama-server.exe"
        if not exe.is_file():
            raise LlamaServerError(f"未找到 llama-server.exe：{exe}")
        gguf = self._gguf_path_explicit or default_gguf_path()
        if not gguf.is_file():
            raise LlamaServerError(f"未找到 GGUF 模型：{gguf}")
        baseline = self._vram_used()
        cpu_threads = max(1, min(4, (os.cpu_count() or 2) // 2))
        failures: list[str] = []
        # llama.cpp picks the GPU layer count from the available device and VRAM; a failed start falls back to CPU.
        for ngl, attempt_timeout in (("auto", timeout_s), (0, timeout_s * 2)):
            port = _pick_free_port()
            args = [
                str(exe),
                "--model", str(gguf),
                "--host", _HOST,
                "--port", str(port),
                "-ngl", str(ngl),
                "-c", "1024",
                "-np", "1",
                "-b", "128",
                "-ub", "128",
                "-t", str(cpu_threads),
                "-tb", str(cpu_threads),
                "--jinja",
            ]
            assert args[args.index("--host") + 1] == _HOST, "只能绑定 127.0.0.1"
            process = self._popen(
                args,
                cwd=str(llama_dir),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self._process = process
            if await self._wait_ready(process, port, attempt_timeout):
                self._port = port
                self._ready = True
                self._device = self._decide_device(ngl, baseline)
                return self._device
            reason = "进程提前退出" if process.poll() is not None else "健康检查超时"
            failures.append(f"ngl={ngl}: {reason}")
            self._terminate(process)
            if self._process is process:
                self._process = None
        raise LlamaServerError(f"llama-server 启动失败（{exe}）：" + "；".join(failures))

    async def stop(self) -> None:
        """Terminate llama-server and its child processes; idempotent."""
        process, self._process = self._process, None
        self._ready = False
        self._device = None
        self._port = None
        if process is None:
            return
        self._terminate(process)

    def chat_sync(
        self, messages: list[dict], *, timeout_s: float = 10.0
    ) -> str:
        """POST /v1/chat/completions (temperature=0), returns the stripped translation."""
        port = self._port
        if (
            not self._ready
            or port is None
            or self._process is None
            or self._process.poll() is not None
        ):
            raise LlamaServerError("llama-server 未就绪")
        result = _post_chat(
            f"http://{_HOST}:{port}/v1/chat/completions",
            {"messages": messages, "temperature": 0, "stream": False},
            timeout_s,
        )
        try:
            content = result["choices"][0]["message"]["content"]  # type: ignore[index]
        except (KeyError, IndexError, TypeError) as error:
            raise LlamaServerError("llama-server 响应格式无效") from error
        return str(content).strip()

    async def _wait_ready(self, process: Any, port: int, timeout_s: float) -> bool:
        """Poll /health until 200; a dead process or a timeout counts as failure."""
        url = f"http://{_HOST}:{port}/health"
        deadline = asyncio.get_running_loop().time() + max(timeout_s, 0.0)
        while True:
            if process.poll() is not None:
                return False
            try:
                status = int(self._health_get(url, timeout=1.0))
            except Exception:
                status = 0
            if status == 200:
                return True
            if asyncio.get_running_loop().time() >= deadline:
                return False
            await self._sleep(_HEALTH_POLL_INTERVAL_S)

    def _decide_device(self, ngl: str | int, baseline: float | None) -> str:
        """Decide the device from the actual VRAM delta; without CUDA or a measurement, report CPU conservatively."""
        if ngl == 0:
            return "cpu"
        current = self._vram_used()
        if current is None or baseline is None:
            return "cpu"
        delta = current - baseline
        return "cuda" if delta >= _VRAM_THRESHOLD_BYTES else "cpu"

    def _terminate(self, process: Any) -> None:
        """Terminate the process: on Windows taskkill the whole child tree, otherwise terminate+wait."""
        pid = getattr(process, "pid", None)
        killed_tree = False
        if os.name == "nt" and isinstance(process, subprocess.Popen) and pid:
            try:
                subprocess.run(
                    ["taskkill", "/PID", str(pid), "/T", "/F"],
                    capture_output=True,
                    timeout=10,
                )
                killed_tree = True
            except Exception:
                killed_tree = False
        if not killed_tree:
            try:
                if process.poll() is None:
                    process.terminate()
            except Exception:
                pass
        try:
            process.wait(timeout=5)
        except Exception:
            pass
