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
import re
import sys
import threading
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_path: Path | None = None
_resolved = False
_PRIVATE_FIELDS = frozenset({"apikey", "accesskey", "authorization", "password", "passwd", "token", "accesstoken",
    "refreshtoken", "secret", "credentials", "credential", "text", "sourcetext", "translatedtext", "transcript",
    "prompt", "completion", "content", "audio", "audiodata", "audiobase64", "pcm", "pcmdata", "pcmbase64"})


def exception_fields(error: BaseException, *, _seen: set[int] | None = None) -> dict[str, object]:
    """Keep the original exception and numeric codes for cross-process diagnosis."""
    seen = set(_seen or ())
    if id(error) in seen:
        return {"errorClass": type(error).__name__, "message": "[circular exception]"}
    seen.add(id(error))
    fields: dict[str, object] = {"errorClass": type(error).__name__, "message": str(error),
                                "stackTrace": "".join(traceback.format_exception(error))}
    for attribute, key in (("code", "code"), ("stage", "stage"), ("provider_code", "providerCode"),
                           ("retryable", "retryable"), ("fatal_scope", "fatalScope"), ("correlation_id", "correlationId")):
        value = getattr(error, attribute, None)
        if isinstance(value, (str, int, float, bool)):
            fields[key] = value
    cause = error.__cause__ or error.__context__
    if cause is not None:
        fields["cause"] = exception_fields(cause, _seen=seen)
    if isinstance(error, BaseExceptionGroup):
        fields["exceptions"] = [exception_fields(item, _seen=seen) for item in error.exceptions]
    response = getattr(error, "response", None)
    if response is not None and isinstance(getattr(response, "status_code", None), int):
        fields["httpStatus"] = response.status_code
        try:
            fields["responseBody"] = response.text
        except Exception:
            fields["responseBodyUnavailable"] = True
    if isinstance(error, ModuleNotFoundError):
        fields["missingModule"] = error.name
    code = getattr(error, "errno", None)
    if type(code) is not int:
        code = next((value for value in error.args if type(value) is int), None)
    if type(code) is int:
        fields["errorCode"] = code
    win_error = getattr(error, "winerror", None)
    if type(win_error) is int:
        fields["windowsErrorCode"] = win_error
    return fields


def log_exception(layer: str, event: str, error: BaseException, **context: Any) -> None:
    if not is_enabled():
        return
    try:
        correlation_id = getattr(error, "correlation_id", None)
        if correlation_id:
            context.setdefault("correlationId", correlation_id)
        fields = exception_fields(error)
        active = sys.exception()
        if active is not None and active is not error and "cause" not in fields:
            fields["cause"] = exception_fields(active)
        write(layer, event, {**context, **fields})
    except Exception:
        write(layer, event, {**context, "errorClass": type(error).__name__, "diagnosticSerializationFailed": True})


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


def is_enabled() -> bool:
    """Diagnostics can target a file or the desktop's stderr log transport."""
    return resolve_path() is not None or os.environ.get("NOLA_TRANSLATOR_RUN_LOG_STDERR") == "1"


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: "[omitted]" if re.sub(r"[^a-z0-9]", "", str(key).lower()) in _PRIVATE_FIELDS else _redact(item)
                for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    text = value if isinstance(value, str) else str(value)
    text = re.sub(r"\b(?:sk|pk|rk)-[A-Za-z0-9._-]{6,}", "[redacted]", text)
    text = re.sub(r'''(?i)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|token)["'\s]*[:=]["'\s]*)[^\s,"'}&#]+''', r'\1[redacted]', text)
    text = re.sub(r'''(?i)(authorization["'\s]*[:=]["'\s]*(?:bearer\s+|basic\s+)?)[^\s,"'}]+''', r'\1[redacted]', text)
    return re.sub(r"(https?://)[^\s/@]+:[^\s/@]+@", r"\1[redacted]@", text)


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
        line = json.dumps(_redact(payload), ensure_ascii=False, default=str)
        with _lock:
            if forward:
                print("NOLA_DIAGNOSTIC " + line, file=sys.stderr, flush=True)
                return
            assert target is not None
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except (OSError, ValueError, TypeError, RecursionError):
        # A broken diagnostic path must not take a live session with it.
        return
