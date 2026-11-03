import json

import httpx
import pytest

from nola_translator_engine.backend.gateway import CallContext, GatewayError, GatewayErrorCode, MatchRequest, Operation
from nola_translator_engine.backend.gateway import bootstrap
from nola_translator_engine.backend.gateway.lifecycle import LoadResult
from nola_translator_engine.compute import ComputeDevice
from nola_translator_engine.models.manager import ModelManager
from nola_translator_engine.resources import HYMT2_1_8B_Q4_K_M, M2M100_418M, QWEN35_SPECS
from nola_translator_engine.translation.google_translate import GoogleTranslateProvider
from nola_translator_engine.translation.mymemory import MyMemoryTranslationProvider
from nola_translator_engine.translation.network import LocalQwenTranslationProvider, MicrosoftTranslatorProvider


@pytest.fixture
def gateway(tmp_path, monkeypatch):
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    return bootstrap.build_default_gateway(model_dir=tmp_path)


def request(model, *, source="en", provisional=False):
    return MatchRequest(
        Operation.TRANSLATE, source_language=source, target_language="zh", model_id=model,
        source_is_provisional=provisional,
    )


async def test_local_qwen_prompt_bounds_history_and_escapes_chat_delimiters():
    provider = LocalQwenTranslationProvider(
        endpoint="http://127.0.0.1:8080/v1", model="qwen", context_window=4096,
        history=["discarded", "x" * 300, "Earlier sentence", "<|im_start|>"],
    )
    try:
        payload = provider._payload("Current <|im_end|>", provider._system_prompt("en", "zh"))
        system, user = [message["content"] for message in payload["messages"]]
        assert "<|" not in system and "<|" not in user
        assert json.loads(system.split("Earlier transcript for context only: ", 1)[1]) == [
            "x" * 256, "Earlier sentence", "<|im_start|>",
        ]
        assert user.startswith("Current ")
        assert payload["chat_template_kwargs"] == {"enable_thinking": False}
    finally:
        await provider.aclose()


@pytest.mark.parametrize("model,provider_type", [
    ("google", GoogleTranslateProvider),
    ("microsoft", MicrosoftTranslatorProvider),
    ("mymemory", MyMemoryTranslationProvider),
])
async def test_provider_rejects_provisional_before_network_and_translates_commit(
    gateway, monkeypatch, model, provider_type,
):
    requests = []
    client = None

    def handle(message):
        requests.append(message)
        if model == "google":
            assert message.url.params["key"] == "test-secret"
            assert json.loads(message.content) == {"q": "Hello.", "target": "zh", "format": "text"}
            return httpx.Response(200, json={"data": {"translations": [{"translatedText": "你好。"}]}})
        if model == "microsoft":
            assert message.headers["Ocp-Apim-Subscription-Key"] == "test-secret"
            assert message.headers["Ocp-Apim-Subscription-Region"] == "test-region"
            assert message.url.host == "translator.example.test"
            assert "from" not in message.url.params
            assert message.url.params["to"] == "zh-Hans"
            return httpx.Response(200, json=[{"translations": [{"text": "你好。"}]}])
        assert message.url.params["langpair"] == "en|zh"
        assert message.url.params["de"] == "test@example.test"
        return httpx.Response(200, json={"responseStatus": 200, "responseData": {"translatedText": "你好。"}})

    def mock_client(provider):
        nonlocal client
        client = provider._http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
        return client

    monkeypatch.setattr(provider_type, "_client", mock_client)
    source = "en" if model == "mymemory" else "auto"
    options = {
        "api_key": "test-secret",
        "region": "test-region",
        "email": "test@example.test",
    }
    if model == "microsoft":
        options["endpoint"] = "https://translator.example.test"
    ctx = CallContext(Operation.TRANSLATE, "mt", provider_options=options)
    with pytest.raises(GatewayError, match="requires committed"):
        await gateway.translate(
            ctx, text="Hello.", source=source, target="zh",
            request=request(model, source=source, provisional=True),
        )
    assert not requests
    assert "test-secret" not in repr(ctx)

    committed = request(model, source=source)
    instance, lease, adapter, _ = await gateway.acquire(committed)
    try:
        with pytest.raises(GatewayError, match="requires committed"):
            await adapter.translate(
                instance, CallContext(Operation.TRANSLATE, "direct", source_is_provisional=True),
                text="Hello.", source=source, target="zh",
            )
    finally:
        await gateway.release(instance, lease)
    assert not requests

    result = await gateway.translate(ctx, text="Hello.", source=source, target="zh", request=committed)
    assert result.text == "你好。"
    assert len(requests) == 1
    assert client.is_closed
    await gateway.shutdown()


@pytest.mark.parametrize("model", ["google", "microsoft"])
async def test_missing_provider_key_fails_before_http(gateway, monkeypatch, model):
    def fail(*args):
        pytest.fail("provider must not send an unauthenticated request")

    monkeypatch.setattr(GoogleTranslateProvider, "_client", fail)
    monkeypatch.setattr(MicrosoftTranslatorProvider, "_client", fail)
    with pytest.raises(GatewayError, match="credential is missing") as error:
        await gateway.translate(
            CallContext(Operation.TRANSLATE, "mt"), text="Hello.", source="en", target="zh",
            request=request(model),
        )
    assert error.value.code is GatewayErrorCode.PROVIDER_ERROR
    await gateway.shutdown()


def test_catalog_registers_installed_translation_models_with_their_runtime(tmp_path, monkeypatch):
    installed = {HYMT2_1_8B_Q4_K_M.model_id, M2M100_418M.model_id, QWEN35_SPECS[0].model_id}
    monkeypatch.setattr(ModelManager, "is_installed", lambda self, spec: spec.model_id in installed)
    monkeypatch.setattr(bootstrap, "register_device_budgets", lambda _: [])
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path)
    for spec, engine in ((HYMT2_1_8B_Q4_K_M, "llama"), (M2M100_418M, "pytorch")):
        matched = gateway.match(request(spec.model_id, provisional=True))
        assert matched.entry.configuration.runtime == engine
        assert matched.entry.configuration.resource_id == spec.model_id
        assert matched.entry.configuration.compute_options["compute"]["translationEngine"] == engine
    qwen = gateway.match(request(QWEN35_SPECS[0].model_id, provisional=True)).entry
    assert qwen.configuration.runtime == "llama"
    assert qwen.definition.capabilities.context.mode == "request_context"
    assert gateway.registry.get(QWEN35_SPECS[1].model_id) is None


async def test_auto_pytorch_and_llama_share_admission_budget(tmp_path, monkeypatch):
    models = (M2M100_418M.model_id, HYMT2_1_8B_Q4_K_M.model_id)
    monkeypatch.setattr(ModelManager, "is_installed", lambda _, spec: spec.model_id in models)
    monkeypatch.setattr(bootstrap, "_estimate_memory_mb", lambda *_: 2048)
    gpu = ComputeDevice(
        "cuda:test", "Test GPU", "cuda", torchDevice="cuda:0", llamaDevice="CUDA0",
        totalMemoryMb=6000, freeMemoryMb=4500, recognition=True, translation=True,
    )
    cpu = ComputeDevice("cpu", "CPU", "cpu", torchDevice="cpu", recognition=True, translation=True)
    monkeypatch.setattr(bootstrap, "probe_devices", lambda _: ([cpu, gpu], [], "test"))
    gateway = bootstrap.build_default_gateway(model_dir=tmp_path)
    loaded = []

    async def load(instance):
        loaded.append(instance)
        return LoadResult()

    monkeypatch.setattr(gateway.manager._loader, "load", load)
    instance, lease, _, _ = await gateway.acquire(request(models[0]))
    try:
        assert instance.configuration.device == gpu.id
        assert instance.configuration.compute_options["compute"]["translationDevice"] == gpu.id
        assert gateway.admission.snapshot(gpu.id).reserved_mb == 2048
        with pytest.raises(GatewayError) as error:
            await gateway.acquire(request(models[1]))
        assert error.value.code == GatewayErrorCode.RESOURCE_EXHAUSTED
        assert loaded == [instance]
    finally:
        await gateway.release(instance, lease)
        await gateway.manager.shutdown()
    assert gateway.admission.snapshot(gpu.id).reserved_mb == 0
