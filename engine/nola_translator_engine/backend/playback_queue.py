"""Durable text ledger for one ordered, whole-sentence playback pipeline."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from contextlib import contextmanager
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal
from uuid import uuid4


@dataclass(frozen=True)
class TtsJob:
    translation_commit_id: str
    translation_id: str
    segment_id: str
    target_revision: int
    target_language: str
    order_index: int
    text: str
    model_id: str
    model_config_revision: int = 1
    voice: str | None = None
    synthesis_options: dict = field(default_factory=dict)
    origin_epoch: int = 0
    output_profile: str = "speech"
    synthesis_attempt: int = 0

    @property
    def job_id(self) -> str:
        identity = json.dumps([self.translation_commit_id, self.output_profile])
        return "tts-" + hashlib.sha256(identity.encode()).hexdigest()[:32]


@dataclass(frozen=True)
class PlaybackClaim:
    job_id: str
    owner_id: str
    claim_id: str
    generation: int
    sample_count: int


class PlaybackQueue:
    """Only the oldest unfinished job can synthesize or own playback audio."""

    def __init__(self, path: Path | str, pipeline_id: str, *, initial_generation: int = 0) -> None:
        self.pipeline_id = pipeline_id
        self._db = sqlite3.connect(path)
        self._db.row_factory = sqlite3.Row
        self._db.executescript("""
            CREATE TABLE IF NOT EXISTS playback_pipeline (
                pipeline_id TEXT PRIMARY KEY,
                generation INTEGER NOT NULL DEFAULT 0,
                paused INTEGER NOT NULL DEFAULT 0,
                stopped INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS playback_job (
                pipeline_id TEXT NOT NULL,
                job_id TEXT NOT NULL,
                order_index INTEGER NOT NULL,
                payload TEXT NOT NULL,
                state TEXT NOT NULL DEFAULT 'queued',
                attempt INTEGER NOT NULL DEFAULT 0,
                owner_id TEXT,
                claim_id TEXT,
                generation INTEGER,
                sample_count INTEGER,
                played INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (pipeline_id, job_id)
            );
            CREATE INDEX IF NOT EXISTS playback_job_order
            ON playback_job(pipeline_id, order_index)
            WHERE state NOT IN ('finished', 'interrupted', 'cancelled');
            CREATE UNIQUE INDEX IF NOT EXISTS playback_job_active
            ON playback_job(pipeline_id)
            WHERE state IN ('running', 'claimed', 'playing');
        """)
        with self._write():
            self._db.execute("INSERT OR IGNORE INTO playback_pipeline(pipeline_id, generation) VALUES (?, ?)",
                             (pipeline_id, initial_generation))
            # A persisted grant may already have reached the device before a crash.
            self._db.execute("""
                UPDATE playback_job SET state = CASE WHEN state = 'running' THEN 'queued' ELSE 'unknown' END
                WHERE pipeline_id = ? AND state IN ('running', 'claimed', 'playing')
            """, (pipeline_id,))

    @contextmanager
    def _write(self):
        with self._db:
            self._db.execute("BEGIN IMMEDIATE")
            yield

    def close(self) -> None:
        self._db.close()

    def _pipeline(self) -> sqlite3.Row:
        return self._db.execute(
            "SELECT * FROM playback_pipeline WHERE pipeline_id = ?", (self.pipeline_id,)
        ).fetchone()

    @property
    def generation(self) -> int:
        return self._pipeline()["generation"]

    def enqueue(self, job: TtsJob) -> bool:
        with self._write():
            if self._pipeline()["stopped"]:
                return False
            return self._db.execute("""
                INSERT INTO playback_job(pipeline_id, job_id, order_index, payload)
                VALUES (?, ?, ?, ?) ON CONFLICT(pipeline_id, job_id) DO NOTHING
            """, (self.pipeline_id, job.job_id, job.order_index, json.dumps(asdict(job)))).rowcount == 1

    def begin_next(self) -> TtsJob | None:
        with self._write():
            pipeline = self._pipeline()
            if pipeline["paused"] or pipeline["stopped"]:
                return None
            row = self._db.execute("""
                SELECT * FROM playback_job
                WHERE pipeline_id = ? AND state NOT IN ('finished', 'interrupted', 'cancelled')
                ORDER BY order_index, rowid LIMIT 1
            """, (self.pipeline_id,)).fetchone()
            if row is None or row["state"] != "queued":
                return None
            if self._db.execute("""
                SELECT 1 FROM playback_job WHERE pipeline_id = ? AND state IN ('running', 'claimed', 'playing')
                LIMIT 1
            """, (self.pipeline_id,)).fetchone():
                return None
            attempt = row["attempt"] + 1
            self._db.execute("""
                UPDATE playback_job SET state = 'running', attempt = ? WHERE pipeline_id = ? AND job_id = ?
            """, (attempt, self.pipeline_id, row["job_id"]))
            payload = json.loads(row["payload"])
            payload["synthesis_attempt"] = attempt
            return TtsJob(**payload)

    def has_unfinished(self) -> bool:
        return self._db.execute("""
            SELECT 1 FROM playback_job
            WHERE pipeline_id = ? AND state NOT IN ('finished', 'interrupted', 'cancelled')
            LIMIT 1
        """, (self.pipeline_id,)).fetchone() is not None

    def blocked_job(self) -> tuple[str, TtsJob] | None:
        row = self._db.execute("""
            SELECT state, payload, attempt FROM playback_job
            WHERE pipeline_id = ? AND state NOT IN ('finished', 'interrupted', 'cancelled')
            ORDER BY order_index, rowid LIMIT 1
        """, (self.pipeline_id,)).fetchone()
        if row is None or row["state"] not in ("failed", "unknown"):
            return None
        payload = json.loads(row["payload"])
        payload["synthesis_attempt"] = row["attempt"]
        return row["state"], TtsJob(**payload)

    def claim(self, job_id: str, owner_id: str, sample_count: int, *, attempt: int | None = None) -> PlaybackClaim | None:
        if not owner_id or sample_count <= 0:
            raise ValueError("playback claim requires an owner and positive sample count")
        with self._write():
            pipeline = self._pipeline()
            if pipeline["paused"] or pipeline["stopped"]:
                return None
            claim = PlaybackClaim(job_id, owner_id, uuid4().hex, pipeline["generation"], sample_count)
            changed = self._db.execute("""
                UPDATE playback_job SET state = 'claimed', owner_id = ?, claim_id = ?,
                    generation = ?, sample_count = ?, played = 0
                WHERE pipeline_id = ? AND job_id = ? AND state = 'running'
                    AND (? IS NULL OR attempt = ?)
            """, (owner_id, claim.claim_id, claim.generation, sample_count, self.pipeline_id, job_id, attempt, attempt))
            return claim if changed.rowcount else None

    def ack(
        self, job_id: str, owner_id: str, claim_id: str, generation: int,
        state: Literal["started", "progress", "finished", "interrupted", "unknown"],
        played_sample_offset: int = 0,
    ) -> bool:
        with self._write():
            if generation != self.generation:
                return False
            row = self._db.execute("""
                SELECT state, sample_count, played FROM playback_job
                WHERE pipeline_id = ? AND job_id = ? AND owner_id = ? AND claim_id = ? AND generation = ?
            """, (self.pipeline_id, job_id, owner_id, claim_id, generation)).fetchone()
            if row is None or not row["played"] <= played_sample_offset <= row["sample_count"]:
                return False
            current = row["state"]
            if state == "finished" and played_sample_offset != row["sample_count"]:
                return False
            if state == current and state in ("finished", "interrupted", "unknown"):
                return played_sample_offset == row["played"]
            if state == "started" and current in ("claimed", "playing"):
                next_state = "playing"
            elif state == "progress" and current == "playing":
                next_state = "playing"
            elif state == "finished" and current == "playing":
                next_state = "finished"
            elif state in ("interrupted", "unknown") and current in ("claimed", "playing"):
                next_state = state
            else:
                return False
            self._db.execute("""
                UPDATE playback_job SET state = ?, played = ? WHERE pipeline_id = ? AND job_id = ?
            """, (next_state, played_sample_offset, self.pipeline_id, job_id))
            return True

    def fail(self, job_id: str, *, attempt: int | None = None) -> bool:
        with self._write():
            return self._db.execute("""
                UPDATE playback_job SET state = 'failed' WHERE pipeline_id = ? AND job_id = ?
                    AND state = 'running' AND (? IS NULL OR attempt = ?)
            """, (self.pipeline_id, job_id, attempt, attempt)).rowcount == 1

    def retry(self, job_id: str) -> bool:
        with self._write():
            return self._db.execute("""
                UPDATE playback_job SET state = 'queued' WHERE pipeline_id = ? AND job_id = ? AND state = 'failed'
            """, (self.pipeline_id, job_id)).rowcount == 1

    def skip(self, job_id: str) -> bool:
        with self._write():
            return self._db.execute("""
                UPDATE playback_job SET state = 'cancelled'
                WHERE pipeline_id = ? AND job_id = ? AND state IN ('failed', 'unknown')
            """, (self.pipeline_id, job_id)).rowcount == 1

    def owner_lost(self, owner_id: str) -> bool:
        with self._write():
            return self._db.execute("""
                UPDATE playback_job SET state = 'unknown'
                WHERE pipeline_id = ? AND owner_id = ? AND state IN ('claimed', 'playing')
            """, (self.pipeline_id, owner_id)).rowcount == 1

    def pause(self) -> int:
        return self._fence(stop=False)

    def resume(self) -> None:
        with self._write():
            self._db.execute("UPDATE playback_pipeline SET paused = 0 WHERE pipeline_id = ?", (self.pipeline_id,))

    def stop(self) -> int:
        return self._fence(stop=True)

    def _fence(self, *, stop: bool) -> int:
        with self._write():
            pipeline = self._pipeline()
            if pipeline["stopped"] or (pipeline["paused"] and not stop):
                return pipeline["generation"]
            self._db.execute("""
                UPDATE playback_pipeline SET paused = 1, stopped = ?, generation = generation + 1
                WHERE pipeline_id = ?
            """, (stop, self.pipeline_id))
            if stop:
                self._db.execute("""
                    UPDATE playback_job SET state =
                        CASE WHEN state IN ('claimed', 'playing') THEN 'interrupted' ELSE 'cancelled' END
                    WHERE pipeline_id = ? AND state NOT IN ('finished', 'interrupted', 'cancelled')
                """, (self.pipeline_id,))
            else:
                self._db.execute("""
                    UPDATE playback_job SET state = CASE WHEN state = 'running' THEN 'queued' ELSE 'interrupted' END
                    WHERE pipeline_id = ? AND state IN ('running', 'claimed', 'playing')
                """, (self.pipeline_id,))
            return pipeline["generation"] + 1
