"""Index-Translate text inference using the official no-thinking user prompt."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import ProviderTranslation
from .llama_server import LlamaServerManager
from .network import JsonRequester, OpenAICompatibleProvider, _post_json
from .index_translate_languages import LANGUAGE_NAMES
from ..model_capabilities import normalize
from ..compute import cpu_threads, resolve_dtype
from .m2m100 import _Bundle
from .transformers_causal import CausalTranslationRuntime

PUBLIC_ENDPOINT = "https://index-translate.bilibili.com/v1"
PUBLIC_MODEL = "Index-Translate-35B-A3B"
def prompt_header(source: str, target: str) -> str:
    source, target = normalize(source), normalize(target)
    if target not in LANGUAGE_NAMES:
        raise ValueError(f"Index-Translate 不支持的目标语言：{target}")
    # The recognizer's primary-language hint need not cover every language in mixed speech.
    # An unmapped hint uses the official auto-source form instead of inventing a language name.
    source_name = LANGUAGE_NAMES.get(source, "")
    return f"请将以下{source_name}文本翻译为{LANGUAGE_NAMES[target]}，直接输出翻译结果，不要进行任何解释。"


class IndexTranslatePublicProvider(OpenAICompatibleProvider):
    """Fixed public service; it never accepts or forwards a user's cloud credential."""

    name = "index-translate"
    label = "Index-Translate"

    def __init__(self, *, requester: JsonRequester = _post_json) -> None:
        super().__init__(endpoint=PUBLIC_ENDPOINT, model=PUBLIC_MODEL,
                         context_window=32768, max_output_tokens=1024, requester=requester)

    def _system_prompt(self, source: str, target: str) -> str:
        return prompt_header(source, target)

    def _headers(self) -> dict[str, str]:
        # Match the official reference client's public-service identification header.
        return {"User-Agent": "Index-Translate-Client/1.0"}

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [{"role": "user", "content": f"{system}\n\n{text.strip()}"}],
            "temperature": 0,
            "max_tokens": self._output_token_limit(text, system),
            "chat_template_kwargs": {"enable_thinking": False},
        }


class IndexTranslateLocalProvider:
    name = "index-translate-local"

    def __init__(self, manager: LlamaServerManager) -> None:
        self.manager = manager

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        messages = [{"role": "user", "content": f"{prompt_header(source, target)}\n\n{text.strip()}"}]
        content = await asyncio.to_thread(self.manager.chat_sync, messages,
            chat_template_kwargs={"enable_thinking": False}, max_tokens=1024)
        return ProviderTranslation(content, (source, target))


class IndexTranslateTransformersRuntime(CausalTranslationRuntime):
    """Official Index-Translate safetensors through Transformers' multimodal model API.

    The text-only task still uses the model's processor and Qwen3.5 chat template. The loader
    is intentionally separate from the generic causal adapter: these checkpoints declare
    Qwen3_5ForConditionalGeneration, not AutoModelForCausalLM.
    """

    model_label = "Index-Translate PyTorch"

    def _load_bundle(self):
        import torch
        from transformers import AutoModelForMultimodalLM, AutoProcessor

        self.device = self.device or "cpu"
        torch.set_num_threads(cpu_threads(self.threads))
        processor = AutoProcessor.from_pretrained(
            str(self.model_dir), local_files_only=True, trust_remote_code=False,
        )
        model = AutoModelForMultimodalLM.from_pretrained(
            str(self.model_dir), local_files_only=True, trust_remote_code=False,
            torch_dtype=resolve_dtype(self.device, self.precision),
        ).to(self.device).eval()
        return _Bundle(model=model, tokenizer=processor)

    def _translate_locked(self, text, source, target):
        import torch

        self.load()
        bundle = self._bundle
        assert bundle is not None
        prompt = f"{prompt_header(source, target)}\n\n{text.strip()}"
        inputs = bundle.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=True, add_generation_prompt=True, enable_thinking=False,
            return_tensors="pt", return_dict=True,
        ).to(self.device)
        input_count = inputs["input_ids"].shape[1]
        context_limit = min(
            self.context_size,
            getattr(bundle.model.config, "max_position_embeddings", self.context_size),
        )
        output_tokens = min(512, context_limit - input_count)
        if output_tokens < 32:
            raise ValueError("翻译原文超过模型上下文长度，请缩短原文或增大上下文窗口。")
        with torch.inference_mode():
            output = bundle.model.generate(**inputs, max_new_tokens=output_tokens, do_sample=False)
        generated = output[:, input_count:]
        if generated.shape[1] >= output_tokens:
            raise ValueError("翻译达到输出上限，请缩短原文或增大上下文窗口。")
        result = bundle.tokenizer.batch_decode(generated, skip_special_tokens=True)[0].strip()
        return result.removeprefix("<think>").split("</think>", 1)[-1].strip()


class IndexTranslateTransformersProvider:
    name = "index-translate-transformers"

    def __init__(self, model_dir, **options) -> None:
        self.runtime = IndexTranslateTransformersRuntime(model_dir, **options)

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        content = await asyncio.to_thread(self.runtime.translate_sync, text, source, target)
        return ProviderTranslation(content, (source, target))
