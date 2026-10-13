import { localeNames, type Locale } from './content'

export type LocalePreference = Locale | 'auto'
const preferenceKey = 'nola-site-language'

export const autoLocaleNames: Record<Locale, string> = {
  'zh-CN': '自动检测', 'zh-TW': '自動偵測', 'zh-HK': '自動偵測',
  en: 'Auto detect', ja: '自動検出', ko: '자동 감지',
}

export function detectSiteLocale(languages: readonly string[]): Locale {
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
  return 'en'
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
  return Object.hasOwn(localeNames, first) ? first as Locale : 'zh-CN'
}

export function localizedSitePath(pathname: string, locale: Locale, base: string): string {
  if (!pathname.startsWith(base)) return pathname
  const relative = pathname.slice(base.length)
  const first = relative.split('/')[0]
  const rest = Object.hasOwn(localeNames, first) ? relative.slice(first.length).replace(/^\//, '') : relative
  return `${base}${locale === 'zh-CN' ? '' : `${locale}/`}${rest}`
}
