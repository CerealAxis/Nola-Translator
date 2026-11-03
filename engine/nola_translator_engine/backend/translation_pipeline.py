"""Snapshot-based MT scheduling for one realtime session (doc 05)."""

from __future__ import annotations

import asyncio
from contextlib import suppress
import hashlib
import inspect
import json
import time
from collections import deque
from dataclasses import dataclass, field, replace
from typing import Any, Callable
from uuid import uuid4

from .gateway.capabilities import CallContext, GatewayError, GatewayErrorCode, Operation
from .gateway.gateway import MatchRequest, ModelGateway
from .latency import unix_ms


@dataclass(frozen=True)
class _Task:
    key: tuple[str, int, str, str]
    generation: int
    source: dict[str, Any]
    context: dict[str, Any]
    source_fingerprint: str
    context_fingerprint: str
    fingerprint: str
    model_fingerprint: str
    config_revision: int
    task_class: str
    task_id: str = field(default_factory=lambda: str(uuid4()))


@dataclass
class _Segment:
    source: dict[str, Any] = field(default_factory=dict)
    latest_source_revision: int = 0
    context: dict[str, Any] = field(default_factory=dict)
    generation: int = 0
    pending_preview: dict[str, _Task] = field(default_factory=dict)
    preview_since: float | None = None
    preview_due: float | None = None
    last_preview_text: str = ""
    provisional: dict[str, tuple[str, str, int]] = field(default_factory=dict)
    target_revisions: dict[str, int] = field(default_factory=dict)
    translation_ids: dict[str, str] = field(default_factory=dict)
    committed: set[str] = field(default_factory=set)


class TranslationScheduler:
    """Coalesce stable snapshots and serialize finals ahead of previews.

    `source_snapshot` takes a SourceText payload (with ``text_state=stable``);
    `source_final` takes a SourceCommitted payload. Context is caller-owned JSON
    data and is fingerprinted so revisions cannot accept results from old terms,
    prompts, history, or language settings.
    """

    def __init__(
        self,
        gateway: ModelGateway,
        *,
        session_id: str,
        pipeline_id: str,
        epoch: int,
        model_id: str,
        target_languages: tuple[str, ...] | list[str],
        event_sink: Callable[[str, dict[str, Any]], Any],
        provider_options: dict[str, str] | None = None,
        fallback_model_id: str | None = None,
        fallback_provider_options: dict[str, str] | None = None,
        preview_interval_ms: int = 500,
        preview_max_wait_ms: int = 1000,
        preview_deadline_s: float = 3.0,
        final_deadline_s: float = 10.0,
        latency_detection: bool = False,
    ) -> None:
        self.gateway = gateway
        self.session_id = session_id
        self.pipeline_id = pipeline_id
        self.epoch = epoch
        self.model_id = model_id
        self.target_languages = tuple(dict.fromkeys(target_languages))
        self.event_sink = event_sink
        self.provider_options = provider_options or {}
        self.fallback_model_id = fallback_model_id
        self.fallback_provider_options = fallback_provider_options or {}
        self.preview_interval = max(0, preview_interval_ms) / 1000
        self.preview_max_wait = max(self.preview_interval, preview_max_wait_ms / 1000)
        self.preview_deadline_s = preview_deadline_s
        self.final_deadline_s = final_deadline_s
        self.latency_detection = latency_detection
        self._segments: dict[tuple[str, int, str], _Segment] = {}
        self._finals: deque[_Task] = deque()
        self._wake = asyncio.Event()
        self._idle = asyncio.Event()
        self._idle.set()
        self._runner: asyncio.Task | None = None
        self._active: _Task | None = None
        self._closed = False

    async def source_snapshot(self, source: dict[str, Any], context: dict[str, Any] | None = None) -> None:
        """Record a draft/stable source snapshot; only stable text is eligible."""

        text_state = source.get("text_state", source.get("state"))
        if text_state not in ("draft", "stable"):
            return
        text = source.get("text")
        segment_id = source.get("segment_id")
        revision = source.get("source_revision")
        if not isinstance(text, str) or not text.strip() or not isinstance(segment_id, str) or not isinstance(revision, int) or revision < 1:
            return
        if self._closed:
            return
        base_key = (self.pipeline_id, self.epoch, segment_id)
        state = self._segments.setdefault(base_key, _Segment())
        if state.source.get("text_state") == "committed" or revision < state.latest_source_revision:
            return
        state.latest_source_revision = revision
        new_source = dict(source)
        stable_end = new_source.get("stable_end_offset")
        if text_state == "stable" and isinstance(stable_end, int):
            text = text[:max(0, stable_end)].rstrip()
            new_source["text"] = text
            if not text:
                text_state = new_source["text_state"] = "draft"
        new_context = dict(context or {})
        if (
            text_state == state.source.get("text_state", state.source.get("state"))
            and new_source.get("text") == state.source.get("text")
            and new_source.get("language") == state.source.get("language")
            and _hash(state.context) == _hash(new_context)
        ):
            return
        changed = (
            _hash(state.source) != _hash(new_source)
            or _hash(state.context) != _hash(new_context)
        )
        if not changed:
            return
        had_pending = bool(state.pending_preview)
        had_preview = bool(state.last_preview_text or state.provisional)
        pending_since = state.preview_since
        state.generation += 1
        state.source = new_source
        state.context = new_context
        for language in self.target_languages:
            old = state.provisional.get(language)
            if old is not None:
                await self._emit(
                    "translated_text",
                    self._translated_payload(state, segment_id, language, old[0], old[2], "provisional", ("stale",)),
                )

        if text_state != "stable":
            state.pending_preview.clear()
            state.preview_since = None
            return
        state.pending_preview.clear()
        state.preview_since = pending_since if had_pending else None
        state.preview_due = None
        if not (_preview_eligible(text, new_source) or had_pending or had_preview):
            return
        now = time.monotonic()
        if state.preview_since is None:
            # Once a segment first qualifies, keep the latest candidate until
            # the debounce or bounded max-wait releases it.
            state.preview_since = now
        state.preview_due = min(now + self.preview_interval, state.preview_since + self.preview_max_wait)
        for language in self.target_languages:
            if language in state.committed:
                continue
            try:
                matched = self._match(new_source, language, accept_preview=True)
            except Exception:
                continue
            policy = matched.entry.definition.capabilities.translation_policy
            if policy.min_source_state == "committed" or not policy.allow_preview:
                continue
            state.pending_preview[language] = self._make_task(
                base_key, state, language, "preview", matched
            )
        if state.pending_preview:
            self._start()
            self._idle.clear()
            self._wake.set()

    async def source_final(self, source: dict[str, Any], context: dict[str, Any] | None = None) -> None:
        """Queue a committed source snapshot; final jobs are never coalesced away."""

        text = source.get("text")
        segment_id = source.get("segment_id")
        revision = source.get("source_revision")
        if not isinstance(text, str) or not isinstance(segment_id, str) or not isinstance(revision, int) or revision < 1 or self._closed:
            return
        base_key = (self.pipeline_id, self.epoch, segment_id)
        state = self._segments.setdefault(base_key, _Segment())
        if state.source.get("text_state") == "committed":
            return
        if revision < state.latest_source_revision:
            return
        state.latest_source_revision = revision
        new_source = dict(source)
        new_source["text_state"] = "committed"
        new_context = dict(context or {})
        state.generation += 1
        state.source, state.context = new_source, new_context
        state.pending_preview.clear()
        state.preview_since = None
        state.preview_due = None
        if not text.strip():
            for language, (old_text, _, old_revision) in state.provisional.items():
                await self._emit("translated_text", self._translated_payload(
                    state, segment_id, language, old_text, old_revision, "provisional", ("stale",),
                ))
            state.provisional.clear()
            return
        for language in self.target_languages:
            if language in state.committed:
                continue
            try:
                matched = self._match(new_source, language, accept_preview=True)
            except Exception as error:
                await self._emit("error", self._error_event_payload(segment_id, error))
                continue
            task = self._make_task(base_key, state, language, "final", matched)
            self._finals.append(task)
        if self._finals:
            self._start()
            self._idle.clear()
            self._wake.set()

    async def wait_idle(self) -> None:
        """Wait for queued jobs to finish, including a preview's bounded delay."""

        while not self._idle.is_set():
            await self._idle.wait()

    async def close(self) -> None:
        self._closed = True
        self._finals.clear()
        for state in self._segments.values():
            state.pending_preview.clear()
        self._wake.set()
        if self._runner is not None:
            self._runner.cancel()
            with suppress(asyncio.CancelledError):
                await self._runner
        self._idle.set()

    def _start(self) -> None:
        if self._runner is None or self._runner.done():
            self._runner = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while not self._closed:
            task = self._next_task()
            if task is None:
                delay = self._next_delay()
                self._wake.clear()
                if delay is None:
                    self._idle.set()
                    await self._wake.wait()
                else:
                    try:
                        await asyncio.wait_for(self._wake.wait(), timeout=delay)
                    except TimeoutError:
                        pass
                continue
            self._active = task
            try:
                await self._execute(task)
            finally:
                self._active = None
                if not self._finals and not any(s.pending_preview for s in self._segments.values()):
                    self._idle.set()
        self._idle.set()

    def _next_task(self) -> _Task | None:
        if self._finals:
            return self._finals.popleft()
        now = time.monotonic()
        for state in self._segments.values():
            if not state.pending_preview:
                continue
            since = state.preview_since or now
            if now - since >= self.preview_max_wait or now >= (state.preview_due or since + self.preview_interval):
                language, task = next(iter(state.pending_preview.items()))
                del state.pending_preview[language]
                if not state.pending_preview:
                    state.preview_since = None
                    state.preview_due = None
                return task
        return None

    def _next_delay(self) -> float | None:
        deadlines = [
            state.preview_due or (state.preview_since or time.monotonic()) + self.preview_interval
            for state in self._segments.values()
            if state.pending_preview
        ]
        return max(0.0, min(deadlines) - time.monotonic()) if deadlines else None

    async def _execute(self, task: _Task) -> None:
        state = self._segments.get(task.key[:3])
        if not self._current(task, state):
            return
        if task.task_class == "final" and state is not None:
            provisional = state.provisional.get(task.key[3])
            if provisional is not None and provisional[1] == task.fingerprint:
                await self._commit(task, provisional[0])
                return
        try:
            request = self._request(task.source, task.key[3], accept_preview=True)
            final = task.task_class == "final"
            deadline = time.monotonic() + (self.final_deadline_s if final else self.preview_deadline_s)
            ctx = CallContext(
                operation=Operation.TRANSLATE, task_id=task.task_id,
                session_id=self._uuid_or_none(self.session_id), pipeline_id=self.pipeline_id,
                epoch=self.epoch, deadline=deadline, config_revision=task.config_revision,
                provider_options=self.provider_options, translation_context=task.context,
            )
            arguments = {
                "text": task.source["text"], "source": str(task.source.get("language") or "auto"),
                "target": task.key[3], "request": request,
            }
            try:
                try:
                    started = unix_ms() if final and self.latency_detection else None
                    result = await self.gateway.translate(ctx, **arguments)
                except GatewayError as error:
                    delay = max(0.1, (error.retry_after_ms or 0) / 1000)
                    if not final or not error.retryable or time.monotonic() + delay >= deadline:
                        raise
                    await asyncio.sleep(delay)
                    if not self._current(task, state):
                        return
                    started = unix_ms() if self.latency_detection else None
                    result = await self.gateway.translate(ctx, **arguments)
                if not result.text.strip() or not result.is_final:
                    raise ValueError("empty or incomplete translation")
            except (GatewayError, ValueError):
                if not final or not self.fallback_model_id or not self._current(task, state):
                    raise
                arguments["request"] = replace(request, model_id=self.fallback_model_id)
                started = unix_ms() if self.latency_detection else None
                result = await self.gateway.translate(replace(
                    ctx, deadline=time.monotonic() + self.final_deadline_s, provider_options=self.fallback_provider_options,
                ), **arguments)
        except Exception as error:
            if task.task_class == "final" and self._current(task, state):
                await self._emit("error", self._error_payload(task, error))
            return
        if not isinstance(result.text, str) or not result.text.strip() or not result.is_final:
            if task.task_class == "final" and self._current(task, state):
                await self._emit("error", self._error_payload(task, ValueError("empty or incomplete translation")))
            return
        if result.fingerprint and result.fingerprint != task.fingerprint:
            return
        if not self._current(task, state):
            return
        if task.task_class == "final":
            if started is not None:
                ready = unix_ms()
                fields = {"segment_id": task.key[2], "provider": arguments["request"].model_id}
                await self._emit("latency_observation", {**fields, "kind": "translation_started", "at_ms": started})
                await self._emit("latency_observation", {**fields, "kind": "translation_ready", "at_ms": ready})
            await self._commit(task, result.text.strip())
        else:
            assert state is not None
            state.target_revisions[task.key[3]] = state.target_revisions.get(task.key[3], 0) + 1
            translation_id = state.translation_ids.setdefault(task.key[3], str(uuid4()))
            target_revision = state.target_revisions[task.key[3]]
            state.provisional[task.key[3]] = (result.text.strip(), task.fingerprint, task.source.get("source_revision", 0))
            state.last_preview_text = task.source["text"]
            await self._emit(
                "translated_text",
                {
                    "translation_id": translation_id,
                    "segment_id": task.key[2],
                    "source_revision": int(task.source.get("source_revision", 1)),
                    "target_language": task.key[3],
                    "target_revision": target_revision,
                    "text": result.text.strip(),
                    "state": "provisional",
                    "based_on_source_revision": int(task.source.get("source_revision", 0)),
                    "based_on_context_revision": int(task.context.get("context_revision", 0)),
                    "quality_flags": (),
                },
            )

    async def _commit(self, task: _Task, text: str) -> None:
        state = self._segments.get(task.key[:3])
        if not self._current(task, state):
            return
        assert state is not None
        language = task.key[3]
        state.target_revisions[language] = state.target_revisions.get(language, 0) + 1
        revision = state.target_revisions[language]
        translation_id = state.translation_ids.setdefault(language, str(uuid4()))
        fingerprint = _hash(text)
        await self._emit(
            "translated_text",
            {
                "translation_id": translation_id,
                "segment_id": task.key[2],
                "source_revision": int(task.source.get("source_revision", 1)),
                "target_language": language,
                "target_revision": revision,
                "text": text,
                "state": "committed",
                "based_on_source_revision": int(task.source.get("source_revision", 1)),
                "based_on_context_revision": int(task.context.get("context_revision", 0)),
                "quality_flags": (),
            },
        )
        await self._emit(
            "translation_committed",
            {
                "commit_id": str(uuid4()),
                "translation_id": translation_id,
                "segment_id": task.key[2],
                "target_language": language,
                "target_revision": revision,
                "text": text,
                "text_fingerprint": fingerprint,
                "based_on_source_revision": int(task.source.get("source_revision", 1)),
                "based_on_context_revision": int(task.context.get("context_revision", 0)),
            },
        )
        state.committed.add(language)

    def _make_task(self, base_key: tuple[str, int, str], state: _Segment, language: str, task_class: str, matched: Any) -> _Task:
        source_fingerprint = _hash({"text": state.source.get("text"), "span": state.source.get("audio_span")})
        context_fingerprint = _hash(state.context)
        config_revision = matched.entry.configuration.revision
        capabilities = matched.entry.definition.capabilities
        model_fingerprint = _hash({
            "model_id": self.model_id,
            "model_revision": capabilities.model_revision,
            "adapter_revision": capabilities.adapter_revision,
            "config_revision": config_revision,
        })
        fingerprint = _hash({
            "source": source_fingerprint,
            "context": context_fingerprint,
            "model": model_fingerprint,
            "source_language": state.source.get("language", "auto"),
            "target_language": language,
        })
        return _Task(
            key=(*base_key, language), generation=state.generation,
            source=dict(state.source), context=dict(state.context),
            source_fingerprint=source_fingerprint, context_fingerprint=context_fingerprint,
            fingerprint=fingerprint, model_fingerprint=model_fingerprint,
            config_revision=config_revision, task_class=task_class,
        )

    def _request(self, source: dict[str, Any], language: str, *, accept_preview: bool) -> MatchRequest:
        return MatchRequest(
            operation=Operation.TRANSLATE,
            source_language=str(source.get("language") or "auto"),
            target_language=language,
            accept_preview=accept_preview,
            source_is_provisional=source.get("text_state") != "committed",
            model_id=self.model_id,
        )

    def _match(self, source: dict[str, Any], language: str, *, accept_preview: bool):
        return self.gateway.match(self._request(source, language, accept_preview=accept_preview))

    def _current(self, task: _Task, state: _Segment | None) -> bool:
        if self._closed or state is None or task.generation != state.generation or task.key[0:2] != (self.pipeline_id, self.epoch):
            return False
        if _hash(state.source) != _hash(task.source) or _hash(state.context) != task.context_fingerprint:
            return False
        try:
            matched = self._match(task.source, task.key[3], accept_preview=True)
        except Exception:
            return False
        definition = matched.entry.definition.capabilities
        model_fingerprint = _hash({
            "model_id": self.model_id,
            "model_revision": definition.model_revision,
            "adapter_revision": definition.adapter_revision,
            "config_revision": matched.entry.configuration.revision,
        })
        return matched.entry.configuration.revision == task.config_revision and model_fingerprint == task.model_fingerprint

    async def _emit(self, event_type: str, payload: dict[str, Any]) -> None:
        result = self.event_sink(event_type, payload)
        if inspect.isawaitable(result):
            await result

    def _translated_payload(self, state: _Segment, segment_id: str, language: str, text: str, based_revision: int, status: str, flags: tuple[str, ...]) -> dict[str, Any]:
        state.target_revisions[language] = state.target_revisions.get(language, 0) + 1
        return {
            "translation_id": state.translation_ids.setdefault(language, str(uuid4())),
            "segment_id": segment_id,
            "source_revision": int(state.source.get("source_revision", 1)),
            "target_language": language,
            "target_revision": state.target_revisions[language],
            "text": text,
            "state": status,
            "based_on_source_revision": int(based_revision),
            "based_on_context_revision": int(state.context.get("context_revision", 0)),
            "quality_flags": flags,
        }

    def _error_payload(self, task: _Task, error: Exception) -> dict[str, Any]:
        return self._error_event_payload(task.key[2], error, task.task_id)

    def _error_event_payload(self, segment_id: str, error: Exception, task_id: str | None = None) -> dict[str, Any]:
        code = "TRANSLATION_TIMEOUT" if getattr(error, "code", None) == GatewayErrorCode.TIMEOUT else "INTERNAL_ERROR"
        return {
            "error": {
                "code": code,
                "stage": "mt",
                "scope": "pipeline",
                "retryable": code == "TRANSLATION_TIMEOUT" or bool(getattr(error, "retryable", False)),
                "fatal": False,
                "message_key": "translation.failed",
                "correlation_id": task_id or str(uuid4()),
                "segment_id": segment_id,
                "safe_details": {},
            }
        }

    @staticmethod
    def _uuid_or_none(value: str):
        from uuid import UUID

        try:
            return UUID(value)
        except (ValueError, TypeError):
            return None


def _hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def _preview_eligible(text: str, source: dict[str, Any]) -> bool:
    words = len(text.split())
    cjk = sum("\u3400" <= char <= "\u9fff" for char in text)
    return words >= 3 or cjk >= 6 or bool(source.get("phrase_boundary") or source.get("sentence_boundary")) or text.rstrip().endswith((".", "!", "?", "。", "！", "？"))
