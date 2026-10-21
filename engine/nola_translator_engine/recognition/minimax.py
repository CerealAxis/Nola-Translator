"""MiniMax speech-to-text: Silero VAD segments uploaded as WAV, transcribed through a
server-sent event stream.

The API takes one complete audio file per request, so Nola's streaming captions come from
uploading each gated segment the moment the gate closes. ``accept`` therefore only feeds the
segmenter and hands finished segments to background tasks; a segment's SSE deltas are
published as revisions of a single caption, which keeps one long request from blocking the
audio loop.
"""

from __future__ import annotations

import asyncio
import json
import ssl
import struct
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from urllib.parse import urlsplit
from urllib.request import getproxies, proxy_bypass
from uuid import uuid4

import httpx
import numpy as np
from numpy.typing import NDArray

from ..audio.resample import AudioFrame, TARGET_SAMPLE_RATE
from ..protocol import ModelSelection
from .aliyun import CloudRecognitionError
from .base import RecognitionUpdate
from .volume_gate import VolumeGateSegment, SileroVadSegmenter


MODELS = ("asr-1.0",)
DEFAULT_ENDPOINT = "https://api.minimax.cn/v1/speech_to_text"
# The `language` request header accepts only these tags, and it is the whole list rather than a
# floor. App code tl is normalized to the provider's fil, as it is for Aliyun.
# https://platform.minimax.io/docs/api-reference/speech-to-text
MINIMAX_LANGUAGES = frozenset("zh yue en fr de es it pt pl ru uk ja ko th vi id ms tl ar tr".split())
LANGUAGE_ALIASES = {"tl": "fil"}
CONNECT_TIMEOUT_SECONDS = 10
#: Covers the upload of a full segment plus a stalled event stream; the drain in `flush` would
#: otherwise wait on a request that is never going to answer.
REQUEST_TIMEOUT_SECONDS = 30
FLUSH_TIMEOUT_SECONDS = 30
MAX_INFLIGHT = 3
MAX_PENDING = 32
MAX_EVENTS = 4096
MAX_TEXT = 16_384

UpdateSink = Callable[[RecognitionUpdate], Awaitable[None]]


def _wav(samples: NDArray[np.float32]) -> bytes:
    """Wrap the segmenter output in a WAV container; the API has no raw PCM input."""
    pcm = np.rint(np.clip(samples, -1.0, 32767 / 32768) * 32768).astype("<i2").tobytes()
    header = b"RIFF" + struct.pack("<I", 36 + len(pcm)) + b"WAVEfmt " + struct.pack(
        "<IHHIIHH", 16, 1, 1, TARGET_SAMPLE_RATE, TARGET_SAMPLE_RATE * 2, 2, 16
    ) + b"data" + struct.pack("<I", len(pcm))
    return header + pcm


def resolve_minimax(config: ModelSelection) -> tuple[str, str, str, str | None]:
    options = config.recognitionOptions
    model = (options.model if options else "") or MODELS[0]
    endpoint = (options.endpoint if options else "") or DEFAULT_ENDPOINT
    if model not in MODELS:
        raise ValueError("Unsupported MiniMax speech-to-text model")
    parsed = urlsplit(endpoint)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("MiniMax speech-to-text endpoint must be an HTTP(S) URL without credentials")
    # Speech-to-text is recognition only, so the native-translation provider has nothing to
    # reuse here the way it does on the Aliyun socket.
    if config.translationProvider == "recognition":
        raise ValueError("MiniMax speech-to-text has no native translation")
    # An absent language header is what enables mixed-language recognition, which is what
    # `auto` asks for.
    source = config.sourceLanguage
    if source != "auto" and source not in MINIMAX_LANGUAGES:
        raise ValueError("Unsupported MiniMax recognition source language")
    return endpoint, model, (options.apiKey if options else ""), (
        None if source == "auto" else LANGUAGE_ALIASES.get(source, source))


@dataclass(slots=True)
class _Segment:
    segment_id: str
    started_at_ms: float
    ended_at_ms: float
    samples: NDArray[np.float32]
    chunks: dict[int, str] = field(default_factory=dict)
    text: str = ""
    published: str = ""
    revision: int = -1


class MiniMaxRecognizer:
    def __init__(self, config: ModelSelection, *, timeout: float = REQUEST_TIMEOUT_SECONDS,
                 finish_timeout: float = FLUSH_TIMEOUT_SECONDS, max_inflight: int = MAX_INFLIGHT) -> None:
        self.url, self.model, self.api_key, self.language = resolve_minimax(config)
        self.timeout = timeout
        self.finish_timeout = finish_timeout
        self.max_inflight = max_inflight
        self.on_update: UpdateSink | None = None
        self.on_error: Callable[[CloudRecognitionError], None] | None = None
        self._segmenter = SileroVadSegmenter(max_segment_ms=config.max_segment_ms, silence_end_ms=config.silence_end_ms)
        self._prefix = uuid4().hex[:12]
        self._serial = 0
        self._tasks: set[asyncio.Task[None]] = set()
        self._inflight = asyncio.Semaphore(max_inflight)
        self._http: httpx.AsyncClient | None = None
        self._closed = False
        self._failure: CloudRecognitionError | None = None
        self._ready: list[RecognitionUpdate] = []
        self._reported = False
        self.segments_dispatched = 0
        self.updates_published = 0

    def validate_credentials(self) -> None:
        if not self.api_key:
            raise ValueError("MiniMax API key is required")

    async def start(self) -> None:
        """Open the request pool. Credentials are checked, but no audio is billed here: the
        first upload happens only once the segmenter closes a segment.
        """
        if self._closed:
            raise CloudRecognitionError("recognitionClosed")
        self.validate_credentials()
        self._client()

    def prepare(self) -> None:
        """Validate local segmentation without opening a billable recognition request."""
        self._segmenter.load()

    def stats(self) -> dict[str, int]:
        return {
            "segmentsDispatched": self.segments_dispatched,
            "updatesPublished": self.updates_published,
            "pendingSegments": len(self._tasks),
            **self._segmenter.stats(),
        }

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        if self._closed:
            raise CloudRecognitionError("recognitionClosed")
        for segment in self._segmenter.accept(frame):
            self._dispatch(segment, segment.end_ms)
        return []

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        """Close the gate on the tail, then drain every upload so the last caption lands."""
        for segment in self._segmenter.flush():
            self._dispatch(segment, ended_at_ms)
        if self._tasks:
            # The drain is awaited rather than shielded: a segment that outlives the budget is
            # cancelled instead of left uploading with nothing left to deliver its caption.
            try:
                await asyncio.wait_for(self._wait_tasks(), self.finish_timeout)
            except TimeoutError:
                await self._cancel_tasks()
                self._fail(CloudRecognitionError("recognitionTimeout"))
        return self._drain()

    async def close(self) -> None:
        self._closed = True
        await self._cancel_tasks()
        client, self._http = self._http, None
        if client is not None:
            await client.aclose()
        self._ready.clear()
        self.on_update = None
        self.on_error = None

    async def _cancel_tasks(self) -> None:
        tasks, self._tasks = self._tasks, set()
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def _client(self) -> httpx.AsyncClient:
        if self._http is None:
            # One pool for the whole session: every segment otherwise pays a fresh TLS
            # handshake. urllib's Windows proxy bypass and system trust match the translation
            # transport so a proxied desktop behaves the same for recognition.
            endpoint = urlsplit(self.url)
            proxy = None if proxy_bypass(endpoint.netloc) else getproxies().get(endpoint.scheme)
            self._http = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=CONNECT_TIMEOUT_SECONDS),
                proxy=proxy, trust_env=False, verify=ssl.create_default_context(),
                limits=httpx.Limits(max_connections=self.max_inflight,
                                    max_keepalive_connections=self.max_inflight),
            )
        return self._http

    def _dispatch(self, segment: VolumeGateSegment, ended_at_ms: float) -> None:
        if self._closed or self._failure is not None:
            # A failed key or an unreachable endpoint fails every later request the same way;
            # uploading anyway would repeat a billable call per segment until the session ends.
            return
        if len(self._tasks) >= MAX_PENDING:
            self._fail(CloudRecognitionError("recognitionBufferOverflow"))
            return
        self._serial += 1
        state = _Segment(f"{self._prefix}-{self._serial}", segment.start_ms, ended_at_ms, segment.samples)
        task = asyncio.create_task(self._transcribe(state), name=f"minimax-asr-{self._serial}")
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        self.segments_dispatched += 1

    async def _wait_tasks(self) -> None:
        # One snapshot: `flush` runs after the capture loop ends, so nothing dispatches a
        # further segment while the drain is in progress.
        await asyncio.gather(*tuple(self._tasks), return_exceptions=True)

    async def _transcribe(self, state: _Segment) -> None:
        try:
            async with self._inflight:
                await self._request(state)
        except asyncio.CancelledError:
            raise
        except CloudRecognitionError as error:
            self._fail(error)
        except (httpx.TimeoutException, TimeoutError):
            self._fail(CloudRecognitionError("recognitionTimeout"))
        except httpx.RequestError:
            self._fail(CloudRecognitionError("recognitionNetworkError"))
        except (ValueError, TypeError):
            self._fail(CloudRecognitionError("recognitionInvalidResponse"))
        except Exception:
            # A task failure is otherwise only collected by the drain's `return_exceptions`,
            # which would drop the caption and report nothing. Transport errors outside the
            # httpx taxonomy (a broken event stream, a decoder fault) land here.
            self._fail(CloudRecognitionError("recognitionNetworkError"))

    async def _request(self, state: _Segment) -> None:
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if self.language is not None:
            headers["language"] = self.language
        async with self._client().stream(
            "POST", self.url,
            # `stream` only accepts the json response format, so no response_format is sent.
            data={"model": self.model, "stream": "true"},
            files={"file": ("segment.wav", _wav(state.samples), "audio/wav")},
            headers=headers,
        ) as response:
            if response.status_code != 200:
                await self._raise_status(response)
            finished = await self._read_events(response, state)
        if not finished and state.text:
            # A stream cut before its finish event still carries a valid partial transcript,
            # and the segment has no later request that could close it.
            await self._publish(state, True)
        elif not finished:
            raise CloudRecognitionError("recognitionInvalidResponse")

    async def _raise_status(self, response: httpx.Response) -> None:
        detail = ""
        try:
            body = json.loads(await response.aread())
            error = body.get("error") if isinstance(body, dict) else None
            detail = str(error.get("type", "")).lower() if isinstance(error, dict) else ""
        except (ValueError, AttributeError):
            detail = ""
        raise CloudRecognitionError(self._reason(response.status_code, detail))

    @staticmethod
    def _reason(status: int, detail: str) -> str:
        """Map onto the reason words the Aliyun recognizer already established, so one
        vocabulary covers both cloud providers. A spent account is named apart from a rate
        limit because the two need opposite user action: top up versus wait.
        """
        if status in (401, 403) or any(item in detail for item in ("auth", "api_key", "permission")):
            return "recognitionUnauthorized"
        if status == 402 or "balance" in detail:
            return "recognitionInsufficientBalance"
        if status == 429 or any(item in detail for item in ("rate", "quota", "limit")):
            return "recognitionRateLimited"
        if 400 <= status < 500:
            return "recognitionRejected"
        return "recognitionNetworkError"

    async def _read_events(self, response: httpx.Response, state: _Segment) -> bool:
        async for line in response.aiter_lines():
            line = line.strip()
            if not line or line.startswith(":"):
                continue
            if not line.startswith("data:"):
                continue
            payload = line[len("data:"):].strip()
            if not payload or payload == "[DONE]":
                continue
            event = json.loads(payload)
            if not isinstance(event, dict):
                raise CloudRecognitionError("recognitionInvalidResponse")
            index = event.get("index")
            if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index <= MAX_EVENTS:
                raise CloudRecognitionError("recognitionInvalidResponse")
            # Deltas are addressed by index rather than arrival order, so an out-of-order or
            # replayed event cannot rewrite text that was already shown.
            state.chunks[index] = self._text(event.get("delta", ""))
            state.text = self._text("".join(state.chunks[position] for position in sorted(state.chunks)))
            if event.get("finish") is True:
                # `duration` measures the whole upload; segment timestamps come from capture.
                await self._publish(state, True)
                return True
            await self._publish(state, False)
        return False

    @staticmethod
    def _text(value: object) -> str:
        if not isinstance(value, str) or len(value) > MAX_TEXT:
            raise CloudRecognitionError("recognitionInvalidResponse")
        return value

    async def _publish(self, state: _Segment, is_final: bool) -> None:
        clean = state.text.strip()
        if not clean or clean == state.published and not is_final:
            return
        state.published = clean
        state.revision += 1
        self.updates_published += 1
        update = RecognitionUpdate(
            state.segment_id, state.revision, state.started_at_ms,
            state.ended_at_ms if is_final else None, clean, self.language, is_final,
        )
        if self.on_update is None:
            # Only finals are worth queuing: an interim revision with no sink has nothing to
            # revise and would accumulate for the whole session.
            if is_final:
                self._ready.append(update)
            return
        await self.on_update(update)

    def _drain(self) -> list[RecognitionUpdate]:
        if not self._ready:
            return []
        updates, self._ready = self._ready, []
        return updates

    def _fail(self, error: CloudRecognitionError) -> None:
        self._failure = self._failure or error
        if self._reported:
            return
        self._reported = True
        if self.on_error is not None:
            self.on_error(self._failure)
