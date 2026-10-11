/** Official public API and the language aliases mapped by its reference client.
 * https://github.com/bilibili/Index-Translate/blob/main/inference/llm/call_api.py
 * The preset deliberately exposes this verified subset of the model's 150-language inventory.
 */
export const INDEX_TRANSLATE_ENDPOINT = 'https://index-translate.bilibili.com/v1'
export const INDEX_TRANSLATE_PUBLIC_MODEL = 'Index-Translate-35B-A3B'
export const INDEX_TRANSLATE_LANGUAGES: readonly string[] = ['en', 'zh', 'de', 'fr', 'es', 'ja', 'ko', 'pt', 'ru', 'ar', 'it', 'nl', 'pl', 'ro', 'sv', 'tr', 'hi', 'vi', 'th', 'id', 'ms', 'tl', 'uk', 'fa', 'cs', 'el', 'da', 'hu', 'fi', 'no', 'sk', 'bg']
export const INDEX_TRANSLATE_MODEL_IDS = ['index-translate-2b-q4-k-m', 'index-translate-9b-q4-k-m', 'index-translate-35b-a3b-q4-k-m'] as const
