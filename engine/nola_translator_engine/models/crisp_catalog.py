"""Pinned model snapshots for the recognition and TTS model catalog."""
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

_QWEN3_TTS_CODEC = FileEntry(
    "qwen3-tts-tokenizer-12hz.gguf", 358_453_280,
    "70dc95dbfdd9aa5d9d406236ff771d061bf17b0cda02a72513953355606e719b",
    repo="cstr/qwen3-tts-tokenizer-12hz-GGUF",
    revision="344e279551177654762e5c7d39e217834325f222",
)
_QWEN3_TTS_DEFAULT_VOICE = FileEntry(
    "qwen3-tts-voice-default.gguf", 11_104,
    blob_sha1="3f1862d5f43caec07a542e2b4d2547828c0ab41a",
    repo="cstr/qwen3-tts-voices-GGUF",
    revision="6ee1102f782cab1f17842983044ac51cf57884d8",
)


def _crisp_tts(model_id: str, repo: str, revision: str, filename: str,
               size: int, digest: str, *, default_voice: bool = False) -> ModelSpec:
    files = (FileEntry(filename, size, digest), _QWEN3_TTS_CODEC)
    if default_voice:
        files += (_QWEN3_TTS_DEFAULT_VOICE,)
    return ModelSpec(model_id, model_id, repo, revision, files)


CRISP_TTS_SPECS = (
    _crisp_tts("tts-qwen3-tts-crisp-0.6b-base-q4-k", "cstr/qwen3-tts-0.6b-base-GGUF",
        "94072f5c394b4dc4d98e97cc874800dde6ecacda", "qwen3-tts-12hz-0.6b-base-q4_k.gguf", 532_862_784,
        "747bff927108f5604e5d0326c62f2a1b10ec2db20b5c460b4adf37e37aef5b39", default_voice=True),
    _crisp_tts("tts-qwen3-tts-crisp-0.6b-base-q8-0", "cstr/qwen3-tts-0.6b-base-GGUF",
        "94072f5c394b4dc4d98e97cc874800dde6ecacda", "qwen3-tts-12hz-0.6b-base-q8_0.gguf", 985_716_544,
        "6162637048fff8ca7f7a16bebc8a62ea8181f4aec4f160894955dee5b87c1961", default_voice=True),
    _crisp_tts("tts-qwen3-tts-crisp-0.6b-base-f16", "cstr/qwen3-tts-0.6b-base-GGUF",
        "94072f5c394b4dc4d98e97cc874800dde6ecacda", "qwen3-tts-12hz-0.6b-base.gguf", 1_834_817_248,
        "9b719418cf9d31fc8472a60ecdab3553280d4b15a9cbfc1363ce9352d64af6dc", default_voice=True),
    _crisp_tts("tts-qwen3-tts-crisp-0.6b-customvoice-q8-0", "cstr/qwen3-tts-0.6b-customvoice-GGUF",
        "29094dcb46f19b0898616aa9aeb876aa9aa6e086", "qwen3-tts-12hz-0.6b-customvoice-q8_0.gguf", 967_980_192,
        "5227dcbc4df7c5533341d111cc469fa491a48e722b23dd10f553181b52dff2d9"),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-base-q8-0", "cstr/qwen3-tts-1.7b-base-GGUF",
        "1d9fa40e85c64e699f3f9fea5aa7fc69a7b2d4ff", "qwen3-tts-12hz-1.7b-base-q8_0.gguf", 2_066_258_176,
        "bbb93ab1f4a3f771f94fc6f68404b2b969bdf3b14c6303473dbf64c63011520d", default_voice=True),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-base-f16", "cstr/qwen3-tts-1.7b-base-GGUF",
        "1d9fa40e85c64e699f3f9fea5aa7fc69a7b2d4ff", "qwen3-tts-12hz-1.7b-base-f16.gguf", 3_863_009_472,
        "c7039d04d3c35da80f38b57bce2b97a5e703ee63de64e7cbbcd6181c7e23e00e", default_voice=True),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-customvoice-q8-0", "cstr/qwen3-tts-1.7b-customvoice-GGUF",
        "4b5b1f6433ab161098601c0bcdc8a69dbf0830ad", "qwen3-tts-12hz-1.7b-customvoice-q8_0.gguf", 2_042_225_952,
        "3985813e21a3f27407110ba3afcd8f12ebc19734a5160ec31992637cd62aa67e"),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-customvoice-f16", "cstr/qwen3-tts-1.7b-customvoice-GGUF",
        "4b5b1f6433ab161098601c0bcdc8a69dbf0830ad", "qwen3-tts-12hz-1.7b-customvoice-f16.gguf", 3_838_977_216,
        "567af3bb58af4fa2fbffa4b00f5599b76638975cb811097d147ae57634d0f2e8"),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-voicedesign-q8-0", "cstr/qwen3-tts-1.7b-voicedesign-GGUF",
        "e3646df398d00b77f0e907a19a44f1a3723af14d", "qwen3-tts-12hz-1.7b-voicedesign-q8_0.gguf", 2_042_225_536,
        "ce9c6d69146891f7854ac46be3bf4e40f803fbebbfe7cdbd12ae3a4b24777295"),
    _crisp_tts("tts-qwen3-tts-crisp-1.7b-voicedesign-f16", "cstr/qwen3-tts-1.7b-voicedesign-GGUF",
        "e3646df398d00b77f0e907a19a44f1a3723af14d", "qwen3-tts-12hz-1.7b-voicedesign-f16.gguf", 3_838_976_832,
        "7ea854dcf5984de7a492fa4916ca0d602fea9e265eaed1217fb1f9faf95125a3"),
)

LLAMA_TTS_SPECS = (
    ModelSpec("tts-qwen3-tts-llama-1.7b-base-q4-k-m", "tts-qwen3-tts-llama-1.7b-base-q4-k-m",
        "ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF", "ca27d74bc954b73dadab5b71ca265d87fc861a7c",
        (FileEntry("Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf", 1_035_965_280,
                   "8d18c94acb2addd042f97da63c98be144eafa76d0d9495177eab65130cf85129"),
         FileEntry("mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf", 446_422_912,
                   "6fd65188839bcd6ecc91b277ad471e22a0edfada4699a0fe82f1165c18cfcce2"))),
    ModelSpec("tts-qwen3-tts-llama-1.7b-base-q8-0", "tts-qwen3-tts-llama-1.7b-base-q8-0",
        "ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF", "ca27d74bc954b73dadab5b71ca265d87fc861a7c",
        (FileEntry("Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf", 1_847_874_400,
                   "ac7931aeb2e7aad1a6ed6602d353a5679c9d096b18ce8204ac730a8408d572e1"),
         FileEntry("mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf", 446_422_912,
                   "6fd65188839bcd6ecc91b277ad471e22a0edfada4699a0fe82f1165c18cfcce2"))),
    ModelSpec("tts-qwen3-tts-llama-1.7b-base-bf16", "tts-qwen3-tts-llama-1.7b-base-bf16",
        "ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF", "ca27d74bc954b73dadab5b71ca265d87fc861a7c",
        (FileEntry("Qwen3-TTS-12Hz-1.7B-Base-bf16.gguf", 3_472_593_760,
                   "0322c634ad5d3282524bc45bff030ab3f6f2a32ba14d5e7dace7eed75ecede46"),
         FileEntry("mmproj-Qwen3-TTS-12Hz-1.7B-Base-bf16.gguf", 669_081_472,
                   "b9503e95e44705739cf82c15ce909b040b96a31ad79d02cf4dc5e1484399265d"))),
)


_TTS_HF_COMMON_FILES = (
    FileEntry("generation_config.json", 245, blob_sha1="1872b16d4535564abf2db5d6debe6cddd82b7f2e"),
    FileEntry("merges.txt", 1_671_839, blob_sha1="20024bfe7c83998e9aeaf98a0cd6a2ce6306c2f0"),
    FileEntry("preprocessor_config.json", 127, blob_sha1="0525dd953bb9241912f7147666f0d535165d5d4f"),
    FileEntry("speech_tokenizer/config.json", 2_336, blob_sha1="06cc8dc4c5ec8a1929086b71b98c313020d9268b"),
    FileEntry("speech_tokenizer/configuration.json", 76, blob_sha1="ab58e2eaf53cd14a1a2a7527d9261ceea93a24cd"),
    FileEntry("speech_tokenizer/model.safetensors", 682_293_092,
              "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258"),
    FileEntry("speech_tokenizer/preprocessor_config.json", 234,
              blob_sha1="ba40914f4f49ab98a8ca545d4892ef7291a39592"),
    FileEntry("tokenizer_config.json", 7_344, blob_sha1="6ff9fd60cc623bb54bbd603cbd418c97a11528d7"),
    FileEntry("vocab.json", 2_776_833, blob_sha1="4783fe10ac3adce15ac8f358ef5462739852c569"),
)
_TTS_MS_COMMON_FILES = (
    FileEntry("configuration.json", 47, "c502b6328c67638b401df8dd05de89e9e8d1cff9cd0ada10dfbdbe13556c20de"),
    FileEntry("generation_config.json", 245, "f1b90b4513f3b34c62851049e2492d7b4c5940daf1276f89c82b8ef04127f3aa"),
    FileEntry("merges.txt", 1_671_839, "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3"),
    FileEntry("preprocessor_config.json", 127, "efdde1022ea9d76928bf7a9cd53139138f5ba2e466e837f08f6105ab1af1c119"),
    FileEntry("speech_tokenizer/config.json", 2_336, "ee65bb901c876664ab8707c487157aa1a6ee57c65969b28fb5ec9dc211e68167"),
    FileEntry("speech_tokenizer/configuration.json", 76, "6bc26d64eb5024b4d1dab5a52371958b429256d6c9d59787f1f5294a54e0cebd"),
    FileEntry("speech_tokenizer/model.safetensors", 682_293_092,
              "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258"),
    FileEntry("speech_tokenizer/preprocessor_config.json", 234,
              "fcb3805e597e786d4067706e602f6688524640f8d3396790e2e09b5942fcbdfb"),
    FileEntry("tokenizer_config.json", 7_344, "dc3c31c3bdaedd5016382bb3cbe07323026775ad51f5a4fb564505992ae4a670"),
    FileEntry("vocab.json", 2_776_833, "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910"),
)


def _pytorch_tts(model_id: str, model_name: str, repo: str, hf_revision: str,
                 config_sha1: str, model_size: int, model_sha256: str,
                 modelscope_revision: str, modelscope_config_sha256: str) -> ModelSpec:
    weight = FileEntry("model.safetensors", model_size, model_sha256)
    config = FileEntry("config.json", 4_908 if "customvoice" in model_id else 4_421 if "voicedesign" in model_id else 4_494,
                       blob_sha1=config_sha1)
    files = (config, *_TTS_HF_COMMON_FILES, weight)
    # All five official PyTorch repositories have the tokenizer files in their ModelScope snapshot.
    modelscope_files = (
        FileEntry("config.json", config.size, modelscope_config_sha256),
        *_TTS_MS_COMMON_FILES,
        FileEntry("model.safetensors", model_size, model_sha256),
    )
    return ModelSpec(model_id, model_id, repo, hf_revision, files,
                     modelscope_repo=repo, modelscope_revision=modelscope_revision,
                     modelscope_files=modelscope_files)


PYTORCH_TTS_SPECS = (
    _pytorch_tts("tts-qwen3-tts-pytorch-0.6b-base-bf16", "Qwen3-TTS 0.6B Base BF16 (PyTorch)",
        "Qwen/Qwen3-TTS-12Hz-0.6B-Base", "5d83992436eae1d760afd27aff78a71d676296fc", "4e923f500f5c3eeb78d44072e7049b28817c2e04", 1_829_344_272,
        "180b3b10eb1c9f1b4db7806d5475bae3071c0243c299d49926bab1da3b6946f6", "7ee3cf0b7e7be29c5d8de06cd552b78263f01ece", "2e714c787c8edb98b05432685cddb634add2de4d4e645f653d68251ef72ba011"),
    _pytorch_tts("tts-qwen3-tts-pytorch-0.6b-customvoice-bf16", "Qwen3-TTS 0.6B CustomVoice BF16 (PyTorch)",
        "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "85e237c12c027371202489a0ec509ded67b5e4b5", "5e8d5fc100536984e3a89bd87ef08e59e322b29b", 1_811_626_576,
        "bc3c7e785eb961179c25450d1acff03f839e0002f2f3a5aeb67b5735c0fa2adb", "3b07e1843e41f3863f213c84e7003ad836a059c6", "81aca2b6fac304944d8acf345272d8a9a727d5fc2e2e66b222ab4729340c7455"),
    _pytorch_tts("tts-qwen3-tts-pytorch-1.7b-base-bf16", "Qwen3-TTS 1.7B Base BF16 (PyTorch)",
        "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "fd4b254389122332181a7c3db7f27e918eec64e3", "81b57e8e790c07e8fa7f82d8bdfd7574d485c396", 3_857_413_744,
        "38fc7fc51c5e776e840414b6fd443962e9411b9654888fd7913e4da643cb857c", "53a097f58d6aa0d688ae0985b4c5e34cfdad2626", "b4f01752d15a488abde3e1ab44723ae4f4b9e68a4037257b098b3737893cc1f9"),
    _pytorch_tts("tts-qwen3-tts-pytorch-1.7b-customvoice-bf16", "Qwen3-TTS 1.7B CustomVoice BF16 (PyTorch)",
        "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice", "0c0e3051f131929182e2c023b9537f8b1c68adfe", "95d74b20b7485f5dfa09d05988d6c606ec226811", 3_833_402_552,
        "38b1d5971bdbd982b561cccec982669a53b0537c3cf5e9bd4778ed07bb2f5137", "ae999bce1d1356e93686274865bc72744daab1a5", "17a07f527a1c25ea30b4e023a184482a23d3e279d697b1dc81b1bde498d29cf9"),
    _pytorch_tts("tts-qwen3-tts-pytorch-1.7b-voicedesign-bf16", "Qwen3-TTS 1.7B VoiceDesign BF16 (PyTorch)",
        "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", "5ecdb67327fd37bb2e042aab12ff7391903235d3", "2c2c027c574a85c0d5a5d48e3cfed1a8a051ff9d", 3_833_402_552,
        "391e8db219f292c515297cdceeb43e4eae67cdde35fa57e79a6a8a532fca0522", "98393ab8928e60376379ecb99a992b80b5926433", "aecd2cc4c1fe9edef1cb7ca7c401685a43879ad43f3f9e883f1c6760b61731e0"),
)

QWEN3_TTS_SPECS = CRISP_TTS_SPECS + LLAMA_TTS_SPECS + PYTORCH_TTS_SPECS

KOKORO_TTS = ModelSpec(
    "tts-kokoro-crisp-q8-0", "tts-kokoro-crisp-q8-0",
    "cstr/kokoro-82m-GGUF", "ab19534a3b5cc12bc2741478e9790eadb328654a",
    (
        FileEntry("kokoro-82m-q8_0.gguf", 141_322_336,
                  "3c8b60064b287a10abd35396a59c9981675c618db8bc91bd290db63f55eb492d"),
        FileEntry("kokoro-voice-af_heart.gguf", 522_784,
                  "14463a5a5204a16a382b2da87b4b0206fcda225b44b7c4627999eb527f49c018",
                  repo="cstr/kokoro-voices-GGUF",
                  revision="1c98db113c69e3feef9644cf0aaec5c0bea02a8e"),
    ),
    modelscope_repo="mysteriov/kokoro-82m-GGUF",
    modelscope_revision="1583b681322fb62fdb0490f82af05b0bf371bccf",
    modelscope_files=(
        FileEntry("kokoro-82m-q8_0.gguf", 141_322_336,
                  "3c8b60064b287a10abd35396a59c9981675c618db8bc91bd290db63f55eb492d",
                  modelscope_repo="mysteriov/kokoro-82m-GGUF",
                  modelscope_revision="1583b681322fb62fdb0490f82af05b0bf371bccf"),
        FileEntry("kokoro-voice-af_heart.gguf", 522_784,
                  "14463a5a5204a16a382b2da87b4b0206fcda225b44b7c4627999eb527f49c018",
                  modelscope_repo="mysteriov/kokoro-voices-GGUF",
                  modelscope_revision="03e0646233c9d6fd6d970eaf8a7b9bd74e207702"),
    ),
)

PIPER_TTS = ModelSpec(
    "tts-piper-crisp-en-gb-cori-medium", "tts-piper-crisp-en-gb-cori-medium",
    "cstr/piper-voices-GGUF", "d1f80d187a377bb70fe06a064f49856e0972a98a",
    (FileEntry("piper-en_GB-cori-medium-f16.gguf", 31_418_816,
               "483cd9dc06a70b2cc63446c29db5b7ada2de0f34a09085359858bfde3151b0bd"),),
    modelscope_repo="mysteriov/piper-voices-GGUF",
    modelscope_revision="1af3d1266e50ed6e18ba0a114d987b557d759aa6",
    modelscope_files=(
        FileEntry("piper-en_GB-cori-medium-f16.gguf", 31_418_816,
                  "483cd9dc06a70b2cc63446c29db5b7ada2de0f34a09085359858bfde3151b0bd",
                  modelscope_repo="mysteriov/piper-voices-GGUF",
                  modelscope_revision="1af3d1266e50ed6e18ba0a114d987b557d759aa6"),
    ),
)

COSYVOICE3_TTS = ModelSpec(
    "tts-cosyvoice3-crisp-0.5b-q4-k", "tts-cosyvoice3-crisp-0.5b-q4-k",
    "cstr/cosyvoice3-0.5b-2512-GGUF", "aa0ea5eb7279bcf54668bcbaa7348019de7d7178",
    (
        FileEntry("cosyvoice3-llm-q4_k.gguf", 383_891_200,
                  "33d899490108bce896c3448bca40ebd994daa125ce0b118e6267f6b84fc09530"),
        FileEntry("cosyvoice3-flow-q8_0.gguf", 360_751_936,
                  "ab264405ca243baf9aa2f2f26959d213d3e3ca9fb204db2a0b582ed2ca243d86"),
        FileEntry("cosyvoice3-hift-f16.gguf", 41_601_888,
                  "6df249e52901714f30f9bb163ff47cedfa56f6df3385567b657610eeb8b8cfd3"),
        FileEntry("cosyvoice3-voices.gguf", 665_472,
                  "73b5cac894d8e715d418d0228d2878ad6e836a809ccb85799ff08ae5f63ac6a2"),
    ),
    modelscope_repo="mysteriov/cosyvoice3-0.5b-2512-GGUF",
    modelscope_revision="dd888b2cc495eb9c5de5dc0bd5453ca37172a5e4",
    modelscope_files=(
        FileEntry("cosyvoice3-llm-q4_k.gguf", 383_891_200,
                  "33d899490108bce896c3448bca40ebd994daa125ce0b118e6267f6b84fc09530"),
        FileEntry("cosyvoice3-flow-q8_0.gguf", 360_751_936,
                  "ab264405ca243baf9aa2f2f26959d213d3e3ca9fb204db2a0b582ed2ca243d86"),
        FileEntry("cosyvoice3-hift-f16.gguf", 41_601_888,
                  "6df249e52901714f30f9bb163ff47cedfa56f6df3385567b657610eeb8b8cfd3"),
        FileEntry("cosyvoice3-voices.gguf", 665_472,
                  "73b5cac894d8e715d418d0228d2878ad6e836a809ccb85799ff08ae5f63ac6a2"),
    ),
)

ADDITIONAL_TTS_SPECS = (KOKORO_TTS, PIPER_TTS, COSYVOICE3_TTS)
ADDITIONAL_TTS_NAMES = {
    KOKORO_TTS.model_id: "Kokoro-82M Q8_0 · CrispASR",
    PIPER_TTS.model_id: "Piper English (UK) Cori Medium · CrispASR",
    COSYVOICE3_TTS.model_id: "CosyVoice3 0.5B Q4_K · CrispASR",
}


def _tts_name(model_id: str) -> str:
    size = "0.6B" if "0.6b" in model_id else "1.7B"
    variant = "VoiceDesign" if "voicedesign" in model_id else "CustomVoice" if "customvoice" in model_id else "Base"
    precision = ("Q4_K_M" if "q4-k-m" in model_id else "Q4_K" if "q4-k" in model_id
                 else "Q8_0" if "q8-0" in model_id else "BF16" if "bf16" in model_id else "F16")
    loader = "CrispASR" if "-crisp-" in model_id else "llama.cpp" if "-llama-" in model_id else "PyTorch"
    return f"Qwen3-TTS {size} {variant} {precision} · {loader}"


QWEN3_TTS_NAMES = {spec.model_id: _tts_name(spec.model_id) for spec in QWEN3_TTS_SPECS}
