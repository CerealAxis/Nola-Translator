"""SenseVoiceSmall streaming caption assembly: whole-segment re-transcription, no prefix continuation."""

from __future__ import annotations

from pathlib import Path

from .sensevoice_runtime import get_sensevoice_runtime
from .streaming import StreamingRecognizer
from .volume_gate import VolumeGateSegmenter


def create_sensevoice_recognizer(
    model_dir: Path, *, source_language: str | None = None
) -> StreamingRecognizer:
    """Build the SenseVoice streaming recognizer; the model loads lazily on the first job's thread.

    No ``prefix_builder``: a non-autoregressive model re-transcribes the whole accumulated
    audio on every block. Silence still does the segmenting, and only continuous speech past
    12 s is force-split, which bounds the cost of re-transcribing the whole segment.
    Load failures (SenseVoiceModelUnavailable) surface from accept()/flush().
    """
    return StreamingRecognizer(
        get_sensevoice_runtime(model_dir),
        source_language=source_language,
        segmenter=VolumeGateSegmenter(max_segment_ms=12000),
        block_ms=1200,
        first_block_ms=600,
    )
