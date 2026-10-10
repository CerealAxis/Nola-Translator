"""Model capability validation, independent of inference library imports."""
from .protocol import ModelConfiguration

QWEN_LANGUAGES = ['zh', 'en', 'yue', 'ar', 'de', 'fr', 'es', 'pt', 'id', 'it', 'ko', 'ru', 'th', 'vi', 'ja', 'tr', 'hi', 'ms', 'nl', 'sv', 'da', 'fi', 'pl', 'cs', 'fil', 'fa', 'el', 'hu', 'mk', 'ro']

def normalize(code: str) -> str:
    key = code.strip().lower()
    if key == "fil": return "tl"
    if key in {"zh-hant", "zh-tw", "zh-hk", "zh-mo"}: return "zh-Hant"
    if key in {"zh-hans", "zh-cn", "zh-sg"}: return "zh"
    return key

def supports_translation(configuration: ModelConfiguration | None, source: str, target: str) -> bool:
    if configuration is None or configuration.slot != "translation": return False
    source, target = normalize(source), normalize(target)
    if target not in {normalize(code) for code in configuration.targetLanguages}: return False
    if source != "auto" and source not in {normalize(code) for code in configuration.sourceLanguages}: return False
    # A primary-language match can still hide code-switching, so let the selected
    # translator inspect same-language captions instead of silently dropping them.
    if source == target: return True
    pairs = configuration.translationPairs
    return pairs is None or any(normalize(pair.target) == target and (source == "auto" or normalize(pair.source) == source) for pair in pairs)

def recognition_configuration(languages: list[str]) -> ModelConfiguration:
    return ModelConfiguration(slot="recognition", engine="pytorch", languages=[normalize(code) for code in languages], supportsAutoDetection=True, sourceLanguages=[], targetLanguages=[])

def translation_configuration(languages: list[str], engine: str) -> ModelConfiguration:
    return ModelConfiguration(slot="translation", engine=engine, languages=[], supportsAutoDetection=False, sourceLanguages=languages, targetLanguages=languages)

LANGUAGE_CODES = frozenset(['zh', 'en', 'yue', 'ar', 'de', 'fr', 'es', 'pt', 'id', 'it', 'ko', 'ru', 'th', 'vi', 'ja', 'tr', 'hi', 'ms', 'nl', 'sv', 'da', 'fi', 'pl', 'cs', 'tl', 'fa', 'el', 'hu', 'mk', 'ro', 'zh-Hant', 'km', 'my', 'gu', 'ur', 'te', 'mr', 'he', 'bn', 'ta', 'uk', 'bo', 'kk', 'mn', 'ug', 'af', 'am', 'ast', 'az', 'ba', 'be', 'bg', 'br', 'bs', 'ca', 'ceb', 'cy', 'et', 'ff', 'fy', 'ga', 'gd', 'gl', 'ha', 'hr', 'ht', 'hy', 'ig', 'ilo', 'is', 'jv', 'ka', 'kn', 'lb', 'lg', 'ln', 'lo', 'lt', 'lv', 'mg', 'ml', 'ne', 'no', 'ns', 'oc', 'or', 'pa', 'ps', 'sd', 'si', 'sk', 'sl', 'so', 'sq', 'sr', 'ss', 'su', 'sw', 'tn', 'uz', 'wo', 'xh', 'yi', 'yo', 'zu'])
