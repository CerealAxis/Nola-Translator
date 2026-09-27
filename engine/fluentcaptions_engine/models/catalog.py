"""本地模型目录：钉死 HuggingFace revision 与逐文件校验值（取值见 spec S4）。"""

from __future__ import annotations

from .manager import FileEntry, ModelSpec


# Qwen3-ASR 1.7B 原始 BF16 权重快照；加载时以 NF4 4-bit 量化运行。
QWEN3_ASR_1_7B_HF = ModelSpec(
    model_id="qwen3-asr-1.7b-hf",
    directory="qwen3-asr-1.7b-hf",
    repo="Qwen/Qwen3-ASR-1.7B-hf",
    revision="bcd2b5b7f32b480ab5790554cfa8347f246a14f3",
    files=(
        FileEntry(
            ".gitattributes",
            1_570,
            "34448b82c17d60fec9b65b1f093c115ddbaadc04beb1b0140b6bfed2e012a930",
        ),
        FileEntry(
            "README.md",
            16_538,
            "427b9a6a4a32477e9df8790ef92f5cbcde790ee148ee5dd8c36f77d9556998a2",
        ),
        FileEntry(
            "chat_template.jinja",
            1_434,
            "f50e6b694fbf4a683206e37869990d68333fe95d285730f084c838a34b0d98c2",
        ),
        FileEntry(
            "config.json",
            2_399,
            "117ac8e63e2af7cae3665e5a632d6eb03f5f384915519ceb6403c15ec6533f63",
        ),
        FileEntry(
            "generation_config.json",
            165,
            "9939fc9388b79bd70757f938b87381e817173d6a6158f5af6506c0b73e775c3c",
        ),
        FileEntry(
            "model.safetensors",
            4_076_193_080,
            "2db53c7d81bd9b8cbc6a074e89be2c968a0d373fb4ee68bb1b1e14f7042dfee1",
        ),
        FileEntry(
            "processor_config.json",
            487,
            "bc0b230081b44e629dd5b9045b78495615c1831b4b9f4cffe97bd37e82a6156a",
        ),
        FileEntry(
            "tokenizer.json",
            11_429_653,
            "fe1fad59be22a41ee293363fcf95fdedbc7c93f3b49270b1d2e18bd1399a7a05",
        ),
        FileEntry(
            "tokenizer_config.json",
            998,
            "945e980986de2ca7768f3326bfdbb4fbea3406f972b8ae0be233089f2b253c11",
        ),
    ),
)


# Hy-MT2 1.8B 预量化 Q4_K_M 单文件；由内置 llama.cpp 在本机运行。
HYMT2_1_8B_Q4_K_M = ModelSpec(
    model_id="hy-mt2-1.8b-q4-k-m",
    directory="hy-mt2-1.8b-q4-k-m",
    repo="tencent/Hy-MT2-1.8B-GGUF",
    revision="a0c709d9fac510f2c807aa3af52872340dc37a4a",
    files=(
        FileEntry(
            "Hy-MT2-1.8B-Q4_K_M.gguf",
            1_133_080_448,
            "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
        ),
    ),
)
