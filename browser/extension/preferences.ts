import { LANGUAGE_CODES, type UiLanguagePreference } from '../../src/shared/languages'

export const UI_LANGUAGES: UiLanguagePreference[] = ['auto', 'zh-CN', 'zh-TW', 'zh-HK', 'ko', 'ja', 'en']
export type DisplayMode = 'bilingual' | 'translation'
export interface Preferences {
  sourceLanguage: string
  pageProvider: string
  selectionProvider: string
  inputProvider: string
  asrProvider: string
  ttsProvider: string
  s2sProvider: string
  llmProvider: string
  subtitleProvider: string
  pageScope: 'all' | 'main'
  translateTitle: boolean
  skipLanguages: string[]
  minTextLength: number
  hoverTranslation: boolean
  selectionTranslation: boolean
  inputTranslation: boolean
  floatingButton: boolean
  floatingSide: 'left' | 'right'
  floatingPosition: number
  floatingLocked: boolean
  floatingClickAction: 'panel' | 'translate'
  floatingDisabledSites: string[]
  selectionOpacity: number
  selectionTranslate: boolean
  selectionCopy: boolean
  selectionSpeak: boolean
  selectionDisabledSites: string[]
  inputTrigger: 'shortcut' | 'tripleSpace'
  contextAware: boolean
  contextMenuEnabled: boolean
  contextMenuPage: boolean
  contextMenuSelection: boolean
  contextMenuSpeak: boolean
  contextMenuInput: boolean
  inputSourceLanguage: string
  inputTargetLanguage: string
  siteBlacklist: string[]
  neverAutoSites: string[]
  pageStyle: 'underline' | 'block' | 'plain'
  pageCustomCss: string
  subtitleCustomCss: string
  pagePrompt: string
  subtitlePrompt: string
  requestRate: number
  batchSize: number
  shortcutPage: string
  shortcutSelection: string
  shortcutHover: string
  shortcutSubtitles: string
  ttsVoice: string
  ttsRate: number
  ttsPitch: number
  ttsVolume: number
  glossary: Array<{ source: string; target: string; sites: string }>
  siteRules: Array<{ host: string; excludeSelectors: string; includeSelectors: string }>

  uiLanguage: UiLanguagePreference
  theme: 'auto' | 'light' | 'dark'
  pageLanguage: string
  pageDisplay: DisplayMode
  autoSites: string[]
  videoLanguage: string
  videoDisplay: DisplayMode | 'source'
  autoSubtitleSites: string[]
  subtitleFont: string
  subtitleSourceSize: number
  subtitleSourceColor: string
  subtitleSourceFont: string
  subtitleTranslationSize: number
  subtitleTranslationColor: string
  subtitleTranslationFont: string
  subtitleTranslationFirst: boolean
  subtitleBold: boolean
  subtitlePauseOnHover: boolean
  subtitleColor: string
  subtitleBackground: string
  subtitleBackgroundOpacity: number
  subtitleFollow: boolean
  subtitlePositionX: number
  subtitlePositionY: number
  pipeline: 'desktop' | 'cascade' | 's2s'
  subtitleSize: number
  subtitleOffset: number
}

export const DEFAULT_PREFERENCES: Preferences = {
  asrProvider: 'desktop', ttsProvider: 'desktop', s2sProvider: 'desktop', llmProvider: 'desktop', sourceLanguage: 'auto', pageProvider: 'desktop', selectionProvider: 'desktop', inputProvider: 'desktop', subtitleProvider: 'desktop',
  pageScope: 'main', translateTitle: true, skipLanguages: [], minTextLength: 2,
  hoverTranslation: true, selectionTranslation: true, inputTranslation: false, floatingButton: true, contextAware: false, contextMenuEnabled: true,
  contextMenuPage: true, contextMenuSelection: true, contextMenuSpeak: true, contextMenuInput: true, inputSourceLanguage: 'auto', inputTargetLanguage: 'zh',
  floatingSide: 'right', floatingPosition: 0.65, floatingLocked: false, floatingClickAction: 'translate', floatingDisabledSites: [], selectionOpacity: 0.95, selectionTranslate: true, selectionCopy: true, selectionSpeak: true, selectionDisabledSites: [], inputTrigger: 'tripleSpace',
  siteBlacklist: [], neverAutoSites: [], pageStyle: 'underline', pageCustomCss: '', subtitleCustomCss: '', pagePrompt: '', subtitlePrompt: '',
  requestRate: 5, batchSize: 8, shortcutPage: 'Alt+T', shortcutSelection: 'Alt+S', shortcutHover: 'Alt', shortcutSubtitles: 'Alt+V',
  ttsVoice: '', ttsRate: 1, ttsPitch: 1, ttsVolume: 1, glossary: [], siteRules: [],

  uiLanguage: 'auto', theme: 'auto', pageLanguage: 'zh', pageDisplay: 'bilingual', autoSites: [],
  subtitleSourceSize: 16, subtitleSourceColor: '#ffffff', subtitleSourceFont: 'system-ui', subtitleTranslationSize: 16, subtitleTranslationColor: '#ffffff', subtitleTranslationFont: 'system-ui', subtitleTranslationFirst: false, subtitleBold: false, subtitlePauseOnHover: false,
  autoSubtitleSites: [], subtitleFont: 'system-ui', subtitleColor: '#ffffff', subtitleBackground: '#000000', subtitleBackgroundOpacity: 0.72, subtitleFollow: true, subtitlePositionX: 50, subtitlePositionY: 95,
  videoLanguage: 'zh', videoDisplay: 'bilingual', pipeline: 'cascade', subtitleSize: 16, subtitleOffset: 5,
}
const keys = (Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]).filter(key => key !== 'glossary')
const numberIn = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.min(max, Math.max(min, value))) : fallback
const subtitleColor = (value: unknown, fallback: string) => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback
const subtitleFont = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 256) : fallback
function readSitePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((raw): raw is string => {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048 || /\s/.test(raw)) return false
    const pattern = raw.trim()
    if (pattern.includes('://') && !/^https?:\/\//i.test(pattern)) return false
    if (!pattern.includes('://') && !/^[a-z0-9*[]/i.test(pattern)) return false
    try {
      const url = new URL((pattern.includes('://') ? pattern : 'https://' + pattern).replaceAll('*', 'x'))
      return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
    } catch { return false }
  }).map(pattern => pattern.trim()).slice(0, 200)
}
export function readPreferences(values: Record<string, unknown>): Preferences {
  const settings = { ...DEFAULT_PREFERENCES }
  for (const key of Object.keys(DEFAULT_PREFERENCES) as (keyof Preferences)[]) {
    const value = values[key]
    if (typeof DEFAULT_PREFERENCES[key] === 'boolean' && typeof value === 'boolean') Object.assign(settings, { [key]: value })
    if (typeof DEFAULT_PREFERENCES[key] === 'string' && typeof value === 'string') Object.assign(settings, { [key]: value.slice(0, 8192) })
  }
  for (const key of ['siteBlacklist', 'neverAutoSites', 'autoSubtitleSites', 'floatingDisabledSites', 'selectionDisabledSites'] as const) {
    settings[key] = readSitePatterns(values[key])
  }
  settings.skipLanguages = Array.isArray(values.skipLanguages) ? values.skipLanguages.filter((code): code is string => typeof code === 'string' && LANGUAGE_CODES.includes(code)) : []
  settings.glossary = Array.isArray(values.glossary) ? values.glossary.filter((row): row is Preferences['glossary'][number] => Boolean(row) && typeof row.source === 'string' && typeof row.target === 'string' && typeof row.sites === 'string').slice(0, 20000) : []
  settings.siteRules = Array.isArray(values.siteRules) ? values.siteRules.filter((row): row is Preferences['siteRules'][number] => Boolean(row) && typeof row.host === 'string' && typeof row.excludeSelectors === 'string' && typeof row.includeSelectors === 'string').slice(0, 200) : []
  return {
    ...settings,
    inputSourceLanguage: values.inputSourceLanguage === 'auto' || typeof values.inputSourceLanguage === 'string' && LANGUAGE_CODES.includes(values.inputSourceLanguage) ? values.inputSourceLanguage : typeof values.sourceLanguage === 'string' && LANGUAGE_CODES.includes(values.sourceLanguage) ? values.sourceLanguage : 'auto',
    inputTargetLanguage: typeof values.inputTargetLanguage === 'string' && LANGUAGE_CODES.includes(values.inputTargetLanguage) ? values.inputTargetLanguage : typeof values.pageLanguage === 'string' && LANGUAGE_CODES.includes(values.pageLanguage) ? values.pageLanguage : 'zh',
    sourceLanguage: values.sourceLanguage === 'auto' || (typeof values.sourceLanguage === 'string' && LANGUAGE_CODES.includes(values.sourceLanguage)) ? values.sourceLanguage : 'auto',
    selectionOpacity: typeof values.selectionOpacity === 'number' && Number.isFinite(values.selectionOpacity) ? Math.max(0.2, Math.min(1, values.selectionOpacity)) : 0.95,
    floatingSide: values.floatingSide === 'left' ? 'left' : 'right',
    floatingPosition: typeof values.floatingPosition === 'number' && Number.isFinite(values.floatingPosition) ? Math.max(0, Math.min(1, values.floatingPosition)) : 0.65,
    floatingClickAction: values.floatingClickAction === 'panel' ? 'panel' : 'translate',
    inputTrigger: values.inputTrigger === 'shortcut' ? 'shortcut' : 'tripleSpace',
    pageScope: values.pageScope === 'all' ? 'all' : 'main',
    pageStyle: values.pageStyle === 'block' || values.pageStyle === 'plain' ? values.pageStyle : 'underline',
    minTextLength: numberIn(values.minTextLength, 1, 1000, 2),
    requestRate: numberIn(values.requestRate, 1, 60, 5), batchSize: numberIn(values.batchSize, 1, 100, 8),
    ttsRate: typeof values.ttsRate === 'number' && Number.isFinite(values.ttsRate) ? Math.max(0.1, Math.min(10, values.ttsRate)) : 1,
    ttsPitch: typeof values.ttsPitch === 'number' && Number.isFinite(values.ttsPitch) ? Math.max(0, Math.min(2, values.ttsPitch)) : 1,
    ttsVolume: typeof values.ttsVolume === 'number' && Number.isFinite(values.ttsVolume) ? Math.max(0, Math.min(1, values.ttsVolume)) : 1,
    uiLanguage: UI_LANGUAGES.includes(values.uiLanguage as UiLanguagePreference) ? values.uiLanguage as UiLanguagePreference : 'auto',
    theme: values.theme === 'dark' || values.theme === 'light' ? values.theme : 'auto',
    pageLanguage: typeof values.pageLanguage === 'string' && LANGUAGE_CODES.includes(values.pageLanguage) ? values.pageLanguage : DEFAULT_PREFERENCES.pageLanguage,
    pageDisplay: values.pageDisplay === 'translation' ? 'translation' : 'bilingual',
    autoSites: readSitePatterns(values.autoSites).slice(0, 100),
    videoLanguage: typeof values.videoLanguage === 'string' && LANGUAGE_CODES.includes(values.videoLanguage) ? values.videoLanguage : DEFAULT_PREFERENCES.videoLanguage,
    videoDisplay: values.videoDisplay === 'source' || values.videoDisplay === 'translation' ? values.videoDisplay : 'bilingual',
    subtitleSourceSize: numberIn(values.subtitleSourceSize, 10, 60, numberIn(values.subtitleSize, 10, 60, 16)),
    subtitleTranslationSize: numberIn(values.subtitleTranslationSize, 10, 60, numberIn(values.subtitleSize, 10, 60, 16)),
    subtitleSourceColor: subtitleColor(values.subtitleSourceColor, subtitleColor(values.subtitleColor, '#ffffff')),
    subtitleTranslationColor: subtitleColor(values.subtitleTranslationColor, subtitleColor(values.subtitleColor, '#ffffff')),
    subtitleSourceFont: subtitleFont(values.subtitleSourceFont, subtitleFont(values.subtitleFont, 'system-ui')),
    subtitleTranslationFont: subtitleFont(values.subtitleTranslationFont, subtitleFont(values.subtitleFont, 'system-ui')),
    subtitleBackgroundOpacity: typeof values.subtitleBackgroundOpacity === 'number' && Number.isFinite(values.subtitleBackgroundOpacity) ? Math.max(0, Math.min(1, values.subtitleBackgroundOpacity)) : 0.72,
    subtitlePositionX: numberIn(values.subtitlePositionX, 0, 100, 50), subtitlePositionY: numberIn(values.subtitlePositionY, 0, 100, 95),
    pipeline: values.pipeline === 's2s' ? 's2s' : 'cascade',
    subtitleSize: numberIn(values.subtitleSize, 10, 60, DEFAULT_PREFERENCES.subtitleSize),
    subtitleOffset: numberIn(values.subtitleOffset, 0, 30, DEFAULT_PREFERENCES.subtitleOffset),
  }
}
export async function loadPreferences(): Promise<Preferences> {
  return readPreferences(await chrome.storage.local.get(keys))
}
export function savePreferences(patch: Partial<Preferences>): Promise<void> {
  return chrome.storage.local.set(patch)
}
export function observePreferences(onChange: (settings: Preferences) => void): () => void {
  let disposed = false
  let revision = 0
  const refresh = () => {
    const requested = ++revision
    void loadPreferences().then(settings => { if (!disposed && revision === requested) onChange(settings) }).catch(() => undefined)
  }
  const listener = (_changes: unknown, area: string) => { if (area === 'local') refresh() }
  chrome.storage.onChanged.addListener(listener)
  refresh()
  return () => { disposed = true; chrome.storage.onChanged.removeListener(listener) }
}

export function matchesSitePatterns(patterns: string[], href: string): boolean {
  let url: URL
  try { url = new URL(href) } catch { return false }
  return patterns.some(raw => {
    const pattern = raw.trim().toLowerCase()
    if (!pattern) return false
    if (!pattern.includes('://') && !pattern.includes('/') && !pattern.includes('*')) return url.hostname === pattern || url.hostname.endsWith('.' + pattern)
    if (pattern.startsWith('*.') && !pattern.includes('/')) return url.hostname === pattern.slice(2) || url.hostname.endsWith(pattern.slice(1))
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
    try { return new RegExp('^' + escaped + '/?$', 'i').test(pattern.includes('://') ? (pattern.includes('/', pattern.indexOf('://') + 3) ? url.href : url.origin) : url.hostname + url.pathname) } catch { return false }
  })
}
export function siteEnabled(settings: Pick<Preferences, 'siteBlacklist'>, href: string): boolean {
  return !matchesSitePatterns(settings.siteBlacklist, href)
}
