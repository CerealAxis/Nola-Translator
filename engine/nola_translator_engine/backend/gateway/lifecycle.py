"""Instance lifecycle, single-flight load and leases (doc 08 §7).

The manager owns the state machine from the doc 08 §7 diagram. Its guarantees:

* single-flight load — concurrent acquires for the same identity key share one
  load and one reservation, then each gets its own lease;
* budget is reserved atomically before load and upgraded to the measured
  footprint after, released on failure/exit (§8);
* a worker crash marks the instance FAILED (never silently ready again) and
  releases its reservation;
* retire/unload only proceeds once in-flight leases actually drain — cancelling
  an await is not treated as "inference stopped".
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Callable, Protocol
from uuid import uuid4

from .capabilities import GatewayError, GatewayErrorCode
from .definitions import (
    IllegalTransition,
    InstanceState,
    ModelDefinition,
    ModelInstance,
    ProviderConfiguration,
)
from .resources import ResourceAdmission, ResourceExhausted


@dataclass
class LoadResult:
    handle: object = None
    measured_memory_mb: float | None = None


class InstanceLoader(Protocol):
    async def load(self, instance: ModelInstance) -> LoadResult: ...
    async def unload(self, instance: ModelInstance) -> None: ...


@dataclass
class Lease:
    lease_id: str
    instance_id: str
    identity_key: str
    config_revision: int
    released: bool = False

    @staticmethod
    def new_id() -> str:
        return f"lease-{uuid4().hex[:12]}"


class InstanceManager:
    def __init__(
        self,
        loader: InstanceLoader,
        admission: ResourceAdmission,
        *,
        device_for: Callable[[ModelInstance], str] | None = None,
    ) -> None:
        self._loader = loader
        self._admission = admission
        self._device_for = device_for or (lambda inst: inst.configuration.device or "cpu")
        self._instances: dict[str, ModelInstance] = {}
        self._by_id: dict[str, ModelInstance] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()
        self._leases: dict[str, Lease] = {}

    # -- introspection ------------------------------------------------------

    def instances(self) -> list[ModelInstance]:
        return list(self._instances.values())

    def get(self, identity_key: str) -> ModelInstance | None:
        return self._instances.get(identity_key)

    def lease(self, lease_id: str) -> Lease | None:
        return self._leases.get(lease_id)

    def _track(self, instance: ModelInstance) -> ModelInstance:
        """Register an instance for both acquire-lookup (by identity key) and
        release-lookup (by instance id). A retired instance leaves the identity
        map so new acquires rebuild, but stays in `_by_id` until its in-flight
        leases actually drain and it unloads."""

        self._by_id[instance.instance_id] = instance
        return instance

    async def _lock_for(self, identity_key: str) -> asyncio.Lock:
        async with self._global_lock:
            lock = self._locks.get(identity_key)
            if lock is None:
                lock = asyncio.Lock()
                self._locks[identity_key] = lock
            return lock

    # -- acquire / load -----------------------------------------------------

    async def acquire(
        self, definition: ModelDefinition, configuration: ProviderConfiguration
    ) -> tuple[ModelInstance, Lease]:
        """Return a READY/BUSY instance plus a new lease, loading single-flight
        if needed. Raises GatewayError on admission or load failure."""

        identity_key = configuration.identity_key()
        lock = await self._lock_for(identity_key)
        async with lock:
            instance = self._instances.get(identity_key)
            if instance is None:
                instance = ModelInstance(
                    instance_id=ModelInstance.new_id(),
                    identity_key=identity_key,
                    definition=definition,
                    configuration=configuration,
                    config_revision=configuration.revision,
                )
                self._instances[identity_key] = instance
                await self._load(instance)
            elif instance.state is InstanceState.FAILED:
                # A crashed instance is reaped and rebuilt, never reused.
                await self._reap(instance)
                instance = ModelInstance(
                    instance_id=ModelInstance.new_id(),
                    identity_key=identity_key,
                    definition=definition,
                    configuration=configuration,
                    config_revision=configuration.revision,
                )
                self._instances[identity_key] = instance
                await self._load(instance)
            elif instance.state in (InstanceState.RETIRING, InstanceState.UNLOADING, InstanceState.UNLOADED):
                raise GatewayError(
                    GatewayErrorCode.LEASE_CONFLICT,
                    stage="lifecycle",
                    message=f"instance is {instance.state.value}; cannot acquire a new lease",
                    fatal_scope="request",
                )
            elif instance.config_revision != configuration.revision:
                # Config changed under a live instance: retire the old one and
                # build a fresh instance at the new revision (doc 08 §7). The
                # old instance keeps serving its existing leases until they end.
                await self.retire(instance)
                instance = ModelInstance(
                    instance_id=ModelInstance.new_id(),
                    identity_key=identity_key,
                    definition=definition,
                    configuration=configuration,
                    config_revision=configuration.revision,
                )
                self._instances[instance.identity_key] = instance
                await self._load(instance)

            lease = self._grant(instance)
            return instance, lease

    async def _load(self, instance: ModelInstance) -> None:
        self._track(instance)
        device = self._device_for(instance)
        estimated = instance.definition.estimated_memory_mb
        try:
            instance.transition(InstanceState.LOADING)
        except IllegalTransition as error:  # pragma: no cover - defensive
            raise GatewayError(
                GatewayErrorCode.LOAD_FAILED, stage="lifecycle", message=str(error), fatal_scope="instance"
            ) from error
        # Reserve atomically before load so two concurrent loads cannot both
        # commit the same free memory (§8).
        if not instance.configuration.is_cloud and estimated > 0:
            try:
                self._admission.reserve(instance.instance_id, device, estimated)
            except ResourceExhausted as error:
                instance.transition(InstanceState.FAILED)
                instance.last_error = str(error)
                raise GatewayError(
                    GatewayErrorCode.RESOURCE_EXHAUSTED,
                    stage="admission",
                    message=str(error),
                    fatal_scope="request",
                ) from error
        try:
            result = await self._loader.load(instance)
        except (GatewayError, asyncio.CancelledError):
            await self._fail(instance, device)
            raise
        except Exception as error:  # weights/runtime/OOM during load
            await self._fail(instance, device)
            raise GatewayError(
                GatewayErrorCode.LOAD_FAILED,
                stage="load",
                message=str(error),
                fatal_scope="instance",
            ) from error
        instance.handle = result.handle
        if result.measured_memory_mb is not None:
            instance.measured_memory_mb = result.measured_memory_mb
            if not instance.configuration.is_cloud:
                self._admission.commit_measured(instance.instance_id, device, result.measured_memory_mb)
        instance.transition(InstanceState.READY)

    async def _fail(self, instance: ModelInstance, device: str) -> None:
        if instance.can_transition(InstanceState.FAILED):
            instance.transition(InstanceState.FAILED)
        if not instance.configuration.is_cloud:
            self._admission.release(instance.instance_id, device)

    async def _reap(self, instance: ModelInstance) -> None:
        device = self._device_for(instance)
        try:
            await self._loader.unload(instance)
        except Exception:
            pass
        if not instance.configuration.is_cloud:
            self._admission.release(instance.instance_id, device)
        if instance.can_transition(InstanceState.UNLOADED):
            if instance.state is InstanceState.FAILED:
                instance.transition(InstanceState.UNLOADED)
        self._instances.pop(instance.identity_key, None)
        self._by_id.pop(instance.instance_id, None)

    def _grant(self, instance: ModelInstance) -> Lease:
        lease = Lease(
            lease_id=Lease.new_id(),
            instance_id=instance.instance_id,
            identity_key=instance.identity_key,
            config_revision=instance.config_revision,
        )
        self._leases[lease.lease_id] = lease
        instance.active_leases += 1
        if instance.state is InstanceState.READY:
            instance.transition(InstanceState.BUSY)
        return lease

    # -- release / retire / unload -----------------------------------------

    async def release(self, lease: Lease) -> None:
        if lease.released:
            return
        lease.released = True
        instance = self._by_id.get(lease.instance_id)
        self._leases.pop(lease.lease_id, None)
        if instance is None:
            return
        instance.active_leases = max(0, instance.active_leases - 1)
        if instance.active_leases == 0:
            if instance.state is InstanceState.BUSY:
                instance.transition(InstanceState.READY)
            if instance.state is InstanceState.RETIRING:
                await self._unload(instance)

    async def retire(self, instance: ModelInstance) -> None:
        """Stop accepting new leases; unload once in-flight work actually ends."""

        if self._instances.get(instance.identity_key) is instance:
            self._instances.pop(instance.identity_key)
        if instance.state is InstanceState.READY:
            instance.transition(InstanceState.UNLOADING)
            await self._unload(instance)
        elif instance.state is InstanceState.BUSY:
            instance.transition(InstanceState.RETIRING)

    async def _unload(self, instance: ModelInstance) -> None:
        device = self._device_for(instance)
        # Enter UNLOADING from any pre-unload state so the terminal transition is
        # legal (RETIRING -> UNLOADING -> UNLOADED, READY -> UNLOADING -> ...).
        if instance.can_transition(InstanceState.UNLOADING):
            instance.transition(InstanceState.UNLOADING)
        try:
            await self._loader.unload(instance)
        finally:
            if not instance.configuration.is_cloud:
                self._admission.release(instance.instance_id, device)
            if instance.can_transition(InstanceState.UNLOADED):
                instance.transition(InstanceState.UNLOADED)
        self._by_id.pop(instance.instance_id, None)

    async def mark_worker_exited(self, instance: ModelInstance) -> None:
        """Called when the backing worker reports an unexpected exit. The
        instance becomes FAILED and its reservation is released; a later acquire
        rebuilds it (doc 08 §8)."""

        device = self._device_for(instance)
        if instance.state not in (InstanceState.READY, InstanceState.BUSY, InstanceState.RETIRING):
            return
        retired = instance.state is InstanceState.RETIRING
        instance.transition(InstanceState.FAILED)
        if not instance.configuration.is_cloud:
            self._admission.release(instance.instance_id, device)
        if retired:
            self._by_id.pop(instance.instance_id, None)

    async def shutdown(self) -> None:
        """Unload every instance; bounded and idempotent."""

        for instance in list(self._by_id.values()):
            device = self._device_for(instance)
            try:
                await self._loader.unload(instance)
            except Exception:
                pass
            if not instance.configuration.is_cloud:
                self._admission.release(instance.instance_id, device)
        self._instances.clear()
        self._by_id.clear()
        self._leases.clear()
