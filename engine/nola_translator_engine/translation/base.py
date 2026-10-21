from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Literal, Protocol


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
