import json

import httpx
import pytest

from nola_translator_engine.translation.index_translate import (
    IndexTranslateLocalProvider,
    IndexTranslatePublicProvider,
    IndexTranslateTransformersRuntime,
)


@pytest.mark.asyncio
async def test_public_api_uses_official_prompt_without_credentials():
    captured = {}

    def request(url, payload, headers):
        captured.update(url=url, payload=payload, headers=headers)
        return {"choices": [{"message": {"content": "你好"}, "finish_reason": "stop"}]}

    provider = IndexTranslatePublicProvider(requester=request)
    assert (await provider.translate("Hello", "en", "zh")).text == "你好"
    assert captured["url"] == "https://index-translate.bilibili.com/v1/chat/completions"
    assert "Authorization" not in captured["headers"]
    assert captured["headers"]["User-Agent"] == "Index-Translate-Client/1.0"
    assert captured["payload"]["model"] == "Index-Translate-35B-A3B"
    assert captured["payload"]["messages"] == [{"role": "user", "content": "请将以下英语文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\nHello"}]
    assert captured["payload"]["chat_template_kwargs"] == {"enable_thinking": False}


@pytest.mark.asyncio
async def test_public_api_streams_translation_and_rejects_truncation():
    captured = {}

    def respond(request):
        captured.update(json.loads(request.content))
        events = [
            {"choices": [{"delta": {"content": "你好"}, "finish_reason": None}]},
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
        ]
        return httpx.Response(200, headers={"content-type": "text/event-stream"},
            text="".join(f"data: {json.dumps(event)}\n\n" for event in events) + "data: [DONE]\n\n")

    provider = IndexTranslatePublicProvider()
    provider._http = httpx.AsyncClient(transport=httpx.MockTransport(respond))
    progress = []
    try:
        result = await provider.translate_stream("Hello", "auto", "zh", progress.append)
        assert result.text == "你好"
        assert progress[-1] == "你好"
        assert captured["stream"] is True
        assert captured["messages"][0]["content"].startswith("请将以下文本翻译为中文")
        with pytest.raises(RuntimeError):
            provider._extract({"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}]})
    finally:
        await provider.aclose()


@pytest.mark.asyncio
async def test_local_translation_disables_thinking_with_official_prompt():
    class Manager:
        def chat_sync(self, messages, **kwargs):
            self.messages, self.kwargs = messages, kwargs
            return "你好"

    manager = Manager()
    result = await IndexTranslateLocalProvider(manager).translate("Hello", "auto", "zh")
    assert result.text == "你好"
    assert manager.messages == [{"role": "user", "content": "请将以下文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\nHello"}]
    assert manager.kwargs["chat_template_kwargs"] == {"enable_thinking": False}
    assert manager.kwargs["max_tokens"] > 0


def test_transformers_loader_uses_official_multimodal_auto_classes_and_chat_prompt(tmp_path, monkeypatch):
    torch = pytest.importorskip("torch")
    transformers = pytest.importorskip("transformers")
    from nola_translator_engine.translation.m2m100 import _Bundle

    captured = {}

    class Inputs(dict):
        def to(self, device):
            captured["device"] = device
            return self

    class Processor:
        chat_template = "official"

        def apply_chat_template(self, messages, **kwargs):
            captured["messages"] = messages
            captured["template_kwargs"] = kwargs
            return Inputs(input_ids=torch.tensor([[1, 2]]))

        def batch_decode(self, tokens, **kwargs):
            return ["<think>draft</think>你好"]

    class Model:
        config = type("Config", (), {"max_position_embeddings": 1024})()

        def to(self, device):
            return self

        def eval(self):
            return self

        def generate(self, **kwargs):
            captured["generation"] = kwargs
            return torch.tensor([[1, 2, 3]])

    monkeypatch.setattr(transformers.AutoProcessor, "from_pretrained", lambda *args, **kwargs: Processor())
    monkeypatch.setattr(transformers.AutoModelForMultimodalLM, "from_pretrained", lambda *args, **kwargs: Model())
    runtime = IndexTranslateTransformersRuntime(tmp_path, device="cpu", precision="auto", context_size=512)
    bundle = runtime._load_bundle()
    assert bundle.tokenizer.chat_template == "official"
    assert bundle.model.config.max_position_embeddings == 1024
    assert runtime._translate_locked("Hello", "en", "zh") == "你好"
    assert captured["messages"] == [{"role": "user", "content": "请将以下英语文本翻译为中文，直接输出翻译结果，不要进行任何解释。\n\nHello"}]
    assert captured["template_kwargs"]["enable_thinking"] is False
    assert captured["template_kwargs"]["return_dict"] is True
