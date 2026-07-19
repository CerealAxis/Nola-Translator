"""字幕 revision、最终句规范化和相邻重复抑制。"""

from __future__ import annotations

from difflib import SequenceMatcher
import re
import unicodedata

from .base import RecognitionUpdate


class RecognitionStabilizer:
    def __init__(self, segment_id: str, started_at_ms: float) -> None:
        self.segment_id = segment_id
        self.started_at_ms = started_at_ms
        self.revision = -1
        self.last_text = ""
        self.language: str | None = None
        self.finalized = False

    def update(
        self,
        text: str,
        *,
        language: str | None,
        is_final: bool,
        ended_at_ms: float | None = None,
    ) -> RecognitionUpdate | None:
        if self.finalized:
            return None
        normalized = unicodedata.normalize("NFKC", text).strip() if is_final else text.strip()
        if not normalized:
            return None
        if normalized == self.last_text and not is_final:
            return None

        self.revision += 1
        self.last_text = normalized
        self.language = language or self.language
        self.finalized = is_final
        return RecognitionUpdate(
            segment_id=self.segment_id,
            revision=self.revision,
            started_at_ms=self.started_at_ms,
            ended_at_ms=ended_at_ms if is_final else None,
            source_text=normalized,
            language=self.language,
            is_final=is_final,
        )

    def flush(self, ended_at_ms: float) -> RecognitionUpdate | None:
        if self.finalized or not self.last_text:
            return None
        return self.update(
            self.last_text,
            language=self.language,
            is_final=True,
            ended_at_ms=ended_at_ms,
        )


class FinalTranscriptDeduplicator:
    """抑制设备重连后时间重叠且文本高度相似的相邻 final。"""

    def __init__(self, similarity_threshold: float = 0.9) -> None:
        self.similarity_threshold = similarity_threshold
        self.previous: RecognitionUpdate | None = None

    @staticmethod
    def _comparison_text(text: str) -> str:
        normalized = unicodedata.normalize("NFKC", text).casefold()
        return re.sub(r"[^\w]+", "", normalized, flags=re.UNICODE)

    def accept(self, update: RecognitionUpdate | None) -> bool:
        if update is None or not update.is_final:
            return False
        previous = self.previous
        self.previous = update
        if previous is None:
            return True
        overlaps = (
            previous.ended_at_ms is not None
            and update.started_at_ms <= previous.ended_at_ms
        )
        if not overlaps:
            return True
        before = self._comparison_text(previous.source_text)
        current = self._comparison_text(update.source_text)
        if not before or not current:
            return True
        similarity = SequenceMatcher(None, before, current).ratio()
        return similarity < self.similarity_threshold
