import { useEffect, useState } from 'react'
import { LANGUAGE_CODES, languageName, resolveUiLanguage, type UiLanguage } from '../../src/shared/languages'
import { Alert, AlertDescription } from '../../src/renderer/components/ui/alert'
import { Button } from '../../src/renderer/components/ui/button'
import { BROWSER_PROTOCOL_VERSION } from '../../src/shared/browser'
import { BrowserFailure, createBridge } from './bridge'
import { ChoiceField } from './components/ChoiceField'
import { browserText, errorKey } from './i18n'
import { DEFAULT_PREFERENCES, observePreferences, type Preferences } from './preferences'

export const languageOptions = (locale: UiLanguage) => LANGUAGE_CODES.map(code => ({ value: code, label: languageName(code, locale) }))
export function usePreferences(): [Preferences, UiLanguage, ReturnType<typeof browserText>] {
  const [settings, setSettings] = useState(DEFAULT_PREFERENCES)
  useEffect(() => observePreferences(setSettings), [])
  const locale = resolveUiLanguage(settings.uiLanguage, navigator.language)
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const update = () => {
      document.documentElement.lang = locale
      document.documentElement.dataset.theme = settings.theme === 'auto' ? query.matches ? 'dark' : 'light' : settings.theme
    }
    query.addEventListener('change', update); update()
    return () => query.removeEventListener('change', update)
  }, [locale, settings.theme])
  return [settings, locale, browserText(settings.uiLanguage)]
}

export function ConnectionStatus({ t, compact = false }: { t: ReturnType<typeof browserText>; compact?: boolean }) {
  const [status, setStatus] = useState<{ connected?: boolean; text?: boolean; textError?: string; realtime?: boolean; error?: string }>({})
  const [checking, setChecking] = useState(false)
  async function check() {
    const bridge = createBridge('nola-popup')
    setChecking(true)
    try {
      const summary = await bridge.request({ type: 'hello' })
      if (!summary || !('protocolVersion' in summary) || summary.protocolVersion !== BROWSER_PROTOCOL_VERSION || summary.extensionCompatible === false) throw new BrowserFailure('browserExtensionVersionMismatch')
      setStatus({ connected: true, text: summary.textTranslation, textError: summary.textTranslationError, realtime: summary.realtimeTranslation })
    } catch (error) { setStatus({ error: error instanceof BrowserFailure ? error.code : 'browserConnectionUnavailable' }) }
    finally { bridge.close(); setChecking(false) }
  }
  useEffect(() => { void check() }, [])
  if (compact) return <div className="nola-provider-status"><span role="status">{t(status.connected ? 'nativeReady' : 'nativeOptional')}</span><Button variant="bare" size="xs" onClick={() => { window.open(chrome.runtime.getURL('options.html#apiProviders'), '_blank') }}>{t('diagnostics')}</Button></div>
  return <div className="flex min-w-0 flex-col gap-2">
    {status.error ? <Alert variant={status.error === 'browserConnectionUnavailable' ? 'default' : 'danger'}><AlertDescription>{t(errorKey(status.error))}</AlertDescription></Alert>
      : status.connected && <p role="status" className="nola-muted">{t('statusReady')}{!compact && <><br />{t(status.text ? 'textReady' : errorKey(status.textError ?? 'browserTextModelUnavailable'))}{status.realtime && <><br />{t('liveAvailable')}</>}</>}</p>}
    {!compact && <Button className="self-start" variant="outline" disabled={checking} onClick={() => void check()}>{t('testConnection')}</Button>}
  </div>
}

export function TargetLanguageField({ value, onChange, locale, t }: { value: string; onChange: (value: string) => void; locale: UiLanguage; t: ReturnType<typeof browserText> }) {
  return <ChoiceField label={t('target')} value={value} options={languageOptions(locale)} onChange={onChange} />
}
