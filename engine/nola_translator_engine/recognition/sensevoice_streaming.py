"""SenseVoiceSmall streaming caption assembly: whole-segment re-transcription, no prefix continuation."""

from __future__ import annotations

from pathlib import Path

from .sensevoice_runtime import get_sensevoice_runtime
from .streaming import StreamingRecognizer
from .volume_gate import SileroVadSegmenter


def create_sensevoice_recognizer(
    model_dir: Path, *, source_language: str | None = None, runtime=None,
    max_segment_ms: int = 10000, silence_end_ms: int = 800
) -> StreamingRecognizer:
    """Build the SenseVoice streaming recognizer; the model loads lazily on the first job's thread.

    No ``prefix_builder``: a non-autoregressive model re-transcribes the whole accumulated
    audio on every block. Silence still does the segmenting, and only continuous speech past
    the configured limit is force-split, which bounds final-caption latency and cumulative re-transcription cost.
    Load failures (SenseVoiceModelUnavailable) surface from accept()/flush().
    """
    return StreamingRecognizer(
        runtime or get_sensevoice_runtime(model_dir),
        source_language=source_language,
        segmenter=SileroVadSegmenter(max_segment_ms=max_segment_ms, silence_end_ms=silence_end_ms),
        block_ms=1200,
        first_block_ms=600,
    )
