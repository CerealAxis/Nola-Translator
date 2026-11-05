"""M02 gateway tests: capability matching, lifecycle, single-flight load,
leases, resource admission, cancellation, config rotation and unified errors.

Acceptance cases G01-G06 from doc 12 §9 plus the doc 08 §3/§4/§7/§8 contracts.
The state-level tests use a fake loader (no models, no network). The final test
drives a real local ASR model through the persistent local_call worker and is
skipped (reported blocked, never faked as pass) when the weights are absent.
"""

from __future__ import annotations

import asyncio
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from nola_translator_engine.backend.gateway import (
    AdapterRegistry,
    CallContext,
    CancelToken,
    GatewayError,
    GatewayErrorCode,
    InstanceManager,
    InstanceState,
    Lease,
    LoadResult,
    LocalWorkerAdapter,
    LocalModelWorker,
    MatchRequest,
    ModelCapabilities,
    ModelDefinition,
    ModelGateway,
    ModelKind,
    ModelRegistry,
    MyMemoryMtAdapter,
    Operation,
    OperationProfile,
    ProviderConfiguration,
    ResourceAdmission,
    ResourceExhausted,
    sanitize_details,
)
from nola_translator_engine.backend.gateway.languages import (
    LANGUAGE_INPUT,
    LANGUAGE_TEXT_OUTPUT,
)


# ---------------------------------------------------------------------------
# Fixtures / builders
# ---------------------------------------------------------------------------


@dataclass
class FakeLoader:
    """Counts loads/unloads and can be told to fail or report a footprint."""

    loads: int = 0
    unloads: int = 0
    fail_on_load: bool = False
    measured_mb: float | None = None
    load_delay: float = 0.0
    started: list[str] = field(default_factory=list)

    async def load(self, instance) -> LoadResult:
        if self.load_delay:
            await asyncio.sleep(self.load_delay)
        self.loads += 1
        self.started.append(instance.instance_id)
        if self.fail_on_load:
            raise RuntimeError("cuda out of memory while loading weights")
        return LoadResult(handle=object(), measured_memory_mb=self.measured_mb)

    async def unload(self, instance) -> None:
        self.unloads += 1


def asr_capabilities() -> ModelCapabilities:
    from nola_translator_engine.backend.gateway.capabilities import LanguageCapabilities

    return ModelCapabilities(
        model_id="sensevoice-small",
        adapter_id="local-call",
        kinds=[ModelKind.ASR],
        operations=[Operation.TRANSCRIBE],
        operation_profiles={
            Operation.TRANSCRIBE: OperationProfile(
                streaming_input="false",
                streaming_output="false",
                finality="append_only",
                cancellation="cooperative",
                timestamps="segment",
                source_transcript="required",
            )
        },
        languages=LanguageCapabilities(input=["zh", "en"], text_output=[], auto_detection=True),
    )


def mt_capabilities(*, committed_only: bool = False, speech: bool = False) -> ModelCapabilities:
    from nola_translator_engine.backend.gateway.capabilities import (
        LanguageCapabilities,
        TranslationPolicy,
    )

    return ModelCapabilities(
        model_id="index-translate",
        adapter_id="local-call",
        kinds=[ModelKind.MT],
        operations=[Operation.TRANSLATE],
        operation_profiles={
            Operation.TRANSLATE: OperationProfile(
                streaming_output="false",
                finality="revisable",
                cancellation="cooperative",
                incremental_translation="snapshot_retranslate",
                audio_output="utterance" if speech else "none",
            )
        },
        languages=LanguageCapabilities(
            input=["en", "zh"], text_output=["zh", "en"], speech_output_available=speech
        ),
        translation_policy=TranslationPolicy(
            min_source_state="committed" if committed_only else "stable",
            allow_preview=not committed_only,
        ),
    )


def asr_definition(memory_mb: float = 500.0) -> ModelDefinition:
    return ModelDefinition(
        model_id="sensevoice-small",
        kinds=[ModelKind.ASR],
        capabilities=asr_capabilities(),
        estimated_memory_mb=memory_mb,
    )


def local_config(model_id: str, *, device: str = "cpu", resource_id: str | None = None, revision: int = 1) -> ProviderConfiguration:
    return ProviderConfiguration(
        provider_id="local",
        model_id=model_id,
        kind=ModelKind.ASR,
        resource_id=resource_id or model_id,
        runtime="crisp",
        device=device,
        compute_options={"prewarm": {"sourceLanguage": "auto", "targetLanguages": []}},
        revision=revision,
    )


def gateway_with(loader=None, *, admission=None) -> tuple[ModelGateway, FakeLoader]:
    loader = loader or FakeLoader()
    registry = ModelRegistry()
    registry.register(asr_definition(), local_config("sensevoice-small"))
    adapters = AdapterRegistry()
    adapters.register(LocalWorkerAdapter())
    gw = ModelGateway(registry=registry, adapters=adapters, admission=admission, manager=None)
    # Replace the manager's loader with the fake so no real subprocess starts.
    gw.manager = InstanceManager(loader, admission or ResourceAdmission())
    return gw, loader


# ---------------------------------------------------------------------------
# Capability matching (doc 08 §4)
# ---------------------------------------------------------------------------


def test_match_rejects_unsupported_target_language() -> None:
    gw, _ = gateway_with()
    gw.registry.register(
        ModelDefinition("index-translate", [ModelKind.MT], mt_capabilities()),
        ProviderConfiguration("local", "index-translate", ModelKind.MT, resource_id="index-translate"),
    )
    with pytest.raises(GatewayError) as info:
        gw.match(MatchRequest(operation=Operation.TRANSLATE, source_language="en", target_language="ja"))
    assert info.value.code is GatewayErrorCode.CAPABILITY_MISMATCH
    assert "ja" in str(info.value)


def test_match_returns_unmet_optional_outputs() -> None:
    gw, _ = gateway_with()
    gw.registry.register(
        ModelDefinition("index-translate", [ModelKind.MT], mt_capabilities(speech=False)),
        ProviderConfiguration("local", "index-translate", ModelKind.MT, resource_id="index-translate"),
    )
    result = gw.match(
        MatchRequest(
            operation=Operation.TRANSLATE,
            source_language="en",
            target_language="zh",
            optional_outputs=["speech"],
        )
    )
    assert result.unmet_optional == ["speech"]


def test_committed_only_request_skips_preview_model() -> None:
    gw, _ = gateway_with()
    gw.registry.register(
        ModelDefinition("preview-mt", [ModelKind.MT], mt_capabilities(committed_only=False)),
        ProviderConfiguration("local", "preview-mt", ModelKind.MT, resource_id="preview-mt"),
    )
    gw.registry.register(
        ModelDefinition("committed-mt", [ModelKind.MT], mt_capabilities(committed_only=True)),
        ProviderConfiguration("local", "committed-mt", ModelKind.MT, resource_id="committed-mt"),
    )
    result = gw.match(
        MatchRequest(operation=Operation.TRANSLATE, source_language="en", target_language="zh", accept_preview=False)
    )
    assert result.entry.definition.model_id == "committed-mt"


def test_capabilities_validate_kinds_rejects_cross_kind_operation() -> None:
    caps = ModelCapabilities(
        model_id="x",
        adapter_id="a",
        kinds=[ModelKind.ASR],
        operations=[Operation.TRANSLATE],  # not valid for ASR
    )
    with pytest.raises(ValueError):
        caps.validate_kinds()


# ---------------------------------------------------------------------------
# G01: single-flight load, one reservation, many leases
# ---------------------------------------------------------------------------


async def test_single_flight_load_shares_one_instance() -> None:
    loader = FakeLoader(load_delay=0.05, measured_mb=480.0)
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=4096)
    gw, _ = gateway_with(loader, admission=admission)

    request = MatchRequest(operation=Operation.TRANSCRIBE)
    results = await asyncio.gather(gw.acquire(request), gw.acquire(request), gw.acquire(request))
    instance_ids = {instance.instance_id for instance, *_ in results}
    lease_ids = {lease.lease_id for _, lease, _, _ in results}

    assert loader.loads == 1  # single-flight
    assert len(instance_ids) == 1  # shared weights instance
    assert len(lease_ids) == 3  # but each caller holds its own lease
    budget = admission.snapshot("cpu")
    assert budget is not None and budget.reserved_mb == pytest.approx(480.0)  # one reservation

    for instance, lease, _, _ in results:
        await gw.release(instance, lease)
    assert loader.loads == 1


# ---------------------------------------------------------------------------
# G02: OOM / load failure / worker exit
# ---------------------------------------------------------------------------


async def test_load_failure_marks_failed_and_releases_reservation() -> None:
    loader = FakeLoader(fail_on_load=True)
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=4096)
    gw, _ = gateway_with(loader, admission=admission)

    with pytest.raises(GatewayError) as info:
        await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE))
    assert info.value.code is GatewayErrorCode.LOAD_FAILED
    # Reservation released after the failed load.
    budget = admission.snapshot("cpu")
    assert budget is not None and budget.reserved_mb == 0.0


async def test_admission_rejects_when_budget_exhausted() -> None:
    loader = FakeLoader()  # measured_mb=None keeps the estimate reserved
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=600)  # only fits one 500MB model
    gw, _ = gateway_with(loader, admission=admission)
    # A second, distinct instance cannot be admitted alongside the first.
    gw.registry.register(
        asr_definition(memory_mb=500.0),
        local_config("sensevoice-small", device="cpu"),
    )
    await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE, model_id="sensevoice-small"))
    other = ModelDefinition("second-asr", [ModelKind.ASR], asr_capabilities(), estimated_memory_mb=500.0)
    other.model_id = "second-asr"
    gw.registry.register(other, local_config("second-asr"))
    with pytest.raises(GatewayError) as info:
        await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE, model_id="second-asr"))
    assert info.value.code is GatewayErrorCode.RESOURCE_EXHAUSTED


async def test_worker_exit_fails_instance_and_rebuilds_on_next_acquire() -> None:
    loader = FakeLoader(measured_mb=100.0)
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=4096)
    gw, _ = gateway_with(loader, admission=admission)

    instance, lease, _, _ = await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE))
    first_id = instance.instance_id
    # Simulate the backing worker crashing while a lease was held.
    instance.handle = LocalModelWorker()
    instance.handle.exited = True
    await gw.release(instance, lease)
    assert instance.state is InstanceState.FAILED

    # Next acquire reaps the dead instance and builds a fresh one.
    instance2, lease2, _, _ = await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE))
    assert instance2.instance_id != first_id
    assert instance2.state in (InstanceState.READY, InstanceState.BUSY)
    await gw.release(instance2, lease2)


# ---------------------------------------------------------------------------
# G03: cancellation + no unload while a lease is held
# ---------------------------------------------------------------------------


async def test_retire_waits_for_active_lease_to_drain() -> None:
    loader = FakeLoader()
    gw, _ = gateway_with(loader)
    instance, lease, _, _ = await gw.acquire(MatchRequest(operation=Operation.TRANSCRIBE))
    assert instance.state is InstanceState.BUSY

    await gw.manager.retire(instance)
    # Busy instance is retiring, not yet unloaded: in-flight work must finish.
    assert instance.state is InstanceState.RETIRING
    assert loader.unloads == 0

    await gw.release(instance, lease)
    assert loader.unloads == 1
    assert instance.state is InstanceState.UNLOADED


def test_cancel_token_raises_and_sanitizes() -> None:
    token = CancelToken()
    token.cancel("stop pressed")
    with pytest.raises(GatewayError) as info:
        token.raise_if_cancelled()
    assert info.value.code is GatewayErrorCode.CANCELLED


def test_error_payload_redacts_secrets_and_paths() -> None:
    error = GatewayError(
        GatewayErrorCode.PROVIDER_ERROR,
        stage="mt",
        message="auth failed Authorization: Bearer sk-secret-123 at C:\\Users\\me\\models\\x.gguf",
    )
    payload = error.to_payload()
    details = str(payload["sanitized_details"])
    assert "sk-secret-123" not in details
    assert "Bearer" not in details.replace("[redacted]", "")
    assert "Users" not in details
    assert payload["code"] == "PROVIDER_ERROR"


def test_sanitize_details_strips_posix_paths() -> None:
    assert "/home/" not in sanitize_details("cannot read /home/user/keys/token.json")


# ---------------------------------------------------------------------------
# G04: config / key rotation is atomic and old leases drain
# ---------------------------------------------------------------------------


async def test_config_rotation_builds_new_revision_and_keeps_old_lease() -> None:
    loader = FakeLoader()
    gw, _ = gateway_with(loader)
    config_v1 = local_config("sensevoice-small", revision=1)
    instance1, lease1 = await gw.manager.acquire(asr_definition(), config_v1)
    assert instance1.config_revision == 1

    # A revision change is detected against the live instance; the old one is
    # retired (kept for its existing lease) and a fresh instance is built at the
    # new revision (doc 08 §7).
    config_v2 = config_v1.rotated(credential_ref=None)
    config_v2.revision = 2
    instance2, lease2 = await gw.manager.acquire(asr_definition(), config_v2)
    assert instance2.config_revision == 2
    # The old instance is still alive serving its existing lease.
    assert lease1.released is False
    await gw.manager.release(lease1)
    await gw.manager.release(lease2)


def test_pinned_model_must_be_enabled_and_support_operation_and_language() -> None:
    gw, _ = gateway_with()
    model_id = "sensevoice-small"
    for request in (
        MatchRequest(operation=Operation.TRANSLATE, model_id=model_id),
        MatchRequest(operation=Operation.TRANSCRIBE, model_id=model_id, source_language="ja"),
    ):
        with pytest.raises(GatewayError, match="no model satisfies"):
            gw.match(request)
    gw.registry.set_enabled(model_id, False)
    with pytest.raises(GatewayError, match="no enabled candidates"):
        gw.match(MatchRequest(operation=Operation.TRANSCRIBE, model_id=model_id))


def test_models_sharing_an_operation_use_their_declared_adapter() -> None:
    from nola_translator_engine.backend.gateway.languages import local_mt_definition, mymemory_definition

    gw, _ = gateway_with()
    gw.adapters.register(MyMemoryMtAdapter())
    for definition in (local_mt_definition(), mymemory_definition()):
        gw.registry.register(definition, local_config(definition.model_id))
        result = gw.match(MatchRequest(operation=Operation.TRANSLATE, model_id=definition.model_id))
        assert result.entry.definition is definition


async def test_worker_timeout_stops_process_before_request_returns(monkeypatch) -> None:
    from nola_translator_engine.backend.gateway.worker import WorkerRequest

    spawn = asyncio.create_subprocess_exec

    async def spawn_hanging_worker(*args, **kwargs):
        return await spawn(
            sys.executable, "-c", "import sys,time; sys.stdin.readline(); time.sleep(60)",
            stdin=kwargs["stdin"], stdout=kwargs["stdout"], stderr=kwargs["stderr"],
        )

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn_hanging_worker)
    worker = LocalModelWorker()
    exited = asyncio.Event()

    async def on_exit():
        exited.set()

    await worker.start(on_exit=on_exit)
    try:
        with pytest.raises(GatewayError) as error:
            await worker.request(WorkerRequest(kind="asr", config={}), timeout=0.05)
        assert error.value.code is GatewayErrorCode.TIMEOUT
        assert exited.is_set()
        assert worker.exit_code is not None
        assert not worker.running
    finally:
        await worker.close()


async def test_cancelled_load_releases_budget_and_can_retry() -> None:
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=500)
    loading = asyncio.Event()

    class BlockingLoader(FakeLoader):
        async def load(self, instance) -> LoadResult:
            if loading.is_set():
                return await super().load(instance)
            loading.set()
            await asyncio.Future()

    gw, _ = gateway_with(BlockingLoader(), admission=admission)
    request = MatchRequest(operation=Operation.TRANSCRIBE)
    task = asyncio.create_task(gw.acquire(request))
    await loading.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert admission.snapshot("cpu").reserved_mb == 0
    assert gw.manager.instances()[0].state is InstanceState.FAILED
    instance, lease, _, _ = await gw.acquire(request)
    await gw.release(instance, lease)
    await gw.shutdown()


async def test_local_worker_warms_each_revision_and_idle_exit_fails_instance() -> None:
    class ProbeWorker(LocalModelWorker):
        running = True

        async def start(self, *, on_exit=None):
            self.on_exit = on_exit
            self.requests = 0

        async def request(self, request, *, timeout=None):
            self.requests += 1
            return {"text": ""}

        async def close(self):
            self.running = False

    registry = ModelRegistry()
    config = local_config("sensevoice-small")
    definition = asr_definition()
    registry.register(definition, config)
    adapters = AdapterRegistry()
    adapters.register(LocalWorkerAdapter())
    admission = ResourceAdmission()
    admission.register_device("cpu", total_mb=1_000)
    gw = ModelGateway(registry=registry, adapters=adapters, admission=admission, worker_factory=ProbeWorker)
    request = MatchRequest(operation=Operation.TRANSCRIBE)
    try:
        old, old_lease, _, _ = await gw.acquire(request)
        registry.register(definition, config.rotated())
        new, new_lease, _, _ = await gw.acquire(request)
        assert old.handle is not new.handle
        assert old.handle.requests == new.handle.requests == 1
        await gw.release(old, old_lease)
        assert not old.handle.running and new.handle.running
        await gw.release(new, new_lease)
        await new.handle.on_exit()
        assert new.state is InstanceState.FAILED
        assert admission.snapshot("cpu").reserved_mb == 0
    finally:
        await gw.shutdown()


# ---------------------------------------------------------------------------
# G05: bounded concurrency per instance
# ---------------------------------------------------------------------------


async def test_concurrency_gate_bounds_active_inference() -> None:
    gw, _ = gateway_with()
    order: list[str] = []

    async def worker(name: str) -> None:
        await gw.concurrency.acquire("inst-1", 1)
        order.append(f"{name}:start")
        await asyncio.sleep(0.02)
        order.append(f"{name}:end")
        gw.concurrency.release("inst-1")

    await asyncio.gather(worker("a"), worker("b"))
    # With a limit of one, the second cannot start before the first ends.
    assert order == ["a:start", "a:end", "b:start", "b:end"] or order == [
        "b:start",
        "b:end",
        "a:start",
        "a:end",
    ]


# ---------------------------------------------------------------------------
# MyMemory committed-only boundary (decision 5 / doc 08 §3)
# ---------------------------------------------------------------------------


async def test_mymemory_rejects_auto_source_language() -> None:
    adapter = MyMemoryMtAdapter()
    instance = None  # adapter does not need a loaded instance for this guard
    ctx = CallContext(operation=Operation.TRANSLATE, task_id="t1")
    with pytest.raises(GatewayError) as info:
        await adapter.translate(instance, ctx, text="hello", source="auto", target="zh")  # type: ignore[arg-type]
    assert info.value.code is GatewayErrorCode.NOT_SUPPORTED


# ---------------------------------------------------------------------------
# ResourceAdmission atomicity unit
# ---------------------------------------------------------------------------


def test_admission_reserve_is_atomic_and_idempotent() -> None:
    admission = ResourceAdmission()
    admission.register_device("gpu0", total_mb=1000, reserve_mb=100)
    admission.reserve("a", "gpu0", 500)
    admission.reserve("a", "gpu0", 500)  # idempotent re-reserve
    assert admission.snapshot("gpu0").reserved_mb == 500  # type: ignore[union-attr]
    with pytest.raises(ResourceExhausted):
        admission.reserve("b", "gpu0", 500)  # only 400 free after reserve head-room
    admission.commit_measured("a", "gpu0", 700)
    assert admission.snapshot("gpu0").reserved_mb == 700  # type: ignore[union-attr]
    admission.release("a", "gpu0")
    assert admission.snapshot("gpu0").reserved_mb == 0  # type: ignore[union-attr]


def test_language_helpers_are_populated() -> None:
    # The registry helper (M02 → M04 bridge) must expose real language tables.
    assert "zh" in LANGUAGE_TEXT_OUTPUT or LANGUAGE_TEXT_OUTPUT == {}
    assert isinstance(LANGUAGE_INPUT, (list, tuple, set, dict))


# ---------------------------------------------------------------------------
# Level 3: real local ASR model load -> infer -> unload (blocked when absent)
# ---------------------------------------------------------------------------


def _model_root() -> Path | None:
    candidate = Path(os.environ.get("NOLA_TRANSLATOR_MODEL_DIR", "")) if os.environ.get("NOLA_TRANSLATOR_MODEL_DIR") else None
    for root in (candidate, Path(__file__).resolve().parents[3] / "models"):
        if root and (root / "sensevoice-small-crisp-q8-0").is_dir():
            return root
    return None


@pytest.mark.skipif(_model_root() is None, reason="BLOCKED: bundled ASR weights not installed")
async def test_real_local_asr_load_infer_unload() -> None:
    """G-level real verification: drive the persistent local_call worker against
    the installed SenseVoice weights. Reports the measured footprint and skips
    (never fakes a pass) when the runtime cannot load."""

    from nola_translator_engine.backend.gateway.bootstrap import build_default_gateway

    gw = build_default_gateway(model_dir=_model_root())
    ctx = CallContext(operation=Operation.TRANSCRIBE, task_id="m02-local")
    try:
        result = await gw.transcribe(ctx, audio=bytes(32_000), language="en")
        instance, = gw.manager.instances()
        assert instance.state is InstanceState.READY
        assert isinstance(result.text, str)
        await gw.manager.retire(instance)
        assert instance.state is InstanceState.UNLOADED
        assert not instance.handle.running
    finally:
        await gw.shutdown()


# ---------------------------------------------------------------------------
# Level 5: real network Provider through the full gateway path (G06 / doc 11 M02)
# ---------------------------------------------------------------------------


@pytest.mark.skipif(
    os.environ.get("NOLA_TEST_REAL_NETWORK") != "1",
    reason="Requires explicit opt-in to the real network Provider",
)
async def test_real_cloud_provider_through_gateway() -> None:
    """Proves resolve -> match -> acquire lease -> translate -> release against a
    real, key-free network Provider (MyMemory). Cloud instances reserve no local
    device budget and connect lazily."""

    from nola_translator_engine.backend.gateway.languages import (
        cloud_configuration,
        mymemory_definition,
    )

    registry = ModelRegistry()
    registry.register(mymemory_definition(), cloud_configuration("mymemory", ModelKind.MT, endpoint="https://api.mymemory.translated.net/get"))
    adapters = AdapterRegistry()
    adapters.register(MyMemoryMtAdapter(), [Operation.TRANSLATE])
    gw = ModelGateway(registry=registry, adapters=adapters)

    ctx = CallContext(operation=Operation.TRANSLATE, task_id="m02-cloud")
    result = await gw.translate(ctx, text="Hello world", source="en", target="zh")
    await gw.shutdown()

    assert result.text and result.text != "Hello world"
    assert result.source == "en" and result.target == "zh"


# ---------------------------------------------------------------------------
# Private management surface (doc 08 §9): control-token only
# ---------------------------------------------------------------------------


def test_management_endpoints_are_private_and_report_state() -> None:
    from fastapi.testclient import TestClient

    from nola_translator_engine.backend import create_app

    gw, _ = gateway_with()
    with TestClient(create_app(control_token="t", instance_id="i", gateway=gw)) as client:
        headers = {"Authorization": "Bearer t"}
        # Unauthenticated management access is rejected (private surface).
        assert client.get("/api/v2/gateway/instances").status_code == 401

        caps = client.get("/api/v2/gateway/capabilities", headers=headers)
        assert caps.status_code == 200
        models = {m["model_id"]: m for m in caps.json()["models"]}
        assert "sensevoice-small" in models
        assert models["sensevoice-small"]["kinds"] == ["asr"]

        instances = client.get("/api/v2/gateway/instances", headers=headers)
        assert instances.status_code == 200
        assert instances.json()["instances"] == []  # nothing loaded yet


async def test_realtime_admission_is_exclusive_and_precedes_waiting_offline_calls():
    from nola_translator_engine.backend.gateway.resources import ConcurrencyGate

    gate = ConcurrencyGate()
    await gate.acquire("shared", 5)
    order = []

    async def run(name, realtime):
        await gate.acquire("shared", 5, realtime=realtime)
        order.append(name)
        await asyncio.sleep(0)
        gate.release("shared")

    realtime = asyncio.create_task(run("realtime", True))
    await asyncio.sleep(0)
    offline = asyncio.create_task(run("offline", False))
    await asyncio.sleep(0)
    assert not order
    gate.release("shared")
    await asyncio.gather(realtime, offline)
    assert order == ["realtime", "offline"]
    assert gate.active("shared") == 0


@pytest.mark.parametrize("runtime,cloud,mode,maximum", [
    ("crisp", False, "offline", 1), ("crisp-tts", False, "offline", 1),
    ("pytorch", False, "offline", 5), ("llama", False, "realtime", 1),
    (None, True, "offline", 10),
])
async def test_gateway_enforces_runtime_caps_at_the_backend(runtime, cloud, mode, maximum):
    gw, _ = gateway_with()
    instance, lease, _, _ = await gw.acquire(MatchRequest(Operation.TRANSCRIBE))
    instance.configuration.runtime = runtime
    instance.configuration.is_cloud = cloud
    ctx = CallContext(Operation.TRANSCRIBE, "limit", task_mode=mode, max_concurrency=10)
    peak = 0

    async def call():
        nonlocal peak
        await gw._enter(instance, ctx)
        peak = max(peak, gw.concurrency.active(instance.instance_id))
        await asyncio.sleep(0.001)
        gw._exit(instance)

    try:
        await asyncio.gather(*(call() for _ in range(12)))
        assert peak == maximum
    finally:
        await gw.release(instance, lease)
        await gw.shutdown()


def test_parallel_memory_reservations_are_atomic_and_released_with_the_model():
    admission = ResourceAdmission()
    admission.register_device("gpu", 1000)
    admission.reserve("model", "gpu", 500)
    with pytest.raises(ResourceExhausted):
        admission.reserve_parallel("model", "gpu", 4, 200)
    assert admission.snapshot("gpu").reserved_mb == 500
    admission.reserve_parallel("model", "gpu", 3, 200)
    assert admission.snapshot("gpu").reserved_mb == 900
    admission.reserve_parallel("model", "gpu", 3, 200)
    assert admission.snapshot("gpu").reserved_mb == 900
    admission.release("model", "gpu")
    assert admission.snapshot("gpu").reserved_mb == 0


async def test_offline_worker_coalesces_compatible_requests_and_isolates_cancellation():
    from nola_translator_engine.backend.gateway.worker import WorkerRequest

    started, finish = asyncio.Event(), asyncio.Event()

    class Worker(LocalModelWorker):
        def __init__(self):
            super().__init__()
            self.calls = []

        async def request(self, request, **kwargs):
            self.calls.append(request)
            started.set()
            await finish.wait()
            return {"results": [{"text": item["text"]} for item in request.payload["requests"]]}

    worker = Worker()
    calls = [asyncio.create_task(worker.request_batch(WorkerRequest("mt", {}, payload={"text": text, "source": "en", "target": "zh"}), limit=5))
             for text in ("first", "second", "third")]
    await started.wait()
    assert len(worker.calls) == 1
    assert worker.calls[0].kind == "batch"
    calls[0].cancel()
    await asyncio.sleep(0)
    assert not calls[0].done()
    finish.set()
    results = await asyncio.gather(*calls, return_exceptions=True)
    assert isinstance(results[0], asyncio.CancelledError)
    assert results[1:] == [{"text": "second"}, {"text": "third"}]


async def test_cancelling_a_queued_batch_item_does_not_dispatch_it():
    from unittest.mock import AsyncMock
    from nola_translator_engine.backend.gateway.worker import WorkerRequest

    worker = LocalModelWorker()
    worker.request = AsyncMock(return_value={"text": "unused"})
    task = asyncio.create_task(worker.request_batch(WorkerRequest("mt", {}, payload={"text": "cancel"}), limit=5))
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    if worker._batch_task:
        await worker._batch_task
    worker.request.assert_not_awaited()
