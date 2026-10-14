"""Index-Translate text inference using the official no-thinking user prompt."""

from __future__ import annotations

import asyncio
from typing import Any

from .base import ProviderTranslation
from .llama_server import LlamaServerManager
from .network import JsonRequester, OpenAICompatibleProvider, _post_json
from .index_translate_languages import LANGUAGE_NAMES
from ..model_capabilities import normalize

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
