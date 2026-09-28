"""Qwen 流式字幕装配：官方 unfixed_chunk_num=2 的前缀回退档位。"""

from __future__ import annotations

from pathlib import Path

from .qwen_runtime import QwenRuntime, get_qwen_runtime
from .streaming import StreamingRecognizer
from .volume_gate import VolumeGateSegmenter

# 官方流式示例：前两块不带前缀让模型自由起始，之后每块回退末尾 5 个 token 续写。
UNFIXED_CHUNK_NUM = 2
ROLLBACK_TOKENS = 5


def _prefix_builder(runtime: QwenRuntime):
    def build(text: str) -> str | None:
        return runtime.rollback_text(text, ROLLBACK_TOKENS) or None

    return build


def create_qwen_recognizer(
    model_dir: Path, *, source_language: str | None = None
) -> StreamingRecognizer:
    """构造 Qwen 流式识别器；模型在首个 job 的线程中惰性加载。

    加载失败（ModelUnavailable）会从 accept()/flush() 抛出，由 runtime.py
    映射为 modelUnavailable 错误事件。
    """
    runtime = get_qwen_runtime(model_dir)
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
