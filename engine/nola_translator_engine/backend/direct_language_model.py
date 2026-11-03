"""Lease the local Qwen endpoint for an AI SDK streaming request."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from uuid import uuid4

from .gateway.adapters import LocalWorkerAdapter
from .gateway.bootstrap import LOCAL_LLM_MODEL_PREFIX
from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.definitions import InstanceState, ModelInstance
from .gateway.gateway import MatchRequest, ModelGateway
from .gateway.lifecycle import Lease

LLM_START_TIMEOUT_S = 180.0


@dataclass
class DirectLanguageModelLease:
    endpoint: str
    context_window: int
    _gateway: ModelGateway = field(repr=False)
    _instance: ModelInstance = field(repr=False)
    _lease: Lease = field(repr=False)

    async def release(self) -> None:
        if self._lease.released:
            return
        await _release(self._gateway, self._instance, self._lease)


async def _release(gateway: ModelGateway, instance: ModelInstance, lease: Lease) -> None:
    if instance.active_leases == 1 and instance.state is InstanceState.BUSY:
        await gateway.manager.retire(instance)
    await gateway.release(instance, lease)


def _connection(response: dict) -> tuple[str, int]:
    endpoint = response.get("endpoint")
    context_window = response.get("contextWindow")
    if not isinstance(endpoint, str) or type(context_window) is not int or not 256 <= context_window <= 32768:
        raise ValueError("invalid language model connection")
    url = urlsplit(endpoint)
    if (
        url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port or url.path != "/v1"
        or url.username is not None or url.password is not None or url.query or url.fragment
    ):
        raise ValueError("invalid language model endpoint")
    return f"http://127.0.0.1:{url.port}/v1", context_window


async def open_direct_language_model(gateway: ModelGateway, model_id: str) -> DirectLanguageModelLease:
    match = MatchRequest(operation=Operation.GENERATE, model_id=LOCAL_LLM_MODEL_PREFIX + model_id)
    ctx = CallContext(operation=Operation.GENERATE, task_id=str(uuid4()), deadline=time.monotonic() + LLM_START_TIMEOUT_S)
    try:
        async with asyncio.timeout(LLM_START_TIMEOUT_S):
            instance, lease, adapter, _ = await gateway.acquire(match)
            opened = False
            try:
                if not isinstance(adapter, LocalWorkerAdapter) or instance.configuration.is_cloud:
                    raise GatewayError(GatewayErrorCode.NOT_SUPPORTED, stage="llm", message="Local model required")
                # A second startup request could abort the worker serving the first SDK stream.
                if instance.active_leases > 1:
                    raise GatewayError(GatewayErrorCode.RESOURCE_EXHAUSTED, stage="llm", message="Local model is busy")
                endpoint, context_window = _connection(await adapter.llm_endpoint(instance, ctx))
                opened = True
                return DirectLanguageModelLease(endpoint, context_window, gateway, instance, lease)
            finally:
                if not opened:
                    await _release(gateway, instance, lease)
    except TimeoutError:
        ctx.cancel_token.cancel()
        raise GatewayError(GatewayErrorCode.TIMEOUT, stage="llm", message="Local model startup timed out") from None
    except asyncio.CancelledError:
        ctx.cancel_token.cancel()
        raise
    except GatewayError as error:
        raise GatewayError(error.code, stage="llm", message="Could not open local language model") from None
    except (ValueError, TypeError):
        raise GatewayError(GatewayErrorCode.INTERNAL, stage="llm", message="Invalid local model connection") from None
