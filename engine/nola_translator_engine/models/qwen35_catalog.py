"""Pinned small Qwen3.5 GGUF checkpoints for local llama.cpp inference."""
from __future__ import annotations

from .manager import FileEntry, ModelSpec


def _qwen35(size: str, hf_revision: str, hf_bytes: int, hf_sha256: str,
            modelscope_repo: str, modelscope_revision: str,
            modelscope_filename: str, modelscope_bytes: int,
            modelscope_sha256: str) -> ModelSpec:
    model_id = f"qwen35-{size.lower()}-q4-k-m"
    filename = f"Qwen3.5-{size}-Q4_K_M.gguf"
    return ModelSpec(
        model_id, model_id, f"unsloth/Qwen3.5-{size}-GGUF", hf_revision,
        (FileEntry(filename, hf_bytes, hf_sha256),),
        modelscope_repo=modelscope_repo,
        modelscope_revision=modelscope_revision,
        modelscope_files=(FileEntry(modelscope_filename, modelscope_bytes,
                                    modelscope_sha256),),
    )


QWEN35_SPECS = (
    _qwen35("0.8B", "6ab461498e2023f6e3c1baea90a8f0fe38ab64d0",
            532_517_120,
            "bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517",
            "unsloth/Qwen3.5-0.8B-GGUF", "88467eb7c8e3b6e7894c794f373050d4dbc6ae8a",
            "Qwen3.5-0.8B-Q4_K_M.gguf", 532_517_120,
            "bd258782e35f7f458f8aced1adc053e6e92e89bc735ba3be89d38a06121dc517"),
    _qwen35("2B", "f6d5376be1edb4d416d56da11e5397a961aca8ae",
            1_280_835_840,
            "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
            "unsloth/Qwen3.5-2B-GGUF", "90057e31161eb95cc0bc1413c4f53b44de9b49c8",
            "Qwen3.5-2B-Q4_K_M.gguf", 1_280_835_840,
            "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223"),
    _qwen35("4B", "e87f176479d0855a907a41277aca2f8ee7a09523",
            2_740_937_888,
            "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
            "unsloth/Qwen3.5-4B-GGUF", "167b4afc359863325cb4164418c715421b4e9118",
            "Qwen3.5-4B-Q4_K_M.gguf", 2_740_937_888,
            "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4"),
)

QWEN35_NAMES = {
    "qwen35-0.8b-q4-k-m": "Qwen3.5 0.8B Q4_K_M · llama.cpp",
    "qwen35-2b-q4-k-m": "Qwen3.5 2B Q4_K_M · llama.cpp",
    "qwen35-4b-q4-k-m": "Qwen3.5 4B Q4_K_M · llama.cpp",
}
