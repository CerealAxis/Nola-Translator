"""Local model worker: a persistent subprocess that reuses the existing
`nola_translator_engine.local_call` inference protocol.

The gateway deliberately does not re-implement ASR/MT/TTS/LLM inference. It
owns lifecycle, leases, capability matching and resource admission, then drives
the same owner-scoped worker the desktop already trusts (doc 08 §6, doc 11 M02:
"preserve existing local runtime isolation and explicit load policy"). The child
keeps torch/llama/CrispASR DLLs out of the FastAPI control process and reports
its own exit so a crash marks the instance failed instead of silently serving.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from .capabilities import GatewayError, GatewayErrorCode


def _bootstrap_source() -> tuple[list[str], list[str]]:
    """Mirror local_call.retry_tts_on_cpu: import paths + native DLL dirs so the
    child can load torch/llama/CrispASR exactly like the caption worker does."""

    import_paths = list(dict.fromkeys(str(Path(path).resolve()) for path in sys.path if path))
    native_paths = [str(Path(sys.executable).resolve().parent)]
    for path in import_paths:
        root = Path(path)
        if (root / "torch" / "__init__.py").is_file():
            native_paths.extend((path, str(root / "Library" / "bin"), str(root / "bin")))
        if (root / "crispasr" / "__init__.py").is_file():
            native_paths.extend((path, str(root / "crispasr" / "vulkan")))
    return import_paths, list(dict.fromkeys(native_paths))


def _child_env(model_dir: str | None) -> dict[str, str]:
    """A minimal, offline environment. Secrets and unrelated vars are dropped so
    the worker never inherits renderer/cloud credentials (doc 08 §9)."""

    env = {
        key: os.environ[key]
        for key in (
            "SystemRoot",
            "WINDIR",
            "PATH",
            "TEMP",
            "TMP",
            "TMPDIR",
            "NOLA_TRANSLATOR_MODEL_DIR",
            "NOLA_TRANSLATOR_LLAMA_DIR",
        )
        if key in os.environ
    }
    if model_dir:
        env["NOLA_TRANSLATOR_MODEL_DIR"] = model_dir
    env.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", PYTHONIOENCODING="utf-8")
    return env


@dataclass
class WorkerRequest:
    """One local_call inference request. `config` is the PrewarmConfig the
    caller (pipeline/desktop) already built; the gateway passes it through
    verbatim rather than re-deriving model placement."""

    kind: str
    config: dict[str, Any]
    resource_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    gateway_device: str | None = None

    def to_line(self, request_id: str) -> str:
        body: dict[str, Any] = {"id": request_id, "kind": self.kind, "config": self.config}
        if self.resource_id is not None:
            body["resourceId"] = self.resource_id
        body.update(self.payload)
        if self.gateway_device is not None:
            body["gatewayDevice"] = self.gateway_device
        return json.dumps(body, ensure_ascii=True)


class LocalModelWorker:
    """Async persistent wrapper around one local_call subprocess.

    A single reader task dispatches responses by id to waiting futures, so
    multiple leases can share one loaded worker while each request stays
    attributable. Process exit fails every pending future and latches `exited`
    so the lifecycle manager can transition the instance to FAILED and release
    its reservation (doc 08 §8: worker exit is monitored independently of task
    deadlines).
    """

    def __init__(self, *, model_dir: str | None = None, estimated_memory_mb: float = 0.0) -> None:
        self._model_dir = model_dir
        self.estimated_memory_mb = estimated_memory_mb
        self._process: asyncio.subprocess.Process | None = None
        self._reader_task: asyncio.Task | None = None
        self._pending: dict[str, asyncio.Future] = {}
        self._write_lock = asyncio.Lock()
        self.exited = False
        self.exit_code: int | None = None
        self._stderr_tail: list[str] = []
        self._batch_queue: list[tuple[WorkerRequest, asyncio.Future, float | None, int]] = []
        self._batch_task: asyncio.Task | None = None

    async def request_batch(self, request: WorkerRequest, *, limit: int, timeout: float | None = None) -> dict[str, Any]:
        future = asyncio.get_running_loop().create_future()
        self._batch_queue.append((request, future, timeout, limit))
        if self._batch_task is None:
            self._batch_task = asyncio.create_task(self._flush_batches())
        try:
            return await asyncio.shield(future)
        except asyncio.CancelledError:
            queued = next((item for item in self._batch_queue if item[1] is future), None)
            if queued is not None:
                self._batch_queue.remove(queued)
                future.cancel()
                raise
            # Native batch inference cannot cancel just one item; keep its lease until completion.
            while not future.done():
                try:
                    await asyncio.shield(future)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    break
            if not future.cancelled():
                future.exception()
            raise

    async def _flush_batches(self) -> None:
        try:
            while self._batch_queue:
                await asyncio.sleep(0.005)
                if not self._batch_queue:
                    break
                first = self._batch_queue.pop(0)
                request, _, _, limit = first
                key = (request.kind, request.config, request.resource_id, request.gateway_device,
                       request.payload.get("source"), request.payload.get("target"))
                group = [first]
                size = len(request.to_line("0"))
                for item in list(self._batch_queue):
                    candidate = item[0]
                    other = (candidate.kind, candidate.config, candidate.resource_id, candidate.gateway_device,
                             candidate.payload.get("source"), candidate.payload.get("target"))
                    candidate_size = len(candidate.to_line("0"))
                    if other == key and len(group) < min(limit, item[3]) and size + candidate_size < 39_000_000 and not candidate.payload.get("inspect"):
                        self._batch_queue.remove(item)
                        group.append(item)
                        size += candidate_size
                        limit = min(limit, item[3])
                try:
                    if len(group) == 1:
                        response = await self.request(request, timeout=first[2])
                        results = [response]
                    else:
                        body = [json.loads(item[0].to_line(str(index))) for index, item in enumerate(group)]
                        response = await self.request(WorkerRequest("batch", request.config,
                            payload={"requests": body}), timeout=max(item[2] or 600 for item in group))
                        results = [{"error": response["error"]} for _ in group] if response.get("error") else response.get("results")
                        if not isinstance(results, list) or len(results) != len(group) or not all(isinstance(item, dict) for item in results):
                            raise ValueError("Invalid batch inference response")
                    for item, result in zip(group, results):
                        item[1].set_result(result)
                except Exception as error:
                    for item in group:
                        item[1].set_exception(error)
        finally:
            self._batch_task = None

    @property
    def running(self) -> bool:
        return self._process is not None and self._process.returncode is None and not self.exited

    async def start(self, *, on_exit: Callable[[], Awaitable[None]] | None = None) -> None:
        if self.running:
            return
        import_paths, native_paths = _bootstrap_source()
        bootstrap = (
            "import os,sys,runpy; "
            f"sys.path[:0]={json.dumps(import_paths)}; "
            f"_nola_dll_handles=[os.add_dll_directory(p) for p in {json.dumps(native_paths)} if hasattr(os, 'add_dll_directory') and os.path.isdir(p)]; "
            'runpy.run_module("nola_translator_engine.local_call", run_name="__main__")'
        )
        creationflags = getattr(subprocess_flags(), "CREATE_NO_WINDOW", 0)
        self._process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-I",
            "-X",
            "utf8",
            "-c",
            bootstrap,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(Path(sys.executable).resolve().parent),
            env=_child_env(self._model_dir),
            creationflags=creationflags,
        )
        self.exited = False
        self._reader_task = asyncio.create_task(self._read_loop(on_exit))

    async def request(self, request: WorkerRequest, *, timeout: float | None = None) -> dict[str, Any]:
        if not self.running:
            raise GatewayError(
                GatewayErrorCode.WORKER_EXITED,
                stage="worker",
                message="local model worker is not running",
                fatal_scope="instance",
            )
        request_id = f"gw-{uuid4().hex[:12]}"
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        line = request.to_line(request_id)
        self._pending[request_id] = future
        sent = False
        try:
            async with asyncio.timeout(timeout):
                async with self._write_lock:
                    assert self._process is not None and self._process.stdin is not None
                    self._process.stdin.write((line + "\n").encode("utf-8"))
                    sent = True
                    await self._process.stdin.drain()
                return await future
        except (asyncio.CancelledError, TimeoutError) as error:
            if sent and not (future.done() and not future.cancelled()):
                # The worker has no per-request abort. Wait for its exit before releasing the lease.
                future.cancel()
                await self.abort()
            if isinstance(error, asyncio.CancelledError):
                raise
            raise GatewayError(
                GatewayErrorCode.TIMEOUT,
                stage="worker",
                message=f"local inference timed out after {timeout}s",
                fatal_scope="instance" if sent else "lease",
            ) from error
        except (BrokenPipeError, ConnectionResetError):
            await self.abort()
            return await future
        finally:
            self._pending.pop(request_id, None)

    async def abort(self) -> None:
        process = self._process
        if process is not None:
            await self._kill(process)
        if self._reader_task is not None:
            await self._reader_task

    async def _kill(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        if sys.platform == "win32":
            import subprocess

            # The Python worker may own a persistent llama-server process.
            system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
            try:
                await asyncio.to_thread(
                    subprocess.run,
                    [str(system_root / "System32" / "taskkill.exe"), "/PID", str(process.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
            except (OSError, subprocess.TimeoutExpired):
                pass
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass

    async def _read_loop(self, on_exit: Callable[[], Awaitable[None]] | None) -> None:
        assert self._process is not None
        stdout = self._process.stdout
        stderr = self._process.stderr
        assert stdout is not None
        stderr_task = asyncio.create_task(self._drain_stderr(stderr))
        try:
            while True:
                raw = await stdout.readline()
                if not raw:
                    break
                try:
                    message = json.loads(raw.decode("utf-8", errors="replace"))
                except json.JSONDecodeError:
                    continue
                if not isinstance(message, dict):
                    continue
                request_id = message.get("id")
                future = self._pending.get(request_id) if isinstance(request_id, str) else None
                if future is not None and not future.done():
                    future.set_result(message)
        except ValueError:
            await self._kill(self._process)
            await stdout.read()
        finally:
            await self._process.wait()
            await self._mark_exited()
            stderr_task.cancel()
            if on_exit is not None:
                await on_exit()

    async def _drain_stderr(self, stderr: asyncio.StreamReader | None) -> None:
        if stderr is None:
            return
        try:
            while True:
                raw = await stderr.readline()
                if not raw:
                    break
                self._stderr_tail.append(raw.decode("utf-8", errors="replace").rstrip())
                if len(self._stderr_tail) > 40:
                    self._stderr_tail.pop(0)
        except (asyncio.CancelledError, ValueError):
            return

    async def _mark_exited(self) -> None:
        self.exited = True
        if self._process is not None:
            self.exit_code = self._process.returncode
        error = GatewayError(
            GatewayErrorCode.WORKER_EXITED,
            stage="worker",
            message="; ".join(self._stderr_tail[-3:]) or "local model worker exited",
            fatal_scope="instance",
        )
        for future in list(self._pending.values()):
            if not future.done():
                future.set_exception(error)
        self._pending.clear()

    def resident_memory_mb(self) -> float | None:
        """Measured child RSS when psutil is available; otherwise None so the
        caller keeps its conservative estimate (weights size != VRAM)."""

        if self._process is None or self._process.pid is None:
            return None
        try:
            import psutil  # type: ignore

            return psutil.Process(self._process.pid).memory_info().rss / (1024 * 1024)
        except Exception:
            return None

    async def close(self) -> None:
        if self._process is None:
            return
        process = self._process
        try:
            if process.stdin is not None and not process.stdin.is_closing():
                process.stdin.close()
        except Exception:
            pass
        try:
            await asyncio.wait_for(process.wait(), timeout=10)
        except asyncio.TimeoutError:
            await self._kill(process)
            await process.wait()
        if self._reader_task is not None:
            await self._reader_task
        self.exited = True
        self.exit_code = process.returncode


def subprocess_flags():
    """Indirection so tests can assert CREATE_NO_WINDOW is used on Windows."""

    import subprocess

    return subprocess
