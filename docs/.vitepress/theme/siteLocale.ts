import { localeNames, type Locale } from './content'

export type LocalePreference = Locale | 'auto'
export const defaultLocale: Locale = 'en'
const preferenceKey = 'nola-site-language'

export const autoLocaleNames: Record<Locale, string> = {
  'zh-CN': '自动检测', 'zh-TW': '自動偵測', 'zh-HK': '自動偵測',
  en: 'Auto detect', ja: '自動検出', ko: '자동 감지',
}

// Mozilla Translation Bar, bedrock-l10n revision db41817c5a461b6213337f844a8be428b9db8e27.
const traditionalPrompt = { confirm: '好！', dismiss: '不要。' }
export const languagePrompt = {
  en: { description: 'Would you like to see this page in your language?', confirm: 'Yes, please!', dismiss: 'No, thanks.' },
  'zh-CN': { description: '想以您的语言查看本页吗？', confirm: '好，正合我意！', dismiss: '不，谢谢。' },
  'zh-TW': { description: '您想要檢視此頁面的 正體中文（繁體）版本嗎？', ...traditionalPrompt },
  'zh-HK': { description: '想以您的語言瀏覽此頁嗎？', ...traditionalPrompt },
  ja: { description: 'このページを日本語で表示しますか?', confirm: 'はい', dismiss: 'いいえ' },
  ko: { description: '한국어로 현재 페이지를 보시겠습니까?', confirm: '네, 물론이요!', dismiss: '아니요, 괜찮습니다.' },
} satisfies Record<Locale, { description: string; confirm: string; dismiss: string }>

export function detectSiteLocale(languages: readonly string[]): Locale | undefined {
  for (const language of languages) {
    const tag = language.toLowerCase().replaceAll('_', '-')
    if (/^zh(?:-|$)/.test(tag)) {
      if (/(?:^|-)(hk|mo)(?:-|$)/.test(tag)) return 'zh-HK'
      if (/(?:^|-)(tw|hant)(?:-|$)/.test(tag)) return 'zh-TW'
      return 'zh-CN'
    }
    if (/^ja(?:-|$)/.test(tag)) return 'ja'
    if (/^ko(?:-|$)/.test(tag)) return 'ko'
    if (/^en(?:-|$)/.test(tag)) return 'en'
  }
}

export function readLocalePreference(): LocalePreference {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved && Object.hasOwn(localeNames, saved)) return saved as Locale
  } catch { /* Browsing without storage still supports automatic detection. */ }
  return 'auto'
}

export function saveLocalePreference(preference: LocalePreference): void {
  try { localStorage.setItem(preferenceKey, preference) } catch { /* The current selection still applies to this visit. */ }
}

export function localeOfPath(pathname: string, base: string): Locale {
  const first = pathname.slice(base.length).split('/')[0]
  if (first === 'vis') return 'zh-CN'
  return Object.hasOwn(localeNames, first) ? first as Locale : defaultLocale
}

export function homePath(locale: Locale, base: string): string {
  return locale === defaultLocale ? base : `${base}${locale}/`
}

export function isHomePath(path: string, base: string): boolean {
  const relative = path.slice(base.length).replace(/(?:^|\/)index\.html$/, '').replace(/\/$/, '')
  return relative === '' || Object.hasOwn(localeNames, relative)
}
