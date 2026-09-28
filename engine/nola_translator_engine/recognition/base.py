"""识别器共享契约。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from ..audio.resample import AudioFrame


@dataclass(frozen=True, slots=True)
class RecognitionUpdate:
    segment_id: str
    revision: int
    started_at_ms: float
    ended_at_ms: float | None
    source_text: str
    language: str | None
    is_final: bool


class Recognizer(Protocol):
    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]: ...
    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]: ...
    async def close(self) -> None: ...
