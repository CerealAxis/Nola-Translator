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


def streaming_config(model_directory: Path) -> SherpaModelConfig:
    return SherpaModelConfig(
        tokens=str(model_directory / "tokens.txt"),
        encoder=str(model_directory / "encoder-epoch-99-avg-1.int8.onnx"),
        decoder=str(model_directory / "decoder-epoch-99-avg-1.onnx"),
        joiner=str(model_directory / "joiner-epoch-99-avg-1.int8.onnx"),
    )
