"""Append-only diagnostic log for a caption session.

Every layer of a browser caption session writes here: the engine directly, the desktop and the
extension through a ``debugLog`` command. One file means one ordered trace, which is the only form
that can answer "where did the audio stop" — the symptom is identical whether a chunk never left
the worklet, was refused by the pipe, or reached a recognizer that stayed silent.

Writing is best effort throughout. A missing log, a full disk or an unwritable path degrades to
no diagnostics and never touches the session.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MAX_DATA_CHARS = 4096
_lock = threading.Lock()
_path: Path | None = None
_resolved = False


def resolve_path() -> Path | None:
    """The configured log file, or ``None`` when diagnostics are not switched on."""
    global _path, _resolved
    if _resolved:
        return _path
    _resolved = True
    configured = os.environ.get("NOLA_TRANSLATOR_DEBUG_LOG", "").strip()
    if configured:
        _path = Path(configured)
    return _path


def write(layer: str, event: str, data: dict[str, Any] | None = None) -> None:
    """Append one line. Never raises and never blocks the caller for longer than the disk takes."""
    target = resolve_path()
    forward = os.environ.get("NOLA_TRANSLATOR_RUN_LOG_STDERR") == "1"
    if target is None and not forward:
        return
    try:
        payload: dict[str, Any] = {
            "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "layer": layer[:32],
            "event": event[:64],
        }
        if data:
            payload["data"] = data
        line = json.dumps(payload, ensure_ascii=False, default=str)
        if len(line) > MAX_DATA_CHARS + 512:
            line = json.dumps({**payload, "data": {"truncated": True}}, ensure_ascii=False, default=str)
        with _lock:
            if forward:
                print("NOLA_DIAGNOSTIC " + line, file=sys.stderr, flush=True)
                return
            assert target is not None
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except (OSError, ValueError, TypeError):
        # A broken diagnostic path must not take a live session with it.
        return
