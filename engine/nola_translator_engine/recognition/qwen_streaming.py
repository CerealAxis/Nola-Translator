"""Qwen streaming caption assembly: the official unfixed_chunk_num=2 prefix-rollback tier."""

from __future__ import annotations

from pathlib import Path

from .qwen_runtime import QwenRuntime, get_qwen_runtime
from .streaming import StreamingRecognizer
from .volume_gate import VolumeGateSegmenter

# The official streaming example lets the first blocks start free, then continues from a
# 5-token rollback on every later block.
UNFIXED_CHUNK_NUM = 2
ROLLBACK_TOKENS = 5


def _prefix_builder(runtime: QwenRuntime):
    def build(text: str) -> str | None:
        return runtime.rollback_text(text, ROLLBACK_TOKENS) or None

    return build


def create_qwen_recognizer(
    model_dir: Path, *, source_language: str | None = None, runtime: QwenRuntime | None = None
) -> StreamingRecognizer:
    """Build the Qwen streaming recognizer; the model loads lazily on the first job's thread.

    Load failures (ModelUnavailable) surface from accept()/flush(), where runtime.py maps
    them to a modelUnavailable error event.
    """
    runtime = runtime or get_qwen_runtime(model_dir)
    if Path(model_dir).name == "qwen3-asr-0.6b-hf":
        return StreamingRecognizer(
            runtime,
            source_language=source_language,
            segmenter=VolumeGateSegmenter(max_segment_ms=6000),
            block_ms=3000,
            prefix_builder=_prefix_builder(runtime),
            prefix_after_blocks=UNFIXED_CHUNK_NUM,
        )
    return StreamingRecognizer(
        runtime,
        source_language=source_language,
        prefix_builder=_prefix_builder(runtime),
        prefix_after_blocks=UNFIXED_CHUNK_NUM,
    )
