"""Local agreement for revisable ASR snapshots within one open segment."""

from collections import deque
from dataclasses import dataclass
from os.path import commonprefix
import unicodedata

from .gateway.operations import AsrObservation


def _word_character(character: str) -> bool:
    return character.isalnum() or unicodedata.category(character).startswith("M")


def _unspaced(character: str) -> bool:
    return unicodedata.name(character, "").startswith((
        "CJK ", "HIRAGANA ", "KATAKANA ", "HANGUL ",
    ))


def _token_boundary(texts: list[str], end: int) -> bool:
    left = texts[-1][end - 1]
    for text in texts:
        if end == len(text):
            continue
        right = text[end]
        if unicodedata.category(right).startswith("M") or right == "\u200d" or left == "\u200d":
            return False
        if _word_character(left) and _word_character(right) and not (
            _unspaced(left) or _unspaced(right)
        ):
            return False
    return True


@dataclass(frozen=True, slots=True)
class SourceSnapshot:
    revision: int
    text: str
    stable_end: int
    committed: bool = False


class SourceAgreement:
    """Tracks audio-backed agreement and permits rollback before finalization."""

    def __init__(self) -> None:
        self._votes: deque[tuple[int, str]] = deque(maxlen=4)
        self._last_watermark = -1
        self.snapshot = SourceSnapshot(0, "", 0)

    def observe(self, observation: AsrObservation, watermark: int) -> SourceSnapshot:
        if self.snapshot.committed or watermark <= self._last_watermark:
            return self.snapshot
        self._last_watermark = watermark
        text = observation.text.strip()
        if not self._votes or watermark - self._votes[-1][0] >= 2_560:
            self._votes.append((watermark, text))
        stable_end = 0
        if len(self._votes) >= 3:
            votes = list(self._votes)
            if len(votes) == 4 and watermark - votes[1][0] >= 6_400:
                votes.pop(0)
        else:
            votes = []
        if votes and watermark - votes[0][0] >= 6_400:
            hypotheses = [vote for _, vote in votes] + [text]
            end = len(commonprefix(hypotheses))
            if observation.words:
                timed_prefix = ""
                for word, _, end_ms in observation.words:
                    if end_ms * 16 > watermark - 8_000:
                        break
                    offset = text.find(word, len(timed_prefix))
                    if offset < 0 or text[len(timed_prefix):offset].strip():
                        break
                    timed_prefix = text[:offset + len(word)]
                end = min(end, len(timed_prefix))
            while end and not _token_boundary(hypotheses, end):
                end -= 1
            stable_end = len(text[:end].rstrip())
        return self._update(text, stable_end, committed=False)

    def commit(self, text: str) -> SourceSnapshot:
        if self.snapshot.committed:
            return self.snapshot
        text = text.strip()
        return self._update(text, len(text), committed=True)

    def _update(self, text: str, stable_end: int, *, committed: bool) -> SourceSnapshot:
        previous = self.snapshot
        if (text, stable_end, committed) != (previous.text, previous.stable_end, previous.committed):
            self.snapshot = SourceSnapshot(previous.revision + 1, text, stable_end, committed)
        return self.snapshot
