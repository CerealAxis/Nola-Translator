"""Private loopback clients; business sessions never own model weights or vendor keys."""

from __future__ import annotations

import asyncio
import base64
from collections.abc import Awaitable, Callable
import json
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import numpy as np

from .audio.resample import AudioFrame
from .debug_log import write as write_debug
from .recognition.aliyun import CloudRecognitionError
from .recognition.base import ModelUnavailable, NativeTranslation, RecognitionUpdate
from .translation.base import ProviderTranslation
from .translation.network import HTTP_REQUEST_TIMEOUT_SECONDS, MAX_CHUNKS


# The proxy cannot inspect the owner's tokenizer/chunk plan. Preserve the maximum
# supported sequential cloud translation budget rather than timing it out early.
GATEWAY_TRANSLATION_TIMEOUT_SECONDS = MAX_CHUNKS * HTTP_REQUEST_TIMEOUT_SECONDS


def private_gateway_address(address: str) -> str:
    parsed = urlsplit(address)
    if (parsed.scheme != 'http' or parsed.hostname != '127.0.0.1' or not parsed.port
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ('', '/')):
        raise ValueError('The private model gateway must be an HTTP loopback origin')
    return address.rstrip('/')


async def gateway_status(address: str, key: str) -> dict:
    async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
        try:
            result = await client.get(private_gateway_address(address) + '/internal/status',
                                      headers={'Authorization': 'Bearer ' + key})
            result.raise_for_status()
            status = result.json()
            if not isinstance(status, dict):
                raise ValueError('Invalid gateway status')
            return status
        except (httpx.HTTPError, ValueError) as error:
            raise ModelUnavailable('The model gateway is unavailable') from error


class GatewayTranslationError(RuntimeError):
    def __init__(self, code: str):
        self.error_code = {'authentication_failed': 'translationUnauthorized',
            'rate_limited': 'translationRateLimited', 'network_unavailable': 'URLError',
            'request_timeout': 'translationTimeout', 'model_unavailable': 'modelUnavailable'}.get(code, 'RuntimeError')
        super().__init__('The model gateway translation request failed')


class GatewayTranslationProvider:
    """Session-scoped HTTP client; cancellation abandons only this translation request."""

    managed_externally = True

    def __init__(self, address: str, key: str, *, name: str = 'gateway-mt',
                 fallback: bool = False, session: str | None = None, binding: str | None = None):
        self.address = private_gateway_address(address)
        self.key = key
        self.name = name
        self.fallback = fallback
        self.session = session
        self.binding = binding or ''
        self._http: httpx.AsyncClient | None = None

    def _client(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(trust_env=False, timeout=120,
                headers={'Authorization': 'Bearer ' + self.key})
        return self._http

    def timeout_for(self, text: str, source: str, target: str) -> float:
        return GATEWAY_TRANSLATION_TIMEOUT_SECONDS

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        return await self.translate_stream(text, source, target, lambda _text: None)

    async def translate_stream(self, text: str, source: str, target: str,
                               on_text: Callable[[str], None]) -> ProviderTranslation:
        payload = {'op': 'infer', 'text': text, 'source': source, 'target': target,
                   'fallback': self.fallback, 'stream': True, 'session': self.session}
        # An empty binding means "the capability's own binding"; naming one lets the session use a
        # configured cloud interface the gateway has not bound as its default.
        if self.binding:
            payload['model'] = self.binding
        result = None
        async with self._client().stream('POST', self.address + '/internal/mt', json=payload) as response:
            if response.status_code in (401, 403):
                raise GatewayTranslationError('authentication_failed')
            response.raise_for_status()
            if 'application/x-ndjson' not in response.headers.get('content-type', ''):
                result = json.loads(await response.aread())
            else:
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    event = json.loads(line)
                    if 'error' in event:
                        error = event['error']
                        code = error.get('code', 'inference_failed') if isinstance(error, dict) else str(error)
                        raise GatewayTranslationError(code)
                    if not isinstance(event.get('text'), str):
                        raise RuntimeError('Invalid gateway translation response')
                    on_text(event['text'])
                    if event.get('done'):
                        result = event
        if not isinstance(result, dict) or not isinstance(result.get('text'), str):
            raise RuntimeError('Gateway translation ended without a final result')
        path = result.get('path', [])
        return ProviderTranslation(result['text'], tuple(path) if isinstance(path, list) else ())

    async def aclose(self) -> None:
        if self._http is not None:
            await self._http.aclose()
            self._http = None


class GatewayRecognizer:
    """One private RPC socket per recognition stream, including browser seek generations."""

    reset_keeps_connection = True

    def __init__(self, address: str, key: str, config, *, connector=None):
        self.address = private_gateway_address(address)
        self.key = key
        self.config = config
        self.session = str(uuid4())
        self.on_update: Callable[[RecognitionUpdate], Awaitable[None]] | None = None
        self.on_error: Callable[[CloudRecognitionError], None] | None = None
        self._connector = connector
        self._socket = None
        self._reader: asyncio.Task | None = None
        self._pending: dict[str, asyncio.Future] = {}
        self._starting: asyncio.Task | None = None
        self._closed = False
        self._failure: CloudRecognitionError | None = None

    async def start(self) -> None:
        if self._closed:
            raise ModelUnavailable('The recognition session is closed')
        if self._failure is not None:
            raise self._failure
        if self._starting is None:
            self._starting = asyncio.create_task(self._open())
        await asyncio.shield(self._starting)

    async def _open(self) -> None:
        connector = self._connector
        if connector is None:
            from websockets.asyncio.client import connect
            connector = connect
        try:
            self._socket = await connector(self.address.replace('http:', 'ws:', 1) + '/internal/asr',
                additional_headers={'Authorization': 'Bearer ' + self.key},
                proxy=None, open_timeout=10, close_timeout=2, max_size=1024 * 1024)
            self._reader = asyncio.create_task(self._receive())
            await self._request('session.open', language=self.config.sourceLanguage,
                silenceMs=self.config.silence_end_ms, maxSegmentMs=self.config.max_segment_ms,
                manual=False, targetLanguages=list(self.config.targetLanguages),
                nativeTranslation=self.config.translationProvider == 'recognition',
                recognitionBinding=getattr(self.config, 'recognitionBinding', '') or '',
                translationBinding=getattr(self.config, 'translationBinding', '') or '')
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if self._socket is not None:
                await self._socket.close()
            if isinstance(error, ModelUnavailable):
                raise
            raise ModelUnavailable('The ASR gateway is unavailable or not ready') from error

    async def _request(self, op: str, **payload):
        if self._failure is not None:
            raise self._failure
        if self._socket is None:
            raise ModelUnavailable('The recognition gateway is not connected')
        request_id = str(uuid4())
        future = asyncio.get_running_loop().create_future()
        self._pending[request_id] = future
        try:
            await self._socket.send(json.dumps({'id': request_id, 'op': op,
                                                'session': self.session, **payload}))
            return await asyncio.wait_for(future, timeout=120)
        finally:
            self._pending.pop(request_id, None)

    async def _receive(self) -> None:
        try:
            async for raw in self._socket:
                message = json.loads(raw)
                if message.get('session') == self.session and 'event' in message:
                    event = message['event']
                    if event.get('type') == 'error':
                        raise CloudRecognitionError(event.get('code', 'networkUnavailable'))
                    if event.get('type') not in ('conversation.item.input_audio_transcription.completed',
                                                 'conversation.item.input_audio_transcription.text'):
                        continue
                    native = event.get('native_translation')
                    translation = NativeTranslation(**native) if isinstance(native, dict) else None
                    update = RecognitionUpdate(segment_id=event['item_id'],
                        revision=event.get('revision', 0), started_at_ms=event.get('audio_start_ms', 0),
                        ended_at_ms=event.get('audio_end_ms'), source_text=event.get('transcript', ''),
                        language=event.get('language'),
                        is_final=event['type'].endswith('.completed'), native_translation=translation)
                    if self.on_update is not None:
                        await self.on_update(update)
                else:
                    future = self._pending.get(message.get('id'))
                    if future is None or future.done():
                        continue
                    if message.get('error'):
                        error = message['error']
                        code = error.get('code') if isinstance(error, dict) else str(error)
                        reason = {'authentication_failed': 'recognitionUnauthorized',
                            'rate_limited': 'recognitionRateLimited',
                            'request_timeout': 'recognitionTimeout'}.get(code, 'recognitionNetworkError')
                        future.set_exception(CloudRecognitionError(reason))
                    else:
                        future.set_result(message.get('result', {}))
            if not self._closed:
                raise ConnectionError('The gateway closed the recognition session')
        except asyncio.CancelledError:
            raise
        except Exception as error:
            if not self._closed:
                self._failure = error if isinstance(error, CloudRecognitionError) else CloudRecognitionError('recognitionNetworkError')
                for future in self._pending.values():
                    if not future.done():
                        future.set_exception(self._failure)
                if self.on_error is not None:
                    self.on_error(self._failure)

    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]:
        await self.start()
        samples = np.rint(np.clip(frame.samples, -1, 32767 / 32768) * 32768).astype('<i2')
        await self._request('session.append', audio=base64.b64encode(samples.tobytes()).decode('ascii'),
                            startedAtMs=frame.started_at_ms)
        return []

    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]:
        if self._socket is not None and not self._closed:
            await self._request('session.commit', endedAtMs=ended_at_ms)
        return []

    async def reset(self) -> None:
        # The existing socket owns the capability leases. Reset sentence state without
        # resolving the current defaults again or releasing the pinned model generation.
        await self.start()
        await self._request('session.reset')

    async def close(self) -> None:
        if self._closed:
            return
        # Wait for an already-started open before releasing its socket and server-side lease.
        if self._starting is not None and not self._starting.done():
            try:
                await asyncio.wait_for(asyncio.shield(self._starting), timeout=15)
            except (Exception, asyncio.CancelledError):
                self._starting.cancel()
                await asyncio.gather(self._starting, return_exceptions=True)
        self._closed = True
        try:
            if self._socket is not None and self._failure is None:
                await asyncio.wait_for(self._request('session.close'), timeout=5)
        except Exception as error:
            # Closing the socket is authoritative: the gateway releases its session lease.
            write_debug('engine', 'gateway.session.close.failed', {'error': type(error).__name__})
        finally:
            if self._socket is not None:
                await self._socket.close()
            if self._reader is not None:
                self._reader.cancel()
                await asyncio.gather(self._reader, return_exceptions=True)
            for future in self._pending.values():
                if not future.done():
                    future.cancel()
