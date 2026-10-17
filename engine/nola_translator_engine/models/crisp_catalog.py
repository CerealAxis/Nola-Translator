"""Pinned GGUF snapshots for supported CrispASR recognition backends."""
from __future__ import annotations

from .manager import FileEntry, ModelSpec


def _single(repo: str, revision: str, family: str, variant: str,
            filename: str, size: int, digest: str) -> ModelSpec:
    model_id = f"{family}-{variant}"
    return ModelSpec(model_id=model_id, directory=model_id, repo=repo, revision=revision,
                     files=(FileEntry(filename, size, digest),))


FUN_ASR_GGUF_SPECS = (
    _single("cstr/funasr-nano-GGUF", "5d4346e47c268ba91a332a148a1fd39b766408ac",
            "fun-asr-nano", "q4-k", "funasr-nano-2512-q4_k.gguf", 896_875_328,
            "d6457bfb4e28402cc6150804a66051714f6753deb40c50ed33cf2936c6538585"),
    _single("cstr/funasr-nano-GGUF", "5d4346e47c268ba91a332a148a1fd39b766408ac",
            "fun-asr-nano", "q8-0", "funasr-nano-2512-q8_0.gguf", 1_272_658_784,
            "dac5e1b95659c0a95b2a1dc60083eb17740454a921ec39f9c24e50b930ca31ab"),
    _single("cstr/funasr-nano-GGUF", "5d4346e47c268ba91a332a148a1fd39b766408ac",
            "fun-asr-nano", "f16", "funasr-nano-2512-f16.gguf", 1_977_252_608,
            "66f03c983eeeed2d11a159a3ad5b959fa7046426f0d98ee5e87273ad946d293f"),
)

SENSEVOICE_GGUF_SPECS = (
    _single("cstr/sensevoice-small-GGUF", "e1ad67de9d05137a6a0b02beba1fd66e28df6ae4",
            "sensevoice-small-crisp", "q4-k", "sensevoice-small-q4_k.gguf", 135_553_632,
            "8a41cfd32e6fd8f5ca330e2425e87bfbed128b42779b40dcc5d100040ec63cc9"),
    _single("cstr/sensevoice-small-GGUF", "e1ad67de9d05137a6a0b02beba1fd66e28df6ae4",
            "sensevoice-small-crisp", "q8-0", "sensevoice-small-q8_0.gguf", 251_674_976,
            "6b84003db9da214c129bcdbb1c471d25b211775a905aecb253dd23aebf18b7f4"),
    _single("cstr/sensevoice-small-GGUF", "e1ad67de9d05137a6a0b02beba1fd66e28df6ae4",
            "sensevoice-small-crisp", "f16", "sensevoice-small-f16.gguf", 469_402_400,
            "580419d7f7eaea14a6a6b43e5a3d68c7860a32cb972492cf039be796e80f3161"),
)

QWEN3_ASR_CRISP_SPECS = (
    _single("cstr/qwen3-asr-0.6b-GGUF", "58bd3202f835f46b24b17142cb503b0860c737a5",
            "qwen3-asr-0.6b-crisp", "q4-k", "qwen3-asr-0.6b-q4_k.gguf", 631_026_336,
            "f63771c02dfa486d9399d41ab6ab8cd2d8ca24e077cd32130ea1f67f4fd8dade"),
    _single("cstr/qwen3-asr-0.6b-GGUF", "58bd3202f835f46b24b17142cb503b0860c737a5",
            "qwen3-asr-0.6b-crisp", "q8-0", "qwen3-asr-0.6b-q8_0.gguf", 1_006_809_760,
            "f547589d5ca582e093b2d3312ad9ff13b609b43d413f972c0e92b823dde70a00"),
    _single("cstr/qwen3-asr-0.6b-GGUF", "58bd3202f835f46b24b17142cb503b0860c737a5",
            "qwen3-asr-0.6b-crisp", "f16", "qwen3-asr-0.6b.gguf", 1_882_037_824,
            "fbfe8f9cd93fd788683c793ff43c9d28847003f925f37fda8b075886f315bdab"),
    _single("cstr/qwen3-asr-1.7b-GGUF", "674df5d44b50a63e7102a18895ed20e3f91de301",
            "qwen3-asr-1.7b-crisp", "q4-k", "qwen3-asr-1.7b-q4_k.gguf", 1_490_915_200,
            "ec197cef7ccc589fdcae1becc3f4a3de119d0a41e790b898b519b1a048dad8d4"),
    _single("cstr/qwen3-asr-1.7b-GGUF", "674df5d44b50a63e7102a18895ed20e3f91de301",
            "qwen3-asr-1.7b-crisp", "q8-0", "qwen3-asr-1.7b-q8_0.gguf", 2_506_723_200,
            "9851ab996591a2d0cb0efb216002764b509c86bd40c95e613d7b65b8e69c8a6e"),
    _single("cstr/qwen3-asr-1.7b-GGUF", "674df5d44b50a63e7102a18895ed20e3f91de301",
            "qwen3-asr-1.7b-crisp", "f16", "qwen3-asr-1.7b-f16.gguf", 4_704_800_576,
            "ac6c58f9cb0f2bb22290319cde01b0e25a2c1f1ee69aa2f1a9265f29a8bfc9d7"),
)

VIBEVOICE_GGUF_SPECS = (
    _single("cstr/vibevoice-asr-GGUF", "f316299d4b39b2990d751c55b3dd6daab61677c7",
            "vibevoice-asr", "q4-k", "vibevoice-asr-q4_k.gguf", 4_811_829_376,
            "f1e87bb5c25dd469b495759e59c4554c4e8ec254f36c5c659737ff3e61ace982"),
    _single("cstr/vibevoice-asr-GGUF", "f316299d4b39b2990d751c55b3dd6daab61677c7",
            "vibevoice-asr", "q8-0", "vibevoice-asr-q8_0.gguf", 9_445_577_088,
            "81072d054aba065e70f1dcefd9519e89bdfb08b4f29af489194b17d0cb0c08fe"),
    _single("cstr/vibevoice-asr-GGUF", "f316299d4b39b2990d751c55b3dd6daab61677c7",
            "vibevoice-asr", "f16", "vibevoice-asr-f16.gguf", 16_664_915_264,
            "4389e186a0e1f5b291cde811adf3a28cdb805be3ffcccbe4a45948c0be215cd9"),
)

_MIMO_REPO = "cstr/mimo-asr-GGUF"
_MIMO_REVISION = "e2d7dfebf0afd8076771903e92958039c5074eab"
_MIMO_TOKENIZER = FileEntry(
    "mimo-tokenizer-q4_k.gguf", 395_594_656,
    "3f3a903b10294ead4ef6a4afec035639fd2113b1d307d42f649a97cc85670e3f",
    repo="cstr/mimo-tokenizer-GGUF",
    revision="fa380f4c49a8e8c62c02c00d0da5e263fc5b0dcf",
)
MIMO_ASR_GGUF_SPECS = (
    ModelSpec("mimo-v2.5-asr-q4-k", "mimo-v2.5-asr-q4-k", _MIMO_REPO,
              _MIMO_REVISION, (FileEntry("mimo-asr-q4_k.gguf", 4_517_988_832,
              "12dbc7cc7a20c7add6ff00bf8b12bca1c46304e0100a5c5a6e74bdecfc57a306"), _MIMO_TOKENIZER)),
    ModelSpec("mimo-v2.5-asr-f16", "mimo-v2.5-asr-f16", _MIMO_REPO,
              _MIMO_REVISION, (FileEntry("mimo-asr-f16.gguf", 16_043_804_896,
              "619172cd385561c95f2bc2c5cdcb20ef9bbc25bb542bc41ba528182e8804c0f2"), _MIMO_TOKENIZER)),
)

CRISP_ASR_SPECS = (FUN_ASR_GGUF_SPECS + VIBEVOICE_GGUF_SPECS + MIMO_ASR_GGUF_SPECS
                   + SENSEVOICE_GGUF_SPECS + QWEN3_ASR_CRISP_SPECS)
