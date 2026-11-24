"""Bounded, process-lifetime history for the performance monitor."""

import asyncio
from collections import deque
from contextlib import contextmanager
import ctypes as ct
import os
import time
from typing_extensions import NotRequired, TypedDict

from ...debug_log import log_exception

from .performance_hardware import HardwareSampler

HISTORY_MS = 30 * 60 * 1000


class CallReading(TypedDict):
    at: float
    model: NotRequired[str]
    duration: NotRequired[float]
    queue: NotRequired[float | None]
    total: NotRequired[float]
    taskId: NotRequired[str]


class TaskReading(TypedDict):
    at: float
    active: int
    queued: int


class AllocationReading(TypedDict):
    models: list[str]
    used: float


class GpuReading(TypedDict):
    id: str
    name: NotRequired[str]
    used: NotRequired[float]
    sharedUsed: NotRequired[float]
    integrated: NotRequired[bool]
    capacity: NotRequired[float]
    load: NotRequired[float]
    allocations: NotRequired[list[AllocationReading]]


class HardwareReading(TypedDict):
    at: float
    cpu: NotRequired[float]
    ram: NotRequired[float]
    ramCapacity: NotRequired[float]
    gpus: list[GpuReading]


class PerformanceSnapshot(TypedDict):
    end: float
    calls: list[CallReading]
    tasks: list[TaskReading]
    hardware: list[HardwareReading]
    loadedModels: NotRequired[dict[str, str]]


def epoch_ms():
    if os.name == "nt":
        stamp = ct.c_uint64()
        ct.windll.kernel32.GetSystemTimePreciseAsFileTime(ct.byref(stamp))
        return (stamp.value - 116444736000000000) / 10_000
    return time.time_ns() / 1_000_000


class PerformanceHistory:
    def __init__(self):
        self.active = self.queued = 0
        self.calls = deque(maxlen=30000)
        self.tasks = deque(maxlen=30000)
        self.hardware = deque(maxlen=400)
        self._counts()

    def _counts(self):
        self.tasks.append({"at": epoch_ms(), "active": self.active, "queued": self.queued})

    @contextmanager
    def waiting(self):
        self.queued += 1
        self._counts()
        start = time.perf_counter_ns()
        try:
            yield lambda: (time.perf_counter_ns() - start) / 1_000_000
        finally:
            self.queued -= 1
            self._counts()

    def begin_call(self, model, queue_ms=None):
        self.active += 1
        self._counts()
        start = time.perf_counter_ns()
        done = False

        def finish():
            nonlocal done
            if done:
                return
            done = True
            self.calls.append({"at": epoch_ms(), "model": model,
                               "duration": (time.perf_counter_ns() - start) / 1_000_000, "queue": queue_ms})
            self.active -= 1
            self._counts()

        return finish

    def cloud_observer(self, queue_ms):
        def begin(model, queued=None):
            nonlocal queue_ms
            total_queue = queue_ms if queued is None else (queue_ms or 0) + queued
            queue_ms = None
            return self.begin_call(model, total_queue)

        return begin, self.waiting

    @contextmanager
    def executing(self, model, queue_ms=None):
        finish = self.begin_call(model, queue_ms)
        try:
            yield
        finally:
            finish()

    @contextmanager
    def task(self, task_id):
        start = time.perf_counter_ns()
        try:
            yield
        finally:
            self.calls.append({"at": epoch_ms(), "total": (time.perf_counter_ns() - start) / 1_000_000,
                               "taskId": str(task_id)})

    def snapshot(self) -> PerformanceSnapshot:
        end = epoch_ms()
        cutoff = end - HISTORY_MS
        def recent(rows, baseline=False):
            while len(rows) > 1 and rows[1]["at"] < cutoff:
                rows.popleft()
            return [row for row in rows if baseline or row["at"] >= cutoff]
        return {"end": end, "calls": recent(self.calls), "tasks": recent(self.tasks, True),
                "hardware": recent(self.hardware)}

    async def sample_hardware(self, instances):
        sampler = HardwareSampler()
        reading = None
        try:
            while True:
                start = time.monotonic()
                owners = {}
                for instance in instances():
                    pid = getattr(instance.handle, "pid", None)
                    if pid is not None and not instance.configuration.is_cloud:
                        owners.setdefault(pid, set()).add(instance.definition.model_id)
                reading = asyncio.create_task(asyncio.to_thread(sampler.read, owners))
                try:
                    values = await asyncio.shield(reading)
                except Exception as error:
                    log_exception("backend", "gateway.performance.sample_failed", error)
                    values = {"gpus": []}
                self.hardware.append({"at": epoch_ms(), **values})
                # CPU and GPU utilization counters need two readings before their first value.
                interval = 0.5 if len(self.hardware) == 1 else 5
                await asyncio.sleep(max(0, interval - (time.monotonic() - start)))
        finally:
            if reading is not None:
                await asyncio.gather(reading, return_exceptions=True)
            sampler.close()
