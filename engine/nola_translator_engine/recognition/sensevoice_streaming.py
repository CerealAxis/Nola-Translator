"""SenseVoiceSmall 流式字幕装配：整段重转写，不带前缀续写。"""

from __future__ import annotations

from pathlib import Path

from .sensevoice_runtime import get_sensevoice_runtime
from .streaming import StreamingRecognizer


def create_sensevoice_recognizer(
    model_dir: Path, *, source_language: str | None = None
) -> StreamingRecognizer:
    """构造 SenseVoice 流式识别器；模型在首个 job 的线程中惰性加载。

    不传 ``prefix_builder``：非自回归模型每块都重转整段已累计音频。分块间隔比
    Qwen 档位更短，SenseVoice 推理开销小，短块能更快给出字幕刷新。
    加载失败（SenseVoiceModelUnavailable）会从 accept()/flush() 抛出。
    """
    return StreamingRecognizer(
        get_sensevoice_runtime(model_dir),
        source_language=source_language,
        block_ms=1000,
    )
