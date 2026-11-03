"""Session event reducer, replay ring, and consumer fanout.

The reducer is the single writer that advances domain state and assigns
event_seq. Async completions must re-enter through `SessionEventLog.submit`
with their task/version snapshot; nothing else may allocate sequence numbers.

Delivery is at-least-once: consumers dedupe by event_id and revision. The
replay ring is bounded (recent events only); durable commits go to the
journal, which compacting never evicts.
"""

from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Iterable
from uuid import UUID, uuid4

from .contracts import (
    ALWAYS_DELIVERED_EVENT_TYPES,
    EventEnvelope,
    EventType,
    OUTPUT_EVENT_TYPES,
    SCHEMA_VERSION,
    SessionSnapshot,
)

#: Replay ring start values (doc 09 §8 engineering initials, not measured optima).
DEFAULT_RING_MAX_EVENTS = 2048
DEFAULT_RING_MAX_SECONDS = 60.0


@dataclass(frozen=True)
class Subscription:
    consumer_id: str
    outputs: frozenset[str]
    queue: asyncio.Queue[EventEnvelope | None]
    #: Last seq this subscription's filter scanned through, so a filtered
    #: consumer can tell skipped seq from lost packets.
    scanned_through_seq: int = 0
    is_playback_owner: bool = False


@dataclass
class SessionEventLog:
    """Per-session append-only event log with bounded replay and fanout."""

    session_id: UUID
    server_instance_id: str
    pipeline_id: UUID | None = None
    epoch: int = 0
    ring_max_events: int = DEFAULT_RING_MAX_EVENTS
    ring_max_seconds: float = DEFAULT_RING_MAX_SECONDS
    journal: SessionJournal | None = None

    _seq: int = 0
    _ring: deque[EventEnvelope] = field(default_factory=deque)
    _subscriptions: dict[str, Subscription] = field(default_factory=dict)
    _clock: object = None  # callable returning unix ms; injected in tests

    def __post_init__(self) -> None:
        if self._clock is None:
            self._clock = lambda: int(time.time() * 1000)

    # -- reducer side -------------------------------------------------------

    @property
    def seq(self) -> int:
        return self._seq

    def submit(self, event_type: EventType, payload: dict[str, object], *, trace_id: str = "") -> EventEnvelope:
        """Assign the next event_seq and fan out. Only the reducer calls this;
        it must run inside the session's serialized command/task context."""

        self._seq += 1
        envelope = EventEnvelope(
            server_instance_id=self.server_instance_id,
            event_id=uuid4(),
            event_seq=self._seq,
            event_type=event_type,
            session_id=self.session_id,
            pipeline_id=self.pipeline_id,
            epoch=self.epoch,
            emitted_at_unix_ms=self._clock(),  # type: ignore[misc]
            trace_id=trace_id,
            payload=payload,
        )
        if self.journal is not None and event_type in ("source_committed", "translation_committed", "playback_state"):
            self.journal.append(event_type, str(self.session_id), envelope.event_seq, envelope.model_dump(mode="json"))
        self._ring.append(envelope)
        self._evict_old()
        self._fanout(envelope)
        return envelope

    def set_pipeline(self, pipeline_id: UUID | None, epoch: int) -> None:
        self.pipeline_id = pipeline_id
        self.epoch = epoch

    def _evict_old(self) -> None:
        while len(self._ring) > self.ring_max_events:
            self._ring.popleft()
        if not self._ring:
            return
        now = self._clock()  # type: ignore[misc]
        cutoff = now - int(self.ring_max_seconds * 1000)
        while self._ring and self._ring[0].emitted_at_unix_ms < cutoff:
            self._ring.popleft()

    def _fanout(self, envelope: EventEnvelope) -> None:
        dead: list[str] = []
        for consumer_id, sub in self._subscriptions.items():
            if not _matches(sub.outputs, envelope.event_type):
                continue
            try:
                sub.queue.put_nowait(envelope)
            except asyncio.QueueFull:
                # A slow caption consumer must not stall inference or other
                # consumers: drop it and let it recover via snapshot+replay.
                dead.append(consumer_id)
                continue
        for consumer_id in dead:
            self.unsubscribe(consumer_id, reason="consumer_too_slow")

    # -- consumer side ------------------------------------------------------

    def subscribe(
        self,
        consumer_id: str,
        outputs: Iterable[str],
        *,
        max_queue: int = 512,
        is_playback_owner: bool = False,
    ) -> Subscription:
        if consumer_id in self._subscriptions:
            raise ValueError(f"consumer {consumer_id} already subscribed")
        sub = Subscription(
            consumer_id=consumer_id,
            outputs=frozenset(outputs),
            queue=asyncio.Queue(maxsize=max_queue),
            is_playback_owner=is_playback_owner,
        )
        self._subscriptions[consumer_id] = sub
        return sub

    def unsubscribe(self, consumer_id: str, *, reason: str = "") -> None:
        sub = self._subscriptions.pop(consumer_id, None)
        if sub is not None:
            if reason == "consumer_too_slow":
                while not sub.queue.empty():
                    sub.queue.get_nowait()
            # Wake any waiting receive loop.
            try:
                sub.queue.put_nowait(None)
            except asyncio.QueueFull:
                pass

    def subscription_ids(self) -> tuple[str, ...]:
        return tuple(self._subscriptions)

    def get_subscription(self, consumer_id: str) -> Subscription | None:
        return self._subscriptions.get(consumer_id)

    def replay_from(self, cursor: int) -> list[EventEnvelope] | None:
        """Events strictly after `cursor`, or None when the cursor fell out of
        the ring (caller must answer RESYNC_REQUIRED + fresh snapshot)."""

        if not self._ring:
            return [] if cursor >= self._seq else None
        oldest = self._ring[0].event_seq
        if cursor + 1 < oldest:
            return None
        return [e for e in self._ring if e.event_seq > cursor]

    def close_all(self) -> None:
        for consumer_id in list(self._subscriptions):
            self.unsubscribe(consumer_id, reason="session_closed")


def _matches(outputs: frozenset[str], event_type: str) -> bool:
    if event_type in ALWAYS_DELIVERED_EVENT_TYPES:
        return True
    for output in outputs:
        if event_type in OUTPUT_EVENT_TYPES.get(output, frozenset()):
            return True
    return False


@dataclass
class JournalEntry:
    """Durable ledger record. Commit events and TTS job transitions are
    appended here before fanout so a consumer can recover results from the
    commit event alone; cache cleanup must not delete entries with unplayed
    jobs or unacked history projection."""

    entry_id: str
    kind: str
    session_id: str
    event_seq: int
    payload: dict[str, object]
    created_at_unix_ms: int


class SessionJournal:
    """Single-writer append-only JSONL journal in the durable session directory.

    Kept minimal and synchronous on purpose: the reducer owns ordering and
    appends happen inside the same serialized step as event submission.
    """

    def __init__(self, path) -> None:
        import json
        import os

        self._json = json
        self._path = os.fspath(path)
        os.makedirs(os.path.dirname(self._path) or ".", exist_ok=True)
        self._fh = None
        self._checkpoint_seq = 0

    def append(self, kind: str, session_id: str, event_seq: int, payload: dict[str, object]) -> JournalEntry:
        entry = JournalEntry(
            entry_id=str(uuid4()),
            kind=kind,
            session_id=session_id,
            event_seq=event_seq,
            payload=payload,
            created_at_unix_ms=int(time.time() * 1000),
        )
        if self._fh is None:
            self._fh = open(self._path, "a", encoding="utf-8")
        self._fh.write(
            self._json.dumps(
                {
                    "entry_id": entry.entry_id,
                    "kind": entry.kind,
                    "session_id": entry.session_id,
                    "event_seq": entry.event_seq,
                    "payload": entry.payload,
                    "created_at_unix_ms": entry.created_at_unix_ms,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        self._fh.flush()
        return entry

    def read_all(self) -> list[JournalEntry]:
        entries: list[JournalEntry] = []
        try:
            with open(self._path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    data = self._json.loads(line)
                    entries.append(
                        JournalEntry(
                            entry_id=data["entry_id"],
                            kind=data["kind"],
                            session_id=data["session_id"],
                            event_seq=data["event_seq"],
                            payload=data["payload"],
                            created_at_unix_ms=data["created_at_unix_ms"],
                        )
                    )
        except FileNotFoundError:
            pass
        return entries

    def close(self) -> None:
        if self._fh is not None:
            self._fh.close()
            self._fh = None
