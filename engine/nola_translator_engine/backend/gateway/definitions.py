"""Model identity split (doc 08 §1) and instance lifecycle state (§7).

Three concepts stay separate so the gateway never confuses "the family exists"
with "an instance is actually loaded and can infer":

* ModelDefinition    — family/weights + capability evidence, no user secrets.
* ProviderConfiguration — cloud endpoint/region/credential_ref, or local
  resource_id/runtime/compute options. Carries a revision that bumps atomically
  on credential rotation.
* ModelInstance      — a loaded/connected instance with instance_id, state,
  the config revision it was built from and its measured resource footprint.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4

from .capabilities import ModelCapabilities, ModelKind, Operation


class InstanceState(str, Enum):
    """Lifecycle states from the doc 08 §7 state diagram."""

    UNLOADED = "unloaded"
    LOADING = "loading"
    READY = "ready"
    BUSY = "busy"
    RETIRING = "retiring"
    UNLOADING = "unloading"
    FAILED = "failed"


#: Legal transitions; anything not listed is rejected so a crash cannot leave an
#: instance in a state the manager believes is still servable.
_TRANSITIONS: dict[InstanceState, frozenset[InstanceState]] = {
    InstanceState.UNLOADED: frozenset({InstanceState.LOADING}),
    InstanceState.LOADING: frozenset({InstanceState.READY, InstanceState.FAILED, InstanceState.UNLOADING}),
    InstanceState.READY: frozenset({InstanceState.BUSY, InstanceState.UNLOADING, InstanceState.FAILED}),
    InstanceState.BUSY: frozenset({InstanceState.READY, InstanceState.RETIRING, InstanceState.FAILED}),
    InstanceState.RETIRING: frozenset({InstanceState.UNLOADING, InstanceState.FAILED}),
    InstanceState.UNLOADING: frozenset({InstanceState.UNLOADED, InstanceState.FAILED}),
    InstanceState.FAILED: frozenset({InstanceState.UNLOADED}),
}


@dataclass
class ModelDefinition:
    """Family + weights + capability evidence. Never holds user secrets."""

    model_id: str
    kinds: list[ModelKind]
    capabilities: ModelCapabilities
    family: str | None = None
    weights_digest: str | None = None
    runtime_environment_id: str | None = None
    #: Estimated resident memory used for admission before a real measurement
    #: exists; weights file size is not VRAM (doc 08 §8).
    estimated_memory_mb: float = 0.0
    estimate_is_measured: bool = False

    def supports(self, operation: Operation) -> bool:
        return operation in self.capabilities.operations


@dataclass
class ProviderConfiguration:
    """How to reach a provider: cloud endpoint or local resource placement."""

    provider_id: str
    model_id: str
    kind: ModelKind
    #: Local placement (mutually informative with the cloud fields).
    resource_id: str | None = None
    runtime: str | None = None
    device: str = "auto"
    precision: str = "auto"
    compute_options: dict[str, Any] = field(default_factory=dict)
    #: Cloud placement.
    endpoint: str | None = None
    region: str | None = None
    credential_ref: str | None = None
    #: Bumped atomically on any credential/endpoint change so a rotating key is
    #: never paired with a stale endpoint revision (doc 08 §7).
    revision: int = 1
    is_cloud: bool = False

    def rotated(self, *, credential_ref: str | None = None, endpoint: str | None = None) -> "ProviderConfiguration":
        """Return a new configuration revision; the old one keeps serving its
        existing leases until they drain."""

        clone = ProviderConfiguration(**{**self.__dict__})
        if credential_ref is not None:
            clone.credential_ref = credential_ref
        if endpoint is not None:
            clone.endpoint = endpoint
        clone.revision = self.revision + 1
        return clone

    def identity_key(self) -> str:
        """Stable key for instance sharing. Local instances key on the weights
        digest + runtime + device + precision + relevant load options; cloud
        instances key on endpoint/config/credential revision (doc 08 §7)."""

        if self.is_cloud:
            basis = {
                "cloud": True,
                "endpoint": self.endpoint,
                "region": self.region,
                "credential_ref": self.credential_ref,
                "revision": self.revision,
                "model_id": self.model_id,
            }
        else:
            basis = {
                "cloud": False,
                "resource_id": self.resource_id,
                "runtime": self.runtime,
                "device": self.device,
                "precision": self.precision,
                "compute_options": self.compute_options,
                "model_id": self.model_id,
            }
        return hashlib.sha256(
            json.dumps(basis, sort_keys=True, ensure_ascii=True).encode("utf-8")
        ).hexdigest()[:32]


@dataclass
class ModelInstance:
    """A concrete loaded/connected instance owned by the lifecycle manager."""

    instance_id: str
    identity_key: str
    definition: ModelDefinition
    configuration: ProviderConfiguration
    state: InstanceState = InstanceState.UNLOADED
    config_revision: int = 1
    #: Resident memory actually measured after load; None until first load.
    measured_memory_mb: float | None = None
    #: Number of active leases currently holding this instance.
    active_leases: int = 0
    #: Opaque handle to the worker/connection backing this instance.
    handle: Any = None
    last_error: str | None = None

    @staticmethod
    def new_id() -> str:
        return f"inst-{uuid4().hex[:12]}"

    def transition(self, target: InstanceState) -> None:
        if target not in _TRANSITIONS[self.state]:
            raise IllegalTransition(f"{self.state.value} -> {target.value} is not allowed")
        self.state = target

    def can_transition(self, target: InstanceState) -> bool:
        return target in _TRANSITIONS[self.state]

    @property
    def resident_memory_mb(self) -> float:
        """Measured footprint when known, otherwise the conservative estimate."""

        if self.measured_memory_mb is not None:
            return self.measured_memory_mb
        return self.definition.estimated_memory_mb


class IllegalTransition(RuntimeError):
    pass
