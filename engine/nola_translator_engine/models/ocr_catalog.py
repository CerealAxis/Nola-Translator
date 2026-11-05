"""PP-OCRv5 mobile ONNX artifacts, converted and published by RapidAI (Apache-2.0)."""

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
OCR_SPECS = {spec.model_id: spec for spec in (PP_OCRV5_MOBILE, *OCR_VARIANTS)}
OCR_LANGUAGES = {OCR_RESOURCE_ID: ("zh", "zh-Hant", "en", "ja", "ko"), **{
    spec.model_id: OCR_GROUP_LANGUAGES[group] for spec, group in zip(OCR_VARIANTS, OCR_VARIANT_FILES)
}}
OCR_NAMES = {OCR_RESOURCE_ID: "PP-OCRv5 mobile (CJK)", **{
    spec.model_id: f"PP-OCRv5 mobile · {OCR_GROUP_NAMES[group]}" for spec, group in zip(OCR_VARIANTS, OCR_VARIANT_FILES)
}}
