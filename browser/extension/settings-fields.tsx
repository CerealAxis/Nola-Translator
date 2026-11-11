import { useEffect, useId, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { LANGUAGE_CODES, languageName, resolveUiLanguage, type UiLanguage } from '../../src/shared/languages'
import { showToast } from '../../src/renderer/components/ui/toast'
import { Badge } from '../../src/renderer/components/ui/badge'
import { Button } from '../../src/renderer/components/ui/button'
import { Field, FieldLabel } from '../../src/renderer/components/ui/field'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '../../src/renderer/components/ui/slider'
import { ColorPicker } from '../../src/renderer/components/ui/color-picker'
import { BROWSER_PROTOCOL_VERSION } from '../../src/shared/browser'
import { BrowserFailure, createBridge } from './bridge'
import { ChoiceField } from './components/ChoiceField'
import { usePortalContainer } from './components/usePortalContainer'
import { browserText, errorKey } from './i18n'
import { DEFAULT_PREFERENCES, observePreferences, savePreferences, type Preferences } from './preferences'
import { requestProviderAccess, type ProviderConnection } from './providers'

export const languageOptions = (locale: UiLanguage) => LANGUAGE_CODES.map(code => ({ value: code, label: languageName(code, locale) }))

export function RangeField({ label, value, onChange, min = 0, max = 100, step = 1, suffix = '' }: { label: string; value: number; onChange(value: number): void; min?: number; max?: number; step?: number; suffix?: string }) {
  const id = useId()
  return <Field><FieldLabel id={id}>{label}</FieldLabel><div className="nola-setting-range"><SliderRoot value={value} min={min} max={max} step={step} onValueChange={onChange}><SliderControl className="relative"><SliderTrack><SliderIndicator /></SliderTrack><SliderThumb aria-labelledby={id} /></SliderControl></SliderRoot><output>{Number(value.toFixed(2))}{suffix}</output></div></Field>
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  const [container, containerRef] = usePortalContainer()
  return <Field className="nola-color-field"><FieldLabel>{label}</FieldLabel><ColorPicker label={label} value={value} presets={[]} onChange={onChange} container={container} /><div ref={containerRef} className="nola-portal-container" /></Field>
}

export const subtitleFontOptions = (value: string, t: ReturnType<typeof browserText>) => [...new Set(['system-ui', 'sans-serif', 'serif', 'monospace', value])].map(font => ({ value: font, label: font === 'system-ui' ? t('systemFont') : font }))

export function usePreferences(): [Preferences, UiLanguage, ReturnType<typeof browserText>] {
  const [settings, setSettings] = useState(DEFAULT_PREFERENCES)
  useEffect(() => observePreferences(setSettings), [])
  const locale = resolveUiLanguage(settings.uiLanguage, navigator.language)
  useEffect(() => {
    const colorScheme = matchMedia('(prefers-color-scheme: dark)')
    const reducedTransparency = matchMedia('(prefers-reduced-transparency: reduce)')
    const update = () => {
      const root = document.documentElement
      root.lang = locale
      root.dataset.theme = settings.theme === 'auto' ? colorScheme.matches ? 'dark' : 'light' : settings.theme
      root.dataset.nolaGlass = settings.liquidGlass && !reducedTransparency.matches ? 'on' : 'off'
    }
    colorScheme.addEventListener('change', update)
    reducedTransparency.addEventListener('change', update)
    update()
    return () => {
      colorScheme.removeEventListener('change', update)
      reducedTransparency.removeEventListener('change', update)
    }
  }, [locale, settings.theme, settings.liquidGlass])
  return [settings, locale, browserText(settings.uiLanguage)]
}

export function ConnectionStatus({ t, compact = false, onReconnect }: { t: ReturnType<typeof browserText>; compact?: boolean; onReconnect?: () => Promise<void> }) {
  const [status, setStatus] = useState<'waiting' | 'connected' | 'disconnected'>('waiting')
  const [checking, setChecking] = useState(false)
  const request = useRef<AbortController>(null)
  async function check(reconnect = false) {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const bridge = createBridge('nola-popup')
    setChecking(true)
    try {
      const summary = await bridge.request({ type: 'hello' }, controller.signal)
      if (!summary || !('protocolVersion' in summary) || summary.protocolVersion !== BROWSER_PROTOCOL_VERSION || summary.extensionCompatible === false) throw new BrowserFailure('browserExtensionVersionMismatch')
      if (reconnect) await onReconnect?.()
      if (controller.signal.aborted) return
      setStatus('connected')
      if (reconnect) showToast({ type: 'success', description: t('nativeReady') })
    } catch (error) {
      if (controller.signal.aborted) return
      const code = error instanceof BrowserFailure ? error.code : 'browserConnectionUnavailable'
      setStatus('disconnected')
      if (compact || reconnect) showToast({ type: 'error', description: t(errorKey(code)) })
    }
    finally { bridge.close(); if (!controller.signal.aborted) setChecking(false) }
  }
  useEffect(() => { void check(); return () => request.current?.abort() }, [])
  const label = t(checking || status === 'waiting' ? 'connectionWaiting' : status === 'connected' ? 'nativeReady' : 'nativeDisconnected')
  const variant = status === 'connected' && !checking ? 'success' : 'secondary'
  if (compact) return <div className="nola-provider-status" aria-busy={checking}>
    <Badge role="status" variant={variant}>{label}</Badge>
    {status === 'disconnected' && <Button variant="outline" size="icon-xs" disabled={checking} aria-label={t('reconnect')} title={t('reconnect')} onClick={() => void check(true)}><RefreshCw aria-hidden="true" /></Button>}
  </div>
  return <span className="flex" role="status" aria-busy={checking}>
    <Badge
      variant={variant}
      render={<button type="button" disabled={checking} title={t('testConnection')} aria-label={`${label} · ${t('testConnection')}`} onClick={() => void check(true)} />}
    >
      {label}<RefreshCw data-icon="inline-end" aria-hidden="true" />
    </Badge>
  </span>
}

export function TargetLanguageField({ value, onChange, locale, t }: { value: string; onChange: (value: string) => void; locale: UiLanguage; t: ReturnType<typeof browserText> }) {
  return <ChoiceField label={t('target')} value={value} options={languageOptions(locale)} onChange={onChange} />
}

export function LiveServiceField({ settings, providers, t }: { settings: Preferences; providers: ProviderConnection[]; t: ReturnType<typeof browserText> }) {
  const onError = (error: unknown) => showToast({ type: 'error', description: t(errorKey(error instanceof Error ? error.message : 'internalError')) })
  const currentProvider = settings.pipeline === 's2s' ? settings.s2sProvider : settings.asrProvider
  const value = currentProvider === 'disabled' || currentProvider === 'desktop' ? currentProvider : `${settings.pipeline === 's2s' ? 's2s' : 'asr'}:${currentProvider}`
  const options = [{ value: 'disabled', label: t('providerNone') }, ...providers.flatMap(provider => {
    const asr = provider.capabilities.includes('asr'), s2s = provider.capabilities.includes('s2s')
    if (provider.id === 'desktop') return asr || s2s ? [{ value: 'desktop', label: provider.name }] : []
    return [...(asr ? [{ value: `asr:${provider.id}`, label: s2s ? `${provider.name} · ${t('asr')}` : provider.name }] : []), ...(s2s ? [{ value: `s2s:${provider.id}`, label: asr ? `${provider.name} · ${t('live')}` : provider.name }] : [])]
  })]
  return <ChoiceField label={t('liveService')} value={value} options={options} onChange={value => {
    if (value === 'disabled') {
      void savePreferences({ asrProvider: 'disabled', s2sProvider: 'disabled' }).catch(onError)
      return
    }
    const direct = value === 'desktop' ? settings.pipeline === 's2s' && settings.s2sProvider === 'desktop' : value.startsWith('s2s:')
    const id = value === 'desktop' ? 'desktop' : value.slice(value.indexOf(':') + 1)
    const provider = providers.find(provider => provider.id === id)
    if (!provider) return
    void requestProviderAccess(provider).then(granted => {
      if (!granted) throw new Error('permissionFailed')
      return savePreferences(direct ? { pipeline: 's2s', s2sProvider: id } : { pipeline: 'cascade', asrProvider: id })
    }).catch(onError)
  }} />
}
