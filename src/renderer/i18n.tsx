/**
 * Interface language preference is persisted by the main process. The `auto` preference resolves
 * from the system locale; the renderer never keeps a second copy in localStorage.
 * zh-CN defines the key tree and every locale is checked against it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { zhCN } from './i18n/zh-CN'
import { en } from './i18n/en'
import { zhTW } from './i18n/zh-TW'
import { zhHK } from './i18n/zh-HK'
import { ko } from './i18n/ko'
import { ja } from './i18n/ja'
import type { Dictionary, DictionaryKey } from './i18n/zh-CN'
import { supportErrorCodeForMessage } from '../shared/error-catalog'
import { resolveUiLanguage } from '../shared/languages'
import type { UiLanguage, UiLanguagePreference } from '../shared/languages'

export type { UiLanguage, UiLanguagePreference } from '../shared/languages'
export { resolveUiLanguage } from '../shared/languages'
export type TranslationVars = Readonly<Record<string, string | number>>

/** 把点号路径编译成字面量联合类型，拼错键会报错。 */
type TranslationKey = DictionaryKey

export type { TranslationKey }

export function appNameForLanguage(language: UiLanguage): string {
  return language === 'en' ? 'Nola Translator' : language === 'zh-TW' || language === 'zh-HK' ? '諾拉翻譯' : language === 'ko' ? '놀라 번역기' : language === 'ja' ? 'ノラ翻訳' : '诺拉翻译'
}

const dictionaries: Record<UiLanguage, Dictionary> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'zh-HK': zhHK,
  ko,
  ja,
  en,
}

function lookup(dictionary: Dictionary, path: string): string | undefined {
  let node: unknown = dictionary
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[segment]
  }
  return typeof node === 'string' ? node : undefined
}

function interpolate(template: string, vars: TranslationVars): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * 取文案。中文界面直接返回词典里的中文原文（`zhCN` 就是中文表本身），
 * 英文界面查 `en` 表。`values` 做 `{name}` 插值。
 */
export function translate(key: string, language: UiLanguage, values: TranslationVars = {}): string {
  const dictionary = dictionaries[language]
  const template = lookup(dictionary, key)
  if (template === undefined) {
    if (language !== 'zh-CN') console.warn(`[i18n] missing key "${key}" for locale "${language}"`)
    // 中文表缺键时把键原样返回：它至少是个可搜索的标识，比 `missing:` 之类占位符有用。
    return interpolate(key, values)
  }
  const message = interpolate(template, values)
  const supportCode = supportErrorCodeForMessage(key)
  if (!supportCode) return message
  const codeLabel = lookup(dictionary, 'errors.errorCodeLabel')
  return codeLabel ? `${message} ${interpolate(codeLabel, { code: supportCode })}` : message
}

export interface I18nContextValue {
  language: UiLanguage
  uiLanguage: UiLanguagePreference
  dictionary: Dictionary
  t: (key: TranslationKey, vars?: TranslationVars) => string
  setLanguage: (language: UiLanguagePreference) => Promise<void>
}

const I18nContext = createContext<I18nContextValue>({
  language: 'zh-CN',
  uiLanguage: 'auto',
  dictionary: zhCN,
  t: (key, vars) => translate(key, 'zh-CN', vars),
  setLanguage: async () => undefined,
})

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [uiLanguage, setUiLanguageState] = useState<UiLanguagePreference>('auto')
  const [systemLocale, setSystemLocale] = useState(() => typeof navigator === 'undefined' ? 'en' : navigator.language)
  const language = resolveUiLanguage(uiLanguage, systemLocale)
  const dictionary = dictionaries[language]
  /**
   * 计数器，用来分辨「`onSettingsChanged` 已经报过一次新值」与「`getSettings()` 的
   * 首次响应才刚到」。没有它的话，冷启动时先到的那个响应会把后到的推送覆盖回去，
   * 界面上语言会闪一下再跳回来。
   */
  const revision = useRef(0)

  useEffect(() => {
    const refreshSystemLocale = () => setSystemLocale(navigator.language)
    window.addEventListener('languagechange', refreshSystemLocale)
    return () => window.removeEventListener('languagechange', refreshSystemLocale)
  }, [])

  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    let active = true
    const initialRevision = revision.current
    const unsubscribe = api.onSettingsChanged((settings) => {
      revision.current += 1
      if (active) setUiLanguageState(settings.uiLanguage)
    })
    void api.getSettings()
      .then((settings) => {
        if (active && revision.current === initialRevision) {
          setUiLanguageState(settings.uiLanguage)
        }
      })
      .catch(() => undefined)
    return () => { active = false; unsubscribe() }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = appNameForLanguage(language)
  }, [language])

  /**
   * 乐观更新：点了语言菜单立刻生效，不等主进程落盘往返。
   * 写失败时**回滚**到之前的值 —— 界面停在一个主进程并不认可的语言上，
   * 下次启动会自己跳回去，那一下闪烁比等 30ms 难受得多。
   */
  const setLanguage = useCallback(async (next: UiLanguagePreference) => {
    const previous = uiLanguage
    const requestRevision = ++revision.current
    setUiLanguageState(next)
    try {
      await window.nolaTranslator?.updateSettings({ uiLanguage: next })
    } catch (error) {
      if (revision.current === requestRevision) setUiLanguageState(previous)
      throw error
    }
  }, [uiLanguage])

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => translate(key, language, vars),
    [language],
  )

  const value = useMemo<I18nContextValue>(() => ({ language, uiLanguage, dictionary, t, setLanguage }), [language, uiLanguage, dictionary, t, setLanguage])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue { return useContext(I18nContext) }
