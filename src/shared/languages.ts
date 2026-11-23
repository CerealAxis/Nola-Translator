import { INDEX_TRANSLATE_LANGUAGE_NAMES } from './index-translate'

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
Object.assign(LANGUAGE_LABELS, Object.fromEntries(Object.entries(INDEX_TRANSLATE_LANGUAGE_NAMES).map(([code, zh]) => [
  code,
  specialLabel(code, zh, english?.of(code) ?? code),
])))
Object.assign(LANGUAGE_LABELS, {
  auto: specialLabel('auto', '自动检测', 'Auto detect', { zhTW: '自動偵測', zhHK: '自動偵測', ko: '자동 감지', ja: '自動検出' }),
  none: specialLabel('none', '不翻译', 'No translation', { zhTW: '不翻譯', zhHK: '不翻譯', ko: '번역 안 함', ja: '翻訳しない' }),
  zh: specialLabel('zh', '中文（简体）', 'Chinese (Simplified)', { zhTW: '簡體中文', zhHK: '簡體中文', ko: '중국어(간체)', ja: '中国語（簡体字）' }),
  'zh-Hant': specialLabel('zh-Hant', '中文（繁体）', 'Chinese (Traditional)', { zhTW: '繁體中文', zhHK: '繁體中文', ko: '중국어(번체)', ja: '中国語（繁体字）' }),
  bo: specialLabel('bo', '藏语', 'Tibetan', { zhTW: '藏語', zhHK: '藏語', ja: 'チベット語', ko: '티베트어' }),
  yue: specialLabel('yue', '粤语', 'Cantonese', { zhTW: '粵語', zhHK: '粵語' }),
  pi: specialLabel('pi', '巴利语', 'Pali', { zhTW: '巴利語', zhHK: '巴利語', ja: 'パーリ語', ko: '팔리어' }),
  ff: specialLabel('ff', '富拉语', 'Fulah', { zhTW: '富拉語', zhHK: '富拉語', ja: 'フラ語', ko: '풀라어' }),
  // M2M100 uses its own "ns" code for Northern Sotho; keep the inference code intact.
  ns: specialLabel('ns', '北索托语', 'Northern Sotho', { zhTW: '北索托語', zhHK: '北索托語', ja: '北ソト語', ko: '북소토어' }),
  abq: specialLabel('abq', '阿巴扎语', 'Abaza', { zhTW: '阿巴扎語', zhHK: '阿巴扎語', ja: 'アバザ語', ko: '아바자어' }),
  lbe: specialLabel('lbe', '拉克语', 'Lak', { zhTW: '拉克語', zhHK: '拉克語', ja: 'ラク語', ko: '라크어' }),
  tab: specialLabel('tab', '塔巴萨兰语', 'Tabassaran', { zhTW: '塔巴薩蘭語', zhHK: '塔巴薩蘭語', ja: 'タバサラン語', ko: '타바사란어' }),
  sck: specialLabel('sck', '萨德里语', 'Sadri', { zhTW: '薩德里語', zhHK: '薩德里語', ja: 'サドリ語', ko: '사드리어' }),
  // Electron's ICU omits these CLDR names even when the development Node runtime has them.
  ba: specialLabel('ba', '巴什基尔语', 'Bashkir', { zhTW: '巴什喀爾文', zhHK: '巴什基爾文', ja: 'バシキール語', ko: '바슈키르어' }),
  ss: specialLabel('ss', '斯瓦蒂语', 'Swati', { zhTW: '斯瓦特文', zhHK: '斯瓦特文', ja: 'スワジ語', ko: '시스와티어' }),
  bal: specialLabel('bal', '俾路支语', 'Baluchi', { zhTW: '俾路支文', zhHK: '俾路支文', ja: 'バルーチー語', ko: '발루치어' }),
  ady: specialLabel('ady', '阿迪格语', 'Adyghe', { zhTW: '阿迪各文', zhHK: '阿迪各文', ja: 'アディゲ語', ko: '아디게어' }),
  bua: specialLabel('bua', '布里亚特语', 'Buriat', { zhTW: '布里阿特文', zhHK: '布里阿特文', ja: 'ブリヤート語', ko: '부리아타' }),
  cv: specialLabel('cv', '楚瓦什语', 'Chuvash', { zhTW: '楚瓦什文', zhHK: '楚瓦什文', ja: 'チュヴァシ語', ko: '추바시어' }),
  dar: specialLabel('dar', '达尔格瓦语', 'Dargwa', { zhTW: '達爾格瓦文', zhHK: '達爾格瓦文', ja: 'ダルグワ語', ko: '다르그와어' }),
  inh: specialLabel('inh', '印古什语', 'Ingush', { zhTW: '印古什文', zhHK: '印古什文', ja: 'イングーシ語', ko: '인귀시어' }),
  kaa: specialLabel('kaa', '卡拉卡尔帕克语', 'Kara-Kalpak', { zhTW: '卡拉卡爾帕克文', zhHK: '卡拉卡爾帕克文', ja: 'カラカルパク語', ko: '카라칼파크어' }),
  kbd: specialLabel('kbd', '卡巴尔德语', 'Kabardian', { zhTW: '卡巴爾達文', zhHK: '卡巴爾達文', ja: 'カバルド語', ko: '카바르디어' }),
  kv: specialLabel('kv', '科米语', 'Komi', { zhTW: '科米文', zhHK: '科米文', ja: 'コミ語', ko: '코미어' }),
  lez: specialLabel('lez', '列兹金语', 'Lezghian', { zhTW: '列茲干文', zhHK: '列茲干文', ja: 'レズギ語', ko: '레즈기안어' }),
  os: specialLabel('os', '奥塞梯语', 'Ossetic', { zhTW: '奧塞提文', zhHK: '奧塞提文', ja: 'オセット語', ko: '오세트어' }),
  sah: specialLabel('sah', '萨哈语', 'Yakut', { zhTW: '雅庫特文', zhHK: '雅庫特文', ja: 'サハ語', ko: '야쿠트어' }),
  tyv: specialLabel('tyv', '图瓦语', 'Tuvinian', { zhTW: '圖瓦文', zhHK: '圖瓦文', ja: 'トゥヴァ語', ko: '투비니안어' }),
  udm: specialLabel('udm', '乌德穆尔特语', 'Udmurt', { zhTW: '烏德穆爾特文', zhHK: '烏德穆爾特文', ja: 'ウドムルト語', ko: '우드말트어' }),
  xal: specialLabel('xal', '卡尔梅克语', 'Kalmyk', { zhTW: '卡爾梅克文', zhHK: '卡爾梅克文', ja: 'カルムイク語', ko: '칼미크어' }),
  ang: specialLabel('ang', '古英语', 'Old English', { zhTW: '古英文', zhHK: '古英文', ja: '古英語', ko: '고대 영어' }),
  bgc: specialLabel('bgc', '哈里亚纳语', 'Haryanvi', { zhTW: '哈里亞納文', zhHK: '哈里亞納文', ja: 'ハリヤーンウィー語', ko: '하리안비어' }),
  new: specialLabel('new', '尼瓦尔语', 'Newari', { zhTW: '尼瓦爾文', zhHK: '尼瓦爾文', ja: 'ネワール語', ko: '네와르어' }),
})
LANGUAGE_LABELS.fil = { ...LANGUAGE_LABELS.tl, code: 'fil' }

export function languageName(code: string, locale: UiLanguage): string {
  const label = LANGUAGE_LABELS[normalizeLanguage(code)] ?? LANGUAGE_LABELS[code]
  if (!label) {
    try { return languageNames(locale)?.of(code) ?? code } catch { return code }
  }
  if (locale === 'zh-CN') return label.zh
  if (locale === 'zh-TW') return label.zhTW
  if (locale === 'zh-HK') return label.zhHK
  return label[locale]
}
