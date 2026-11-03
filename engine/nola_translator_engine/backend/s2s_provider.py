"""Qwen LiveTranslate transport and version-specific observation normalization."""

from __future__ import annotations

import asyncio
import base64
import json
import re
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import AsyncIterator
from uuid import uuid4

from ..recognition.aliyun import ALIYUN_LANGUAGES, MODELS, REGIONS, Connector, WebSocketTransport, connect_websocket
from .gateway.capabilities import CallContext, ModelKind, Operation
from .gateway.definitions import ModelInstance

AUDIO_LANGUAGES = frozenset("zh en ar de fr es pt id it ko ru th vi ja tr hi ms nl ur nb sv da he fi pl is cs fil fa".split())
LANGUAGE_ALIASES = {"tl": "fil", "no": "nb"}
MAX_ACTIVE = 128
MAX_TEXT = 16384
SOURCE_PREFIX = "conversation.item.input_audio_transcription."


class S2SProtocolError(RuntimeError):
    pass


@dataclass(frozen=True)
class S2SObservation:
    kind: str
    item_id: str = ""
    response_id: str = ""
    text: str = ""
    final: bool = False
    status: str = ""
    source_ids: tuple[str, ...] = ()
    speaker_id: int | None = None
    pcm: bytes = b""
    chunk_seq: int = 0
    sample_rate: int = 0
    audio_done: bool = False
    started_at_ms: int | None = None
    ended_at_ms: int | None = None
    language: str | None = None


@dataclass
class Source:
    text: str = ""
    speaker: int | None = None
    start: int | None = None
    end: int | None = None


@dataclass
class Target:
    text: str = ""
    text_done: bool = False
    audio_done: bool = False
    chunks: int = 0


@dataclass
class Response:
    items: dict[str, Target] = field(default_factory=dict)


def _object(value: object) -> dict:
    if not isinstance(value, dict):
        raise S2SProtocolError("invalid_provider_event")
    return value


def _array(value: object) -> list:
    if not isinstance(value, list):
        raise S2SProtocolError("invalid_provider_event")
    return value


def _text(value: object, limit: int = MAX_TEXT) -> str:
    if not isinstance(value, str) or len(value) > limit:
        raise S2SProtocolError("invalid_provider_event")
    return value


def _id(value: object) -> str:
    value = _text(value, 128)
    if not value:
        raise S2SProtocolError("invalid_provider_event")
    return value


def _remember(cache: OrderedDict, key: str) -> bool:
    duplicate = key in cache
    cache[key] = None
    cache.move_to_end(key)
    if len(cache) > 2048:
        cache.popitem(last=False)
    return duplicate


def _active(mapping: dict, key: str, factory):
    if key not in mapping:
        if len(mapping) >= MAX_ACTIVE:
            raise S2SProtocolError("provider_association_overflow")
        mapping[key] = factory()
    return mapping[key]


def _update_text(previous: str, event: dict, suffix: str, delta_profile: bool, final_key: str) -> str | None:
    if suffix in ("completed", "done"):
        return _text(event.get(final_key, previous))
    if delta_profile and suffix == "delta":
        return _text(previous + _text(event.get("delta")))
    if not delta_profile and suffix == "text":
        return _text(_text(event.get("text", "")) + _text(event.get("stash", "")))
    return None


class QwenS2SSession:
    def __init__(self, ws: WebSocketTransport, model: str, outputs: frozenset[str]) -> None:
        self._ws = ws
        self._delta_profile = model == MODELS[0]
        self._outputs = outputs
        self._writer = asyncio.Lock()
        self._closed = False
        self._finishing = False
        self._reading = False
        self._sent_ms = 0.0
        self._sources: dict[str, Source] = {}
        self._responses: dict[str, Response] = {}
        self._links: OrderedDict[str, str] = OrderedDict()
        self._seen: OrderedDict[str, None] = OrderedDict()
        self._closed_sources: OrderedDict[str, None] = OrderedDict()
        self._closed_responses: OrderedDict[str, None] = OrderedDict()
        self.provider_session_id = ""
        self.input_sample_rate = 16000
        self.output_sample_rate = 24000

    async def _send(self, kind: str, **payload: object) -> None:
        try:
            await self._ws.send(json.dumps({"type": kind, "event_id": uuid4().hex, **payload}))
        except Exception:
            raise S2SProtocolError("provider_connection_failed") from None

    async def _receive(self) -> dict:
        try:
            event = _object(json.loads(await self._ws.recv()))
        except (ValueError, UnicodeError, TypeError):
            raise S2SProtocolError("invalid_provider_event") from None
        except S2SProtocolError:
            raise
        except Exception:
            raise S2SProtocolError("provider_connection_failed") from None
        if event.get("type") == "error" or event.get("code"):
            raise S2SProtocolError("provider_rejected_request")
        return event

    async def _expect(self, kind: str) -> dict:
        event = await self._receive()
        if event.get("type") != kind:
            raise S2SProtocolError("invalid_provider_handshake")
        return _object(event.get("session"))

    async def configure(self, settings: dict) -> None:
        async with asyncio.timeout(10):
            created = await self._expect("session.created")
            await self._send("session.update", session=settings)
            updated = await self._expect("session.updated")
        self.provider_session_id = _id(updated.get("id"))
        if self.provider_session_id != created.get("id"):
            raise S2SProtocolError("invalid_provider_handshake")
        modalities = "output_modalities" if self._delta_profile else "modalities"
        if any(modality not in _array(updated.get(modalities)) for modality in settings[modalities]):
            raise S2SProtocolError("output_unsupported")
        if self._delta_profile:
            audio = _object(updated.get("audio"))
            self.input_sample_rate = self._rate(_object(audio.get("input")), {16000})
            if "audio" in self._outputs:
                self.output_sample_rate = self._rate(_object(audio.get("output")), {8000, 16000, 24000, 48000})
        elif updated.get("sample_rate", 16000) != 16000 or updated.get("input_audio_format", "pcm") != "pcm":
            raise S2SProtocolError("unsupported_provider_audio_format")
        elif "audio" in self._outputs and updated.get("output_audio_format", "pcm") != "pcm":
            raise S2SProtocolError("unsupported_provider_audio_format")

    @staticmethod
    def _rate(audio: dict, allowed: set[int]) -> int:
        fmt = _object(audio.get("format"))
        rate = fmt.get("sample_rate")
        if fmt.get("type") != "pcm" or type(rate) is not int or rate not in allowed:
            raise S2SProtocolError("unsupported_provider_audio_format")
        return rate

    async def append_audio(self, pcm: bytes) -> None:
        if not pcm or len(pcm) % 2:
            raise S2SProtocolError("invalid_input_audio")
        async with self._writer:
            if self._closed or self._finishing:
                raise S2SProtocolError("provider_session_closed")
            self._sent_ms += len(pcm) * 500 / self.input_sample_rate
            await self._send("input_audio_buffer.append", audio=base64.b64encode(pcm).decode("ascii"))

    async def finish(self) -> None:
        async with self._writer:
            if not self._closed and not self._finishing:
                self._finishing = True
                await self._send("session.finish")

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            try:
                await self._ws.close()
            except Exception:
                pass

    async def interrupt(self) -> None:
        await self.close()

    async def observations(self) -> AsyncIterator[S2SObservation]:
        if self._reading:
            raise S2SProtocolError("provider_receiver_already_started")
        self._reading = True
        while not self._closed:
            try:
                event = await self._receive()
            except S2SProtocolError:
                if self._closed:
                    return
                raise
            if self._closed:
                return
            kind = _id(event.get("type"))
            if kind == "session.finished":
                if not self._finishing:
                    raise S2SProtocolError("provider_finished_unexpectedly")
                for response_id, response in tuple(self._responses.items()):
                    for observation in self._complete(response_id, response, "incomplete", []):
                        if self._closed:
                            return
                        yield observation
                for item_id, item in self._sources.items():
                    if self._closed:
                        return
                    if item.text:
                        yield S2SObservation("source", item_id, text=item.text, status="incomplete")
                return
            if event.get("event_id") is not None and _remember(self._seen, _id(event["event_id"])):
                continue
            for observation in self._normalize(kind, event):
                if self._closed:
                    return
                yield observation

    def _source_observation(self, kind: str, event: dict) -> S2SObservation | None:
        item_id = _id(event.get("item_id"))
        if item_id in self._closed_sources:
            return None
        item = _active(self._sources, item_id, Source)
        suffix = kind.rsplit(".", 1)[-1]
        if suffix == "speech_started":
            start = event.get("audio_start_ms")
            speaker = event.get("speaker_id")
            item.start = start if type(start) is int and 0 <= start <= self._sent_ms + 2000 else None
            item.speaker = speaker if type(speaker) is int else None
        elif suffix == "speech_stopped":
            end = event.get("audio_end_ms")
            item.end = end if type(end) is int and (item.start or 0) <= end <= self._sent_ms + 2000 else None
        elif suffix != "failed":
            text = _update_text(item.text, event, suffix, self._delta_profile, "transcript")
            if text is None:
                return None
            item.text = text
        final = suffix == "completed"
        failed = suffix == "failed"
        if final or failed:
            self._sources.pop(item_id)
            _remember(self._closed_sources, item_id)
        language = event.get("language")
        return S2SObservation("source", item_id, text=item.text, final=final,
                              status="incomplete" if failed else "", speaker_id=item.speaker,
                              started_at_ms=item.start, ended_at_ms=item.end,
                              language=language if isinstance(language, str) and len(language) <= 32 else None)

    def _source_ids(self, item_id: str) -> tuple[str, ...]:
        source_id = self._links.get(item_id)
        return (source_id,) if source_id and "source" in self._outputs else ()

    def _complete(self, response_id: str, response: Response, status: str, outputs: list) -> list[S2SObservation]:
        final_texts = {}
        for value in outputs:
            output = _object(value)
            if output.get("role", "assistant") != "assistant":
                continue
            item_id = _id(output.get("id"))
            item = _active(response.items, item_id, Target)
            parts = [_object(part) for part in _array(output.get("content", []))]
            text = _text("".join(_text(part.get("text") or part.get("transcript") or "") for part in parts))
            final_texts[item_id] = (text or item.text, bool(text or item.text_done) and output.get("status", status) == "completed")
        observations = []
        for item_id, item in response.items.items():
            text, item_done = final_texts.get(item_id, (item.text, item.text_done))
            final = status == "completed" and item_done
            if "target" in self._outputs and text:
                observations.append(S2SObservation("target", item_id, response_id, text, final,
                                                   "completed" if final else "incomplete", self._source_ids(item_id)))
        observations.append(S2SObservation("response", response_id=response_id, status=status))
        return observations

    def _normalize(self, kind: str, event: dict) -> list[S2SObservation]:
        if kind.startswith(SOURCE_PREFIX) or kind in ("input_audio_buffer.speech_started", "input_audio_buffer.speech_stopped"):
            if "source" in self._outputs:
                observation = self._source_observation(kind, event)
                return [observation] if observation else []
            return []
        if kind == "conversation.item.created":
            item = _object(event.get("item"))
            if item.get("role") == "assistant" and event.get("previous_item_id"):
                item_id, previous = _id(item.get("id")), _id(event["previous_item_id"])
                self._links[item_id] = previous
                if len(self._links) > 2048:
                    self._links.popitem(last=False)
            return []
        if kind == "response.done":
            result = _object(event.get("response"))
            response_id = _id(result.get("id"))
            if _remember(self._closed_responses, response_id):
                return []
            response = self._responses.pop(response_id, Response())
            status = "completed" if result.get("status") == "completed" else "incomplete"
            return self._complete(response_id, response, status, _array(result.get("output", [])))

        family, _, suffix = kind.rpartition(".")
        if family not in ("response.audio", "response.text", "response.audio_transcript", "response.output_item"):
            return []
        response_id = _id(event.get("response_id"))
        if response_id in self._closed_responses:
            return []
        response = _active(self._responses, response_id, Response)
        if family == "response.output_item":
            output = _object(event.get("item"))
            if output.get("role") == "assistant":
                _active(response.items, _id(output.get("id")), Target)
            return []
        item_id = _id(event.get("item_id"))
        item = _active(response.items, item_id, Target)
        source_ids = self._source_ids(item_id)
        if family == "response.audio":
            if "audio" not in self._outputs or item.audio_done:
                return []
            pcm = b""
            if suffix == "delta":
                try:
                    pcm = base64.b64decode(_text(event.get("delta"), 256 * 1024), validate=True)
                except ValueError:
                    raise S2SProtocolError("invalid_provider_audio") from None
                if not pcm or len(pcm) % 2:
                    raise S2SProtocolError("invalid_provider_audio")
            elif suffix == "done":
                item.audio_done = True
            else:
                return []
            observation = S2SObservation("audio", item_id, response_id, source_ids=source_ids, pcm=pcm,
                                         chunk_seq=item.chunks, sample_rate=self.output_sample_rate, audio_done=item.audio_done)
            item.chunks += bool(pcm)
            return [observation]
        if item.text_done or "target" not in self._outputs:
            return []
        text = _update_text(item.text, event, suffix, self._delta_profile,
                            "transcript" if family == "response.audio_transcript" else "text")
        if text is None:
            return []
        item.text = text
        item.text_done = suffix == "done"
        return [S2SObservation("target", item_id, response_id, text, source_ids=source_ids)]


class QwenS2SAdapter:
    adapter_id = "aliyun-livetranslate"
    kinds = frozenset({ModelKind.S2S})
    operations = frozenset({Operation.S2S_SESSION})

    def __init__(self, connector: Connector = connect_websocket) -> None:
        self._connector = connector

    async def open(self, instance: ModelInstance, ctx: CallContext, *, config: dict) -> QwenS2SSession:
        model = instance.definition.model_id
        region = config.get("region") or instance.configuration.region or REGIONS[0]
        source = config.get("source_language") or "auto"
        target = config.get("target_language") or "en"
        source = LANGUAGE_ALIASES.get(source, source)
        target = LANGUAGE_ALIASES.get(target, target)
        outputs = frozenset(config.get("outputs", ("source", "target")))
        if model not in MODELS or region not in REGIONS:
            raise S2SProtocolError("unsupported_provider_model_or_region")
        if (source != "auto" and (model == MODELS[0] or source not in ALIYUN_LANGUAGES)
                or target not in ALIYUN_LANGUAGES):
            raise S2SProtocolError("unsupported_provider_language")
        if not outputs or outputs - {"source", "target", "audio"} or ("audio" in outputs and target not in AUDIO_LANGUAGES):
            raise S2SProtocolError("output_unsupported")
        workspace, api_key = config.get("workspace_id"), config.get("api_key")
        if not isinstance(workspace, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", workspace) or not api_key:
            raise S2SProtocolError("provider_credentials_required")
        if not isinstance(api_key, str) or "\r" in api_key or "\n" in api_key:
            raise S2SProtocolError("provider_credentials_required")
        modalities = ["text", "audio"] if "audio" in outputs else ["text"]
        settings: dict = {"translation": {"language": target}}
        if model == MODELS[0]:
            settings["output_modalities"] = modalities
            settings["audio"] = {"input": {"turn_detection": {"type": "speaker_detection", "threshold": 0.5}}}
        else:
            transcription = {"model": "qwen3-asr-flash-realtime" if "source" in outputs else None}
            if source != "auto":
                transcription["language"] = source
            settings.update(modalities=modalities, sample_rate=16000, input_audio_format="pcm",
                            output_audio_format="pcm", input_audio_transcription=transcription,
                            turn_detection={"type": "server_vad"})
        if config.get("voice") and "audio" in outputs:
            settings["voice"] = config["voice"]
        url = f"wss://{workspace}.{region}.maas.aliyuncs.com/api-ws/v1/realtime?model={model}"
        try:
            ws = await self._connector(url, {"Authorization": f"Bearer {api_key}"})
        except Exception:
            raise S2SProtocolError("provider_connection_failed") from None
        session = QwenS2SSession(ws, model, outputs)
        try:
            await session.configure(settings)
        except TimeoutError:
            await session.close()
            raise S2SProtocolError("provider_handshake_timeout") from None
        except BaseException:
            await session.close()
            raise
        return session
