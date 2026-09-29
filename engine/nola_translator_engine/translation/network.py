"""Optional network translation providers, used only after the user explicitly picks one."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .base import ProviderTranslation


JsonRequester = Callable[[str, object, dict[str, str]], object]


def _post_json(url: str, payload: object, headers: dict[str, str]) -> object:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=UTF-8", **headers},
    )
    with urlopen(request, timeout=20) as response:  # noqa: S310 - the URL is explicitly configured by the user
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"翻译服务返回 HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


class MicrosoftTranslatorProvider:
    name = "microsoft"

    def __init__(
        self,
        api_key: str,
        *,
        endpoint: str = "https://api.cognitive.microsofttranslator.com",
        region: str = "",
        requester: JsonRequester = _post_json,
    ) -> None:
        if not api_key:
            raise ValueError("Microsoft Translator API 密钥为空")
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.region = region
        self.requester = requester

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        aliases = {"zh": "zh-Hans"}
        query = urlencode(
            {"api-version": "3.0", "from": aliases.get(source, source), "to": aliases.get(target, target)}
        )
        headers = {"Ocp-Apim-Subscription-Key": self.api_key}
        if self.region:
            headers["Ocp-Apim-Subscription-Region"] = self.region
        result = await asyncio.to_thread(
            self.requester,
            f"{self.endpoint}/translate?{query}",
            [{"Text": text}],
            headers,
        )
        try:
            translated = result[0]["translations"][0]["text"]  # type: ignore[index]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Microsoft Translator 响应格式无效") from error
        return ProviderTranslation(str(translated), (source, target))


def _translation_messages(text: str, source: str, target: str) -> list[dict[str, str]]:
    return [
        {
            "role": "system",
            "content": (
                "You are a translation engine. Translate the user's text "
                f"from {source} to {target}. Return only the translation."
            ),
        },
        {"role": "user", "content": text},
    ]


class OpenAICompatibleProvider:
    name = "openai"

    def __init__(
        self,
        *,
        endpoint: str,
        model: str,
        api_key: str = "",
        requester: JsonRequester = _post_json,
    ) -> None:
        if not endpoint or not model:
            raise ValueError("OpenAI 兼容接口的地址或模型为空")
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.requester = requester

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        result = await asyncio.to_thread(
            self.requester,
            f"{self.endpoint}/chat/completions",
            {"model": self.model, "messages": _translation_messages(text, source, target), "temperature": 0},
            headers,
        )
        try:
            translated = result["choices"][0]["message"]["content"]  # type: ignore[index]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("OpenAI 兼容接口响应格式无效") from error
        return ProviderTranslation(str(translated).strip(), (source, target))


class OllamaTranslationProvider:
    name = "ollama"

    def __init__(
        self,
        *,
        endpoint: str = "http://127.0.0.1:11434",
        model: str,
        requester: JsonRequester = _post_json,
    ) -> None:
        if not model:
            raise ValueError("Ollama 模型为空")
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.requester = requester

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        result = await asyncio.to_thread(
            self.requester,
            f"{self.endpoint}/api/chat",
            {
                "model": self.model,
                "messages": _translation_messages(text, source, target),
                "stream": False,
                "options": {"temperature": 0},
            },
            {},
        )
        try:
            translated = result["message"]["content"]  # type: ignore[index]
        except (KeyError, TypeError) as error:
            raise RuntimeError("Ollama 响应格式无效") from error
        return ProviderTranslation(str(translated).strip(), (source, target))
