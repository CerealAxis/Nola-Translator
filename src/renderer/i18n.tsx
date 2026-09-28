import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { english } from './locales/en'

export type UiLanguage = 'zh-CN' | 'en'
export type TranslationValues = Record<string, string | number>

export function translate(message: string, language: UiLanguage, values: TranslationValues = {}): string {
  const template = language === 'en' ? english[message] ?? message : message
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match))
}

type I18n = {
  language: UiLanguage
  t: (message: string, values?: TranslationValues) => string
  setLanguage: (language: UiLanguage) => Promise<void>
}

const I18nContext = createContext<I18n>({
  language: 'zh-CN',
  t: (message, values) => translate(message, 'zh-CN', values),
  setLanguage: async () => undefined,
})

export function I18nProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [language, updateLanguage] = useState<UiLanguage>('zh-CN')
  const revision = useRef(0)
  useEffect(() => {
    const api = window.nolaTranslator
    if (!api) return
    let active = true
    const initialRevision = revision.current
    const unsubscribe = api.onSettingsChanged((settings) => {
      revision.current += 1
      if (active) updateLanguage(settings.uiLanguage === 'en' ? 'en' : 'zh-CN')
    })
    void api.getSettings().then((settings) => {
      if (active && revision.current === initialRevision) updateLanguage(settings.uiLanguage === 'en' ? 'en' : 'zh-CN')
    }).catch(() => undefined)
    return () => { active = false; unsubscribe() }
  }, [])
  useEffect(() => { document.documentElement.lang = language }, [language])
  const setLanguage = useCallback(async (next: UiLanguage) => {
    const previous = language
    const requestRevision = ++revision.current
    updateLanguage(next)
    try {
      await window.nolaTranslator?.updateSettings({ uiLanguage: next })
    } catch (error) {
      if (revision.current === requestRevision) updateLanguage(previous)
      throw error
    }
  }, [language])
  const t = useCallback((message: string, values?: TranslationValues) => translate(message, language, values), [language])
  return <I18nContext.Provider value={{ language, t, setLanguage }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n { return useContext(I18nContext) }
