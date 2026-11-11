import './csp'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, Captions, Languages, MoreHorizontal, PanelRight, Settings2, X } from 'lucide-react'
import { Button } from '../../src/renderer/components/ui/button'
import { ToastProvider } from '../../src/renderer/components/ui/toast'
import { Switch, SwitchThumb } from '../../src/renderer/components/ui/switch'
import { Field, FieldLabel } from '../../src/renderer/components/ui/field'
import { Dialog, DialogContent, DialogTitle, DialogClose, DialogTrigger } from '../../src/renderer/components/ui/dialog'
import { Kbd, KbdGroup } from '../../src/renderer/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle } from '../../src/renderer/components/ui/popover'
import { createPopupStore } from './popupStore'
import type { BrowserKey } from './i18n'
import { NolaLogo } from './logo'
import { ChoiceField } from './components/ChoiceField'
import { PopupLanguage } from './components/PopupLanguage'
import { DEFAULT_PROVIDERS, loadProviders, requestProviderAccess, visibleProviderConnections, type ProviderConnection, type Capability } from './providers'
import { DISABLED_PROVIDER, liveTranslationEnabled, matchesSitePatterns, savePreferences } from './preferences'
import { ConnectionStatus, languageOptions, LiveServiceField, usePreferences } from './settings-fields'
import './styles.css'
import { captureDiagnostics } from './diagnostics'

captureDiagnostics('popup')
import { ProviderAvatar } from './components/ProviderAvatar'
import { Badge } from '../../src/renderer/components/ui/badge'
import { SubtitleAvailabilityTooltip } from './components/SubtitleAvailabilityTooltip'
import { useErrorToasts } from './components/useErrorToasts'

const providerSlots = [
  ['pageProvider', 'web', 'mt'], ['subtitleProvider', 'video', 'mt'], ['selectionProvider', 'selection', 'mt'],
  ['inputProvider', 'inputTranslation', 'mt'], ['ttsProvider', 'tts', 'tts'], ['asrProvider', 'asr', 'asr'],
  ['s2sProvider', 's2s', 's2s'], ['llmProvider', 'llm', 'llm'],
] as const satisfies readonly (readonly [string, BrowserKey, Capability])[]
export interface PopupProps { store: ReturnType<typeof createPopupStore> }
export function Popup({ store }: PopupProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [settings, locale, t] = usePreferences()
  const [providers, setProviders] = useState<ProviderConnection[]>(DEFAULT_PROVIDERS)
  const [localError, setLocalError] = useState<string>()
  const [more, setMore] = useState(false)
  const [acting, setActing] = useState(false)
  useEffect(() => {
    const reload = () => { void loadProviders().then(setProviders).catch(() => setLocalError('providerInvalid')) }
    const changed = (changes: Record<string, unknown>) => { if ('providerRevision' in changes) reload() }
    reload(); chrome.storage.onChanged.addListener(changed)
    return () => chrome.storage.onChanged.removeListener(changed)
  }, [])
  useEffect(() => {
    if (!state.enabled) return
    const timer = setInterval(() => { void store.send('pageStatus').catch(() => undefined) }, 500)
    return () => clearInterval(timer)
  }, [state.enabled, store])
  useEffect(() => {
    if (!location.pathname.endsWith('/sidepanel.html')) return
    const refresh = () => { void store.init().catch(() => undefined) }
    const updated = (_tabId: number, change: { url?: string; status?: string }) => { if (change.url || change.status === 'complete') refresh() }
    chrome.tabs.onActivated.addListener(refresh); chrome.tabs.onUpdated.addListener(updated)
    return () => { chrome.tabs.onActivated.removeListener(refresh); chrome.tabs.onUpdated.removeListener(updated) }
  }, [store])
  const siteDisabled = Boolean(state.url && matchesSitePatterns(settings.siteBlacklist, state.url))
  const usesDesktop = providerSlots.some(([key]) => {
    if (settings[key] !== 'desktop') return false
    if (key === 'asrProvider' || key === 's2sProvider') return liveTranslationEnabled(settings) && key === (settings.pipeline === 's2s' ? 's2sProvider' : 'asrProvider')
    if (key === 'selectionProvider') return settings.selectionTranslation
    if (key === 'inputProvider') return settings.inputTranslation
    return true
  })
  const restricted = (!state.origin || state.availability === 'restricted') && state.availability !== 'loading'
  useErrorToasts(t, localError, state.error, state.pageError, state.subtitleError, state.liveError, restricted ? 'restrictedPage' : undefined)
  const autoSite = Boolean(state.url && matchesSitePatterns(settings.autoSites, state.url))
  const languages = languageOptions(locale)
  const openSettings = (section: string) => { window.open(chrome.runtime.getURL(`options.html#${section}`), '_blank') }
  const restoring = state.pageActive && !state.pageError
  const canTranslate = Boolean(state.origin) && state.availability !== 'restricted' && !siteDisabled && !state.pending && !acting
  const pageEnabled = settings.pageProvider !== DISABLED_PROVIDER
  const subtitlesEnabled = settings.subtitleProvider !== DISABLED_PROVIDER
  const save = (patch: Parameters<typeof savePreferences>[0]) => { void savePreferences(patch).then(() => setLocalError(undefined)).catch(() => setLocalError('internalError')) }
  const act = (type: Parameters<typeof store.send>[0]) => {
    setActing(true); setLocalError(undefined)
    void store.send(type).catch(() => setLocalError('internalError')).finally(() => setActing(false))
  }
  const saveProvider = (key: typeof providerSlots[number][0], value: string) => {
    const enabled = value !== DISABLED_PROVIDER
    const patch = { [key]: value, ...(key === 'selectionProvider' ? { selectionTranslation: enabled } : key === 'inputProvider' ? { inputTranslation: enabled } : {}) }
    if (!enabled) { save(patch); return }
    const provider = providers.find(item => item.id === value)
    if (provider) void requestProviderAccess(provider).then(granted => {
      if (!granted) throw new Error('providerPermission')
      return savePreferences(patch)
    }).then(() => setLocalError(undefined)).catch(error => setLocalError(error instanceof Error ? error.message : 'providerInvalid'))
  }
  const providerOptions = (id: string, capability: Capability) => [
    { value: DISABLED_PROVIDER, label: t('providerNone') },
    ...visibleProviderConnections(providers, id).filter(provider => provider.capabilities.includes(capability)).map(provider => ({ value: provider.id, label: provider.name })),
  ]
  const openSidebar = () => {
    const request = chrome.sidebarAction ? chrome.sidebarAction.open() : chrome.runtime.sendMessage({ type: 'openTranslationPanel', tabId: state.tabId }).then(result => { if (!(result as { ok?: boolean })?.ok) throw new Error('openPanelFromToolbar') })
    void request.catch(() => setLocalError('openPanelFromToolbar'))
  }
  return <main className="nola-popup">
    <div className="nola-popup-body">
      <header className="nola-popup-header"><div className="nola-panel-brand"><NolaLogo /><h1>Nola Translator</h1></div><div className="nola-popup-header-tools">
        <Button variant="bare" size="icon-sm" aria-label={t('translationHub')} title={t('translationHub')} onClick={() => openSettings('translationHub')}><Languages /></Button>
        {!location.pathname.endsWith('/sidepanel.html') && <Button variant="bare" size="icon-sm" aria-label={t('openTranslationPanel')} title={t('openTranslationPanel')} onClick={openSidebar}><PanelRight /></Button>}
      </div></header>
      {usesDesktop && <ConnectionStatus t={t} compact onReconnect={() => store.send('refreshDesktopConnection')} />}
      <div className="nola-popup-languages">
        <PopupLanguage label={t('source')} value={settings.sourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languages]} onChange={value => save({ sourceLanguage: value })} t={t} />
        <Button variant="bare" size="icon-sm" aria-label={t('swapLanguages')} title={t('swapLanguages')} disabled={settings.sourceLanguage === 'auto'} onClick={() => save({ sourceLanguage: settings.pageLanguage, pageLanguage: settings.sourceLanguage })}><ArrowLeftRight /></Button>
        <PopupLanguage label={t('target')} value={settings.pageLanguage} options={languages} onChange={value => save({ pageLanguage: value })} t={t} />
      </div>
      <Dialog><div className="nola-popup-provider-row"><span>{t('provider')}</span><DialogTrigger render={<Button variant="bare" className="nola-provider-summary" aria-label={t('apiProviders')} />}>
        <span className="nola-provider-avatars">{providerSlots.slice(0, 5).filter(([key]) => settings[key] !== DISABLED_PROVIDER).map(([key, label]) => <span key={key} title={`${t(label)}: ${providers.find(item => item.id === settings[key])?.name ?? ''}`}><ProviderAvatar provider={providers.find(item => item.id === settings[key])} /></span>)}<Badge variant="secondary" className="nola-provider-count">+{providerSlots.length - 5}</Badge></span>
      </DialogTrigger></div><DialogContent className="nola-popup-drawer"><header><DialogTitle>{t('provider')}</DialogTitle><DialogClose render={<Button variant="bare" size="icon-sm" aria-label={t('close')} />}><X /></DialogClose></header>
        <div className="nola-popup-provider-fields">{providerSlots.slice(0, 5).map(([key, label, capability]) => <ChoiceField key={key} label={t(label)} value={settings[key]} options={providerOptions(settings[key], capability)} onChange={value => saveProvider(key, value)} />)}<LiveServiceField settings={settings} providers={providers} t={t} /><details><summary>{t('advancedSettings')}</summary><ChoiceField label={t('llm')} value={settings.llmProvider} options={providerOptions(settings.llmProvider, 'llm')} onChange={value => saveProvider('llmProvider', value)} /></details></div>
        <Button variant="outline" onClick={() => openSettings('apiProviders')}><Settings2 data-icon="inline-start" />{t('apiProviders')}</Button>
      </DialogContent></Dialog>
      <Button disabled={!canTranslate || !pageEnabled && state.enabled && !restoring} title={!pageEnabled && state.enabled && !restoring ? t('providerDisabled') : undefined} aria-label={t(restoring ? 'restorePage' : state.enabled ? 'translatePage' : 'enableSite')} onClick={() => { if (!state.enabled) store.enable(); else act(restoring ? 'stopPageTranslation' : 'startPageTranslation') }}>
        <span>{t(state.pending || acting ? 'starting' : restoring ? 'restorePage' : state.enabled ? 'translatePage' : 'enableSite')}</span>{state.enabled && !restoring && !acting && <KbdGroup data-icon="inline-end">{settings.shortcutPage.split('+').filter(Boolean).map((key, index) => <Kbd key={index}>{key}</Kbd>)}</KbdGroup>}
      </Button>
      <div className="nola-popup-switches">
        <Field><FieldLabel htmlFor="site-disabled">{t('siteDisabled')}</FieldLabel><Switch id="site-disabled" disabled={!state.origin} checked={siteDisabled} onCheckedChange={disabled => {
          if (!state.origin) return
          save({ siteBlacklist: disabled ? [...new Set([...settings.siteBlacklist, state.origin])] : settings.siteBlacklist.filter(site => !matchesSitePatterns([site], state.url ?? state.origin!)) })
          if (disabled) act('stopPageTranslation')
        }}><SwitchThumb /></Switch></Field>
        <Field><FieldLabel htmlFor="auto-site">{t('autoSite')}</FieldLabel><Switch id="auto-site" disabled={!state.origin || siteDisabled} checked={autoSite} onCheckedChange={checked => {
          if (!state.origin) return
          save({ autoSites: checked ? [...new Set([...settings.autoSites, state.origin])] : settings.autoSites.filter(site => !matchesSitePatterns([site], state.url ?? state.origin!)) })
        }}><SwitchThumb /></Switch></Field>
        <div className="nola-popup-hover-row"><div className="nola-popup-hotkey"><ChoiceField label={t('hoverTranslation')} value={settings.shortcutHover} options={[...new Set(['Alt', 'Ctrl', 'Shift', 'Meta', settings.shortcutHover])].map(value => ({ value, label: value ? t('hoverWithKey').replace('{key}', value) : t('shortcutUnassigned') }))} onChange={value => save({ shortcutHover: value })} /></div><Switch aria-label={t('hoverTranslation')} checked={settings.hoverTranslation} onCheckedChange={value => save({ hoverTranslation: value })}><SwitchThumb /></Switch></div>
        <Field><FieldLabel htmlFor="context-aware">{t('contextAware')}</FieldLabel><Switch id="context-aware" disabled={!pageEnabled || settings.llmProvider === DISABLED_PROVIDER} checked={settings.contextAware && pageEnabled && settings.llmProvider !== DISABLED_PROVIDER} onCheckedChange={value => save({ contextAware: value })}><SwitchThumb /></Switch></Field>
        <Field>
          <FieldLabel htmlFor="bilingual-page">{t('bilingualPage')}</FieldLabel>
          <Switch id="bilingual-page" checked={settings.pageDisplay === 'bilingual'} onCheckedChange={checked => save({ pageDisplay: checked ? 'bilingual' : 'translation' })}>
            <SwitchThumb />
          </Switch>
        </Field>
      </div>
      {state.video && <div className="nola-popup-video">{(subtitlesEnabled || state.subtitles) && <SubtitleAvailabilityTooltip availability={state.subtitleAvailability} active={state.subtitles} t={t}>
        <Button variant="outline" disabled={!canTranslate || !state.enabled || state.realtime || !state.subtitles && state.subtitleAvailability !== 'ready'} onClick={() => act('toggleSubtitles')}><Captions data-icon="inline-start" />{t(state.subtitles ? 'stopSubtitles' : 'translateSubtitles')}</Button>
      </SubtitleAvailabilityTooltip>}{(liveTranslationEnabled(settings) || state.realtime) && <Button variant="outline" disabled={!canTranslate || !state.enabled} onClick={() => act('toggleRealtime')}>{t(state.realtime ? 'end' : 'live')}</Button>}</div>}
      {state.pageError && state.pageActive && <Button variant="outline" disabled={acting} onClick={() => act('stopPageTranslation')}>{t('restorePage')}</Button>}
    </div>
    <footer className="nola-popup-footer"><Button variant="bare" size="sm" onClick={() => { void chrome.runtime.openOptionsPage().catch(() => setLocalError('internalError')) }}><Settings2 data-icon="inline-start" />{t('settings')}</Button><span className="nola-muted">v{chrome.runtime.getManifest().version}</span><Popover open={more} onOpenChange={setMore}><PopoverTrigger render={<Button variant="bare" size="sm" />}><MoreHorizontal data-icon="inline-start" />{t('more')}</PopoverTrigger><PopoverContent className="nola-popup-more-menu" side="top" align="end"><PopoverTitle className="sr-only">{t('more')}</PopoverTitle>{(['floatingButton', 'shortcuts', 'contextMenu', 'general', 'backup'] as const).map(section => <Button key={section} variant="bare" onClick={() => { setMore(false); openSettings(section) }}>{t(section === 'general' ? 'interfaceLanguage' : section)}</Button>)}</PopoverContent></Popover></footer>
    <ToastProvider closeLabel={t('close')} />
  </main>
}
const mount = document.getElementById('root')
if (mount) {
  const store = createPopupStore()
  createRoot(mount).render(<Popup store={store} />)
  void store.init().catch(() => undefined)
}
