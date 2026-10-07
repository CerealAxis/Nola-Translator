/** Language identity is shared; model capabilities decide which codes are selectable. */
export const LANGUAGE_CODES: readonly string[] = ["zh", "en", "yue", "ar", "de", "fr", "es", "pt", "id", "it", "ko", "ru", "th", "vi", "ja", "tr", "hi", "ms", "nl", "sv", "da", "fi", "pl", "cs", "tl", "fa", "el", "hu", "mk", "ro", "zh-Hant", "km", "my", "gu", "ur", "te", "mr", "he", "bn", "ta", "uk", "bo", "kk", "mn", "ug", "af", "am", "ast", "az", "ba", "be", "bg", "br", "bs", "ca", "ceb", "cy", "et", "ff", "fy", "ga", "gd", "gl", "ha", "hr", "ht", "hy", "ig", "ilo", "is", "jv", "ka", "kn", "lb", "lg", "ln", "lo", "lt", "lv", "mg", "ml", "ne", "no", "ns", "oc", "or", "pa", "ps", "sd", "si", "sk", "sl", "so", "sq", "sr", "ss", "su", "sw", "tn", "uz", "wo", "xh", "yi", "yo", "zu"]
export interface LanguageLabel { code: string; zh: string; en: string }
export function normalizeLanguage(code: string): string {
  const key = code.trim().toLowerCase()
  if (key === 'fil') return 'tl'
  if (key === 'zh-hant' || /^zh-(tw|hk|mo)$/.test(key)) return 'zh-Hant'
  if (key === 'zh-hans' || key === 'zh-cn' || key === 'zh-sg') return 'zh'
  return key
}
function languageNames(locale: string): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames([locale], { type: 'language' }) } catch { return null }
}
const chinese = languageNames('zh-CN')
const english = languageNames('en')
export const LANGUAGE_LABELS: Record<string, LanguageLabel> = Object.fromEntries(
  LANGUAGE_CODES.map(code => [code, { code, zh: chinese?.of(code) ?? code, en: english?.of(code) ?? code }]),
)
Object.assign(LANGUAGE_LABELS, {
  auto: { code: 'auto', zh: '自动检测', en: 'Auto detect' },
  none: { code: 'none', zh: '不翻译', en: 'No translation' },
  zh: { code: 'zh', zh: '中文（简体）', en: 'Chinese (Simplified)' },
  'zh-Hant': { code: 'zh-Hant', zh: '中文（繁体）', en: 'Chinese (Traditional)' },
  bo: { code: 'bo', zh: '藏语', en: 'Tibetan' },
  yue: { code: 'yue', zh: '粤语', en: 'Cantonese' },
})
LANGUAGE_LABELS.fil = { ...LANGUAGE_LABELS.tl, code: 'fil' }
