"""首版内置模型目录。模型文件由资源页显式下载，不进入安装包。"""

from __future__ import annotations

from pathlib import Path

from .manager import ModelSpec
from ..recognition.sherpa_streaming import SherpaModelConfig


STREAMING_ZH_EN_SMALL = ModelSpec(
    model_id="sherpa-zh-en-small",
    url=(
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
        "sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16.tar.bz2"
    ),
    archive_size=458_187_351,
    archive_md5="5ab35aee5f885f6f80ce3a39fd2a7b3e",
    directory="sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16",
    required_files=(
        "tokens.txt",
        "encoder-epoch-99-avg-1.int8.onnx",
        "decoder-epoch-99-avg-1.onnx",
        "joiner-epoch-99-avg-1.int8.onnx",
    ),
)


# SenseVoiceSmall：中文、粤语、英语、日语、韩语。GitHub release 提供 SHA-256 摘要，
# ModelManager 会校验下载大小、摘要以及解压后的 tokens/model 文件。
SENSEVOICE_SMALL = ModelSpec(
    model_id="sensevoice-small",
    url=(
        "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
        "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2"
    ),
    archive_size=163_002_883,
    archive_md5=None,
    directory="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
    required_files=("tokens.txt", "model.int8.onnx"),
    archive_sha256="7d1efa2138a65b0b488df37f8b89e3d91a60676e416f515b952358d83dfd347e",
)


def streaming_config(model_directory: Path) -> SherpaModelConfig:
    return SherpaModelConfig(
        tokens=str(model_directory / "tokens.txt"),
        encoder=str(model_directory / "encoder-epoch-99-avg-1.int8.onnx"),
        decoder=str(model_directory / "decoder-epoch-99-avg-1.onnx"),
        joiner=str(model_directory / "joiner-epoch-99-avg-1.int8.onnx"),
    )
