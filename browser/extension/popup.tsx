import './csp'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, Captions, Languages, MoreHorizontal, PanelRight, Settings2, Text, X } from 'lucide-react'
import { Button } from '../../src/renderer/components/ui/button'
import { Alert, AlertDescription } from '../../src/renderer/components/ui/alert'
import { Switch, SwitchThumb } from '../../src/renderer/components/ui/switch'
import { Field, FieldLabel } from '../../src/renderer/components/ui/field'
import { Dialog, DialogContent, DialogTitle, DialogClose, DialogTrigger } from '../../src/renderer/components/ui/dialog'
import { Kbd, KbdGroup } from '../../src/renderer/components/ui/kbd'
import { createPopupStore } from './popupStore'
import { errorKey, type BrowserKey } from './i18n'
import { NolaLogo } from './logo'
import { ChoiceField } from './components/ChoiceField'
import { PopupLanguage } from './components/PopupLanguage'
import { DEFAULT_PROVIDERS, loadProviders, requestProviderAccess, type ProviderConnection, type Capability } from './providers'
import { matchesSitePatterns, savePreferences } from './preferences'
import { languageOptions, usePreferences } from './settings-fields'
import './styles.css'

const providerSlots = [
  ['pageProvider', 'web', 'mt'], ['subtitleProvider', 'video', 'mt'], ['selectionProvider', 'selection', 'mt'],
  ['inputProvider', 'inputTranslation', 'mt'], ['ttsProvider', 'tts', 'tts'], ['asrProvider', 'asr', 'asr'],
  ['s2sProvider', 's2s', 's2s'], ['llmProvider', 'llm', 'llm'],
] as const satisfies readonly (readonly [string, BrowserKey, Capability])[]
function ProviderMark({ provider }: { provider?: ProviderConnection }) {
  return <span className="nola-provider-avatar" title={provider?.name}>{provider?.id === 'desktop' ? <NolaLogo /> : <span aria-hidden="true">{provider?.name.slice(0, 1) ?? '?'}</span>}</span>
}
export interface PopupProps { store: ReturnType<typeof createPopupStore> }
export function Popup({ store }: PopupProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [settings, locale, t] = usePreferences()
  const [providers, setProviders] = useState<ProviderConnection[]>(DEFAULT_PROVIDERS)
  const [localError, setLocalError] = useState<string>()
  const [more, setMore] = useState(false)
  useEffect(() => {
    const reload = () => { void loadProviders().then(setProviders).catch(() => setLocalError('providerInvalid')) }
    const changed = (changes: Record<string, unknown>) => { if ('providerRevision' in changes) reload() }
    reload(); chrome.storage.onChanged.addListener(changed)
    return () => chrome.storage.onChanged.removeListener(changed)
  }, [])
  useEffect(() => {
    const timer = setInterval(() => { void store.send('pageStatus') }, 500)
    return () => clearInterval(timer)
  }, [store])
  useEffect(() => {
    if (!location.pathname.endsWith('/sidepanel.html')) return
    const refresh = () => { void store.init() }
    const updated = (_tabId: number, change: { url?: string; status?: string }) => { if (change.url || change.status === 'complete') refresh() }
    chrome.tabs.onActivated.addListener(refresh); chrome.tabs.onUpdated.addListener(updated)
    return () => { chrome.tabs.onActivated.removeListener(refresh); chrome.tabs.onUpdated.removeListener(updated) }
  }, [store])
  const siteDisabled = Boolean(state.url && matchesSitePatterns(settings.siteBlacklist, state.url))
  const errors = [...new Set([localError, state.error, state.pageError, state.subtitleError, state.liveError].filter((error): error is string => Boolean(error)))]
  const autoSite = Boolean(state.url && matchesSitePatterns(settings.autoSites, state.url))
  const languages = languageOptions(locale)
  const openSettings = (section: string) => { window.open(chrome.runtime.getURL(`options.html#${section}`), '_blank') }
  const restoring = state.pageActive && !state.pageError
  const canTranslate = Boolean(state.origin) && state.availability !== 'restricted' && !siteDisabled && !state.pending
  const saveProvider = (key: typeof providerSlots[number][0], value: string) => {
    const provider = providers.find(item => item.id === value)
    if (provider) void requestProviderAccess(provider).then(granted => {
      if (!granted) throw new Error('providerPermission')
      return savePreferences({ [key]: value })
    }).then(() => setLocalError(undefined)).catch(error => setLocalError(error instanceof Error ? error.message : 'providerInvalid'))
  }
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
      <div className="nola-popup-languages">
        <PopupLanguage label={t('source')} value={settings.sourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languages]} onChange={value => { void savePreferences({ sourceLanguage: value }) }} t={t} />
        <ArrowRight className="nola-language-arrow" aria-hidden="true" />
        <PopupLanguage label={t('target')} value={settings.pageLanguage} options={languages} onChange={value => { void savePreferences({ pageLanguage: value }) }} t={t} />
      </div>
      <Dialog><div className="nola-popup-provider-row"><span>{t('provider')}</span><DialogTrigger render={<Button variant="bare" className="nola-provider-summary" aria-label={t('apiProviders')} />}>
        <span className="nola-provider-avatars">{providerSlots.slice(0, 5).map(([key, label]) => <span key={key} title={`${t(label)}: ${providers.find(item => item.id === settings[key])?.name ?? ''}`}><ProviderMark provider={providers.find(item => item.id === settings[key])} /></span>)}<span className="nola-provider-avatar nola-provider-count">+{providerSlots.length - 5}</span></span>
      </DialogTrigger></div><DialogContent className="nola-popup-drawer"><header><DialogTitle>{t('provider')}</DialogTitle><DialogClose render={<Button variant="bare" size="icon-sm" aria-label={t('close')} />}><X /></DialogClose></header>
        <div className="nola-popup-provider-fields">{providerSlots.map(([key, label, capability]) => <ChoiceField key={key} label={t(label)} value={settings[key]} options={providers.filter(provider => provider.capabilities.includes(capability)).map(provider => ({ value: provider.id, label: provider.name }))} onChange={value => saveProvider(key, value)} />)}</div>
        {localError && <Alert variant="danger"><AlertDescription>{t(errorKey(localError))}</AlertDescription></Alert>}
        <Button variant="outline" onClick={() => openSettings('apiProviders')}><Settings2 data-icon="inline-start" />{t('apiProviders')}</Button>
      </DialogContent></Dialog>
      <div className="nola-popup-translate-row">
        <Button variant="outline" size="icon" aria-label={t(settings.pageDisplay === 'bilingual' ? 'translationOnly' : 'bilingual')} title={t(settings.pageDisplay === 'bilingual' ? 'bilingual' : 'translationOnly')} onClick={() => { void savePreferences({ pageDisplay: settings.pageDisplay === 'bilingual' ? 'translation' : 'bilingual' }) }}>{settings.pageDisplay === 'bilingual' ? <Languages /> : <Text />}</Button>
        <Button className="nola-popup-translate" disabled={!canTranslate} aria-label={t(restoring ? 'restorePage' : state.enabled ? 'translatePage' : 'enableSite')} onClick={() => { if (!state.enabled) store.enable(); else void store.send(restoring ? 'stopPageTranslation' : 'startPageTranslation') }}>
          <span>{t(restoring ? 'restorePage' : state.enabled ? 'translatePage' : 'enableSite')}</span>{state.enabled && !restoring && <KbdGroup>{settings.shortcutPage.split('+').filter(Boolean).map((key, index) => <Kbd key={index}>{key}</Kbd>)}</KbdGroup>}
        </Button>
      </div>
      {(!state.origin || state.availability === 'restricted') && state.availability !== 'loading' && <p className="nola-muted" role="status">{t('restrictedPage')}</p>}
      <div className="nola-popup-switches">
        <Field><FieldLabel htmlFor="site-disabled">{t('siteDisabled')}</FieldLabel><Switch id="site-disabled" disabled={!state.origin} checked={siteDisabled} onCheckedChange={disabled => {
          if (!state.origin) return
          void savePreferences({ siteBlacklist: disabled ? [...settings.siteBlacklist, state.origin] : settings.siteBlacklist.filter(site => !matchesSitePatterns([site], state.url ?? state.origin!)) })
          if (disabled) void store.send('stopPageTranslation')
        }}><SwitchThumb /></Switch></Field>
        <Field><FieldLabel htmlFor="auto-site">{t('autoSite')}</FieldLabel><Switch id="auto-site" disabled={!state.origin || siteDisabled} checked={autoSite} onCheckedChange={checked => {
          if (!state.origin) return
          void savePreferences({ autoSites: checked ? [...settings.autoSites, state.origin] : settings.autoSites.filter(site => !matchesSitePatterns([site], state.url ?? state.origin!)) })
        }}><SwitchThumb /></Switch></Field>
        <div className="nola-popup-hover-row"><div className="nola-popup-hotkey"><ChoiceField label={t('hoverTranslation')} value={settings.shortcutHover} options={[...new Set(['Alt', 'Ctrl', 'Shift', 'Meta', settings.shortcutHover])].map(value => ({ value, label: t('hoverWithKey').replace('{key}', value) }))} onChange={value => { void savePreferences({ shortcutHover: value }) }} /></div><Switch aria-label={t('hoverTranslation')} checked={settings.hoverTranslation} onCheckedChange={value => { void savePreferences({ hoverTranslation: value }) }}><SwitchThumb /></Switch></div>
        <Field><FieldLabel htmlFor="context-aware">{t('contextAware')}</FieldLabel><Switch id="context-aware" checked={settings.contextAware} onCheckedChange={value => { void savePreferences({ contextAware: value }) }}><SwitchThumb /></Switch></Field>
      </div>
      {state.video && <div className="nola-popup-video"><Button variant="outline" disabled={siteDisabled || state.realtime} onClick={() => { void store.send('toggleSubtitles') }}><Captions data-icon="inline-start" />{t(state.subtitles ? 'stopSubtitles' : 'translateSubtitles')}</Button><Button variant="outline" disabled={siteDisabled} onClick={() => { void store.send('toggleRealtime') }}>{t(state.realtime ? 'end' : 'live')}</Button></div>}
      {errors.map(error => <Alert key={error} variant="danger"><AlertDescription>{t(errorKey(error))}</AlertDescription></Alert>)}
      {state.pageError && state.pageActive && <Button variant="outline" onClick={() => { void store.send('stopPageTranslation') }}>{t('restorePage')}</Button>}
    </div>
    <footer className="nola-popup-footer"><Button variant="bare" size="sm" onClick={() => { void chrome.runtime.openOptionsPage() }}><Settings2 data-icon="inline-start" />{t('settings')}</Button><span className="nola-muted">v{chrome.runtime.getManifest().version}</span><Button variant="bare" size="sm" aria-expanded={more} onClick={() => setMore(value => !value)}><MoreHorizontal data-icon="inline-start" />{t('more')}</Button></footer>
    {more && <div className="nola-popup-more"><Button variant="bare" onClick={() => openSettings('floatingButton')}>{t('floatingButton')}</Button><Button variant="bare" onClick={() => openSettings('shortcuts')}>{t('shortcuts')}</Button><Button variant="bare" onClick={() => openSettings('general')}>{t('interfaceLanguage')}</Button><Button variant="bare" onClick={() => openSettings('backup')}>{t('backup')}</Button></div>}
  </main>
}
const mount = document.getElementById('root')
if (mount) {
  const store = createPopupStore()
  createRoot(mount).render(<Popup store={store} />)
  void store.init().catch(() => undefined)
}
