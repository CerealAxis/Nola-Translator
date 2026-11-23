import asyncio
from unittest.mock import AsyncMock

import pytest

from nola_translator_engine.backend.direct_language_model import open_direct_language_model
from nola_translator_engine.backend.gateway import bootstrap
from nola_translator_engine.backend.gateway.adapters import LocalWorkerAdapter
from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode, Operation
from nola_translator_engine.backend.gateway.lifecycle import InstanceManager, LoadResult
from nola_translator_engine.models.manager import ModelManager
from nola_translator_engine.models.qwen35_catalog import QWEN35_SPECS

MODEL = QWEN35_SPECS[0].model_id


@pytest.fixture
def gateway(tmp_path, monkeypatch):
    monkeypatch.setattr(ModelManager, "is_installed", lambda self, spec: spec.model_id == MODEL)
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path)
    loader = AsyncMock()
    loader.load.return_value = LoadResult(handle=None)
    gateway.manager = InstanceManager(loader, gateway.admission)
    adapter = LocalWorkerAdapter()
    adapter._call = AsyncMock(return_value={"endpoint": "http://127.0.0.1:8888/v1", "contextWindow": 32768})
    gateway.adapters.register(adapter)
    return gateway, loader, adapter


async def test_direct_language_model_keeps_lease_and_separates_translation(gateway):
    gateway, loader, adapter = gateway
    mt = gateway.registry.get(MODEL)
    llm = gateway.registry.get("llm:" + MODEL)
    assert mt.configuration.identity_key() != llm.configuration.identity_key()

    lease = await open_direct_language_model(gateway, MODEL)
    assert lease.endpoint == "http://127.0.0.1:8888/v1"
    assert lease.context_window == 32768
    instance, request, ctx = adapter._call.await_args.args
    assert instance.active_leases == 1
    assert request.kind == "llm"
    assert request.resource_id == request.config["translationModelId"] == MODEL
    assert request.config["compute"]["contextSize"] == 32768
    assert ctx.operation is Operation.GENERATE

    with pytest.raises(GatewayError) as caught:
        await open_direct_language_model(gateway, MODEL)
    assert caught.value.code is GatewayErrorCode.RESOURCE_EXHAUSTED
    adapter._call.assert_awaited_once()
    loader.unload.assert_not_awaited()

    await lease.release()
    await lease.release()
    assert instance.active_leases == 0
    assert gateway.manager.get(llm.configuration.identity_key()) is None
    loader.unload.assert_awaited_once_with(instance)


async def test_direct_language_model_releases_on_invalid_endpoint(gateway):
    gateway, loader, adapter = gateway
    adapter._call.return_value["endpoint"] = "http://127.0.0.1:8888@elsewhere/v1"
    with pytest.raises(GatewayError) as caught:
        await open_direct_language_model(gateway, MODEL)
    assert caught.value.code is GatewayErrorCode.INTERNAL
    loader.unload.assert_awaited_once()


async def test_direct_language_model_releases_cancelled_start(gateway):
    gateway, loader, adapter = gateway
    started = asyncio.Event()

    async def wait(*args, **kwargs):
        started.set()
        await asyncio.Future()

    adapter._call.side_effect = wait
    opening = asyncio.create_task(open_direct_language_model(gateway, MODEL))
    await started.wait()
    opening.cancel()
    with pytest.raises(asyncio.CancelledError):
        await opening
    loader.unload.assert_awaited_once()
