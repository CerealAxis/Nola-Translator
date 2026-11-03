"""Device budget and atomic admission (doc 08 §8).

Two concurrent loads must never both see the same free VRAM and both commit.
The budget therefore reserves atomically *before* a load starts, upgrades the
reservation to a measured footprint once the load succeeds, and releases on
failure or worker exit. CPU fallback and cloud placement are accounted for
separately so a local GPU budget is not charged for a network provider.
"""

from __future__ import annotations

import asyncio
import threading
from dataclasses import dataclass, field


@dataclass
class DeviceBudget:
    """Total/reserved/available memory for one device, in MB."""

    device_id: str
    total_mb: float
    #: Head-room kept free for workspace/KV reserve (doc 08 §8).
    reserve_mb: float = 0.0
    reserved_mb: float = 0.0
    #: Reservations keyed by instance_id so a release is idempotent and cannot
    #: double-free after a crash + explicit unload both fire.
    _holds: dict[str, float] = field(default_factory=dict)

    @property
    def available_mb(self) -> float:
        return max(0.0, self.total_mb - self.reserve_mb - self.reserved_mb)

    def try_reserve(self, instance_id: str, amount_mb: float) -> bool:
        if instance_id in self._holds:
            # Re-reserving the same instance is a no-op success (idempotent).
            return True
        if amount_mb <= self.available_mb + 1e-6:
            self._holds[instance_id] = amount_mb
            self.reserved_mb += amount_mb
            return True
        return False

    def commit_measured(self, instance_id: str, measured_mb: float) -> None:
        """Replace an estimate hold with the measured footprint after load."""

        previous = self._holds.get(instance_id)
        if previous is None:
            self._holds[instance_id] = measured_mb
            self.reserved_mb += measured_mb
            return
        self.reserved_mb += measured_mb - previous
        self._holds[instance_id] = measured_mb
        self.reserved_mb = max(0.0, self.reserved_mb)

    def release(self, instance_id: str) -> float:
        held = self._holds.pop(instance_id, 0.0)
        self.reserved_mb = max(0.0, self.reserved_mb - held)
        return held


class ResourceExhausted(RuntimeError):
    def __init__(self, device_id: str, requested_mb: float, available_mb: float) -> None:
        super().__init__(
            f"device {device_id} cannot admit {requested_mb:.0f}MB "
            f"(available {available_mb:.0f}MB)"
        )
        self.device_id = device_id
        self.requested_mb = requested_mb
        self.available_mb = available_mb


class ResourceAdmission:
    """Serialises admission decisions across the whole gateway.

    A single lock makes "check free memory then reserve" atomic so the race in
    doc 08 §8 cannot happen even though loads themselves run concurrently in
    worker subprocesses. Cloud instances bypass the device budget entirely.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._devices: dict[str, DeviceBudget] = {}

    def register_device(self, device_id: str, total_mb: float, *, reserve_mb: float = 0.0) -> None:
        with self._lock:
            existing = self._devices.get(device_id)
            if existing is not None:
                existing.total_mb = total_mb
                existing.reserve_mb = reserve_mb
            else:
                self._devices[device_id] = DeviceBudget(device_id, total_mb, reserve_mb)

    def devices(self) -> dict[str, DeviceBudget]:
        with self._lock:
            return dict(self._devices)

    def snapshot(self, device_id: str) -> DeviceBudget | None:
        with self._lock:
            budget = self._devices.get(device_id)
            if budget is None:
                return None
            return DeviceBudget(
                budget.device_id, budget.total_mb, budget.reserve_mb, budget.reserved_mb, dict(budget._holds)
            )

    def reserve(self, instance_id: str, device_id: str, amount_mb: float) -> None:
        """Atomically reserve budget; raise ResourceExhausted when it does not
        fit. An unregistered device is treated as unbounded (e.g. CPU/system RAM
        we do not cap) unless a budget was explicitly registered."""

        with self._lock:
            budget = self._devices.get(device_id)
            if budget is None:
                return
            if not budget.try_reserve(instance_id, amount_mb):
                raise ResourceExhausted(device_id, amount_mb, budget.available_mb)

    def commit_measured(self, instance_id: str, device_id: str, measured_mb: float) -> None:
        with self._lock:
            budget = self._devices.get(device_id)
            if budget is not None:
                budget.commit_measured(instance_id, measured_mb)

    def release(self, instance_id: str, device_id: str) -> None:
        with self._lock:
            budget = self._devices.get(device_id)
            if budget is not None:
                budget.release(instance_id)


class ConcurrencyGate:
    """Per-instance active-inference admission (doc 08 §8: default one active
    inference per local instance unless re-entrancy + context isolation were
    verified)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, int] = {}
        self._waiters: dict[str, asyncio.Queue] = {}

    def _queue(self, instance_id: str) -> asyncio.Queue:
        queue = self._waiters.get(instance_id)
        if queue is None:
            queue = asyncio.Queue()
            self._waiters[instance_id] = queue
        return queue

    async def acquire(self, instance_id: str, limit: int) -> None:
        queue = self._queue(instance_id)
        while True:
            with self._lock:
                current = self._active.get(instance_id, 0)
                if current < limit:
                    self._active[instance_id] = current + 1
                    return
            await queue.get()

    def release(self, instance_id: str) -> None:
        with self._lock:
            current = self._active.get(instance_id, 0)
            self._active[instance_id] = max(0, current - 1)
        queue = self._waiters.get(instance_id)
        if queue is not None:
            try:
                queue.put_nowait(None)
            except asyncio.QueueFull:  # pragma: no cover - unbounded queue
                pass

    def active(self, instance_id: str) -> int:
        with self._lock:
            return self._active.get(instance_id, 0)
