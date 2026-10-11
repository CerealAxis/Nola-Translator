"""Text-only Aliyun LiveTranslate WebSocket recognition and optional native translation."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode, urlsplit
from urllib.request import getproxies, proxy_bypass
from uuid import uuid4

import numpy as np

from ..audio.resample import AudioFrame
from ..protocol import ModelSelection
from .base import ModelUnavailable, NativeTranslation, RecognitionUpdate


MODELS = ("qwen3.8-livetranslate-flash-realtime", "qwen3.5-livetranslate-flash-realtime")
REGIONS = ("cn-beijing", "ap-southeast-1")
# The official LiveTranslate language table applies to ASR hints and the single target.
# https://help.aliyun.com/zh/model-studio/qwen3-5-livetranslate-flash-realtime
ALIYUN_LANGUAGES = frozenset("zh en ar de fr es pt id it ko ru th vi ja tr hi ms nl ur nb sv da he fi pl is cs fil fa yue el af ast be bg bn bs ca ceb et gl gu hr hu jv kk kn ky lv mk ml mr pa ro sk sl sw tg az uk".split())
MAX_ITEMS = 128
MAX_TEXT = 16_384


class CloudRecognitionError(ModelUnavailable):
    """Only a fixed reason crosses the engine boundary; vendor messages can echo secrets."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class WebSocketTransport(Protocol):
    async def send(self, message: str) -> None: ...
    async def recv(self) -> str | bytes: ...
    async def close(self) -> None: ...


Connector = Callable[[str, dict[str, str]], Awaitable[WebSocketTransport]]
UpdateSink = Callable[[RecognitionUpdate], Awaitable[None]]


async def connect_websocket(url: str, headers: dict[str, str]) -> WebSocketTransport:
    # Lazy import keeps local caption sessions independent of this optional transport.
    from websockets.asyncio.client import connect
    endpoint = urlsplit(url)
    # Match the HTTP pool's explicit Windows/system proxy and bypass policy. WebSocket
    # discovery has separate ws/wss keys; Nola consistently uses the HTTP(S) proxy scopes.
    proxy = None if proxy_bypass(endpoint.netloc) else getproxies().get("https" if endpoint.scheme == "wss" else "http")
    return await connect(url, additional_headers=headers, open_timeout=10, close_timeout=1,
                         max_size=256 * 1024, max_queue=16, write_limit=32 * 1024, proxy=proxy)


def resolve_aliyun(config: ModelSelection) -> tuple[str, str, str, str]:
    options = config.recognitionOptions
    model = (options.model if options else "") or MODELS[0]
    region = (options.region if options else "") or REGIONS[0]
    workspace = options.workspaceId if options else ""
    if model not in MODELS or region not in REGIONS:
        raise ValueError("Unsupported Aliyun recognition model or region")
    if not re.fullmatch(r"[A-Za-z0-9-]{1,128}", workspace):
        raise ValueError("Aliyun workspace ID is required")
    if options and options.endpoint:
        raise ValueError("Aliyun recognition uses the workspace's official WebSocket endpoint")
    if model == MODELS[0] and config.sourceLanguage != "auto":
        raise ValueError("Qwen3.8 LiveTranslate supports automatic source-language detection only")
    aliases = {"tl": "fil", "no": "nb"}
    if config.sourceLanguage != "auto" and aliases.get(config.sourceLanguage, config.sourceLanguage) not in ALIYUN_LANGUAGES:
        raise ValueError("Unsupported Aliyun recognition source language")
    if config.translationProvider == "recognition" and any(aliases.get(target, target) not in ALIYUN_LANGUAGES for target in config.targetLanguages):
        raise ValueError("Unsupported Aliyun recognition target language")
    if config.translationProvider == "recognition" and len(config.targetLanguages) > 1:
        raise ValueError("Aliyun native translation supports at most one target language")
    url = f"wss://{workspace}.{region}.maas.aliyuncs.com/api-ws/v1/realtime?{urlencode({'model': model})}"
    target = config.targetLanguages[0] if config.translationProvider == "recognition" and config.targetLanguages else "en"
    return url, model, (options.apiKey if options else ""), aliases.get(target, target)


@dataclass(slots=True)
class _Item:
    text: str = ""
    language: str | None = None
    started: float = 0.0
    ended: float | None = None
    final: bool = False
    revision: int = -1
    translated: str = ""
    translation_state: str = "pending"


class AliyunRecognizer:
    def __init__(self, config: ModelSelection, *, connector: Connector = connect_websocket,
                 timeout: float = 10, finish_timeout: float = 15) -> None:
        self.url, self.model, self.api_key, self.target = resolve_aliyun(config)
        self.language = config.sourceLanguage
        self.native_translation = config.translationProvider == "recognition" and bool(config.targetLanguages)
        self.connector = connector
        self.timeout = timeout
        self.finish_timeout = finish_timeout
        self.on_update: UpdateSink | None = None
        self.on_error: Callable[[CloudRecognitionError], None] | None = None
        self._ws: WebSocketTransport | None = None
        self._receiver: asyncio.Task[None] | None = None
        self._finished = asyncio.Event()
        self._closed = False
        self._failure: CloudRecognitionError | None = None
        self._origin: float | None = None
        self._sent_ms = 0.0
        self._anchors: list[tuple[float, float]] = []
        self._items: OrderedDict[str, _Item] = OrderedDict()
        self._links: OrderedDict[str, str] = OrderedDict()
        self._translations: OrderedDict[str, tuple[str, str]] = OrderedDict()
        self._responses: OrderedDict[str, set[str]] = OrderedDict()
        self._session_serial = 0
        self._prefix = uuid4().hex[:12]
        self._lock = asyncio.Lock()

    def validate_credentials(self) -> None:
        if not self.api_key:
            raise ValueError("Aliyun recognition API key is required")

    def _session_config(self) -> dict[str, object]:
        # Official client events differ by version; 3.8 always enables ASR and defaults to
        # 16 kHz PCM. The API still performs translation when Nola uses an external provider.
        # https://help.aliyun.com/zh/model-studio/live-translator-client-events
        if self.model == MODELS[0]:
            return {"output_modalities": ["text"], "translation": {"language": self.target}}
        transcription = {"model": "qwen3-asr-flash-realtime"}
        if self.language != "auto":
            transcription["language"] = {"tl": "fil", "no": "nb"}.get(self.language, self.language)
        return {"modalities": ["text"], "sample_rate": 16000, "input_audio_format": "pcm",
                "input_audio_transcription": transcription, "translation": {"language": self.target},
                "turn_detection": {"type": "server_vad", "threshold": 0.2, "silence_duration_ms": 500}}

    async def start(self) -> None:
        async with self._lock:
            if self._closed:
                raise CloudRecognitionError("recognitionClosed")
            if self._failure is not None:
                raise self._failure
            if self._ws is not None:
                return
            self.validate_credentials()
            try:
                self._ws = await asyncio.wait_for(self.connector(self.url, {"Authorization": f"Bearer {self.api_key}"}), self.timeout)
                await self._expect("session.created")
                await self._send({"type": "session.update", "session": self._session_config()})
                await self._expect("session.updated")
                self._finished.clear()
                self._session_serial += 1
                self._receiver = asyncio.create_task(self._receive())
            except asyncio.CancelledError:
                await self._disconnect()
                raise
            except Exception as error:
                await self._disconnect()
                raise self._sanitize(error) from None

    @staticmethod
    def _sanitize(error: Exception) -> CloudRecognitionError:
        if isinstance(error, CloudRecognitionError):
            return error
        status = getattr(getattr(error, "response", None), "status_code", None)
        return CloudRecognitionError("recognitionUnauthorized" if status in (401, 403) else
            "recognitionRateLimited" if status == 429 else "recognitionTimeout" if isinstance(error, TimeoutError)
            else "recognitionNetworkError")

    async def _expect(self, kind: str) -> None:
        assert self._ws is not None
        event = json.loads(await asyncio.wait_for(self._ws.recv(), self.timeout))
        if not isinstance(event, dict):
            raise CloudRecognitionError("recognitionInvalidResponse")
        if event.get("type") == "error":
            raise self._event_error(event)
        if event.get("type") != kind:
            raise CloudRecognitionError("recognitionInvalidHandshake")

    async def _send(self, event: dict[str, object]) -> None:
        assert self._ws is not None
        await asyncio.wait_for(self._ws.send(json.dumps({"event_id": f"event_{uuid4().hex}", **event})), 2)

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        await self.start()
        if self._origin is None:
            self._origin = frame.started_at_ms
        # Server offsets count uploaded samples, while capture timestamps include pauses.
        # Anchors keep browser/video and desktop audio timelines in the runtime's time domain.
        if not self._anchors or abs(frame.started_at_ms - self._timestamp(self._sent_ms)) > 2:
            if len(self._anchors) >= 512:
                self._failure = CloudRecognitionError("recognitionBufferOverflow")
                await self._disconnect()
                raise self._failure
            self._anchors.append((self._sent_ms, frame.started_at_ms))
        self._sent_ms += frame.samples.size / 16
        pcm = np.rint(np.clip(frame.samples, -1.0, 32767 / 32768) * 32768).astype("<i2").tobytes()
        try:
            await self._send({"type": "input_audio_buffer.append", "audio": base64.b64encode(pcm).decode("ascii")})
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._failure = self._failure or self._sanitize(error)
            await self._disconnect()
            raise self._failure from None
        return []

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        if self._ws is None:
            if self._failure is not None:
                raise self._failure
            return []
        try:
            await self._send({"type": "session.finish"})
            await asyncio.wait_for(self._finished.wait(), self.finish_timeout)
            if self._failure is not None:
                raise self._failure
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._failure = self._failure or self._sanitize(error)
            if self.native_translation:
                for item_id, item in tuple(self._items.items()):
                    if item.translation_state == "pending":
                        item.translation_state = "failed"
                        await self._publish(item_id)
            raise self._failure from None
        finally:
            await self._disconnect()
            self._origin, self._sent_ms = None, 0.0
            self._anchors.clear()
            self._items.clear()
            self._links.clear()
            self._translations.clear()
            self._responses.clear()
        return []

    async def close(self) -> None:
        self._closed = True
        await self._disconnect()
        self._items.clear()
        self._links.clear()
        self._translations.clear()
        self._responses.clear()
        self.on_update = None
        self.on_error = None

    async def _disconnect(self) -> None:
        receiver, self._receiver = self._receiver, None
        if receiver is not None and receiver is not asyncio.current_task():
            receiver.cancel()
            await asyncio.gather(receiver, return_exceptions=True)
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                await asyncio.wait_for(ws.close(), 1)
            except Exception:
                pass

    async def _receive(self) -> None:
        try:
            while self._ws is not None:
                event = json.loads(await self._ws.recv())
                if not isinstance(event, dict):
                    raise CloudRecognitionError("recognitionInvalidResponse")
                if event.get("type") == "session.finished":
                    if self.native_translation:
                        for item_id, item in tuple(self._items.items()):
                            if item.translation_state == "pending":
                                item.translation_state = "failed"
                                await self._publish(item_id)
                    self._finished.set()
                    return
                await self._event(event)
        except asyncio.CancelledError:
            raise
        except Exception as error:
            self._failure = self._sanitize(error)
            self._finished.set()
            if self.on_error is not None:
                self.on_error(self._failure)
            await self._disconnect()

    @staticmethod
    def _event_error(event: dict) -> CloudRecognitionError:
        code = str(event.get("error", {}).get("code", "")).lower()
        reason = "recognitionUnauthorized" if any(item in code for item in ("auth", "api_key", "permission")) else (
            "recognitionRateLimited" if any(item in code for item in ("rate", "quota", "limit")) else "recognitionRejected")
        return CloudRecognitionError(reason)

    def _item(self, item_id: str) -> _Item:
        if not item_id or len(item_id) > 128:
            raise CloudRecognitionError("recognitionInvalidResponse")
        item = self._items.get(item_id)
        if item is None:
            while len(self._items) >= MAX_ITEMS:
                old_id, old = next(iter(self._items.items()))
                if not old.final or self.native_translation and old.translation_state == "pending":
                    raise CloudRecognitionError("recognitionBufferOverflow")
                self._items.pop(old_id)
                for key in [key for key, value in self._links.items() if value == old_id]:
                    self._links.pop(key, None)
                    self._translations.pop(key, None)
                    for response_id, assistant_ids in tuple(self._responses.items()):
                        assistant_ids.discard(key)
                        if not assistant_ids:
                            self._responses.pop(response_id, None)
            item = _Item(started=self._sent_ms)
            self._items[item_id] = item
        return item

    @staticmethod
    def _text(value: object) -> str:
        if not isinstance(value, str) or len(value) > MAX_TEXT:
            raise CloudRecognitionError("recognitionInvalidResponse")
        return value

    async def _publish(self, item_id: str) -> None:
        item = self._item(item_id)
        if not item.text or self._origin is None or self.on_update is None:
            return
        item.revision += 1
        target = {"fil": "tl", "nb": "no"}.get(self.target, self.target)
        translation = NativeTranslation(target, item.translated or None, item.translation_state,
            "translationUnavailable" if item.translation_state == "failed" else None) if self.native_translation else None
        await self.on_update(RecognitionUpdate(f"{self._prefix}-{self._session_serial}-{item_id}"[:128], item.revision,
            self._timestamp(item.started), self._timestamp(item.ended) if item.ended is not None else None,
            item.text, item.language, item.final, translation))

    def _timestamp(self, offset: float) -> float:
        for sent, captured in reversed(self._anchors):
            if offset >= sent:
                return captured + offset - sent
        return (self._origin or 0.0) + offset

    async def _translated(self, assistant_id: str, text: str, final: bool, *, delta: bool = False,
                          failed: bool = False) -> None:
        previous = self._translations.get(assistant_id, ("", "pending"))
        text = self._text(previous[0] + text if delta else text)
        if assistant_id not in self._translations and len(self._translations) >= MAX_ITEMS:
            raise CloudRecognitionError("recognitionBufferOverflow")
        state = "failed" if failed else "complete" if final else "pending"
        self._translations[assistant_id] = (text, state)
        source_id = self._links.get(assistant_id)
        if source_id is not None:
            item = self._item(source_id)
            item.translated = text
            item.translation_state = state
            await self._publish(source_id)

    def _associate_response(self, response_id: object, assistant_id: object) -> None:
        if response_id is None:
            return
        if (not isinstance(response_id, str) or not response_id or len(response_id) > 128
                or not isinstance(assistant_id, str) or not assistant_id or len(assistant_id) > 128):
            raise CloudRecognitionError("recognitionInvalidResponse")
        if response_id not in self._responses and len(self._responses) >= MAX_ITEMS:
            raise CloudRecognitionError("recognitionBufferOverflow")
        assistant_ids = self._responses.setdefault(response_id, set())
        if assistant_id not in assistant_ids and len(assistant_ids) >= MAX_ITEMS:
            raise CloudRecognitionError("recognitionBufferOverflow")
        assistant_ids.add(assistant_id)

    async def _event(self, event: dict) -> None:
        kind = event.get("type", "")
        item_id = str(event.get("item_id", ""))
        if kind == "error" or kind == "conversation.item.input_audio_transcription.failed":
            raise self._event_error(event)
        if kind in ("input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"):
            item = self._item(item_id)
            value = event.get("audio_start_ms" if kind.endswith("started") else "audio_end_ms")
            if not isinstance(value, (int, float)) or not 0 <= value <= self._sent_ms + 2000:
                raise CloudRecognitionError("recognitionInvalidResponse")
            if kind.endswith("started"):
                item.started = float(value)
            else:
                item.ended = max(item.started, float(value))
            await self._publish(item_id)
        elif kind.startswith("conversation.item.input_audio_transcription."):
            item = self._item(item_id)
            suffix = kind.rsplit(".", 1)[-1]
            if item.final and suffix != "completed":
                return
            # 3.8 deltas append; 3.5 text/stash events replace the entire visible hypothesis.
            # https://help.aliyun.com/zh/model-studio/live-translator-server-events
            if suffix == "delta":
                item.text = self._text(item.text + self._text(event.get("delta", "")))
            elif suffix == "text":
                item.text = self._text(self._text(event.get("text", "")) + self._text(event.get("stash", "")))
            elif suffix == "completed":
                item.text = self._text(event.get("transcript", ""))
                item.final = True
                item.ended = item.ended if item.ended is not None else max(item.started, self._sent_ms)
                language = event.get("language")
                item.language = {"fil": "tl", "nb": "no"}.get(language, language) if isinstance(language, str) and len(language) <= 32 else None
            else:
                return
            await self._publish(item_id)
        elif self.native_translation and kind == "conversation.item.created":
            item = event.get("item", {})
            if not isinstance(item, dict) or item.get("role") != "assistant":
                return
            assistant_id, source_id = item.get("id"), event.get("previous_item_id")
            if not isinstance(assistant_id, str) or not isinstance(source_id, str):
                return
            if len(self._links) >= MAX_ITEMS and assistant_id not in self._links:
                raise CloudRecognitionError("recognitionBufferOverflow")
            self._links[assistant_id] = source_id
            if assistant_id in self._translations:
                text, state = self._translations[assistant_id]
                await self._translated(assistant_id, text, state == "complete", failed=state == "failed")
        elif self.native_translation and kind in ("response.text.delta", "response.text.text", "response.text.done"):
            self._associate_response(event.get("response_id"), item_id)
            text = event.get("delta", "") if kind.endswith("delta") else event.get("text", "")
            text = self._text(text)
            if kind.endswith(".text"):
                text = self._text(text + self._text(event.get("stash", "")))
            # text.done also fires for interrupted/incomplete output. response.done supplies
            # the authoritative status before a translation is persisted as settled.
            await self._translated(item_id, text, False, delta=kind.endswith("delta"))
        elif self.native_translation and kind in ("response.output_item.added", "response.output_item.done"):
            # Output-item events provide the response/item link even when no text is emitted.
            # https://help.aliyun.com/zh/model-studio/live-translator-server-events
            item = event.get("item", {})
            if isinstance(item, dict) and item.get("role") == "assistant":
                self._associate_response(event.get("response_id"), item.get("id"))
        elif self.native_translation and kind == "response.done":
            response = event.get("response", {})
            response_id = response.get("id")
            associated = self._responses.pop(response_id, set()) if isinstance(response_id, str) else set()
            settled: set[str] = set()
            for output in response.get("output", []):
                if not isinstance(output, dict) or not isinstance(output.get("id"), str):
                    continue
                text = "".join(self._text(content.get("text", "")) for content in output.get("content", []) if isinstance(content, dict))
                await self._translated(output["id"], text or self._translations.get(output["id"], ("", "pending"))[0],
                    response.get("status") == "completed", failed=response.get("status") != "completed")
                settled.add(output["id"])
            # Failed/incomplete responses can have an empty output array. Their known output
            # items still need a terminal state instead of waiting until session.finish.
            for assistant_id in associated - settled:
                await self._translated(assistant_id, self._translations.get(assistant_id, ("", "pending"))[0],
                    False, failed=True)
