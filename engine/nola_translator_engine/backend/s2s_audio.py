"""Forward provider S2S PCM to one live playback owner without TTS buffering."""

from __future__ import annotations

import asyncio
import inspect
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Literal
from uuid import uuid4

from .contracts import ErrorPayload
from .latency import unix_ms
from .s2s_provider import S2SObservation


@dataclass(frozen=True)
class AudioPacket:
    audio_stream_id: str
    claim_id: str
    owner_id: str
    generation: int
    translation_id: str
    response_id: str
    sample_rate: int
    channels: int
    chunk_seq: int
    sample_start: int
    pcm: bytes
    is_last: bool


AudioSink = Callable[[AudioPacket], Awaitable[None]]
EventSink = Callable[[str, dict[str, Any]], object]
AckState = Literal["started", "progress", "finished", "interrupted", "unknown"]


@dataclass
class _Stream:
    stream_id: str
    claim_id: str
    translation_id: str
    response_id: str
    sample_rate: int
    item_id: str
    sample_start: int = 0
    ack_offset: int = 0
    emitted_samples: int = 0
    next_chunk_seq: int = 0
    terminal: bool = False
    dropped: bool = False
    ack_state: str | None = None


class S2SAudioOutput:
    def __init__(self, session: object, event_sink: EventSink | None = None, *, latency_detection: bool = False) -> None:
        self.session = session
        self.event_sink = event_sink
        self.latency_detection = latency_detection
        self.generation = int(getattr(session, "playback_generation", 0))
        self.owner_id: str | None = None
        self.sink: AudioSink | None = None
        self._streams: dict[str, _Stream] = {}
        self._response_streams: dict[str, list[str]] = {}
        self._stream_keys: dict[tuple[str, str], str] = {}
        self._active_response: str | None = None
        self._active_stream_id: str | None = None
        self._drained = asyncio.Event()
        self._drained.set()
        self._idle = asyncio.Event()
        self._idle.set()
        self._stopped = False

    def attach(self, owner_id: str, sink: AudioSink) -> bool:
        if self._stopped or not owner_id or (self.owner_id is not None and self.owner_id != owner_id):
            return False
        self.owner_id, self.sink = owner_id, sink
        return True

    def detach(self, owner_id: str) -> bool:
        if self.owner_id != owner_id:
            return False
        self._fence()
        self.owner_id = self.sink = None
        for stream in self._streams.values():
            self._drop_stream(stream)
        self._report("PLAYBACK_DEVICE_LOST", "s2sAudioOwnerDetached", {"owner_id": owner_id})
        return True

    async def accept(self, observation: S2SObservation, translation_id: str | None,
                     segment_id: str | None = None) -> None:
        if self._stopped:
            return
        if observation.kind == "audio":
            await self._audio(observation, translation_id, segment_id)
        elif observation.kind == "response":
            await self._response_done(observation)

    async def _audio(self, observation: S2SObservation, translation_id: str | None, segment_id: str | None) -> None:
        arrived_at = unix_ms() if self.latency_detection and observation.chunk_seq == 0 else None
        response_id = observation.response_id
        if not response_id or not observation.item_id or observation.sample_rate <= 0:
            self._report("PROTOCOL_ERROR", "s2sAudioObservationInvalid", {"response_id": response_id})
            return
        if self._active_response not in (None, response_id):
            prior = self._active_response
            self._fence()
            self._report("PROTOCOL_ERROR", "s2sAudioConcurrentResponse", {"response_id": response_id})
            self._remove_response(prior)
            return
        self._active_response = response_id
        key = (response_id, observation.item_id)
        stream_id = self._stream_keys.get(key)
        stream = self._streams.get(stream_id) if stream_id else None
        if stream is None:
            if self._active_stream_id is not None:
                try:
                    await asyncio.wait_for(self._drained.wait(), timeout=5)
                except TimeoutError:
                    self._fence()
                    self._drop_all()
                    self._report("PLAYBACK_UNKNOWN", "s2sPlaybackAckTimeout", {"response_id": response_id})
            stream_id = uuid4().hex
            self._stream_keys[key] = stream_id
            stream = _Stream(stream_id, uuid4().hex, translation_id or "", response_id,
                             observation.sample_rate, observation.item_id)
            self._streams[stream_id] = stream
            self._active_stream_id = stream_id
            self._drained.clear()
            self._response_streams.setdefault(response_id, []).append(stream_id)
            self._idle.clear()
        if stream.terminal or stream.dropped:
            return
        if observation.chunk_seq != stream.next_chunk_seq:
            self._fence()
            self._drop_all()
            self._report("PROTOCOL_ERROR", "s2sAudioSequenceInvalid", {"response_id": response_id})
            return
        if translation_id:
            stream.translation_id = translation_id
        if self.owner_id is None or self.sink is None:
            stream.dropped = True
            self._drop_stream(stream)
            self._report("PLAYBACK_DEVICE_LOST", "s2sAudioOwnerMissing", {"response_id": response_id, "item_id": observation.item_id})
            return
        if len(observation.pcm) % 2 or (not observation.pcm and not observation.audio_done):
            self._fence()
            self._drop_all()
            self._report("PROTOCOL_ERROR", "s2sAudioPcmInvalid", {"response_id": response_id, "item_id": observation.item_id})
            return
        if arrived_at is not None and observation.pcm and self.event_sink:
            notification = self.event_sink("latency_observation", {
                "kind": "audio_ready", "at_ms": arrived_at,
                "audio_stream_id": stream.stream_id, "segment_id": segment_id,
            })
            if inspect.isawaitable(notification):
                await notification
        is_last = observation.audio_done
        await self._send(stream, observation, is_last)

    async def _send(self, stream: _Stream, observation: S2SObservation, is_last: bool) -> None:
        owner, sink = self.owner_id, self.sink
        if owner is None or sink is None:
            self._drop_stream(stream)
            self._report("PLAYBACK_DEVICE_LOST", "s2sAudioOwnerMissing", {"response_id": stream.response_id})
            return
        if observation.sample_rate != stream.sample_rate or len(observation.pcm) % 2:
            self._fence()
            self._drop_all()
            self._report("PROTOCOL_ERROR", "s2sAudioFormatInvalid", {"response_id": stream.response_id})
            return
        packet = AudioPacket(
            audio_stream_id=stream.stream_id, claim_id=stream.claim_id, owner_id=owner,
            generation=self.generation, translation_id=stream.translation_id,
            response_id=stream.response_id, sample_rate=stream.sample_rate, channels=1,
            chunk_seq=observation.chunk_seq, sample_start=stream.sample_start,
            pcm=observation.pcm, is_last=is_last,
        )
        try:
            result = sink(packet)
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            self._fence()
            self._drop_all()
            self._report("PLAYBACK_DEVICE_LOST", "s2sAudioSinkFailed", {"response_id": stream.response_id, "error": str(exc)})
            return
        samples = len(observation.pcm) // 2
        stream.sample_start += samples
        stream.emitted_samples += samples
        stream.next_chunk_seq += 1
        stream.terminal = is_last

    async def _response_done(self, observation: S2SObservation) -> None:
        response_id = observation.response_id
        if observation.status != "completed":
            self._fence()
            if observation.status != "cancelled":
                self._report("SYNTHESIS_FAILED", "s2sAudioResponseFailed", {"response_id": response_id, "status": observation.status})
            self._drop_all()
            return
        stream_ids = self._response_streams.get(response_id, [])
        for stream_id in stream_ids:
            stream = self._streams.get(stream_id)
            if not stream or stream.terminal or stream.dropped:
                continue
            if self.owner_id is None or self.sink is None:
                stream.dropped = True
                self._drop_stream(stream)
                self._report("PLAYBACK_DEVICE_LOST", "s2sAudioOwnerMissing", {"response_id": response_id})
                continue
            terminal = S2SObservation("audio", stream.item_id, response_id,
                                      pcm=b"", chunk_seq=stream.next_chunk_seq,
                                      sample_rate=stream.sample_rate, audio_done=True)
            await self._send(stream, terminal, True)
        if self._active_response == response_id:
            self._active_response = None
        self._cleanup_response(response_id)

    def _remove_response(self, response_id: str) -> None:
        for stream_id in self._response_streams.pop(response_id, []):
            self._streams.pop(stream_id, None)
            if self._active_stream_id == stream_id:
                self._active_stream_id = None
                self._drained.set()
        self._stream_keys = {key: value for key, value in self._stream_keys.items() if key[0] != response_id}
        if self._active_response == response_id:
            self._active_response = None
        if not self._response_streams:
            self._idle.set()

    def _cleanup_response(self, response_id: str) -> None:
        stream_ids = self._response_streams.get(response_id, [])
        if all(
            (stream := self._streams.get(stream_id)) is None or stream.dropped
            or stream.ack_state in ("finished", "interrupted", "unknown")
            for stream_id in stream_ids
        ):
            self._remove_response(response_id)

    def ack(self, audio_stream_id: str, owner_id: str, claim_id: str, generation: int,
            state: AckState, played_sample_offset: int = 0) -> bool:
        stream = self._streams.get(audio_stream_id)
        if (not stream or self.owner_id != owner_id or stream.claim_id != claim_id
                or generation != self.generation or not stream.ack_offset <= played_sample_offset <= stream.emitted_samples):
            return False
        if state == "finished" and (not stream.terminal or played_sample_offset != stream.emitted_samples):
            return False
        if state in ("started", "progress"):
            if state == "progress" and played_sample_offset == stream.ack_offset:
                return False
            stream.ack_offset = played_sample_offset
            return True
        if state in ("finished", "interrupted", "unknown"):
            stream.ack_offset = played_sample_offset
            stream.ack_state = state
            if self._active_stream_id == audio_stream_id:
                self._active_stream_id = None
                self._drained.set()
            self._cleanup_response(stream.response_id)
            return True
        return False

    def _fence(self) -> int:
        self.generation = max(self.generation, int(getattr(self.session, "playback_generation", 0))) + 1
        setattr(self.session, "playback_generation", self.generation)
        if self.event_sink:
            self.event_sink("playback_state", {
                "audio_stream_id": self._active_stream_id or "s2s",
                "playback_generation": self.generation,
                "owner_id": self.owner_id,
                "state": "cancelled",
            })
        return self.generation

    def _drop_all(self) -> None:
        self._streams.clear()
        self._response_streams.clear()
        self._active_response = None
        self._stream_keys.clear()
        self._active_stream_id = None
        self._drained.set()
        self._idle.set()

    def _drop_stream(self, stream: _Stream) -> None:
        stream.dropped = True
        if self._active_stream_id == stream.stream_id:
            self._active_stream_id = None
            self._drained.set()

    def stop(self) -> int:
        if not self._stopped:
            self._stopped = True
            generation = self._fence()
            self._drop_all()
            return generation
        return self.generation

    async def close(self) -> None:
        self.stop()
        self.owner_id = self.sink = None

    async def wait_idle(self) -> None:
        await self._idle.wait()

    def _report(self, code: str, message_key: str, details: dict[str, Any]) -> None:
        if self.event_sink:
            error = ErrorPayload(code=code, stage="playback", scope="consumer",
                                 message_key=message_key, safe_details={k: str(v) for k, v in details.items()})
            result = self.event_sink("error", {"error": error.model_dump(mode="json")})
            if inspect.isawaitable(result):
                asyncio.create_task(result)
