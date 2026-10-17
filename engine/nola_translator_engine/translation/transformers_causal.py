"""Local causal-LM translation independent of the recommended model families."""
from __future__ import annotations

import asyncio

from .base import ProviderTranslation
from .m2m100 import M2M100Runtime, _Bundle
from ..compute import cpu_threads, resolve_dtype
from .index_translate_languages import LANGUAGE_NAMES


class CausalTranslationRuntime(M2M100Runtime):
    model_label = "Transformers causal LM"

    def __init__(self, model_dir, *, context_size=2048, **options):
        super().__init__(model_dir, **options)
        self.context_size = context_size

    def _load_bundle(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.device = self.device or "cpu"
        torch.set_num_threads(cpu_threads(self.threads))
        tokenizer = AutoTokenizer.from_pretrained(str(self.model_dir), local_files_only=True, trust_remote_code=False)
        model = AutoModelForCausalLM.from_pretrained(str(self.model_dir), local_files_only=True,
            trust_remote_code=False, torch_dtype=resolve_dtype(self.device, self.precision)).to(self.device).eval()
        if not tokenizer.chat_template:
            raise ValueError("翻译模型缺少 chat_template；请导入包含对话模板的完整模型。")
        return _Bundle(model=model, tokenizer=tokenizer)

    def _translate_locked(self, text, source, target):
        import torch
        from ..model_capabilities import normalize
        from ..hub import HYMT2_LANGUAGES

        self.load()
        bundle = self._bundle
        target_name = HYMT2_LANGUAGES.get(normalize(target)) or LANGUAGE_NAMES.get(normalize(target), target)
        prompt = f"Translate the following text into {target_name}. Only output the translation:\n{text}"
        rendered = bundle.tokenizer.apply_chat_template([{"role": "user", "content": prompt}],
            tokenize=False, add_generation_prompt=True, enable_thinking=False)
        inputs = bundle.tokenizer(rendered, return_tensors="pt", add_special_tokens=False).to(self.device)
        count = inputs['input_ids'].shape[1]
        limit = min(self.context_size, getattr(bundle.model.config, 'max_position_embeddings', self.context_size))
        output_tokens = min(512, limit - count)
        if output_tokens < 32:
            raise ValueError("翻译原文超过模型上下文长度，请缩短原文或增大上下文窗口。")
        with torch.inference_mode():
            output = bundle.model.generate(**inputs, max_new_tokens=output_tokens, do_sample=False)
        generated = output[0, count:]
        if len(generated) >= output_tokens:
            raise ValueError("翻译达到输出上限，请缩短原文或增大上下文窗口。")
        return bundle.tokenizer.decode(generated, skip_special_tokens=True).strip()


class CausalTranslationProvider:
    name = "transformers-causal"

    def __init__(self, model_dir, **options):
        self.runtime = CausalTranslationRuntime(model_dir, **options)

    async def translate(self, text, source, target):
        content = await asyncio.to_thread(self.runtime.translate_sync, text, source, target)
        return ProviderTranslation(content, (source, target))
