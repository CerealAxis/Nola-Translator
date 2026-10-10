"""Optional network translation providers, used only after the user explicitly picks one."""

from __future__ import annotations

import asyncio
import json
import math
import re
import ssl
from time import monotonic
import httpx
from collections.abc import Callable
from typing import Any
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, getproxies, proxy_bypass, urlopen

from .base import ProviderTranslation


JsonRequester = Callable[[str, object, dict[str, str]], object]

#: Default base URLs, defined in one place so the runtime dispatch cannot disagree with them.
DEFAULT_MICROSOFT_ENDPOINT = "https://api.cognitive.microsofttranslator.com"
#: Versioned base: the user types the address *including* the version, and the fixed suffix
#: (`/chat/completions`, `/responses`, `/api/chat`) is appended to it.
DEFAULT_OPENAI_ENDPOINT = "https://api.openai.com/v1"
DEFAULT_OLLAMA_ENDPOINT = "http://127.0.0.1:11434"
#: Bare origin, NOT versioned — see `AnthropicMessagesProvider` for why this one differs.
DEFAULT_ANTHROPIC_ENDPOINT = "https://api.anthropic.com"

#: The version header is required on every Messages request; this is the value Anthropic's own
#: versioning page documents (https://platform.claude.com/docs/en/api/versioning).
ANTHROPIC_VERSION = "2023-06-01"

DEFAULT_CONTEXT_WINDOW = 128_000
DEFAULT_MAX_OUTPUT_TOKENS = 4_096

#: Characters per token, used ONLY to keep a request inside the user's contextWindow. This
#: is an approximation, not tokenisation: no tokenizer is loaded, and the real ratio is
#: roughly 1.5 chars/token for CJK and roughly 4 for English prose, varying with model.
#:
#: Both values sit BELOW those measured ratios, so the estimate over-counts and a request
#: under-fills. That is the safe direction to err in: this guard is all that stands between
#: a caption and an HTTP 400, and an under-count is what blows the window. CJK binds.
CJK_CHARS_PER_TOKEN = 1.2
LATIN_CHARS_PER_TOKEN = 3
#: Floor for the per-request allowance. Without it a small contextWindow would compute a
#: zero-or-negative budget and the text could never be chunked at all.
MIN_PROMPT_TOKENS = 64
#: Hard cap on how many requests one translation may turn into. Past this the input is refused
#: rather than truncated: a caption that silently lost its tail reads as a translation bug, and
#: an unbounded loop would pin the translation worker on a pathological paste. At the default
#: 128k window the 16 KiB the protocol allows for a caption is a single chunk, so this is a
#: guard against a mis-set window, not a limit the normal path reaches.
MAX_CHUNKS = 8


#: Seconds a single HTTP request may take. The scheduler's whole-translation deadline is
#: derived from this (see `_BudgetedChatProvider.timeout_for`).
HTTP_REQUEST_TIMEOUT_SECONDS = 20


def _post_json(url: str, payload: object, headers: dict[str, str]) -> object:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json; charset=UTF-8", **headers},
    )
    with urlopen(request, timeout=HTTP_REQUEST_TIMEOUT_SECONDS) as response:  # noqa: S310 - the URL is explicitly configured by the user
        if response.status < 200 or response.status >= 300:
            raise RuntimeError(f"翻译服务返回 HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def _estimate_tokens(text: str) -> int:
    """Approximate token count; see CJK/LATIN_CHARS_PER_TOKEN for the safety direction.

    Must never come out below the real count, or the chunking below would size a request the
    model then refuses as too long. Round up, and divide by the blended ratio rather than by a
    single constant: the two have to stay in step or the estimate silently stops being an
    upper bound for one of the two scripts.
    """
    return math.ceil(len(text) / _chars_per_token(text))


def _is_cjk(char: str) -> bool:
    code = ord(char)
    return (
        0x3040 <= code <= 0x30FF  # kana
        or 0x3400 <= code <= 0x4DBF  # CJK extension A
        or 0x4E00 <= code <= 0x9FFF  # CJK unified ideographs
        or 0xAC00 <= code <= 0xD7AF  # hangul
        or 0xF900 <= code <= 0xFAFF  # CJK compatibility ideographs
    )


def _is_dense(char: str) -> bool:
    """Whether a character belongs to a script that tokenizes at roughly one per token.

    Only the token estimate asks this;
    `_join_chunks` keeps asking `_is_cjk`, where a fullwidth comma is no reason to drop the
    space between two English words.
    """
    code = ord(char)
    return (
        _is_cjk(char)
        or 0x3000 <= code <= 0x30FF  # CJK symbols and punctuation
        or 0xFF00 <= code <= 0xFFEF  # halfwidth and fullwidth forms
    )


def _chars_per_token(text: str) -> float:
    """Characters per token for *this* text, blended by its dense-script share.

    A caption is rarely pure: Chinese subtitles carry English product names, numbers and
    timestamps. One flat constant has to be either right for CJK and wasteful for English or
    the reverse, so the two ratios are weighted by how much of the text each one covers.
    A pure-CJK or pure-Latin string takes its own ratio unchanged.
    """
    if not text:
        return LATIN_CHARS_PER_TOKEN
    dense = sum(1 for char in text if _is_dense(char))
    if not dense:
        return LATIN_CHARS_PER_TOKEN
    share = dense / len(text)
    return share * CJK_CHARS_PER_TOKEN + (1 - share) * LATIN_CHARS_PER_TOKEN


def _join_chunks(parts: list[str]) -> str:
    """Concatenate chunk translations, putting a space back only where the script needs one."""
    joined = ""
    for part in parts:
        piece = part.strip()
        if not piece:
            continue
        if joined and not (_is_cjk(joined[-1]) or _is_cjk(piece[0])):
            joined += " "
        joined += piece
    return joined


def _split_text(text: str, limit: int) -> list[str]:
    """Cut text into pieces of at most `limit` characters, preferring natural boundaries.

    A cut on length alone is legal but produces fragments that end mid-word, which translate
    worse than whole sentences. So the last sentence-ish boundary inside the window wins, and
    only a window with no boundary at all falls back to cutting on length.
    """
    pieces: list[str] = []
    remaining = text.strip()
    while remaining:
        if len(remaining) <= limit:
            pieces.append(remaining)
            break
        window = remaining[:limit]
        boundary = max(
            window.rfind("\n"),
            window.rfind("。"),
            window.rfind("！"),
            window.rfind("？"),
            window.rfind(". "),
            window.rfind("! "),
            window.rfind("? "),
            window.rfind("; "),
            window.rfind(", "),
        )
        cut = boundary + 1 if boundary > 0 else limit
        chunk = remaining[:cut].strip()
        if chunk:
            pieces.append(chunk)
        remaining = remaining[cut:].strip()
    return pieces


class _NetworkTransport:
    requester: JsonRequester
    endpoint: str
    _http: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            # A session-scoped pool avoids a new TCP/TLS handshake for every caption.
            # Keep urllib's Windows proxy bypass rules and system certificate trust when switching transport.
            endpoint = urlsplit(self.endpoint)
            proxy = None if proxy_bypass(endpoint.netloc) else getproxies().get(endpoint.scheme)
            self._http = httpx.AsyncClient(timeout=HTTP_REQUEST_TIMEOUT_SECONDS, follow_redirects=True,
                                          proxy=proxy, trust_env=False, verify=ssl.create_default_context(),
                                          limits=httpx.Limits(max_connections=3, max_keepalive_connections=3))
        return self._http

    async def _request_json(self, url: str, payload: object, headers: dict[str, str]) -> object:
        if self.requester is not _post_json:
            return await asyncio.to_thread(self.requester, url, payload, headers)
        response = await self._client().post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

    async def aclose(self) -> None:
        if self._http is not None:
            client, self._http = self._http, None
            await client.aclose()


class MicrosoftTranslatorProvider(_NetworkTransport):
    name = "microsoft"

    def __init__(
        self,
        api_key: str,
        *,
        endpoint: str = DEFAULT_MICROSOFT_ENDPOINT,
        region: str = "",
        requester: JsonRequester = _post_json,
    ) -> None:
        if not api_key:
            raise ValueError("Microsoft Translator API 密钥为空")
        # Checked here rather than at request time, for the same reason the other four
        # providers check their own endpoint: an empty address only ever builds the relative
        # URL `/translate?…`, which surfaces as a connection error that names nothing.
        if not endpoint:
            raise ValueError(
                "Microsoft Translator 接口的地址为空：请填写服务根地址，"
                f"例如 {DEFAULT_MICROSOFT_ENDPOINT}"
            )
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
        result = await self._request_json(
            f"{self.endpoint}/translate?{query}",
            [{"Text": text}],
            headers,
        )
        try:
            translated = result[0]["translations"][0]["text"]  # type: ignore[index]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Microsoft Translator 响应格式无效") from error
        return ProviderTranslation(str(translated), (source, target))


def _system_prompt(source: str, target: str) -> str:
    return (
        "You are a translation engine. Translate the complete transcript into "
        f"{target}. The recognizer labels the main source language as {source}, but the text may "
        "switch between languages within a sentence. Translate every non-target-language part; "
        "preserve wording that is already in the target language, and keep names and technical "
        "terms when translating them would be misleading. For a JSON input containing "
        "previousSource, previousTranslation, and currentSource, treat the previous fields as "
        "context and translate currentSource only. Return the complete current translation, "
        "keeping the previous wording where the meaning is unchanged and adding or revising only "
        "what the updated source requires. Return only translated text."
    )


def _translation_messages(text: str, source: str, target: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": _system_prompt(source, target)},
        {"role": "user", "content": text},
    ]


class _BudgetedChatProvider(_NetworkTransport):
    """Shared limit handling and context-window chunking for the four chat-shaped formats.

    A subclass only describes its wire format: the URL, the headers, the body, and which JSON
    path holds the translation. Everything about `contextWindow` and `maxOutputTokens` lives
    here, so those two settings cannot be honoured by one format and quietly dropped by the
    next — and so a subclass cannot forget the chunking entirely.
    """

    #: Unique across providers: the scheduler keys its LRU cache on this, and the caption
    #: event reports it as the translation's `provider`.
    name = ""
    #: Names the provider in every error message, so the message points at the setting the
    #: user has to change.
    label = ""
    supports_streaming = False

    def __init__(
        self,
        *,
        endpoint: str,
        model: str,
        api_key: str = "",
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        requester: JsonRequester = _post_json,
    ) -> None:
        if not model:
            raise ValueError(f"{self.label}的模型名为空（translationOptions.model）")
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.context_window = context_window
        self.max_output_tokens = max_output_tokens
        self.requester = requester

    def _url(self) -> str:
        raise NotImplementedError

    def _headers(self) -> dict[str, str]:
        raise NotImplementedError

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        raise NotImplementedError

    def _extract(self, result: object) -> str:
        raise NotImplementedError

    def _prompt_overhead(self, system: str) -> int:
        # Reserve space for message framing as well as the repeated system instructions.
        # Token counts remain estimates; providers use different tokenizers.
        return _estimate_tokens(system) + MIN_PROMPT_TOKENS

    def _output_token_reserve(self, system: str) -> int:
        """Use one reply allowance for both chunk planning and the outgoing payload."""
        available = self.context_window - self._prompt_overhead(system)
        if available < 2:
            raise ValueError(f"{self.label}的 contextWindow 太小，无法容纳提示词、原文和输出")
        return min(
            self.max_output_tokens,
            max(1, self.context_window // 2),
            max(1, available - MIN_PROMPT_TOKENS),
        )

    def _input_token_budget(self, system: str) -> int:
        return self.context_window - self._prompt_overhead(system) - self._output_token_reserve(system)

    def _output_token_limit(self, text: str, system: str) -> int:
        """Never request more output than fits beside this chunk's estimated input."""
        remaining = self.context_window - self._prompt_overhead(system) - _estimate_tokens(text)
        if remaining < 1:
            raise ValueError(f"{self.label}的输入超过 contextWindow，未发送请求")
        return min(self._output_token_reserve(system), remaining)

    def _plan_chunks(self, text: str, system: str) -> list[str]:
        """Split the source text so each request fits the window."""
        budget = self._input_token_budget(system)
        pending = [text]
        chunks: list[str] = []
        while pending:
            piece = pending.pop()
            if _estimate_tokens(piece) <= budget:
                chunks.append(piece)
                continue
            # Recheck each piece: a mixed-language paragraph can split into a dense CJK
            # piece whose token estimate differs from the original paragraph's ratio.
            per_chunk = max(1, int(budget * _chars_per_token(piece)))
            pending.extend(reversed(_split_text(piece, per_chunk)))
        return chunks

    def timeout_for(self, text: str, source: str, target: str) -> float:
        """Seconds this one translation may take, for `TranslationScheduler` to apply.

        One translation is not one request here: `translate` splits the text and then walks
        the chunks sequentially, so a small contextWindow turns a single caption into several
        round trips. A flat budget shared across all of them cannot work, so the deadline
        scales with the real chunk count.

        Clamped at MAX_CHUNKS because `translate` refuses anything longer before it makes a
        single request, so an unbounded paste cannot buy itself an unbounded deadline.
        """
        chunks = len(self._plan_chunks(text, _system_prompt(source, target)))
        return min(max(chunks, 1), MAX_CHUNKS) * HTTP_REQUEST_TIMEOUT_SECONDS

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        system = _system_prompt(source, target)
        chunks = self._plan_chunks(text, system)
        if len(chunks) > MAX_CHUNKS:
            raise RuntimeError(
                f"{self.label}的原文过长：按 contextWindow={self.context_window} 需要 "
                f"{len(chunks)} 段请求，超过上限 {MAX_CHUNKS} 段。"
                "请调大 translationOptions.contextWindow 后重试。"
            )
        parts: list[str] = []
        for chunk in chunks:
            # the chunks are one utterance and the scheduler already
            # runs the per-target requests concurrently, which is the concurrency that pays.
            result = await self._request_json(self._url(), self._payload(chunk, system), self._headers())
            parts.append(self._extract(result))
        return ProviderTranslation(_join_chunks(parts), (source, target))

    def _stream_delta(self, event: dict[str, Any]) -> tuple[str, bool]:
        raise NotImplementedError

    async def translate_stream(self, text: str, source: str, target: str,
                               on_text: Callable[[str], None]) -> ProviderTranslation:
        if not self.supports_streaming or self.requester is not _post_json:
            return await self.translate(text, source, target)
        system = _system_prompt(source, target)
        chunks = self._plan_chunks(text, system)
        if len(chunks) > MAX_CHUNKS:
            raise RuntimeError(f"{self.label}的原文过长，超过上限 {MAX_CHUNKS} 段")
        parts: list[str] = []
        last_sent = 0.0
        last_text = ""
        for chunk in chunks:
            payload = {**self._payload(chunk, system), "stream": True}
            buffer = ""
            finished = False
            async with self._client().stream('POST', self._url(), json=payload, headers=self._headers()) as response:
                response.raise_for_status()
                if 'text/event-stream' not in response.headers.get('content-type', ''):
                    # Some compatible gateways ignore stream and return their ordinary JSON reply.
                    await response.aread()
                    parts.append(self._extract(response.json()))
                    continue
                data: list[str] = []

                def consume() -> None:
                    nonlocal buffer, finished, last_sent, last_text
                    raw = '\n'.join(data)
                    data.clear()
                    if not raw:
                        return
                    if raw == '[DONE]':
                        finished = True
                        return
                    event = json.loads(raw)
                    if not isinstance(event, dict) or event.get('error') or event.get('type') == 'error':
                        raise RuntimeError(f"{self.label}的流式响应错误")
                    delta, done = self._stream_delta(event)
                    finished = finished or done
                    buffer += delta
                    # Some compatible chat APIs put reasoning inside content instead of a separate field.
                    visible = re.sub(r'<think>.*?(?:</think>|$)', '', buffer, flags=re.DOTALL)
                    if '<' in visible and visible[visible.rfind('<'):] in ('<', '<t', '<th', '<thi', '<thin', '<think'):
                        visible = visible[:visible.rfind('<')]
                    partial = _join_chunks([*parts, visible])
                    now = monotonic()
                    if partial and partial != last_text and (not last_text or now - last_sent >= 0.1):
                        on_text(partial)
                        last_text, last_sent = partial, now

                async for line in response.aiter_lines():
                    if line.startswith('data:'):
                        data.append(line[5:].lstrip(' '))
                    elif not line:
                        consume()
                consume()
                if not finished:
                    raise RuntimeError(f"{self.label}的流式响应中断")
                visible = re.sub(r'<think>.*?(?:</think>|$)', '', buffer, flags=re.DOTALL).strip()
                if not visible:
                    raise RuntimeError(f"{self.label}没有返回译文")
                parts.append(visible)
        return ProviderTranslation(_join_chunks(parts), (source, target))


class OpenAICompatibleProvider(_BudgetedChatProvider):
    """OpenAI Chat Completions: `POST {endpoint}/chat/completions`.

    `endpoint` is a versioned base — the default already ends in `/v1` — so a proxy served at
    `https://host/openai/v1` works exactly like the default does.
    """

    name = "openai"
    label = "OpenAI 兼容接口"
    supports_streaming = True

    def __init__(
        self,
        *,
        endpoint: str = DEFAULT_OPENAI_ENDPOINT,
        model: str,
        api_key: str = "",
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        requester: JsonRequester = _post_json,
    ) -> None:
        if not endpoint:
            raise ValueError(
                "OpenAI 兼容接口的地址为空：请填写带版本号的根地址，例如 https://api.openai.com/v1"
            )
        super().__init__(
            endpoint=endpoint,
            model=model,
            api_key=api_key,
            context_window=context_window,
            max_output_tokens=max_output_tokens,
            requester=requester,
        )

    def _url(self) -> str:
        return f"{self.endpoint}/chat/completions"

    def _headers(self) -> dict[str, str]:
        # Omitted rather than sent empty: a keyless local server (LM Studio, vLLM, llama.cpp's
        # OpenAI shim) rejects the header outright, and those users never configured a key.
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": text},
            ],
            # 0 pins sampling: the same sentence should not come back worded differently
            # between two identical caption lines.
            "temperature": 0,
            "max_tokens": self._output_token_limit(text, system),
        }
        # MiniMax's documented reasoning_split changes output format, not reasoning latency.
        # https://platform.minimax.io/docs/api-reference/text-openai-api
        if urlsplit(self.endpoint).hostname in ('api.minimax.io', 'api.minimax.cn', 'api.minimax.chat'):
            payload.update(temperature=1, reasoning_split=True)
        return payload

    def _stream_delta(self, event: dict[str, Any]) -> tuple[str, bool]:
        choices = event.get('choices', [])
        if not choices:
            return '', False
        choice = choices[0]
        reason = choice.get('finish_reason')
        if reason and reason != 'stop':
            raise RuntimeError('OpenAI 兼容接口译文被截断或阻止')
        content = choice.get('delta', {}).get('content') or ''
        if not isinstance(content, str):
            raise RuntimeError('OpenAI 兼容接口流式文本格式无效')
        return content, reason == 'stop'

    def _extract(self, result: object) -> str:
        try:
            choice = result["choices"][0]  # type: ignore[index]
            if choice.get('finish_reason') not in (None, 'stop'):
                raise RuntimeError('OpenAI 兼容接口译文被截断或阻止')
            translated = choice["message"]["content"]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError(
                "OpenAI 兼容接口响应格式无效（缺少 choices[0].message.content）"
            ) from error
        if not isinstance(translated, str):
            raise RuntimeError('OpenAI 兼容接口没有返回译文')
        translated = re.sub(r'<think>.*?(?:</think>|$)', '', translated, flags=re.DOTALL).strip()
        if not translated:
            raise RuntimeError('OpenAI 兼容接口没有返回译文')
        return translated


class OpenAIResponsesProvider(_BudgetedChatProvider):
    """OpenAI Responses: `POST {endpoint}/responses`.

    Three differences from Chat Completions that are easy to get wrong and each break the
    request silently: the system prompt is the top-level `instructions`, not a message with
    role "system"; the output limit is `max_output_tokens`, not `max_tokens`; and the reply
    is under `output[].content[].text`, not `choices[0].message.content`.
    """

    name = "openai-responses"
    label = "OpenAI Responses 接口"

    def __init__(
        self,
        *,
        endpoint: str = DEFAULT_OPENAI_ENDPOINT,
        model: str,
        api_key: str = "",
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        requester: JsonRequester = _post_json,
    ) -> None:
        if not endpoint:
            raise ValueError(
                "OpenAI Responses 接口的地址为空：请填写带版本号的根地址，例如 https://api.openai.com/v1"
            )
        super().__init__(
            endpoint=endpoint,
            model=model,
            api_key=api_key,
            context_window=context_window,
            max_output_tokens=max_output_tokens,
            requester=requester,
        )

    def _url(self) -> str:
        return f"{self.endpoint}/responses"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        return {
            "model": self.model,
            "input": text,
            "instructions": system,
            "temperature": 0,
            "max_output_tokens": self._output_token_limit(text, system),
        }

    def _extract(self, result: object) -> str:
        try:
            items = result["output"]  # type: ignore[index]
            for item in items:
                for block in item.get("content") or []:
                    # Output items also carry reasoning and tool-call blocks; only the text
                    # block is the translation, and `output_text` is the type that says so.
                    if block.get("type") == "output_text" and block.get("text"):
                        return str(block["text"]).strip()
        except (AttributeError, IndexError, KeyError, TypeError) as error:
            raise RuntimeError("OpenAI Responses 响应格式无效（缺少 output 数组）") from error
        raise RuntimeError("OpenAI Responses 响应里没有 output_text 内容块")


class AnthropicMessagesProvider(_BudgetedChatProvider):
    """Anthropic Messages: `POST {endpoint}/v1/messages`.

    Endpoint asymmetry, and it is the one thing to get right when typing the address: the
    other three formats take a *versioned* base and append a fixed suffix, while Anthropic
    users type a *bare origin* (`https://api.anthropic.com`) and the versioned path is
    appended here. A base that already carries `/v1` or the full `/v1/messages` is refused at
    construction rather than turned into `/v1/v1/messages` and a 404 twenty seconds later.

    Two more differences from the OpenAI shape, both from Anthropic's own Messages reference:
    `max_tokens` is a *required* body field, and the system prompt is the top-level `system`
    parameter rather than a message with role "system".
    """

    name = "anthropic"
    label = "Anthropic Messages 接口"
    supports_streaming = True

    def __init__(
        self,
        *,
        endpoint: str = DEFAULT_ANTHROPIC_ENDPOINT,
        model: str,
        api_key: str = "",
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        requester: JsonRequester = _post_json,
    ) -> None:
        # Checked here rather than at request time: the Messages API requires the x-api-key
        # header on every call, so an empty key could only ever end as an opaque HTTP 401.
        if not api_key:
            raise ValueError(
                "Anthropic Messages 接口需要 API 密钥（translationOptions.apiKey）："
                "该接口必须携带 x-api-key 请求头"
            )
        if not endpoint:
            raise ValueError(
                "Anthropic Messages 接口的地址为空：请填写不带版本号的根地址，"
                "例如 https://api.anthropic.com"
            )
        if _has_version_suffix(endpoint):
            raise ValueError(
                f"Anthropic 地址请填不带版本号的根地址（当前填了 {endpoint}）："
                "/v1/messages 由引擎自动拼接，请只填到域名，"
                f"例如 {DEFAULT_ANTHROPIC_ENDPOINT}"
            )
        super().__init__(
            endpoint=endpoint,
            model=model,
            api_key=api_key,
            context_window=context_window,
            max_output_tokens=max_output_tokens,
            requester=requester,
        )

    def _url(self) -> str:
        return f"{self.endpoint}/v1/messages"

    def _headers(self) -> dict[str, str]:
        return {"x-api-key": self.api_key, "anthropic-version": ANTHROPIC_VERSION}

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        return {
            "model": self.model,
            # Required by the Messages API, and the closest thing to max_output_tokens.
            "max_tokens": self._output_token_limit(text, system),
            "system": system,
            "messages": [{"role": "user", "content": text}],
        }

    def _extract(self, result: object) -> str:
        try:
            if result.get('stop_reason') not in (None, 'end_turn', 'stop_sequence'):  # type: ignore[union-attr]
                raise RuntimeError('Anthropic Messages 译文被截断或阻止')
            blocks = result["content"]  # type: ignore[index]
            for block in blocks:
                if block.get("type") == "text" and block.get("text"):
                    return str(block["text"]).strip()
        except (AttributeError, IndexError, KeyError, TypeError) as error:
            raise RuntimeError("Anthropic Messages 响应格式无效（缺少 content 数组）") from error
        raise RuntimeError("Anthropic Messages 响应里没有文本内容块")

    def _stream_delta(self, event: dict[str, Any]) -> tuple[str, bool]:
        if event.get('type') == 'message_delta':
            reason = event.get('delta', {}).get('stop_reason')
            if reason not in (None, 'end_turn', 'stop_sequence'):
                raise RuntimeError('Anthropic Messages 译文被截断或阻止')
        delta = event.get('delta', {})
        if event.get('type') == 'content_block_delta' and delta.get('type') == 'text_delta':
            return delta.get('text', ''), False
        return '', event.get('type') == 'message_stop'


class OllamaTranslationProvider(_BudgetedChatProvider):
    """Ollama's own chat API: `POST {endpoint}/api/chat`.

    The native endpoint rather than Ollama's OpenAI-compatible shim, so a stock local install
    works with no configuration at all. No auth header by default — a local Ollama has no key —
    but one is sent if the user configured it, for a reverse proxy sitting in front of Ollama.
    The output limit is `options.num_predict`, which is Ollama's own name for "maximum number
    of tokens to predict when generating text".
    """

    name = "ollama"
    label = "Ollama 接口"

    def __init__(
        self,
        *,
        endpoint: str = DEFAULT_OLLAMA_ENDPOINT,
        model: str,
        api_key: str = "",
        context_window: int = DEFAULT_CONTEXT_WINDOW,
        max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
        requester: JsonRequester = _post_json,
    ) -> None:
        if not endpoint:
            raise ValueError(
                f"Ollama 接口的地址为空：请填写服务根地址，例如 {DEFAULT_OLLAMA_ENDPOINT}"
            )
        super().__init__(
            endpoint=endpoint,
            model=model,
            api_key=api_key,
            context_window=context_window,
            max_output_tokens=max_output_tokens,
            requester=requester,
        )

    def _url(self) -> str:
        return f"{self.endpoint}/api/chat"

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def _payload(self, text: str, system: str) -> dict[str, Any]:
        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": text},
            ],
            # Ollama streams by default; a non-streaming body is what this parser expects.
            "stream": False,
            "options": {"temperature": 0, "num_predict": self._output_token_limit(text, system)},
        }

    def _extract(self, result: object) -> str:
        try:
            translated = result["message"]["content"]  # type: ignore[index]
        except (KeyError, TypeError) as error:
            raise RuntimeError("Ollama 响应格式无效（缺少 message.content）") from error
        return str(translated).strip()


def _has_version_suffix(endpoint: str) -> bool:
    """Whether the URL already carries the versioned path the Anthropic provider appends.

    Both spellings count, because both are what a user actually pastes. `/v1` is the half-
    remembered base; `/v1/messages` is the complete endpoint printed in Anthropic's own docs
    and SDK examples, so it is the more likely paste.

    The path is compared as a whole, trailing slash included, so `/v1beta` and `/v10` are
    left alone.
    """
    path = urlsplit(endpoint).path.rstrip("/")
    return any(path == suffix or path.endswith(suffix) for suffix in ("/v1", "/v1/messages"))
