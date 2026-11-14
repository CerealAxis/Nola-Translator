"""Pinned OCR and comic detector artifacts; each model's license is independent of Lumina MIT."""

from .manager import FileEntry, ModelSpec


class OcrModelSpec(ModelSpec):
    def url_for(self, entry, network=None, source=None):
        # RapidAI publishes these artifacts on ModelScope, not Hugging Face.
        task = "det" if "_det_" in entry.path else "rec"
        return f"https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/{OCR_REVISION}/onnx/PP-OCRv5/{task}/{entry.path}"


# RapidAI/RapidOCR tag v3.10.0, resolved with git ls-remote; SHA-256 values
# independently match RapidOCR's default_models.yaml and ModelScope metadata.
OCR_REVISION = "d298462ac20a2e994f433151b5fe6cc1180e9a09"
OCR_RESOURCE_ID = "pp-ocrv5-mobile-onnx"
OCR_DETECTOR = "ch_PP-OCRv5_det_mobile.onnx"
COMIC_DETECTOR_ID = "comic-rtdetr-onnx"
MANGA_OCR_ID = "manga-ocr-onnx"
BABERU_OCR_ID = "baberu-ocr-onnx"
PPOCRV6_ID = "pp-ocrv6-medium-onnx"
PADDLEOCR_VL_ID = "paddleocr-vl-1.6-onnx"
RFDETR_SEG_ID = "comic-rfdetr-seg-onnx"
LAMA_ONNX_ID = "comic-lama-onnx"
LAMA_MANGA_ONNX_ID = "comic-lama-manga-onnx"
ANGLENET_ID = "comic-anglenet-onnx"
COMIC_FONT_CLASSIFIER_ID = "comic-font-classifier-onnx"
COMIC_YUZU_FONT_ID = "comic-yuzu-font-onnx"
MANGA_OCR = ModelSpec(
    model_id=MANGA_OCR_ID, directory=MANGA_OCR_ID,
    repo="mayocream/manga-ocr-onnx", revision="24b12778d85800835e2ca409236de281b8ab7b9f",
    files=(
        FileEntry("encoder_model.onnx", 343454249,
                  "15fa8155fe9bc1a7d25d9bb353debaa4def033d0174e907dbd2dd6d995def85f"),
        FileEntry("decoder_model.onnx", 117480262,
                  "ef7765261e9d1cdc34d89356986c2bbc2a082897f753a89605ae80fdfa61f5e8"),
        FileEntry("vocab.txt", 30216,
                  "5cb5c5586d98a2f331d9f8828e4586479b0611bfba5d8c3b6dadffc84d6a36a3"),
    ),
)
BABERU_OCR = ModelSpec(
    model_id=BABERU_OCR_ID, directory=BABERU_OCR_ID,
    repo="genshiai-daichi/baberu-ocr", revision="b9868433dbda3ed9ba1357d008599ff4ada873d5",
    files=(
        FileEntry("onnx/vision_int4.onnx", 52_293_486, "1967ecef502e4c1e1e7c512ea0a2e06396b39ded87a8a9cc77bd7db2e981a361"),
        FileEntry("onnx/decoder_prefill_int8.onnx", 35_133_596, "187a59cb61d3870f1f97c9eb027eb34ff19d023fba801cda113a13870be0b724"),
        FileEntry("onnx/decoder_step_int8.onnx", 34_715_466, "46640b0b3db77f0f0eef660bbe5dc9126a5e0fb49eb2786b2edba7b0371d9769"),
        FileEntry("tokenizer/vocab.json", 130_761, blob_sha1="0c290fca124356dda12c46ee0280de38dd562acf"),
    ),
)
PPOCRV6 = ModelSpec(
    model_id=PPOCRV6_ID, directory=PPOCRV6_ID,
    repo="PaddlePaddle/PP-OCRv6_medium_rec_onnx", revision="50c7eacafc52fa7bcf4194e8cd08e46f8558504b",
    files=(
        FileEntry("inference.onnx", 76_554_979, "9c09abf0957f7968c7586464b7397b84ad2387a0497a351af40e9acc71b673ba"),
        FileEntry("inference.yml", 150_580, blob_sha1="c53a96fcd315a86cb4748d2746f3d90941e1c6d8"),
    ),
)
PADDLEOCR_VL = ModelSpec(
    model_id=PADDLEOCR_VL_ID, directory=PADDLEOCR_VL_ID,
    repo="iaa2005/PaddleOCR-VL-1.6-ONNX", revision="869fb2eb047f49830805b32a0c53f3e370e5be7e",
    files=(
        FileEntry("onnx/vision_encoder_q8.onnx", 446_261_993, "d3c3721a65b2266d9102f0048b2c972f91746b07f46cb9e7b03f7f1e0aed7c8c"),
        FileEntry("onnx/decoder_q8.onnx", 363_265_016, "bce4e3504082e8a7c3f718abb933004403b4af3f24074eaceb9952b168e1c022"),
        FileEntry("onnx/embedding.onnx", 423_624_912, "a3cd4e685f455c9c634f1d62e4ead57eb2965de5cd6cd2b291407b61d5cfdd91"),
        FileEntry("tokenizer.json", 11_189_060, "c8a215a59183d0d0781adc33bacd3ce6162716f7fd568fb30234a74d69803a7d"),
        FileEntry("preprocessor_config.json", 641, blob_sha1="d873cd63d04d9e6243999759fc30f7752dab3222"),
        FileEntry("config.json", 2_059, blob_sha1="c54711466ae75457f8e57b909a49dae570bfa5c5"),
    ),
)
RFDETR_SEG = ModelSpec(
    model_id=RFDETR_SEG_ID, directory=RFDETR_SEG_ID,
    repo="Kiznavierr/koharu-layout-rfdetr-seg-2xl-1152-onnx-fp16",
    revision="586b723a019e9370eefad169050609b03e0fe9a4",
    files=(FileEntry("koharu-layout-rfdetr-seg-2xl-1152-fp16.onnx", 74_471_165,
        "0d576a5722d72c6ac4fe96e6cb0df4e5c90197ffa9252d5167c7ec346dccd06e"),),
)
LAMA_ONNX = ModelSpec(
    model_id=LAMA_ONNX_ID, directory=LAMA_ONNX_ID,
    repo="opencv/inpainting_lama", revision="aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f",
    files=(FileEntry("inpainting_lama_2025jan.onnx", 92_591_623,
        "7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2"),),
)
LAMA_MANGA_ONNX = ModelSpec(
    model_id=LAMA_MANGA_ONNX_ID, directory=LAMA_MANGA_ONNX_ID,
    repo="mayocream/lama-manga-onnx", revision="b55497aadbfcb9740e1ed16f008268d71b4f3f79",
    files=(FileEntry("lama-manga.onnx", 207_482_644,
        "4512adab295ee5a5e02ccd1bdf8d45dccbac88309d9cff1532ffd5de876f02a4"),),
)
ANGLENET = ModelSpec(
    model_id=ANGLENET_ID, directory=ANGLENET_ID,
    repo="Kellenok/anglenet", revision="e981a2b1925d649b5bb12b700c6c0d71f4c1f38a",
    files=(FileEntry("anglenet_v0_1_distill_64x64.onnx", 2_102_682,
        "5246cdbf819a16e7cc5da7841442609f7daba8a61ffa5c05b5323d95091a6c4d"),),
)
COMIC_FONT_CLASSIFIER = ModelSpec(
    model_id=COMIC_FONT_CLASSIFIER_ID, directory=COMIC_FONT_CLASSIFIER_ID,
    repo="storia/font-classify-onnx", revision="86a4e773157cfc4db41844742851385bd5e5d1ca",
    files=(
        FileEntry("model.onnx", 64_057_660,
            "44aa3d46804aa55b7841a0eb6dcc9bb72badd6d01645e5c7448a70525655b7b6"),
        FileEntry("model_config.yaml", 76_406,
            "eb33dd3ed758879cf555923ae1c5af08f067995eee4ebd54d269cfb4ed905f79"),
    ),
)
COMIC_YUZU_FONT = ModelSpec(
    model_id=COMIC_YUZU_FONT_ID, directory=COMIC_YUZU_FONT_ID,
    repo="ogkalu/yuzumarker-font-detection-onnx", revision="7f6d0bdd51140ddb9f08356519cc024c1452483a",
    files=(
        FileEntry("font-detector.onnx", 144_464_880,
            "99dd351e94f06e31397113602ae000a24c1d38ad76275066e844a0c836f75d4f"),
        FileEntry("font-labels-ex.json", 715_294,
            "0662100cfd7654bc43a5449d868fd955060681a1648db95cbf27f5b19a4dd475",
            repo="fffonion/yuzumarker-font-detection", revision="7484242bb840f39e27f10df8ade1f8a9a8fa8f53"),
    ),
)
COMIC_DETECTOR = ModelSpec(
    model_id=COMIC_DETECTOR_ID, directory=COMIC_DETECTOR_ID,
    repo="ogkalu/comic-text-and-bubble-detector", revision="4269a0e53d40419f4746e8b3e30ae7faef3a26c6",
    files=(FileEntry("detector.onnx", 168481531,
        "065744e91c0594ad8663aa8b870ce3fb27222942eded5a3cc388ce23421bd195"),),
)
OCR_RECOGNIZERS = {
    "ch": "ch_PP-OCRv5_rec_mobile.onnx",
    "ko": "korean_PP-OCRv5_rec_mobile.onnx",
}
OCR_FILES = (
    FileEntry(OCR_DETECTOR, 4_819_576, "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae"),
    FileEntry(OCR_RECOGNIZERS["ch"], 16_631_306, "5825fc7ebf84ae7a412be049820b4d86d77620f204a041697b0494669b1742c5"),
    FileEntry(OCR_RECOGNIZERS["ko"], 13_488_748, "cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b"),
)
PP_OCRV5_MOBILE = OcrModelSpec(
    model_id=OCR_RESOURCE_ID, directory=OCR_RESOURCE_ID,
    repo="RapidAI/RapidOCR", revision=OCR_REVISION, files=OCR_FILES,
    modelscope_repo="RapidAI/RapidOCR", modelscope_revision=OCR_REVISION,
    modelscope_files=OCR_FILES,
)


# Language groups follow PaddleOCR's multilingual model routing. Artifact digests and sizes
# are pinned to the same RapidAI revision as the existing CJK installation above.
OCR_GROUP_LANGUAGES = {'ch': ('zh', 'zh-Hant', 'en', 'ja'),
 'korean': ('ko', 'en'),
 'latin': ('af',
           'az',
           'bs',
           'ca',
           'cs',
           'cy',
           'da',
           'de',
           'es',
           'et',
           'eu',
           'fi',
           'fr',
           'ga',
           'gl',
           'hr',
           'hu',
           'id',
           'is',
           'it',
           'ku',
           'la',
           'lb',
           'lt',
           'lv',
           'mi',
           'ms',
           'mt',
           'nl',
           'no',
           'oc',
           'pi',
           'pl',
           'pt',
           'qu',
           'rm',
           'ro',
           'sr-Latn',
           'sk',
           'sl',
           'sq',
           'sv',
           'sw',
           'tl',
           'tr',
           'uz',
           'vi'),
 'eslav': ('be', 'ru', 'uk', 'en'),
 'en': ('en',),
 'th': ('th', 'en'),
 'el': ('el', 'en'),
 'arabic': ('ar', 'bal', 'fa', 'ku', 'ps', 'sd', 'ug', 'ur', 'en'),
 'cyrillic': ('abq',
              'ady',
              'ava',
              'ba',
              'be',
              'bg',
              'bua',
              'che',
              'cv',
              'dar',
              'inh',
              'kaa',
              'kbd',
              'kk',
              'kv',
              'ky',
              'lbe',
              'lez',
              'mhr',
              'mk',
              'mn',
              'mo',
              'os',
              'sr',
              'ru',
              'sah',
              'tab',
              'tg',
              'tt',
              'tyv',
              'udm',
              'uk',
              'xal',
              'en'),
 'devanagari': ('ang',
                'bgc',
                'bh',
                'bho',
                'gom',
                'hi',
                'mah',
                'mai',
                'mr',
                'ne',
                'new',
                'sa',
                'sck',
                'en'),
 'ta': ('ta', 'en'),
 'te': ('te', 'en')}
OCR_VARIANT_FILES = {'ch': (16631306, '5825fc7ebf84ae7a412be049820b4d86d77620f204a041697b0494669b1742c5'),
 'korean': (13488748, 'cd6e2ea50f6943ca7271eb8c56a877a5a90720b7047fe9c41a2e541a25773c9b'),
 'latin': (7904513, 'b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a'),
 'eslav': (7911802, '08705d6721849b1347d26187f15a5e362c431963a2a62bfff4feac578c489aab'),
 'en': (7872351, 'c3461add59bb4323ecba96a492ab75e06dda42467c9e3d0c18db5d1d21924be8'),
 'th': (7915294, 'de541dd83161c241ff426f7ecfd602a0ba77d686cf3ab9a6c255ea82fd08006e'),
 'el': (7832350, 'b4368bccd557123c702b7549fee6cd1e94b581337d1c9b65310f109131542b7f'),
 'arabic': (8023828, 'c1192e632d0baa9146ae5b756a0e635e3dc63c1733737ebfd1629e87144e9295'),
 'cyrillic': (8074092, '90f761b4bfcce0c8c561c0cb5c887b0971d3ec01c32164bdf7374a35b0982711'),
 'devanagari': (7940361, 'd6f0a906580e3fa6b324a318718f1f31f268b6ea8ef985f91c2012a37f52c91e'),
 'ta': (7909926, 'a42448808b7dea87597336f12438935f40353f1949e8360acd9e06b4da21bfe1'),
 'te': (7923102, 'a3690451b50028a09a3316a1274f7c05728151ea3f8fd392696397a7fefcbd92')}
OCR_GROUP_NAMES = {
    "ch": "Chinese / English / Japanese", "korean": "Korean", "latin": "Latin", "eslav": "East Slavic",
    "en": "English", "th": "Thai", "el": "Greek", "arabic": "Arabic", "cyrillic": "Cyrillic",
    "devanagari": "Devanagari", "ta": "Tamil", "te": "Telugu",
}
OCR_VARIANTS = tuple(
    OcrModelSpec(
        model_id=f"pp-ocrv5-mobile-{group}-onnx", directory=f"pp-ocrv5-mobile-{group}-onnx",
        repo="RapidAI/RapidOCR", revision=OCR_REVISION,
        files=(OCR_FILES[0], FileEntry(f"{group}_PP-OCRv5_rec_mobile.onnx", size, digest)),
        modelscope_repo="RapidAI/RapidOCR", modelscope_revision=OCR_REVISION,
        modelscope_files=(OCR_FILES[0], FileEntry(f"{group}_PP-OCRv5_rec_mobile.onnx", size, digest)),
    ) for group, (size, digest) in OCR_VARIANT_FILES.items()
)
OCR_SPECS = {spec.model_id: spec for spec in (
    PP_OCRV5_MOBILE, *OCR_VARIANTS, MANGA_OCR, BABERU_OCR, PPOCRV6, PADDLEOCR_VL
)}
OCR_LANGUAGES = {OCR_RESOURCE_ID: ("zh", "zh-Hant", "en", "ja", "ko"), **{
    spec.model_id: OCR_GROUP_LANGUAGES[group] for spec, group in zip(OCR_VARIANTS, OCR_VARIANT_FILES)
}}
OCR_LANGUAGES[MANGA_OCR_ID] = ("ja",)
OCR_LANGUAGES.update({
    BABERU_OCR_ID: ("ja", "zh", "zh-Hant", "ko", "en"),
    PPOCRV6_ID: ("zh", "zh-Hant", "ja", "ko", "en"),
    PADDLEOCR_VL_ID: ("zh", "zh-Hant", "ja", "ko", "en"),
})
OCR_NAMES = {OCR_RESOURCE_ID: "PP-OCRv5 mobile (CJK)", **{
    spec.model_id: f"PP-OCRv5 mobile · {OCR_GROUP_NAMES[group]}" for spec, group in zip(OCR_VARIANTS, OCR_VARIANT_FILES)
}}
OCR_NAMES[MANGA_OCR_ID] = "Manga OCR (Japanese)"
OCR_NAMES.update({
    BABERU_OCR_ID: "Baberu OCR (Apache-2.0)",
    PPOCRV6_ID: "PP-OCRv6 Medium (Apache-2.0)",
    PADDLEOCR_VL_ID: "PaddleOCR-VL 1.6 (experimental; Apache-2.0)",
})
