import { useEffect, useId, useState } from 'react'
import { LANGUAGE_CODES, languageName, resolveUiLanguage, type UiLanguage } from '../../src/shared/languages'
import { Alert, AlertDescription } from '../../src/renderer/components/ui/alert'
import { Button } from '../../src/renderer/components/ui/button'
import { Field, FieldLabel } from '../../src/renderer/components/ui/field'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '../../src/renderer/components/ui/slider'
import { ColorPicker } from '../../src/renderer/components/ui/color-picker'
import { BROWSER_PROTOCOL_VERSION } from '../../src/shared/browser'
import { BrowserFailure, createBridge } from './bridge'
import { ChoiceField } from './components/ChoiceField'
import { browserText, errorKey } from './i18n'
import { DEFAULT_PREFERENCES, observePreferences, savePreferences, type Preferences } from './preferences'
import { requestProviderAccess, type ProviderConnection } from './providers'

export const languageOptions = (locale: UiLanguage) => LANGUAGE_CODES.map(code => ({ value: code, label: languageName(code, locale) }))

export function RangeField({ label, value, onChange, min = 0, max = 100, step = 1, suffix = '' }: { label: string; value: number; onChange(value: number): void; min?: number; max?: number; step?: number; suffix?: string }) {
  const id = useId()
  return <Field><FieldLabel id={id}>{label}</FieldLabel><div className="nola-setting-range"><SliderRoot value={value} min={min} max={max} step={step} onValueChange={onChange}><SliderControl className="relative"><SliderTrack><SliderIndicator /></SliderTrack><SliderThumb aria-labelledby={id} /></SliderControl></SliderRoot><output>{Number(value.toFixed(2))}{suffix}</output></div></Field>
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  return <Field><FieldLabel>{label}</FieldLabel><ColorPicker label={label} value={value} presets={[]} onChange={onChange} container={container} /><div ref={setContainer} className="nola-portal-container" /></Field>
}

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

export function LiveServiceField({ settings, providers, t }: { settings: Preferences; providers: ProviderConnection[]; t: ReturnType<typeof browserText> }) {
  const [error, setError] = useState('')
  const currentProvider = settings.pipeline === 's2s' ? settings.s2sProvider : settings.asrProvider
  const value = currentProvider === 'desktop' ? 'desktop' : `${settings.pipeline === 's2s' ? 's2s' : 'asr'}:${currentProvider}`
  const options = providers.flatMap(provider => {
    const asr = provider.capabilities.includes('asr'), s2s = provider.capabilities.includes('s2s')
    if (provider.id === 'desktop') return asr || s2s ? [{ value: 'desktop', label: provider.name }] : []
    return [...(asr ? [{ value: `asr:${provider.id}`, label: s2s ? `${provider.name} · ${t('asr')}` : provider.name }] : []), ...(s2s ? [{ value: `s2s:${provider.id}`, label: asr ? `${provider.name} · ${t('live')}` : provider.name }] : [])]
  })
  return <><ChoiceField label={t('liveService')} value={value} options={options} onChange={value => {
    const direct = value === 'desktop' ? settings.pipeline === 's2s' && settings.s2sProvider === 'desktop' : value.startsWith('s2s:')
    const id = value === 'desktop' ? 'desktop' : value.slice(value.indexOf(':') + 1)
    const provider = providers.find(provider => provider.id === id)
    if (!provider) return
    void requestProviderAccess(provider).then(granted => {
      if (!granted) throw new Error('permissionFailed')
      return savePreferences(direct ? { pipeline: 's2s', s2sProvider: id } : { pipeline: 'cascade', asrProvider: id })
    }).then(() => setError('')).catch(error => setError(t(errorKey(error instanceof Error ? error.message : 'internalError'))))
  }} />{error && <p role="alert" className="nola-error">{error}</p>}</>
}
