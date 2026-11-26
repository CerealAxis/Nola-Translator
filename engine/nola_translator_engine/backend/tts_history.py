from __future__ import annotations

import base64
import copy
import hashlib
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid4, uuid5

from .gateway.operations import SynthesisResult
from .playback_queue import TtsJob


class TtsGenerationHistory:
    def __init__(self, root: Path):
        self.root = root.resolve(strict=True)
        self.database = self.root / "voices.sqlite3"
        self.pending: set[str] = set()

    @classmethod
    def from_environment(cls):
        root = os.environ.get("NOLA_TTS_DATA_ROOT")
        return cls(Path(root)) if root else None

    @staticmethod
    def identity(job: TtsJob) -> str:
        return str(uuid5(NAMESPACE_URL, job.job_id))

    def enqueue(self, job: TtsJob) -> None:
        snapshot = copy.deepcopy(job.synthesis_options["resolved_request"])
        identity = self.identity(job)
        snapshot.update(requestId=identity, text=job.text, targetLanguage=job.target_language)
        now = datetime.now(timezone.utc).isoformat()
        with sqlite3.connect(self.database) as db:
            db.execute("INSERT OR IGNORE INTO tts_generations VALUES(?,?,?,?,?,?,?)",
                (identity, json.dumps(snapshot), "queued", None, None, now, now))
        self.pending.add(identity)

    def complete(self, job: TtsJob, result: SynthesisResult) -> None:
        from .direct_inference import _tts_wav
        identity, asset_id = self.identity(job), str(uuid4())
        data = base64.b64decode(_tts_wav(result).split(",", 1)[1], validate=True)
        base = self.root / "voices"
        base.mkdir(exist_ok=True)
        base = base.resolve(strict=True)
        for part in (base / identity,):
            part.mkdir(exist_ok=True)
            if part.is_symlink() or part.is_junction() or not part.resolve(strict=True).is_relative_to(base):
                raise ValueError("Voice output escapes asset root")
        relative = f"{identity}/{asset_id}.wav"
        target = base / relative
        with target.open("xb") as output:
            output.write(data)
        duration = sum(len(chunk.pcm) / (2 * chunk.channels * chunk.sample_rate) * 1000 for chunk in result.chunks)
        now = datetime.now(timezone.utc).isoformat()
        try:
            with sqlite3.connect(self.database) as db:
                db.execute("INSERT INTO voice_assets VALUES(?,?,?,?,?,?,?,?,?)", (asset_id, identity, "output", relative,
                    "audio/wav", hashlib.sha256(data).hexdigest(), duration, len(data), now))
                db.execute("UPDATE tts_generations SET state='complete', output_asset_id=?, updated_at=? WHERE id=? AND state='queued'",
                    (asset_id, now, identity))
        except Exception:
            target.unlink(missing_ok=True)
            raise
        self.pending.discard(identity)

    def fail(self, job: TtsJob, code: str) -> None:
        identity = self.identity(job)
        with sqlite3.connect(self.database) as db:
            db.execute("UPDATE tts_generations SET state='failed', error_code=?, updated_at=? WHERE id=? AND state='queued'",
                (code, datetime.now(timezone.utc).isoformat(), identity))
        self.pending.discard(identity)

    def close(self) -> None:
        with sqlite3.connect(self.database) as db:
            db.executemany("UPDATE tts_generations SET state='cancelled', updated_at=? WHERE id=? AND state='queued'",
                [(datetime.now(timezone.utc).isoformat(), identity) for identity in self.pending])
        self.pending.clear()
