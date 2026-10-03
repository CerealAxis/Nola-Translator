/**
 * 界面语言。
 *
 * **保留主项目这一份，而不是原型的 `i18n/provider.tsx`。** 差别不是风格，是事实：
 * 原型那版把语言偏好写在 `localStorage` 里，还多一个 `'system'` 档位。这里两样都做不到 ——
 * 1. 语言是 `AppSettings.uiLanguage`，只有 `'zh-CN' | 'en'` 两个值，保存在**主进程**的
 *    `userData/settings.json` 里。渲染层只能异步 `getSettings()` 拿它，写回去要
 *    `updateSettings()`。多造一个 `'system'` 档位会让设置页写出主进程 zod schema
 *    (`z.enum(['zh-CN','en'])`) 拒收的值。
 * 2. `file://` 下的 `localStorage` 不可靠，而且设置**已经**在主进程里了，
 *    再存一份权威就多了一处会漂移的地方。
 *
 * 词典是原型带来的那 6 个文件（`i18n/*.ts`），键从 `zh-CN.ts` 推导，
 * `en.ts` 上那行 `const en: Dictionary` 让漏键在**编译期**就报错 —— 这套校验必须保住。
 * 键是点号路径（`nav.home`），`t()` 找不到时不回退中文：英文界面里露出中文比露出占位符更糟。
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { zhCN } from './i18n/zh-CN'
import { en } from './i18n/en'
import type { Dictionary } from './i18n/zh-CN'

/** 与 `AppSettings.uiLanguage` 同一个并集。 */
export type UiLanguage = 'zh-CN' | 'en'
export type TranslationVars = Readonly<Record<string, string | number>>

/** 把点号路径编译成字面量联合类型，拼错键会报错。 */
type TranslationKey = Leaves<Dictionary>
type Leaves<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}` }[keyof T & string]

export type { TranslationKey }

export function appNameForLanguage(language: UiLanguage): string {
  return language === 'en' ? 'Nola Translator' : '诺拉翻译'
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
  const dictionary: Dictionary = language === 'en' ? en : zhCN
  const template = lookup(dictionary, key)
  if (template === undefined) {
    if (language === 'en') console.warn(`[i18n] missing key "${key}" for locale "en"`)
    // 中文表缺键时把键原样返回：它至少是个可搜索的标识，比 `missing:` 之类占位符有用。
    return interpolate(key, values)
  }
  return interpolate(template, values)
}

export interface I18nContextValue {
  language: UiLanguage
  t: (key: TranslationKey, vars?: TranslationVars) => string
  setLanguage: (language: UiLanguage) => Promise<void>
}

const I18nContext = createContext<I18nContextValue>({
  language: 'zh-CN',
  t: (key, vars) => translate(key, 'zh-CN', vars),
  setLanguage: async () => undefined,
})

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [language, setLanguageState] = useState<UiLanguage>('zh-CN')
  /**
   * 计数器，用来分辨「`onSettingsChanged` 已经报过一次新值」与「`getSettings()` 的
   * 首次响应才刚到」。没有它的话，冷启动时先到的那个响应会把后到的推送覆盖回去，
   * 界面上语言会闪一下再跳回来。
   */
  const revision = useRef(0)

  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    let active = true
    const initialRevision = revision.current
    const unsubscribe = api.onSettingsChanged((settings) => {
      revision.current += 1
      if (active) setLanguageState(settings.uiLanguage === 'en' ? 'en' : 'zh-CN')
    })
    void api.getSettings()
      .then((settings) => {
        if (active && revision.current === initialRevision) {
          setLanguageState(settings.uiLanguage === 'en' ? 'en' : 'zh-CN')
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
  const setLanguage = useCallback(async (next: UiLanguage) => {
    const previous = language
    const requestRevision = ++revision.current
    setLanguageState(next)
    try {
      await window.nolaTranslator?.updateSettings({ uiLanguage: next })
    } catch (error) {
      if (revision.current === requestRevision) setLanguageState(previous)
      throw error
    }
  }, [language])

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) => translate(key, language, vars),
    [language],
  )

  const value = useMemo<I18nContextValue>(() => ({ language, t, setLanguage }), [language, t, setLanguage])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue { return useContext(I18nContext) }
