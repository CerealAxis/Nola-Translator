"""Local model catalog: independent pinned Hugging Face and ModelScope file manifests."""

from __future__ import annotations

from .manager import FileEntry, ModelSpec

# ModelScope metadata source: https://www.modelscope.cn/api/v1/models/{repo}/repo/files
# Each manifest below was read again with Revision=<full commit>&Recursive=true;
# sizes and SHA-256 belong to that repository, including its non-weight files.

# Official GGUF Q4_K_M artifacts, pinned from Hugging Face's blobs API.
# Text captions do not need the separate mmproj vision weights.
# Source: https://huggingface.co/IndexTeam/Index-Translate-2B-GGUF (and 9B / 35B-A3B-preview).
INDEX_TRANSLATE_2B_Q4_K_M = ModelSpec(
    model_id="index-translate-2b-q4-k-m", directory="index-translate-2b-q4-k-m",
    repo="IndexTeam/Index-Translate-2B-GGUF", revision="3a0eca6ce931d88d00614d427ab3ed8ff0743902",
    modelscope_repo="IndexTeam/Index-Translate-2B-GGUF",
    files=(FileEntry("Index-Translate-2B.Q4_K_M.gguf", 1_312_164_352,
        "044b313d29342bd3b2c77cbb64023ca0d209bd9b3247763f9d162767ef2d746a"),),
    modelscope_revision="b92a7c7bf499a6f05da1a66fab8549da3de5b603",
    modelscope_files=(
        FileEntry("Index-Translate-2B.Q4_K_M.gguf", 1_312_164_352,
            "044b313d29342bd3b2c77cbb64023ca0d209bd9b3247763f9d162767ef2d746a"),
    ),
)
INDEX_TRANSLATE_9B_Q4_K_M = ModelSpec(
    model_id="index-translate-9b-q4-k-m", directory="index-translate-9b-q4-k-m",
    repo="IndexTeam/Index-Translate-9B-GGUF", revision="645939fbab839a656f1bc39975a872bc8ad749f8",
    modelscope_repo="IndexTeam/Index-Translate-9B-GGUF",
    files=(FileEntry("Index-Translate-9B.Q4_K_M.gguf", 5_780_090_304,
        "9cc6758b0007f4cbf42ea3400768cbff91ae74ef8d640e467158348426d33713"),),
    modelscope_revision="e97205e0e68986a643eab5ebfd75cebeb67234d0",
    modelscope_files=(
        FileEntry("Index-Translate-9B.Q4_K_M.gguf", 5_780_090_304,
            "9cc6758b0007f4cbf42ea3400768cbff91ae74ef8d640e467158348426d33713"),
    ),
)
INDEX_TRANSLATE_35B_A3B_Q4_K_M = ModelSpec(
    model_id="index-translate-35b-a3b-q4-k-m", directory="index-translate-35b-a3b-q4-k-m",
    repo="IndexTeam/Index-Translate-35B-A3B-preview-GGUF", revision="3319ce338363a181c6c20c06b7379063d9baf484",
    modelscope_repo="IndexTeam/Index-Translate-35B-A3B-preview-GGUF",
    files=(FileEntry("Index-Translate-35B-A3B-preview.Q4_K_M.gguf", 21_713_462_400,
        "7d803928b68110b64880206f79ccd18e209d11091a21c689ca9e369687cb93f6"),),
    modelscope_revision="91f6e204309d1808f3779d4a3822f8ce011785bb",
    modelscope_files=(
        FileEntry("Index-Translate-35B-A3B-preview.Q4_K_M.gguf", 21_713_462_400,
            "7d803928b68110b64880206f79ccd18e209d11091a21c689ca9e369687cb93f6"),
    ),
)

# Official PyTorch/Transformers snapshots. 2B variants share the same 150-language text
# capability, but use distinct resource IDs because their storage and loader differ from GGUF.
INDEX_TRANSLATE_2B_BF16 = ModelSpec(
    model_id="index-translate-2b-bf16", directory="index-translate-2b-bf16",
    repo="IndexTeam/Index-Translate-2B", revision="9bc08445315723eb9b77d1b93505915eb03c3f01",
    files=(
        FileEntry("config.json", 2_908, blob_sha1="d30a15be1bbfd610f58ad80f1fbeb6778f58a80f"),
        FileEntry("generation_config.json", 100, blob_sha1="cb2c8db5920c1c44e9854f3927eeb37d61a8ee63"),
        FileEntry("merges.txt", 3_353_259, blob_sha1="a494e019ca1502219fd0128658b979e5f05ae8e8"),
        FileEntry("model.safetensors", 4_548_216_776, "2f499211fe352913464be69365e2e5724f913051efb3ae2b6fd0fa617a4c0b60"),
        FileEntry("preprocessor_config.json", 390, blob_sha1="2ea84a437d448ff71b08df68fdd949d5cc4ebb64"),
        FileEntry("tokenizer.json", 12_807_196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16_712, blob_sha1="34e1f7a59c40a7a4197ce3dbb242b94dc5bef1dd"),
        FileEntry("video_preprocessor_config.json", 386, blob_sha1="37900b3ff9295e1aa7e211378466356b52e64e55"),
        FileEntry("vocab.json", 6_722_759, blob_sha1="0aa0ce0658d60ac4a5d609f4eadb0e8e43514176"),
    ),
)
INDEX_TRANSLATE_2B_FP8 = ModelSpec(
    model_id="index-translate-2b-fp8", directory="index-translate-2b-fp8",
    repo="IndexTeam/Index-Translate-2B-FP8", revision="e5f35a7f2d58ff91ef395128bebe3efcd01e4f62",
    files=(
        FileEntry("chat_template.jinja", 7_755, blob_sha1="0ef09f214eaa6d9bca297988afc1454b5827b2c7"),
        FileEntry("config.json", 8_100, blob_sha1="f9f3c37d0341baa60a2e8a98bda884c3ce8045bc"),
        FileEntry("generation_config.json", 113, blob_sha1="dbda49f51ba73ae994bb3b0b9806dfaa1305224e"),
        FileEntry("model.safetensors", 3_055_011_640, "6d7900f01ccd7315fa3ba5b478eb61140e2aa7e69161bad52696196d60391e98"),
        FileEntry("model.safetensors.index.json", 64_136, blob_sha1="b959f4b401c5b412e525c37904da46adf1f08bc4"),
        FileEntry("model_mtp.safetensors", 121_657_904, "78354d27683c4c72d81b55f44ba16b10a0aa40828f2a1e057344a9cef7f2f209"),
        FileEntry("processor_config.json", 1_221, blob_sha1="8438fb895445fc0863e7585e5168d5a8983e34b7"),
        FileEntry("recipe.yaml", 281, blob_sha1="56b89354d8e18349061376d06adf3799683baa86"),
        FileEntry("tokenizer.json", 19_989_325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1_127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)
INDEX_TRANSLATE_2B_FP4 = ModelSpec(
    model_id="index-translate-2b-fp4", directory="index-translate-2b-fp4",
    repo="IndexTeam/Index-Translate-2B-FP4", revision="bf49b475ce2b75307f4da835a9d2e06758a6f040",
    files=(
        FileEntry("chat_template.jinja", 7_755, blob_sha1="0ef09f214eaa6d9bca297988afc1454b5827b2c7"),
        FileEntry("config.json", 13_724, blob_sha1="8df0b9c3862ad605a72bcd4a23efb43a1cae497d"),
        FileEntry("generation_config.json", 113, blob_sha1="dbda49f51ba73ae994bb3b0b9806dfaa1305224e"),
        FileEntry("model.safetensors", 2_997_649_248, "c0c47a80c830cd52ad1651bfda0af0655408594184148fbea768c98726e1e11c"),
        FileEntry("model.safetensors.index.json", 74_102, blob_sha1="076883410081df9c3b46a69a9717e2ee15611597"),
        FileEntry("model_mtp.safetensors", 121_657_904, "78354d27683c4c72d81b55f44ba16b10a0aa40828f2a1e057344a9cef7f2f209"),
        FileEntry("recipe.yaml", 400, blob_sha1="3c1955a15e3abeb988e6855f9424a1f9a44c17e9"),
        FileEntry("tokenizer.json", 19_989_325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1_127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)


# Qwen3-ASR 1.7B: BF16 weights on disk, run NF4 4-bit quantized in memory.
QWEN3_ASR_1_7B_HF = ModelSpec(
    model_id="qwen3-asr-1.7b-hf",
    directory="qwen3-asr-1.7b-hf",
    repo="Qwen/Qwen3-ASR-1.7B-hf",
    modelscope_repo="Qwen/Qwen3-ASR-1.7B-hf",
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
    modelscope_revision="fbdf079ca130130ace97d61dde535b3bebada633",
    modelscope_files=(
        FileEntry(".gitattributes", 2_129,
            "0aefab68978f25d82421f2039b23711121eb624b23fac3376f941aab386c05be"),
        FileEntry("README.md", 16_538,
            "427b9a6a4a32477e9df8790ef92f5cbcde790ee148ee5dd8c36f77d9556998a2"),
        FileEntry("chat_template.jinja", 1_434,
            "f50e6b694fbf4a683206e37869990d68333fe95d285730f084c838a34b0d98c2"),
        FileEntry("config.json", 2_399,
            "117ac8e63e2af7cae3665e5a632d6eb03f5f384915519ceb6403c15ec6533f63"),
        FileEntry("generation_config.json", 165,
            "9939fc9388b79bd70757f938b87381e817173d6a6158f5af6506c0b73e775c3c"),
        FileEntry("model.safetensors", 4_076_193_080,
            "2db53c7d81bd9b8cbc6a074e89be2c968a0d373fb4ee68bb1b1e14f7042dfee1"),
        FileEntry("processor_config.json", 487,
            "bc0b230081b44e629dd5b9045b78495615c1831b4b9f4cffe97bd37e82a6156a"),
        FileEntry("tokenizer.json", 11_429_653,
            "fe1fad59be22a41ee293363fcf95fdedbc7c93f3b49270b1d2e18bd1399a7a05"),
        FileEntry("tokenizer_config.json", 998,
            "945e980986de2ca7768f3326bfdbb4fbea3406f972b8ae0be233089f2b253c11"),
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
    modelscope_repo="Qwen/Qwen3-ASR-0.6B-hf",
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
    modelscope_revision="005b749cd1566dc579fe0238316087e2fc1945c0",
    modelscope_files=(
        FileEntry(".gitattributes", 2_129,
            "0aefab68978f25d82421f2039b23711121eb624b23fac3376f941aab386c05be"),
        FileEntry("README.md", 16_538,
            "742006d0f99ce6475b1c5e7b66e4a2f166cce836dd7ce3d7f20707252859195a"),
        FileEntry("chat_template.jinja", 1_434,
            "f50e6b694fbf4a683206e37869990d68333fe95d285730f084c838a34b0d98c2"),
        FileEntry("config.json", 2_398,
            "9eecf6f1b383e343889c2e6010e632590fa57d4bc678e151c7d6a160a0dfb04a"),
        FileEntry("generation_config.json", 165,
            "9939fc9388b79bd70757f938b87381e817173d6a6158f5af6506c0b73e775c3c"),
        FileEntry("model.safetensors", 1_564_928_088,
            "d3f212dd20abecd315d830bc54ae3865e56ebfc3276484e57b771288ba27fd35"),
        FileEntry("processor_config.json", 487,
            "bc0b230081b44e629dd5b9045b78495615c1831b4b9f4cffe97bd37e82a6156a"),
        FileEntry("tokenizer.json", 11_429_653,
            "fe1fad59be22a41ee293363fcf95fdedbc7c93f3b49270b1d2e18bd1399a7a05"),
        FileEntry("tokenizer_config.json", 998,
            "945e980986de2ca7768f3326bfdbb4fbea3406f972b8ae0be233089f2b253c11"),
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
    modelscope_repo="iic/SenseVoiceSmall",
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
    modelscope_revision="7bf452403abd7353a300cd760f7adae7701c92c1",
    modelscope_files=(
        FileEntry("README.md", 12_091,
            "1e9a3ad58f907aeb099a650a2f2565c64f9936820c8654016c3980b767a6407b"),
        FileEntry("am.mvn", 11_203,
            "29b3c740a2c0cfc6b308126d31d7f265fa2be74f3bb095cd2f143ea970896ae5"),
        FileEntry("chn_jpn_yue_eng_ko_spectok.bpe.model", 377_341,
            "aa87f86064c3730d799ddf7af3c04659151102cba548bce325cf06ba4da4e6a8"),
        FileEntry("config.yaml", 1_855,
            "f71e239ba36705564b5bf2d2ffd07eece07b8e3f2bbf6d2c99d8df856339ac19"),
        FileEntry("configuration.json", 396,
            "02810a7f8e9e8aee10370a265f7e799728ce25b4c00cdbf4602b303ee395a38e"),
        FileEntry("model.pt", 936_291_369,
            "833ca2dcfdf8ec91bd4f31cfac36d6124e0c459074d5e909aec9cabe6204a3ea"),
    ),
)


HYMT2_1_8B_Q4_K_M = ModelSpec(
    model_id="hy-mt2-1.8b-q4-k-m",
    directory="hy-mt2-1.8b-q4-k-m",
    repo="tencent/Hy-MT2-1.8B-GGUF",
    modelscope_repo="Tencent-Hunyuan/Hy-MT2-1.8B-GGUF",
    revision="a0c709d9fac510f2c807aa3af52872340dc37a4a",
    files=(
        FileEntry(
            "Hy-MT2-1.8B-Q4_K_M.gguf",
            1_133_080_448,
            "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699",
        ),
    ),
    modelscope_revision="e97e6af0ec0950385644d7c0a8e5c899071f722b",
    modelscope_files=(
        FileEntry("Hy-MT2-1.8B-Q4_K_M.gguf", 1_133_080_448,
            "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"),
    ),
)

# Official 7B Q4_K_M artifact; the runtime supplies its separate official chat template.
# Source: https://huggingface.co/tencent/Hy-MT2-7B-GGUF/tree/ab8472660ac61fac25f1af43fac2599d52a8a775
HYMT2_7B_Q4_K_M = ModelSpec(
    model_id="hy-mt2-7b-q4-k-m", directory="hy-mt2-7b-q4-k-m",
    repo="tencent/Hy-MT2-7B-GGUF", revision="ab8472660ac61fac25f1af43fac2599d52a8a775",
    modelscope_repo="Tencent-Hunyuan/Hy-MT2-7B-GGUF",
    files=(FileEntry("Hy-MT2-7B-Q4_K_M.gguf", 4_624_648_896,
        "9f96256500f3fc1ab4d64336b58f52a949a95ad7516b0c229476eef782f9f77b"),),
    modelscope_revision="47b1dd35c1f984e23ec7b3c72e5d01620dce8f40",
    modelscope_files=(
        FileEntry("Hy-MT2-7B-Q4_K_M.gguf", 4_624_648_896,
            "9f96256500f3fc1ab4d64336b58f52a949a95ad7516b0c229476eef782f9f77b"),
    ),
)


# unsloth's Hy-MT2 1.8B quantizations (importance-matrix calibrated). All are standard
# llama.cpp quant types readable straight from the official release, and the three tiers
# measure at nearly the same speed (0.15~0.18s/sentence), so the only trade-off is size
# versus terminology retention: Q3_K_M is steadiest on proper nouns (Genshin Impact,
# Pro), UD-IQ2_M is the smallest but flattens them to literal meaning.
_UNSLOTH_HYMT2_REPO = "unsloth/Hy-MT2-1.8B-GGUF"
_UNSLOTH_HYMT2_REVISION = "0378cc2780f462f0fd397d0cdd244d2f769de40e"
# This ModelScope Q3 conversion is not byte-identical to unsloth's HF artifact;
# keep its independently published size and SHA-256 in the alternate manifest.
_MODELSCOPE_HYMT2_REPO = "fss618/Hy-MT2-1.8B-GGUF"

HYMT2_1_8B_Q3_K_M = ModelSpec(
    model_id="hy-mt2-1.8b-q3-k-m",
    directory="hy-mt2-1.8b-q3-k-m",
    repo=_UNSLOTH_HYMT2_REPO,
    revision=_UNSLOTH_HYMT2_REVISION,
    modelscope_repo=_MODELSCOPE_HYMT2_REPO,
    files=(
        FileEntry(
            "Hy-MT2-1.8B-Q3_K_M.gguf",
            951_022_560,
            "d843f052e1adb61197156f534099cf9fb58353af7cc30999a2f1f717819936b8",
        ),
    ),
    modelscope_revision="356e2bd51dd91bc4a84444c2121c02a26fbe2ffd",
    modelscope_files=(
        FileEntry("Hy-MT2-1.8B-Q3_K_M.gguf", 951_021_472,
            "bb16d8ec1442c8470e2023d4b9af13f893df9f85dbbc93cc1ed7fc90d13f661f"),
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
    modelscope_repo="facebook/m2m100_418M",
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
    modelscope_revision="036fa2a4b203927f7ab61219b1039b269b4a6d07",
    modelscope_files=(
        FileEntry(".gitattributes", 2_075,
            "247a3cfc672484dd40bdf07af0f83ee7a4457e9a995dadb47eedc36c630103b6"),
        FileEntry("README.md", 4_603,
            "1fd660f130aedc5ecf1796b47ab47d43d3c4b36541f5387b7adb3df75cb5dfdb"),
        FileEntry("config.json", 908,
            "df0ae43e4e4b0d7e3c97b7f447857a70ef6b6a2aa1f145cedbcc730d95f67134"),
        FileEntry("generation_config.json", 233,
            "aed76366507333ddbb8bd49960f23c82fe6446b3319a46a54befdb45324ccf61"),
        FileEntry("pytorch_model.bin", 1_935_796_948,
            "d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1"),
        FileEntry("sentencepiece.bpe.model", 2_423_393,
            "d8f7c76ed2a5e0822be39f0a4f95a55eb19c78f4593ce609e2edbc2aea4d380a"),
        FileEntry("special_tokens_map.json", 1_140,
            "c1a4f86c3874d279ae1b2a05162858db5dd6c61665d84223ed886cbcff08fda6"),
        FileEntry("tokenizer_config.json", 298,
            "a53e6aa83da0b82565ed90c3849056307a9453843322ac5b8439ec4b9497fe48"),
        FileEntry("vocab.json", 3_708_092,
            "b6e77e474aeea8f441363aca7614317c06381f3eacfe10fb9856d5081d1074cc"),
    ),
)

# Additional official Index-Translate Transformers snapshots, pinned by Hugging Face revision.
INDEX_TRANSLATE_9B_BF16 = ModelSpec(
    model_id="index-translate-9b-bf16", directory="index-translate-9b-bf16",
    repo="IndexTeam/Index-Translate-9B", revision="4e06279e62352dab96bbeb6fa0579bca5e822d75",
    files=(
        FileEntry("config.json", 3126, blob_sha1="273ce437e01baf96a07cd9eb3d5f48bac8d7c657"),
        FileEntry("generation_config.json", 100, blob_sha1="cb2c8db5920c1c44e9854f3927eeb37d61a8ee63"),
        FileEntry("merges.txt", 3353259, blob_sha1="a494e019ca1502219fd0128658b979e5f05ae8e8"),
        FileEntry("model-00001-of-00004.safetensors", 5278251472, "60b667c0c334869669f129f7abbecb24b07f8e111a2e6bc059198359ce01f7e7"),
        FileEntry("model-00002-of-00004.safetensors", 5358071808, "7cd89432b30065fcc6b20f7e9dec37972c7f70d437a83bbcb4dcad927f3694ac"),
        FileEntry("model-00003-of-00004.safetensors", 5340098264, "0dcab64f71cb6aa696f202871dc3222ac39dc15e3ee62c5a75c1a8ff31b82bd5"),
        FileEntry("model-00004-of-00004.safetensors", 3329882376, "7f2875ebde5816eda3b4e8c20d04a5898bcfab762977d0880bc1ea4b2e991182"),
        FileEntry("model.safetensors.index.json", 70357, blob_sha1="335bf8f894dafedbe556448c70b7e7fb564c19e3"),
        FileEntry("preprocessor_config.json", 390, blob_sha1="2ea84a437d448ff71b08df68fdd949d5cc4ebb64"),
        FileEntry("tokenizer.json", 12807196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16713, blob_sha1="ae8d254e44c51d0cb0907bcb221f18efca829d3e"),
        FileEntry("video_preprocessor_config.json", 386, blob_sha1="37900b3ff9295e1aa7e211378466356b52e64e55"),
        FileEntry("vocab.json", 6722759, blob_sha1="0aa0ce0658d60ac4a5d609f4eadb0e8e43514176"),
    ),
)
INDEX_TRANSLATE_9B_FP8 = ModelSpec(
    model_id="index-translate-9b-fp8", directory="index-translate-9b-fp8",
    repo="IndexTeam/Index-Translate-9B-FP8", revision="d467e031548df719a665509ce5bfc63c6a62af5c",
    files=(
        FileEntry("chat_template.jinja", 7756, blob_sha1="a585dec894e63da457d9440ec6aa7caa16d20860"),
        FileEntry("config.json", 9064, blob_sha1="df3beee6eead64d9a2eac6bb1123b7f622617f6c"),
        FileEntry("generation_config.json", 113, blob_sha1="dbda49f51ba73ae994bb3b0b9806dfaa1305224e"),
        FileEntry("model.safetensors", 11904105456, "33a509454d4d0ef6fe576aca8da3e9920eb58e4a237454be296fbfcfafa835b1"),
        FileEntry("model.safetensors.index.json", 81058, blob_sha1="aa5d86552e61bc01e53f0502d44a38773adf39b3"),
        FileEntry("model_mtp.safetensors", 486582848, "8341190c753544d1e924f26da7b983cae0ae45f08ba19dc5628b2084956815ea"),
        FileEntry("processor_config.json", 1221, blob_sha1="8438fb895445fc0863e7585e5168d5a8983e34b7"),
        FileEntry("recipe.yaml", 281, blob_sha1="56b89354d8e18349061376d06adf3799683baa86"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)
INDEX_TRANSLATE_9B_FP4 = ModelSpec(
    model_id="index-translate-9b-fp4", directory="index-translate-9b-fp4",
    repo="IndexTeam/Index-Translate-9B-FP4", revision="8e676876a2db89fa9e81be991b4fb10dd6d9da8c",
    files=(
        FileEntry("chat_template.jinja", 7756, blob_sha1="a585dec894e63da457d9440ec6aa7caa16d20860"),
        FileEntry("config.json", 16554, blob_sha1="d8dd0500879dddf379fa137753aae7707931b9dd"),
        FileEntry("generation_config.json", 113, blob_sha1="dbda49f51ba73ae994bb3b0b9806dfaa1305224e"),
        FileEntry("model.safetensors", 11198720888, "f2ca80c44a129085d86096b005a5c368b3535d416ddc29d47b89a8b5b7b22560"),
        FileEntry("model.safetensors.index.json", 94358, blob_sha1="1bd2258d6172518e3b4b510399cfb886e1b749c3"),
        FileEntry("model_mtp.safetensors", 486582848, "8341190c753544d1e924f26da7b983cae0ae45f08ba19dc5628b2084956815ea"),
        FileEntry("recipe.yaml", 400, blob_sha1="3c1955a15e3abeb988e6855f9424a1f9a44c17e9"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)
INDEX_TRANSLATE_35B_A3B_BF16 = ModelSpec(
    model_id="index-translate-35b-a3b-preview-bf16", directory="index-translate-35b-a3b-preview-bf16",
    repo="IndexTeam/Index-Translate-35B-A3B-preview", revision="7e4029e0df842502cb009cf493d6467c247043b3",
    files=(
        FileEntry("config.json", 3544, blob_sha1="2fd92bfc9ee58bd0274ad207d4120c3e7458dde8"),
        FileEntry("generation_config.json", 100, blob_sha1="cb2c8db5920c1c44e9854f3927eeb37d61a8ee63"),
        FileEntry("merges.txt", 3353259, blob_sha1="a494e019ca1502219fd0128658b979e5f05ae8e8"),
        FileEntry("model-00001-of-00015.safetensors", 4323955416, "266c7257c4866fe1226a04a6cf8e1f201bd5e8c8686eb79bf42202deaa5c1edd"),
        FileEntry("model-00002-of-00015.safetensors", 5043302824, "c623273c36fe4647f133bf92a7067ca4cacc75d8b0ace5cc4371a5185a45b7e7"),
        FileEntry("model-00003-of-00015.safetensors", 4988775072, "9cc4027d515d2e23e3a4446d18d6287b199ad0a539cabe5c94c1eafaedcdcafb"),
        FileEntry("model-00004-of-00015.safetensors", 5110740952, "9311c3ed510eefee0dc97bc814e1630b0ef92b7147388082d3f899c03dc8aad7"),
        FileEntry("model-00005-of-00015.safetensors", 5043302816, "28164d294dff5ea0738024c8214ee73c0920d8b16592140f24deadd31ef8aa96"),
        FileEntry("model-00006-of-00015.safetensors", 4988775072, "025ac0609dc4a1960322d0ccecf93615561a5d0793808727c46b23fd422d9209"),
        FileEntry("model-00007-of-00015.safetensors", 5110740952, "eb6f9589e1b8a86c46343467897e2da7e30ece58fc0759cb318e94f7b094e851"),
        FileEntry("model-00008-of-00015.safetensors", 5043302832, "8b8e6a8fcf51102a1201f2a2fb30f5cad95d4b60b677916e19acd148fcb198ed"),
        FileEntry("model-00009-of-00015.safetensors", 4975864704, "6b8ae4f1146fe2b8b222661b4ff84d45d177ca55627d5ce89f11cc08dd7d0980"),
        FileEntry("model-00010-of-00015.safetensors", 5110740952, "271780be89455f1536b05d57da4bb30fdf95df3f3472af9a4e570931e3680c53"),
        FileEntry("model-00011-of-00015.safetensors", 5043302832, "2585fac47a6313072c7275175cfadb35e647b917f2f5648646e45a831db40668"),
        FileEntry("model-00012-of-00015.safetensors", 5043302824, "a93826912eb7092b2b0b2b10a001d031460d25813e7b3e7e8b5d55c7e2cb6b26"),
        FileEntry("model-00013-of-00015.safetensors", 4988775032, "383337f148f86898e0656e23a57dd76667fabfcfdf3b1400094f08c574c76803"),
        FileEntry("model-00014-of-00015.safetensors", 5368414736, "737aad00c037a90686a0616994a033f70f3a90a08ac887838167cba2b745d22a"),
        FileEntry("model-00015-of-00015.safetensors", 1720571296, "e4ed524b6f6ac5044dc7ce2aee177a5a1cab9e3808ecdd6ace30b78c8f72be19"),
        FileEntry("model.safetensors.index.json", 163733, blob_sha1="7d27b822aee750766565bc8bec40525578ada5a3"),
        FileEntry("preprocessor_config.json", 390, blob_sha1="2ea84a437d448ff71b08df68fdd949d5cc4ebb64"),
        FileEntry("tokenizer.json", 12807196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16713, blob_sha1="ae8d254e44c51d0cb0907bcb221f18efca829d3e"),
        FileEntry("video_preprocessor_config.json", 387, blob_sha1="846ad004e082fdfd68c7b351bad6535e55032839"),
        FileEntry("vocab.json", 6722759, blob_sha1="0aa0ce0658d60ac4a5d609f4eadb0e8e43514176"),
    ),
)
INDEX_TRANSLATE_35B_A3B_FP8 = ModelSpec(
    model_id="index-translate-35b-a3b-preview-fp8", directory="index-translate-35b-a3b-preview-fp8",
    repo="IndexTeam/Index-Translate-35B-A3B-preview-FP8", revision="61e404249633cb84c0f54667fa138183483530c6",
    files=(
        FileEntry("chat_template.jinja", 7756, blob_sha1="a585dec894e63da457d9440ec6aa7caa16d20860"),
        FileEntry("config.json", 11403, blob_sha1="31e72af2e4e475cfaa96f8d9f8b10ba7c67ffe6f"),
        FileEntry("generation_config.json", 113, blob_sha1="dbda49f51ba73ae994bb3b0b9806dfaa1305224e"),
        FileEntry("model-00001-of-00002.safetensors", 20004320082, "590d946054d7dd681500df074f399efc2408509fac898d42c6bd9d04af7f996f"),
        FileEntry("model-00002-of-00002.safetensors", 16661908558, "709017af5e60eafe217706e16e5759aa66cd629ec355e3198fa137d5fea714d2"),
        FileEntry("model.safetensors.index.json", 6863568, blob_sha1="faf73ebf48f523552065161cdb83cfff4bf8729f"),
        FileEntry("model_mtp.safetensors", 1689376032, "e87b22fc975f54e52759c79255bf0766383c2d348a0183b07285e94c63a6a137"),
        FileEntry("processor_config.json", 1222, blob_sha1="99252780605520de2c9e7dcb87f8cf47abfb422e"),
        FileEntry("recipe.yaml", 281, blob_sha1="56b89354d8e18349061376d06adf3799683baa86"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)
INDEX_TRANSLATE_35B_A3B_FP4 = ModelSpec(
    model_id="index-translate-35b-a3b-preview-fp4", directory="index-translate-35b-a3b-preview-fp4",
    repo="IndexTeam/Index-Translate-35B-A3B-preview-FP4", revision="111ff5e950f75dcccb1e631f65e936781a9c34d7",
    files=(
        FileEntry("chat_template.jinja", 7756, blob_sha1="a585dec894e63da457d9440ec6aa7caa16d20860"),
        FileEntry("config.json", 9121, blob_sha1="aaa65e34b53fd166050dc667f35fe296830932e4"),
        FileEntry("generation_config.json", 112, blob_sha1="b3605c8cced522dda86c5c3617468e2923dae84d"),
        FileEntry("hf_quant_config.json", 4808, blob_sha1="93d3a64e25c94fe90fb05a027f9bb0f59ce57479"),
        FileEntry("model-00001-of-00003.safetensors", 10006294456, "92a3452c7f7a65415f39a8c11cbe161c28b81209ae68443ec73fdf6af924d07a"),
        FileEntry("model-00002-of-00003.safetensors", 10008184144, "405bff2787f14ceb0599dcafd2288bcf989b715183eeda99c23e80962889575b"),
        FileEntry("model-00003-of-00003.safetensors", 3338985200, "66e683c357f8a68080f68646c2beb2fd154d52a93e6505bb7d8b643748c2c7b6"),
        FileEntry("model.safetensors.index.json", 13709224, "6578d6fd5e7b6b699e46f8d552d8903889ec7e8dbb5c0c2c4886670fbc0b17f8"),
        FileEntry("model_mtp.safetensors", 1689376032, "e87b22fc975f54e52759c79255bf0766383c2d348a0183b07285e94c63a6a137"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, blob_sha1="8a675cf6071546d7c13fea4c9d1acf1d1958569c"),
    ),
)

# ModelScope manifests for official Index-Translate Transformers snapshots.
from dataclasses import replace as _replace_index_spec
INDEX_TRANSLATE_2B_BF16 = _replace_index_spec(INDEX_TRANSLATE_2B_BF16,
    modelscope_repo="IndexTeam/Index-Translate-2B", modelscope_revision="3473f22736a89e12ece274e2130be2d5898dbda3",
    modelscope_files=(
        FileEntry("config.json", 2908, "ed1c1723241f23f7f4e23430759cbd7dcfb4103cbdfe052bfe7626b57c2615b4"),
        FileEntry("generation_config.json", 100, "5b2e05bd687ce6eb52f8beff6d9dc98a0fb1e02ce8898062869218d17264220f"),
        FileEntry("merges.txt", 3353259, "a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d"),
        FileEntry("model.safetensors", 4548216776, "2f499211fe352913464be69365e2e5724f913051efb3ae2b6fd0fa617a4c0b60"),
        FileEntry("preprocessor_config.json", 390, "27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516"),
        FileEntry("tokenizer.json", 12807196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16712, "e611fbccc7c29ef3b1cafb1cb7ea548d189968632901d678fd62be68c47885de"),
        FileEntry("video_preprocessor_config.json", 386, "d039cd7d88b3502a99edd455496b75b44ecf7dd3b3669748bafac37e6cecc085"),
        FileEntry("vocab.json", 6722759, "ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003"),
    ))
INDEX_TRANSLATE_2B_FP8 = _replace_index_spec(INDEX_TRANSLATE_2B_FP8,
    modelscope_repo="IndexTeam/Index-Translate-2B-FP8", modelscope_revision="1ef7c09149f60066dfa2276f602b80f885f7d17c",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7755, "273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80"),
        FileEntry("config.json", 8100, "171bf9745621f8f6e77b6658f07f27a34fa973ff941b99c4260dfed274ad5f40"),
        FileEntry("generation_config.json", 113, "f8f355e9f4f72a99190263e6c89d2c7de8c38b83b2aee36ae7f7a327dfe937a0"),
        FileEntry("model.safetensors", 3055011640, "6d7900f01ccd7315fa3ba5b478eb61140e2aa7e69161bad52696196d60391e98"),
        FileEntry("model.safetensors.index.json", 64136, "32a79a46c49cf7d40a96491c72629c2689e1eca71e5fe148b864af8bc2045b93"),
        FileEntry("model_mtp.safetensors", 121657904, "78354d27683c4c72d81b55f44ba16b10a0aa40828f2a1e057344a9cef7f2f209"),
        FileEntry("processor_config.json", 1221, "9ad79dcc3fc51f5eaa519b43adcb3ff5b748a5a0af959237ad7b68b710b9e041"),
        FileEntry("recipe.yaml", 281, "bfda4470887a9d1903d1b70d57b9c605a51d4125eeb5124fc3ea1a0cc7bf3d6d"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
INDEX_TRANSLATE_2B_FP4 = _replace_index_spec(INDEX_TRANSLATE_2B_FP4,
    modelscope_repo="IndexTeam/Index-Translate-2B-FP4", modelscope_revision="9bd0b05046ba66276881aec67e01cf6277919be4",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7755, "273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80"),
        FileEntry("config.json", 13724, "808ebf5bc3bc3203d0299f767ee88c4bcf054ee888b791a0677d3726d529d223"),
        FileEntry("generation_config.json", 113, "f8f355e9f4f72a99190263e6c89d2c7de8c38b83b2aee36ae7f7a327dfe937a0"),
        FileEntry("model.safetensors", 2997649248, "c0c47a80c830cd52ad1651bfda0af0655408594184148fbea768c98726e1e11c"),
        FileEntry("model.safetensors.index.json", 74102, "055619f2e68668a61dda3b549d2d9c3737db8ff5682a0a574595f57071305ba9"),
        FileEntry("model_mtp.safetensors", 121657904, "78354d27683c4c72d81b55f44ba16b10a0aa40828f2a1e057344a9cef7f2f209"),
        FileEntry("recipe.yaml", 400, "c2837fc2807a2c02f5968fad587b03e5d9259e8c841fe82063c07c3b416e0b8e"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
INDEX_TRANSLATE_9B_BF16 = _replace_index_spec(INDEX_TRANSLATE_9B_BF16,
    modelscope_repo="IndexTeam/Index-Translate-9B", modelscope_revision="6ae85e9af278d70007d869d21c263d7d00c3d8dc",
    modelscope_files=(
        FileEntry("config.json", 3126, "d0883072e01861ed0b2d47be3c16c36a8e81c224c7ffaa310c6558fb3f932b05"),
        FileEntry("generation_config.json", 100, "5b2e05bd687ce6eb52f8beff6d9dc98a0fb1e02ce8898062869218d17264220f"),
        FileEntry("merges.txt", 3353259, "a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d"),
        FileEntry("model-00001-of-00004.safetensors", 5278251472, "60b667c0c334869669f129f7abbecb24b07f8e111a2e6bc059198359ce01f7e7"),
        FileEntry("model-00002-of-00004.safetensors", 5358071808, "7cd89432b30065fcc6b20f7e9dec37972c7f70d437a83bbcb4dcad927f3694ac"),
        FileEntry("model-00003-of-00004.safetensors", 5340098264, "0dcab64f71cb6aa696f202871dc3222ac39dc15e3ee62c5a75c1a8ff31b82bd5"),
        FileEntry("model-00004-of-00004.safetensors", 3329882376, "7f2875ebde5816eda3b4e8c20d04a5898bcfab762977d0880bc1ea4b2e991182"),
        FileEntry("model.safetensors.index.json", 70357, "2ade32a7ee117d939d2085e2ae0cbd762dca9d2f34437bdcd2bd334767c0a361"),
        FileEntry("preprocessor_config.json", 390, "27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516"),
        FileEntry("tokenizer.json", 12807196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16713, "3891e840d7dc5fca0af33d3a25083a735e36fe06214e3f707024820cb6b9f89c"),
        FileEntry("video_preprocessor_config.json", 386, "d039cd7d88b3502a99edd455496b75b44ecf7dd3b3669748bafac37e6cecc085"),
        FileEntry("vocab.json", 6722759, "ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003"),
    ))
INDEX_TRANSLATE_9B_FP8 = _replace_index_spec(INDEX_TRANSLATE_9B_FP8,
    modelscope_repo="IndexTeam/Index-Translate-9B-FP8", modelscope_revision="14cee5c88f4391eb05989b7c5b9184f19b32903a",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7756, "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715"),
        FileEntry("config.json", 9064, "0a0c740d73901c494a0b251ef0e8688a487b1ed506fa3a0dec2f7646165136b7"),
        FileEntry("generation_config.json", 113, "f8f355e9f4f72a99190263e6c89d2c7de8c38b83b2aee36ae7f7a327dfe937a0"),
        FileEntry("model.safetensors", 11904105456, "33a509454d4d0ef6fe576aca8da3e9920eb58e4a237454be296fbfcfafa835b1"),
        FileEntry("model.safetensors.index.json", 81058, "468653c9261f867ed7ac33601fb620f004a1fba2a2e79da0f374936d428b4f77"),
        FileEntry("model_mtp.safetensors", 486582848, "8341190c753544d1e924f26da7b983cae0ae45f08ba19dc5628b2084956815ea"),
        FileEntry("processor_config.json", 1221, "9ad79dcc3fc51f5eaa519b43adcb3ff5b748a5a0af959237ad7b68b710b9e041"),
        FileEntry("recipe.yaml", 281, "bfda4470887a9d1903d1b70d57b9c605a51d4125eeb5124fc3ea1a0cc7bf3d6d"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
INDEX_TRANSLATE_9B_FP4 = _replace_index_spec(INDEX_TRANSLATE_9B_FP4,
    modelscope_repo="IndexTeam/Index-Translate-9B-FP4", modelscope_revision="01f4e6d0d1be228312327fa2bcd83a5d3a3e811e",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7756, "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715"),
        FileEntry("config.json", 16554, "94c3a7897d59a0df3df8c74a3c315e749cd43fb966bf5705d5844416a3a21c16"),
        FileEntry("generation_config.json", 113, "f8f355e9f4f72a99190263e6c89d2c7de8c38b83b2aee36ae7f7a327dfe937a0"),
        FileEntry("model.safetensors", 11198720888, "f2ca80c44a129085d86096b005a5c368b3535d416ddc29d47b89a8b5b7b22560"),
        FileEntry("model.safetensors.index.json", 94358, "b7f0bbb78bf0d5668933bf96f31e26ba4a77568fa4a21c034e8cbfbb6cb693c7"),
        FileEntry("model_mtp.safetensors", 486582848, "8341190c753544d1e924f26da7b983cae0ae45f08ba19dc5628b2084956815ea"),
        FileEntry("recipe.yaml", 400, "c2837fc2807a2c02f5968fad587b03e5d9259e8c841fe82063c07c3b416e0b8e"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
INDEX_TRANSLATE_35B_A3B_BF16 = _replace_index_spec(INDEX_TRANSLATE_35B_A3B_BF16,
    modelscope_repo="IndexTeam/Index-Translate-35B-A3B-preview", modelscope_revision="c98635caaf863580a3cd03bb39fca53af8090558",
    modelscope_files=(
        FileEntry("config.json", 3544, "5e4d7f74fec2f360eb9cfbfcd6ec0c4c76e684d3a11caaed259d9fd9bfbc7944"),
        FileEntry("generation_config.json", 100, "5b2e05bd687ce6eb52f8beff6d9dc98a0fb1e02ce8898062869218d17264220f"),
        FileEntry("merges.txt", 3353259, "a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d"),
        FileEntry("model-00001-of-00015.safetensors", 4323955416, "266c7257c4866fe1226a04a6cf8e1f201bd5e8c8686eb79bf42202deaa5c1edd"),
        FileEntry("model-00002-of-00015.safetensors", 5043302824, "c623273c36fe4647f133bf92a7067ca4cacc75d8b0ace5cc4371a5185a45b7e7"),
        FileEntry("model-00003-of-00015.safetensors", 4988775072, "9cc4027d515d2e23e3a4446d18d6287b199ad0a539cabe5c94c1eafaedcdcafb"),
        FileEntry("model-00004-of-00015.safetensors", 5110740952, "9311c3ed510eefee0dc97bc814e1630b0ef92b7147388082d3f899c03dc8aad7"),
        FileEntry("model-00005-of-00015.safetensors", 5043302816, "28164d294dff5ea0738024c8214ee73c0920d8b16592140f24deadd31ef8aa96"),
        FileEntry("model-00006-of-00015.safetensors", 4988775072, "025ac0609dc4a1960322d0ccecf93615561a5d0793808727c46b23fd422d9209"),
        FileEntry("model-00007-of-00015.safetensors", 5110740952, "eb6f9589e1b8a86c46343467897e2da7e30ece58fc0759cb318e94f7b094e851"),
        FileEntry("model-00008-of-00015.safetensors", 5043302832, "8b8e6a8fcf51102a1201f2a2fb30f5cad95d4b60b677916e19acd148fcb198ed"),
        FileEntry("model-00009-of-00015.safetensors", 4975864704, "6b8ae4f1146fe2b8b222661b4ff84d45d177ca55627d5ce89f11cc08dd7d0980"),
        FileEntry("model-00010-of-00015.safetensors", 5110740952, "271780be89455f1536b05d57da4bb30fdf95df3f3472af9a4e570931e3680c53"),
        FileEntry("model-00011-of-00015.safetensors", 5043302832, "2585fac47a6313072c7275175cfadb35e647b917f2f5648646e45a831db40668"),
        FileEntry("model-00012-of-00015.safetensors", 5043302824, "a93826912eb7092b2b0b2b10a001d031460d25813e7b3e7e8b5d55c7e2cb6b26"),
        FileEntry("model-00013-of-00015.safetensors", 4988775032, "383337f148f86898e0656e23a57dd76667fabfcfdf3b1400094f08c574c76803"),
        FileEntry("model-00014-of-00015.safetensors", 5368414736, "737aad00c037a90686a0616994a033f70f3a90a08ac887838167cba2b745d22a"),
        FileEntry("model-00015-of-00015.safetensors", 1720571296, "e4ed524b6f6ac5044dc7ce2aee177a5a1cab9e3808ecdd6ace30b78c8f72be19"),
        FileEntry("model.safetensors.index.json", 163733, "ced5d9747da6b2a729aa3a8156447662a37d8ae30ff4a25726abcfd7428221ad"),
        FileEntry("preprocessor_config.json", 390, "27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516"),
        FileEntry("tokenizer.json", 12807196, "fe000e3ed39ed12b8d2481d527d44f93c65d37e87645d2dcc80d1bf9d50d2927"),
        FileEntry("tokenizer_config.json", 16713, "3891e840d7dc5fca0af33d3a25083a735e36fe06214e3f707024820cb6b9f89c"),
        FileEntry("video_preprocessor_config.json", 387, "28a340356435be8f0f2bef2d955232785609a373d36df0ee6c51ce632a94780e"),
        FileEntry("vocab.json", 6722759, "ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003"),
    ))
INDEX_TRANSLATE_35B_A3B_FP8 = _replace_index_spec(INDEX_TRANSLATE_35B_A3B_FP8,
    modelscope_repo="IndexTeam/Index-Translate-35B-A3B-preview-FP8", modelscope_revision="c7590f7dec74513f3a371eb7609ec8269c907c4c",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7756, "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715"),
        FileEntry("config.json", 11403, "0eb18022d9b85ccad3eea4389500325740675bcd6b302c386437bd5fe522a968"),
        FileEntry("generation_config.json", 113, "f8f355e9f4f72a99190263e6c89d2c7de8c38b83b2aee36ae7f7a327dfe937a0"),
        FileEntry("model-00001-of-00002.safetensors", 20004320082, "590d946054d7dd681500df074f399efc2408509fac898d42c6bd9d04af7f996f"),
        FileEntry("model-00002-of-00002.safetensors", 16661908558, "709017af5e60eafe217706e16e5759aa66cd629ec355e3198fa137d5fea714d2"),
        FileEntry("model.safetensors.index.json", 6863568, "4e01b3a77c0c2f9d673b7d9a98f879132f2b9f01f7be1e6c7c24ea57f7e57bbe"),
        FileEntry("model_mtp.safetensors", 1689376032, "e87b22fc975f54e52759c79255bf0766383c2d348a0183b07285e94c63a6a137"),
        FileEntry("processor_config.json", 1222, "b402400b91df29e2cb338065085d5e4129c67b6da3a683cf72467d06d8870a70"),
        FileEntry("recipe.yaml", 281, "bfda4470887a9d1903d1b70d57b9c605a51d4125eeb5124fc3ea1a0cc7bf3d6d"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
INDEX_TRANSLATE_35B_A3B_FP4 = _replace_index_spec(INDEX_TRANSLATE_35B_A3B_FP4,
    modelscope_repo="IndexTeam/Index-Translate-35B-A3B-preview-FP4", modelscope_revision="c7820f7431d788d810d9fc7b3505a79e86399dd4",
    modelscope_files=(
        FileEntry("chat_template.jinja", 7756, "a4aee8afcf2e0711942cf848899be66016f8d14a889ff9ede07bca099c28f715"),
        FileEntry("config.json", 9121, "6f1102e1c7bc001e6ceb100450d6632d02d6c419ded789d91ed64d66aade861a"),
        FileEntry("generation_config.json", 112, "9e45942fa3083df28a3019d47f0379485e4d983e8f07cc76d1f3451450e570e3"),
        FileEntry("hf_quant_config.json", 4808, "4e4577297a65406ec8f698bb00f8a2b4b16d98ab3ab7d3affa2df3212df0aedd"),
        FileEntry("model-00001-of-00003.safetensors", 10006294456, "92a3452c7f7a65415f39a8c11cbe161c28b81209ae68443ec73fdf6af924d07a"),
        FileEntry("model-00002-of-00003.safetensors", 10008184144, "405bff2787f14ceb0599dcafd2288bcf989b715183eeda99c23e80962889575b"),
        FileEntry("model-00003-of-00003.safetensors", 3338985200, "66e683c357f8a68080f68646c2beb2fd154d52a93e6505bb7d8b643748c2c7b6"),
        FileEntry("model.safetensors.index.json", 13709224, "6578d6fd5e7b6b699e46f8d552d8903889ec7e8dbb5c0c2c4886670fbc0b17f8"),
        FileEntry("model_mtp.safetensors", 1689376032, "e87b22fc975f54e52759c79255bf0766383c2d348a0183b07285e94c63a6a137"),
        FileEntry("tokenizer.json", 19989325, "06b9509352d2af50381ab2247e083b80d32d5c0aba91c272ca9ff729b6a0e523"),
        FileEntry("tokenizer_config.json", 1127, "171ecbe7ddae98d11840698f7df2b8d5b4722139db0f0620d3bbf429bd656250"),
    ))
