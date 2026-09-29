"""Local model catalog: pinned HuggingFace revisions with a checksum per file."""

from __future__ import annotations

from .manager import FileEntry, ModelSpec


# Qwen3-ASR 1.7B: BF16 weights on disk, run NF4 4-bit quantized in memory.
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


# Qwen3-ASR 0.6B, loaded through the same AutoProcessor +
# Qwen3ASRForConditionalGeneration path as 1.7B. The -hf repo is mandatory:
# Qwen/Qwen3-ASR-0.6B ships the thinker layout (thinker_config in config, thinker.
# prefixed weight keys, WhisperFeatureExtractor), whose keys and n_window padding do
# not line up with transformers qwen3_asr — from_pretrained silently loads none of them.
QWEN3_ASR_0_6B_HF = ModelSpec(
    model_id="qwen3-asr-0.6b-hf",
    directory="qwen3-asr-0.6b-hf",
    repo="Qwen/Qwen3-ASR-0.6B-hf",
    revision="7f1569a48a89f3e3f4dc3a5c9d28bddd903bc76c",
    files=(
    FileEntry(
        ".gitattributes",
        1570,
        "34448b82c17d60fec9b65b1f093c115ddbaadc04beb1b0140b6bfed2e012a930",
    ),
    FileEntry(
        "README.md",
        16538,
        "742006d0f99ce6475b1c5e7b66e4a2f166cce836dd7ce3d7f20707252859195a",
    ),
    FileEntry(
        "chat_template.jinja",
        1434,
        "f50e6b694fbf4a683206e37869990d68333fe95d285730f084c838a34b0d98c2",
    ),
    FileEntry(
        "config.json",
        2398,
        "9eecf6f1b383e343889c2e6010e632590fa57d4bc678e151c7d6a160a0dfb04a",
    ),
    FileEntry(
        "generation_config.json",
        165,
        "9939fc9388b79bd70757f938b87381e817173d6a6158f5af6506c0b73e775c3c",
    ),
    FileEntry(
        "model.safetensors",
        1564928088,
        "d3f212dd20abecd315d830bc54ae3865e56ebfc3276484e57b771288ba27fd35",
    ),
    FileEntry(
        "processor_config.json",
        487,
        "bc0b230081b44e629dd5b9045b78495615c1831b4b9f4cffe97bd37e82a6156a",
    ),
    FileEntry(
        "tokenizer.json",
        11429653,
        "fe1fad59be22a41ee293363fcf95fdedbc7c93f3b49270b1d2e18bd1399a7a05",
    ),
    FileEntry(
        "tokenizer_config.json",
        998,
        "945e980986de2ca7768f3326bfdbb4fbea3406f972b8ae0be233089f2b253c11",
    ),
    ),
)


# SenseVoiceSmall: non-autoregressive, loaded by funasr from the local snapshot dir.
# Only the 4 files the runtime needs (configuration.json declares init_param / config /
# tokenizer_conf.bpemodel / frontend_conf.cmvn_file) plus README. The repo's
# requirements.txt is deliberately left out: funasr pip-installs it under
# trust_remote_code=True, and it pins numpy<=1.26.4, which would clobber our own pin.
SENSEVOICE_SMALL = ModelSpec(
    model_id="sensevoice-small",
    directory="sensevoice-small",
    repo="FunAudioLLM/SenseVoiceSmall",
    revision="3847d57b6bdf2dd8875cb1508d2af43d80a16bf7",
    files=(
        FileEntry(
            "README.md",
            11_952,
            "6add90487ea3d685b6604ad0932b565fc5cf7e9daaf8aebc674de49da4560958",
        ),
        FileEntry(
            "am.mvn",
            11_203,
            "29b3c740a2c0cfc6b308126d31d7f265fa2be74f3bb095cd2f143ea970896ae5",
        ),
        FileEntry(
            "chn_jpn_yue_eng_ko_spectok.bpe.model",
            377_341,
            "aa87f86064c3730d799ddf7af3c04659151102cba548bce325cf06ba4da4e6a8",
        ),
        FileEntry(
            "config.yaml",
            1_855,
            "f71e239ba36705564b5bf2d2ffd07eece07b8e3f2bbf6d2c99d8df856339ac19",
        ),
        FileEntry(
            "configuration.json",
            396,
            "02810a7f8e9e8aee10370a265f7e799728ce25b4c00cdbf4602b303ee395a38e",
        ),
        FileEntry(
            "model.pt",
            936_291_369,
            "833ca2dcfdf8ec91bd4f31cfac36d6124e0c459074d5e909aec9cabe6204a3ea",
        ),
    ),
)


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


# unsloth's Hy-MT2 1.8B quantizations (importance-matrix calibrated). All are standard
# llama.cpp quant types readable straight from the official release, and the three tiers
# measure at nearly the same speed (0.15~0.18s/sentence), so the only trade-off is size
# versus terminology retention: Q3_K_M is steadiest on proper nouns (Genshin Impact,
# Pro), UD-IQ2_M is the smallest but flattens them to literal meaning.
_UNSLOTH_HYMT2_REPO = "unsloth/Hy-MT2-1.8B-GGUF"
_UNSLOTH_HYMT2_REVISION = "0378cc2780f462f0fd397d0cdd244d2f769de40e"

HYMT2_1_8B_Q3_K_M = ModelSpec(
    model_id="hy-mt2-1.8b-q3-k-m",
    directory="hy-mt2-1.8b-q3-k-m",
    repo=_UNSLOTH_HYMT2_REPO,
    revision=_UNSLOTH_HYMT2_REVISION,
    files=(
        FileEntry(
            "Hy-MT2-1.8B-Q3_K_M.gguf",
            951_022_560,
            "d843f052e1adb61197156f534099cf9fb58353af7cc30999a2f1f717819936b8",
        ),
    ),
)

HYMT2_1_8B_IQ2_M = ModelSpec(
    model_id="hy-mt2-1.8b-iq2-m",
    directory="hy-mt2-1.8b-iq2-m",
    repo=_UNSLOTH_HYMT2_REPO,
    revision=_UNSLOTH_HYMT2_REVISION,
    files=(
        FileEntry(
            "Hy-MT2-1.8B-UD-IQ2_M.gguf",
            722_666_176,
            "9936b5ba66523f100f18604232d88acb4b44f3c9e26eab3f0f9113d44514d0f0",
        ),
    ),
)


# M2M100 418M many-to-many translation model; the official repo ships only
# pytorch_model.bin, and the tokenizer is sentencepiece.
M2M100_418M = ModelSpec(
    model_id="m2m100-418m",
    directory="m2m100-418m",
    repo="facebook/m2m100_418M",
    revision="55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636",
    files=(
        FileEntry(
            ".gitattributes",
            690,
            "98cf30ae2568ea1d18641cc0d1d9a2f9041cc43aea81f5d719654abd9e290e0d",
        ),
        FileEntry(
            "README.md",
            4_603,
            "1fd660f130aedc5ecf1796b47ab47d43d3c4b36541f5387b7adb3df75cb5dfdb",
        ),
        FileEntry(
            "config.json",
            908,
            "df0ae43e4e4b0d7e3c97b7f447857a70ef6b6a2aa1f145cedbcc730d95f67134",
        ),
        FileEntry(
            "generation_config.json",
            233,
            "aed76366507333ddbb8bd49960f23c82fe6446b3319a46a54befdb45324ccf61",
        ),
        FileEntry(
            "pytorch_model.bin",
            1_935_796_948,
            "d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1",
        ),
        FileEntry(
            "sentencepiece.bpe.model",
            2_423_393,
            "d8f7c76ed2a5e0822be39f0a4f95a55eb19c78f4593ce609e2edbc2aea4d380a",
        ),
        FileEntry(
            "special_tokens_map.json",
            1_140,
            "c1a4f86c3874d279ae1b2a05162858db5dd6c61665d84223ed886cbcff08fda6",
        ),
        FileEntry(
            "tokenizer_config.json",
            298,
            "a53e6aa83da0b82565ed90c3849056307a9453843322ac5b8439ec4b9497fe48",
        ),
        FileEntry(
            "vocab.json",
            3_708_092,
            "b6e77e474aeea8f441363aca7614317c06381f3eacfe10fb9856d5081d1074cc",
        ),
    ),
)
