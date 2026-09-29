"""Shared recognizer contracts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

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


class ModelUnavailable(RuntimeError):
    """Recognition model unavailable: directory missing or weights failed to load;
    runtime.py maps this to modelUnavailable.
    """


class Recognizer(Protocol):
    async def accept(self, frame: AudioFrame) -> list[RecognitionUpdate]: ...
    async def flush(self, ended_at_ms: float) -> list[RecognitionUpdate]: ...
    async def close(self) -> None: ...


class Transcriber(Protocol):
    """The minimal model interface the streaming scheduler depends on."""

    @property
    def loaded(self) -> bool: ...

    def transcribe(
        self,
        samples: NDArray[np.float32],
        *,
        prefix: str | None = None,
        language: str | None = None,
    ) -> tuple[str, str | None]: ...
