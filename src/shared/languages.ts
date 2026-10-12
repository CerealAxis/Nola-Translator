/** Language identity is shared; model capabilities decide which codes are selectable. */
export const LANGUAGE_CODES: readonly string[] = ["ky", "tg", "zh", "en", "yue", "ar", "de", "fr", "es", "pt", "id", "it", "ko", "ru", "th", "vi", "ja", "tr", "hi", "ms", "nl", "sv", "da", "fi", "pl", "cs", "tl", "fa", "el", "hu", "mk", "ro", "zh-Hant", "km", "my", "gu", "ur", "te", "mr", "he", "bn", "ta", "uk", "bo", "kk", "mn", "ug", "af", "am", "ast", "az", "ba", "be", "bg", "br", "bs", "ca", "ceb", "cy", "et", "ff", "fy", "ga", "gd", "gl", "ha", "hr", "ht", "hy", "ig", "ilo", "is", "jv", "ka", "kn", "lb", "lg", "ln", "lo", "lt", "lv", "mg", "ml", "ne", "no", "ns", "oc", "or", "pa", "ps", "sd", "si", "sk", "sl", "so", "sq", "sr", "ss", "su", "sw", "tn", "uz", "wo", "xh", "yi", "yo", "zu"]
export interface LanguageLabel { code: string; zh: string; zhTW: string; zhHK: string; ko: string; ja: string; en: string }
export type UiLanguage = 'zh-CN' | 'zh-TW' | 'zh-HK' | 'ko' | 'ja' | 'en'
export type UiLanguagePreference = UiLanguage | 'auto'

export function resolveUiLanguage(preference: UiLanguagePreference, systemLocale: string): UiLanguage {
  if (preference !== 'auto') return preference
  const locale = systemLocale.trim().replaceAll('_', '-').toLowerCase()
  if (locale.startsWith('zh-hk') || locale.startsWith('zh-mo') || locale.includes('hant-hk') || locale.includes('hant-mo')) return 'zh-HK'
  if (locale.startsWith('zh-tw') || locale.includes('hant')) return 'zh-TW'
  if (locale.startsWith('zh')) return 'zh-CN'
  if (locale.startsWith('ko')) return 'ko'
  if (locale.startsWith('ja')) return 'ja'
  return 'en'
}

export function normalizeLanguage(code: string): string {
  const key = code.trim().toLowerCase()
  if (key === 'fil') return 'tl'
  if (key === 'nb') return 'no'
  if (key === 'zh-hant' || /^zh-(tw|hk|mo)$/.test(key)) return 'zh-Hant'
  if (key === 'zh-hans' || key === 'zh-cn' || key === 'zh-sg') return 'zh'
  return key
}
function languageNames(locale: string): Intl.DisplayNames | null {
  try { return new Intl.DisplayNames([locale], { type: 'language' }) } catch { return null }
}
const chinese = languageNames('zh-CN')
const traditionalChinese = languageNames('zh-TW')
const hongKongChinese = languageNames('zh-HK')
const korean = languageNames('ko')
const japanese = languageNames('ja')
const english = languageNames('en')
export const LANGUAGE_LABELS: Record<string, LanguageLabel> = Object.fromEntries(
  LANGUAGE_CODES.map(code => [code, {
    code,
    zh: chinese?.of(code) ?? code,
    zhTW: traditionalChinese?.of(code) ?? code,
    zhHK: hongKongChinese?.of(code) ?? code,
    ko: korean?.of(code) ?? code,
    ja: japanese?.of(code) ?? code,
    en: english?.of(code) ?? code,
  }]),
)
const specialLabel = (code: string, zh: string, en: string, localized: Partial<Pick<LanguageLabel, 'zhTW' | 'zhHK' | 'ko' | 'ja'>> = {}): LanguageLabel => ({
  code, zh, en,
  zhTW: localized.zhTW ?? traditionalChinese?.of(code) ?? code,
  zhHK: localized.zhHK ?? hongKongChinese?.of(code) ?? code,
  ko: localized.ko ?? korean?.of(code) ?? code,
  ja: localized.ja ?? japanese?.of(code) ?? code,
})
Object.assign(LANGUAGE_LABELS, {
  auto: specialLabel('auto', '自动检测', 'Auto detect', { zhTW: '自動偵測', zhHK: '自動偵測', ko: '자동 감지', ja: '自動検出' }),
  none: specialLabel('none', '不翻译', 'No translation', { zhTW: '不翻譯', zhHK: '不翻譯', ko: '번역 안 함', ja: '翻訳しない' }),
  zh: specialLabel('zh', '中文（简体）', 'Chinese (Simplified)', { zhTW: '簡體中文', zhHK: '簡體中文', ko: '중국어(간체)', ja: '中国語（簡体字）' }),
  'zh-Hant': specialLabel('zh-Hant', '中文（繁体）', 'Chinese (Traditional)', { zhTW: '繁體中文', zhHK: '繁體中文', ko: '중국어(번체)', ja: '中国語（繁体字）' }),
  bo: specialLabel('bo', '藏语', 'Tibetan', { zhTW: '藏語', zhHK: '藏語' }),
  yue: specialLabel('yue', '粤语', 'Cantonese', { zhTW: '粵語', zhHK: '粵語' }),
})
LANGUAGE_LABELS.fil = { ...LANGUAGE_LABELS.tl, code: 'fil' }

export function languageName(code: string, locale: UiLanguage): string {
  const label = LANGUAGE_LABELS[normalizeLanguage(code)] ?? LANGUAGE_LABELS[code]
  if (!label) return code
  if (locale === 'zh-CN') return label.zh
  if (locale === 'zh-TW') return label.zhTW
  if (locale === 'zh-HK') return label.zhHK
  return label[locale]
}
