from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Literal, Protocol

from ..model_capabilities import normalize


def revision_context(text: str) -> dict[str, str] | None:
    """Recognize the bounded revision envelope without interpreting ordinary transcripts."""
    if not text.lstrip().startswith('{'):
        return None
    try:
        value = json.loads(text)
    except ValueError:
        return None
    keys = {'previousSource', 'previousTranslation', 'currentSource'}
    if (isinstance(value, dict) and value.keys() == keys
            and all(isinstance(item, str) and item.strip() for item in value.values())):
        return value
    return None


def compares_by_character(language: str) -> bool:
    """Whether two texts of this language are compared character by character.

    Chinese and Japanese are written without word separators, so a character is the
    smallest unit a reader can tell apart. The target language decides the granularity:
    a Chinese translation of English speech is still compared character by character.
    """
    return normalize(language) in {'zh', 'zh-Hant', 'ja'}


def split_common_prefix(left: str, right: str, language: str) -> tuple[str, str, str]:
    """Split two texts at the first unit where they differ.

    Returns the shared part, the rest of `left` and the rest of `right`. The shared part
    always ends on a unit boundary, so a confirmed prefix never holds half a word.
    """
    if compares_by_character(language):
        index = 0
        for first, second in zip(left, right):
            if first != second:
                break
            index += 1
        return left[:index], left[index:], right[index:]
    left_words = left.split()
    right_words = right.split()
    index = 0
    for first, second in zip(left_words, right_words):
        if first != second:
            break
        index += 1
    return ' '.join(left_words[:index]), ' '.join(left_words[index:]), ' '.join(right_words[index:])


def join_text(base: str, addition: str, language: str) -> str:
    """Append `addition` to `base` without losing the separator between them.

    Comparing by word drops the whitespace that separated two words, so a target that is
    not written without separators needs a space put back where the two sides meet
    without one.
    """
    if not base:
        return addition
    if not addition:
        return base
    if compares_by_character(language) or base[-1].isspace() or addition[0].isspace():
        return base + addition
    return f"{base} {addition}"


@dataclass(frozen=True, slots=True)
class ProviderTranslation:
    text: str
    path: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ScheduledTranslation:
    target_language: str
    state: Literal["pending", "complete", "failed"]
    provider: str
    text: str | None = None
    error_code: str | None = None
    path: tuple[str, ...] = ()


class TranslationProvider(Protocol):
    name: str

    async def translate(
        self, text: str, source: str, target: str
    ) -> ProviderTranslation: ...
