from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True, slots=True)
class ProviderTranslation:
    text: str
    path: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ScheduledTranslation:
    target_language: str
    state: Literal["complete", "failed"]
    provider: str
    text: str | None = None
    error_code: str | None = None
    path: tuple[str, ...] = ()


class TranslationProvider(Protocol):
    name: str

    async def translate(
        self, text: str, source: str, target: str
    ) -> ProviderTranslation: ...
