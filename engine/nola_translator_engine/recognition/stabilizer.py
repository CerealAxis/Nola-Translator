"""Caption revisions, final-sentence normalization, and adjacent-duplicate suppression."""

from __future__ import annotations

from difflib import SequenceMatcher
import re
import unicodedata

from .base import RecognitionUpdate


_ENGLISH_TERMINAL_PUNCTUATION = (".", "?", "!", "…")
_ENGLISH_NAMES = {
    "ai": "AI",
    "api": "API",
    "amazon": "Amazon",
    "chatgpt": "ChatGPT",
    "cpu": "CPU",
    "gpu": "GPU",
    "i": "I",
    "microsoft": "Microsoft",
    "nasa": "NASA",
    "openai": "OpenAI",
    "uk": "UK",
    "usa": "USA",
    "windows": "Windows",
    "youtube": "YouTube",
}


def _looks_english(text: str, language: str | None) -> bool:
    if language is not None:
        return language.split("-")[0].casefold() == "en"
    letters = [character for character in text if character.isalpha()]
    return bool(letters) and all(character.isascii() for character in letters)


def _format_caption_text(text: str, language: str | None, is_final: bool) -> str:
    normalized = unicodedata.normalize("NFKC", text).strip()
    if not normalized or not _looks_english(normalized, language):
        return normalized

    letters = [character for character in normalized if character.isalpha()]
    uppercase_ratio = (
        sum(character.isupper() for character in letters) / len(letters)
        if letters
        else 0.0
    )
    if len(letters) >= 4 and uppercase_ratio >= 0.8:
        normalized = normalized.lower()
        normalized = re.sub(
            r"\b[a-z][a-z0-9]*\b",
            lambda match: _ENGLISH_NAMES.get(match.group(0), match.group(0)),
            normalized,
        )
        first_letter = next(
            (index for index, character in enumerate(normalized) if character.isalpha()),
            None,
        )
        if first_letter is not None:
            normalized = (
                normalized[:first_letter]
                + normalized[first_letter].upper()
                + normalized[first_letter + 1 :]
            )

    if is_final and not normalized.endswith(_ENGLISH_TERMINAL_PUNCTUATION):
        normalized += "."
    return normalized


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
        normalized = _format_caption_text(text, language or self.language, is_final)
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
    """Suppress adjacent finals that overlap in time and read almost identically, as
    happens after a device reconnect.
    """

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
