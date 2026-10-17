"""Pinned Qwen3-ASR llama.cpp GGUF weights and their matching audio projectors."""
from __future__ import annotations

from .manager import FileEntry, ModelSpec

QWEN3_ASR_0_6B_GGUF_Q4_K_M = ModelSpec(
    "qwen3-asr-0.6b-gguf-q4-k-m", "qwen3-asr-0.6b-gguf-q4-k-m", "mradermacher/Qwen3-ASR-0.6B-GGUF", "6cf166e9f1c5bd2521108e3410ee5358de5eabab",
    (
        FileEntry("Qwen3-ASR-0.6B.Q4_K_M.gguf", 484216288, "40d27969c614b4492f330baa41fcc8d00e25264aebbe3f16eaf5e4bd5af35cd5"),
        FileEntry("Qwen3-ASR-0.6B.mmproj-Q8_0.gguf", 214392608, "0138afe958883431cffc177cbb24b2ec2f2f56c2766d2cf7f02157d707b684ad"),
    ),
)

QWEN3_ASR_1_7B_GGUF_Q4_K_M = ModelSpec(
    "qwen3-asr-1.7b-gguf-q4-k-m", "qwen3-asr-1.7b-gguf-q4-k-m", "slyusarev/Qwen3-ASR-1.7B-GGUF", "3f45ea4f5f84f3159a561c9ece8063d56e740648",
    (
        FileEntry("Qwen3-ASR-1.7B-Q4_K_M.gguf", 1282435008, "f53b45df729c90a182612b759227daa9bb72139b012a87e558dd6c204d486ae9"),
        FileEntry("mmproj-Qwen3-ASR-1.7B-Q8_0.gguf", 355709344, "46c1d533af3f354ceb37ce855dbceff7da7fa7cf1e6a523df3b13440bd164c0d"),
    ),
)

QWEN3_ASR_0_6B_GGUF_Q8_0 = ModelSpec(
    "qwen3-asr-0.6b-gguf-q8-0", "qwen3-asr-0.6b-gguf-q8-0", "ggml-org/Qwen3-ASR-0.6B-GGUF", "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
    (
        FileEntry("Qwen3-ASR-0.6B-Q8_0.gguf", 804749248, "bca259818b50ca7c4c05e9bdb35a5dc04fa039653a6d6f3f0f331f96f6aa1971"),
        FileEntry("mmproj-Qwen3-ASR-0.6B-Q8_0.gguf", 214392480, "41a342b5e4c514e968cb756de6cd1b7be39eff43c44c57a2ef5fc6522e36603d"),
    ),
)

QWEN3_ASR_0_6B_GGUF_BF16 = ModelSpec(
    "qwen3-asr-0.6b-gguf-bf16", "qwen3-asr-0.6b-gguf-bf16", "ggml-org/Qwen3-ASR-0.6B-GGUF", "928ab958557df9aa2ef1c93e0e83c7ad0933fae2",
    (
        FileEntry("Qwen3-ASR-0.6B-bf16.gguf", 1509343168, "12b2894d9a7c98cd8f26670f5a47ab738f42bcc98df21e109be493870c71ba50"),
        FileEntry("mmproj-Qwen3-ASR-0.6B-bf16.gguf", 378575520, "dae36c855f9a82a8916bea2238b24bda69a39d8da8b2f46dee7c103775656039"),
    ),
)

QWEN3_ASR_1_7B_GGUF_Q8_0 = ModelSpec(
    "qwen3-asr-1.7b-gguf-q8-0", "qwen3-asr-1.7b-gguf-q8-0", "ggml-org/Qwen3-ASR-1.7B-GGUF", "36a678687ba7d07a74ca70ccb0e36902e005fb80",
    (
        FileEntry("Qwen3-ASR-1.7B-Q8_0.gguf", 2165034944, "58e22d0532d4eacaf034cfac17a6fed159f37c41390c710186783be439d1fc57"),
        FileEntry("mmproj-Qwen3-ASR-1.7B-Q8_0.gguf", 355709344, "46c1d533af3f354ceb37ce855dbceff7da7fa7cf1e6a523df3b13440bd164c0d"),
    ),
)

QWEN3_ASR_1_7B_GGUF_BF16 = ModelSpec(
    "qwen3-asr-1.7b-gguf-bf16", "qwen3-asr-1.7b-gguf-bf16", "ggml-org/Qwen3-ASR-1.7B-GGUF", "36a678687ba7d07a74ca70ccb0e36902e005fb80",
    (
        FileEntry("Qwen3-ASR-1.7B-bf16.gguf", 4069674944, "1af18763dfafde2bbf071ef8a0952f7bee66f140c3565e5ccc5afb07dc1f9227"),
        FileEntry("mmproj-Qwen3-ASR-1.7B-bf16.gguf", 641773984, "8882e9ddab3186f9aa71b1417c847177913e1466655ac944cf86e9b846735d62"),
    ),
)

QWEN3_ASR_GGUF_SPECS = (
    QWEN3_ASR_0_6B_GGUF_Q4_K_M,
    QWEN3_ASR_1_7B_GGUF_Q4_K_M,
    QWEN3_ASR_0_6B_GGUF_Q8_0,
    QWEN3_ASR_0_6B_GGUF_BF16,
    QWEN3_ASR_1_7B_GGUF_Q8_0,
    QWEN3_ASR_1_7B_GGUF_BF16,
)
