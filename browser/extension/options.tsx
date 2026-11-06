import './csp'
import { Settings2, Plug, Keyboard, Languages, Captions, MousePointer2, TextCursorInput, Volume2, PanelsTopLeft, MousePointerClick, BookOpen, Archive, PanelTop, Search, Upload, Download, Plus, ArrowLeftRight, ChevronDown, ChevronUp, Copy, RefreshCw, X, Check } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../../src/renderer/components/ui/button'
import { Input } from '../../src/renderer/components/ui/input'
import { Textarea } from '../../src/renderer/components/ui/textarea'
import { Alert, AlertDescription } from '../../src/renderer/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '../../src/renderer/components/ui/field'
import { Switch, SwitchThumb } from '../../src/renderer/components/ui/switch'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../src/renderer/components/ui/input-group'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '../../src/renderer/components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle } from '../../src/renderer/components/ui/popover'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../src/renderer/components/ui/dialog'
import { Card, CardHeader, CardTitle, CardContent } from '../../src/renderer/components/ui/card'
import { Badge } from '../../src/renderer/components/ui/badge'
import { ChoiceField } from './components/ChoiceField'
import { PopupLanguage } from './components/PopupLanguage'
import { ProviderAvatar } from './components/ProviderAvatar'
import { SettingsPreview, type PreviewKind } from './components/SettingsPreview'
import { NolaLogo } from './logo'
import { DEFAULT_PREFERENCES, readPreferences, savePreferences, UI_LANGUAGES, type Preferences } from './preferences'
import { ColorField, ConnectionStatus, languageOptions, LiveServiceField, RangeField, TargetLanguageField, usePreferences } from './settings-fields'
import { createProvider, loadProviders, saveProviders, requestProviderAccess, PROVIDER_PRESETS, exportProviderConfig, type ProviderConnection, type Capability } from './providers'
import { GlossaryManager } from './components/GlossaryManager'
import { parseOptionsRoute } from './options-route'
import { extensionGlossary, migrateLegacyGlossary, restoreExtensionConfiguration } from './glossary-store'
import { emptyGlossary, glossaryDocumentSchema } from '../../src/shared/glossary'
import { clearTranslationCache, synthesize, testProvider, translate } from './provider-client'
import { browserText, errorKey, type BrowserKey } from './i18n'
import './styles.css'

type T = ReturnType<typeof browserText>
const sections = ['general', 'apiProviders', 'web', 'video', 'selection', 'inputTranslation', 'floatingButton', 'contextMenu', 'shortcuts', 'tts', 'translationHub', 'glossary', 'backup'] as const
const navGroups = [
  { label: 'settingsGroup', items: ['general', 'apiProviders', 'shortcuts'] },
  { label: 'translationGroup', items: ['web', 'video', 'selection', 'inputTranslation', 'tts', 'translationHub'] },
  { label: 'toolsGroup', items: ['floatingButton', 'contextMenu', 'glossary', 'backup'] },
] as const
const sectionIcons = { general: Settings2, apiProviders: Plug, shortcuts: Keyboard, web: Languages, video: Captions, selection: MousePointer2, inputTranslation: TextCursorInput, tts: Volume2, translationHub: PanelsTopLeft, floatingButton: PanelTop, contextMenu: MousePointerClick, glossary: BookOpen, backup: Archive }
const descriptions = { general: 'generalDescription', apiProviders: 'providersDescription', shortcuts: 'shortcutsDescription', web: 'webDescription', video: 'videoDescription', selection: 'selectionDescription', inputTranslation: 'inputDescription', tts: 'ttsDescription', translationHub: 'hubDescription', floatingButton: 'floatingDescription', contextMenu: 'contextDescription', glossary: 'glossaryDescription', backup: 'backupDescription' } as const
const previewSections: readonly string[] = ['web', 'video', 'selection', 'inputTranslation', 'floatingButton', 'contextMenu']
const searchKeys: Record<typeof sections[number], BrowserKey[]> = {
  general: ['interfaceLanguage', 'theme', 'source', 'target', 'siteBlacklist'],
  apiProviders: ['apiKey', 'baseUrl', 'model', 'featureBindings', 'asr', 'tts', 's2s', 'llm', 'connection'],
  shortcuts: ['translatePage', 'translateSelection', 'hoverTranslation', 'video'],
  web: ['provider', 'display', 'pageScope', 'translateTitle', 'hoverTranslation', 'contextAware', 'minTextLength', 'skipLanguages', 'autoSites', 'neverAutoSites', 'pageStyle', 'customCss', 'prompt', 'requestRate', 'llmBatchSize', 'siteRules'],
  video: ['provider', 'display', 'subtitleFont', 'fontSize', 'subtitleColor', 'subtitleBackground', 'subtitleBackgroundOpacity', 'subtitlePosition', 'subtitlePositionX', 'subtitlePositionY', 'subtitleFollow', 'subtitleTranslationFirst', 'subtitleBold', 'subtitlePauseOnHover', 'customCss', 'autoSubtitleSites'],
  selection: ['toolbarActions', 'translateText', 'speakSelection', 'copyTranslation', 'opacity', 'disabledWebsites'],
  inputTranslation: ['source', 'target', 'provider', 'inputTrigger', 'inputTripleSpace', 'inputShortcut'],
  floatingButton: ['floatingSide', 'floatingPosition', 'pinFloating', 'floatingClickAction', 'disabledWebsites'],
  contextMenu: ['togglePageTranslation', 'translateSelection', 'speakSelection', 'inputTranslation'],
  tts: ['provider', 'voice', 'rate', 'pitch', 'volume'],
  translationHub: ['inputText', 'source', 'target', 'selectProviders'],
  glossary: ['sourceTerm', 'targetTerm', 'sites', 'exportCsv', 'importCsv'],
  backup: ['includeKeys', 'exportConfig', 'importConfig', 'clearCache', 'resetSettings'],
}
const languageLabels = ['简体中文', '繁體中文（台灣）', '繁體中文（香港）', '한국어', '日本語', 'English']
type Save = <K extends keyof Preferences>(key: K, value: Preferences[K]) => void

function TextField({ label, value, onChange, multiline = false, type = 'text', description }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string; description?: string }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(value) }, [value])
  const change = (value: string) => { setDraft(value); onChange(value) }
  return <Field className={multiline ? 'nola-field-stack' : undefined}><div className="nola-setting-copy"><FieldLabel htmlFor={id}>{label}</FieldLabel>{description && <p>{description}</p>}</div>{multiline ? <Textarea id={id} value={draft} onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false; onChange(draft) }} onChange={e => change(e.target.value)} /> : <Input id={id} type={type} value={draft} onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false; onChange(draft) }} onChange={e => change(e.target.value)} />}</Field>
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = useId()
  return <Field className="nola-setting-toggle"><FieldLabel htmlFor={id}>{label}</FieldLabel><Switch id={id} checked={checked} onCheckedChange={onChange}><SwitchThumb /></Switch></Field>
}
function NumberField({ label, value, onChange, min = 0, max = 100, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <TextField label={label} value={String(value)} type="number" onChange={value => { const number = Number(value); if (Number.isFinite(number)) onChange(Math.max(min, Math.min(max, Math.round(number / step) * step))) }} />
}
function FileAction({ label, accept, disabled, onFile }: { label: string; accept: string; disabled?: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="nola-file-action"><Button variant="outline" disabled={disabled} onClick={() => input.current?.click()}><Upload data-icon="inline-start" />{label}</Button><input ref={input} type="file" aria-label={label} accept={accept} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file) }} /></div>
}
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="nola-settings-section">{title && <h2>{title}</h2>}<FieldGroup>{children}</FieldGroup></section>
}
function ProviderField({ label, value, providers, onChange, capability = 'mt', t }: { label: string; value: string; providers: ProviderConnection[]; onChange: (value: string) => void; capability?: Capability; t: T }) {
  const [error, setError] = useState('')
  return <><ChoiceField label={label} value={value} options={providers.filter(p => p.capabilities.includes(capability)).map(p => ({ value: p.id, label: p.name }))} onChange={id => { const provider = providers.find(p => p.id === id); if (provider) void requestProviderAccess(provider).then(granted => { if (!granted) throw new Error('permissionFailed'); setError(''); onChange(id) }).catch(() => setError(t('permissionFailed'))) }} />{error && <p role="alert" className="nola-error">{error}</p>}</>
}
function ShortcutField({ label, value, onChange, modifierOnly = false, error, t }: { label: string; value: string; onChange(value: string): void; modifierOnly?: boolean; error?: string; t: T }) {
  const id = useId()
  return <Field data-invalid={Boolean(error) || undefined}><div className="nola-setting-copy"><FieldLabel htmlFor={id}>{label}</FieldLabel><p id={id + '-help'}>{error || t('shortcutRecordHelp')}</p></div><Input id={id} value={value} readOnly aria-invalid={Boolean(error) || undefined} aria-describedby={id + '-help'} onKeyDown={event => {
    if (event.key === 'Tab' || event.key === 'Escape') return
    event.preventDefault()
    const modifier = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta' }[event.key]
    if (modifierOnly) { if (modifier) onChange(modifier); return }
    if (modifier || event.key === '+' || (!event.ctrlKey && !event.altKey && !event.metaKey)) return
    onChange([event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+'))
  }} /></Field>
}
function LanguageMultiField({ settings, locale, save, t }: { settings: Preferences; locale: Parameters<typeof languageOptions>[0]; save: Save; t: T }) {
  const [query, setQuery] = useState('')
  const languages = languageOptions(locale)
  return <Field><FieldLabel>{t('skipLanguages')}</FieldLabel><Popover><PopoverTrigger render={<Button variant="outline" aria-label={t('skipLanguages')} />}><span className="nola-language-selection">{settings.skipLanguages.length ? languages.filter(option => settings.skipLanguages.includes(option.value)).map(option => option.label).join(', ') : t('none')}</span><ChevronDown data-icon="inline-end" /></PopoverTrigger><PopoverContent className="nola-hub-provider-picker"><PopoverTitle>{t('skipLanguages')}</PopoverTitle><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={t('searchLanguages')} placeholder={t('searchLanguages')} value={query} onChange={e => setQuery(e.target.value)} /></InputGroup>{languages.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(option => <Toggle key={option.value} label={option.label} checked={settings.skipLanguages.includes(option.value)} onChange={checked => save('skipLanguages', checked ? [...settings.skipLanguages, option.value] : settings.skipLanguages.filter(value => value !== option.value))} />)}</PopoverContent></Popover></Field>
}
function JsonField({ label, value, onChange, error }: { label: string; value: object; onChange: (value: Record<string, string>) => void; error: string }) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)
  return <><TextField label={label} multiline value={draft} onChange={text => { setDraft(text); try { const parsed: unknown = JSON.parse(text); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); onChange(parsed as Record<string, string>); setInvalid(false) } catch { setInvalid(true) } }} />{invalid && <p className="nola-error" role="alert">{error}</p>}</>
}

function ConfirmAction({ label, description, onConfirm, t }: { label: string; description: string; onConfirm(): Promise<void>; t: T }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  return <><Button variant="outline" onClick={() => { setError(''); setOpen(true) }}>{label}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>{label}</DialogTitle><DialogDescription>{description}</DialogDescription>{error && <p className="nola-error" role="alert">{error}</p>}<DialogFooter><DialogClose render={<Button variant="outline" disabled={pending} />}>{t('cancel')}</DialogClose><Button variant="destructive" disabled={pending} onClick={() => { setPending(true); void onConfirm().then(() => setOpen(false)).catch(() => setError(t('internalError'))).finally(() => setPending(false)) }}>{label}</Button></DialogFooter></DialogContent></Dialog></>
}
function ProviderEditor({ providers, settings, onChange, t }: { providers: ProviderConnection[]; settings: Preferences; onChange: (providers: ProviderConnection[]) => Promise<void>; t: T }) {
  const [selected, setSelected] = useState('desktop')
  const [result, setResult] = useState('')
  const [pending, setPending] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [provider, setProvider] = useState<ProviderConnection>()
  const currentDraft = useRef(provider)
  currentDraft.current = provider
  useEffect(() => { setResult(''); setShowKey(false) }, [provider?.id])
  const dirty = useRef(false)
  const drafts = useRef(new Map<string, ProviderConnection>())
  const lastSelected = useRef(selected)
  const preset = PROVIDER_PRESETS.find(item => item.id === provider?.preset)
  useEffect(() => {
    if (lastSelected.current === selected && dirty.current) return
    lastSelected.current = selected; dirty.current = false
    setProvider(drafts.current.get(selected) ?? providers.find(p => p.id === selected) ?? providers[0])
  }, [providers, selected])
  const update = (patch: Partial<ProviderConnection>) => { dirty.current = true; setResult(''); setProvider(current => { if (!current) return current; const next = { ...current, ...patch }; drafts.current.set(current.id, next); return next }) }
  async function test() {
    if (!provider) return
    setPending(true); setResult('')
    try {
      const result = await testProvider(provider)
      if (currentDraft.current === provider) setResult(result)
    } catch (error) { if (currentDraft.current === provider) setResult(t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed'))) } finally { setPending(false) }
  }
  async function save() {
    if (!provider) return
    setPending(true); setResult('')
    try {
      if (!await requestProviderAccess(provider)) throw new Error('permissionFailed')
      await onChange(providers.map(p => p.id === provider.id ? provider : p)); dirty.current = false; drafts.current.delete(provider.id); setResult(t('saved'))
    } catch (error) { setResult(t(errorKey(error instanceof Error ? error.message : 'providerInvalid'))) } finally { setPending(false) }
  }
  return <div className="nola-provider-layout">
    <aside className="nola-provider-rail" aria-label={t('apiProviders')}>
      <Popover open={adding} onOpenChange={setAdding}><PopoverTrigger render={<Button variant="outline" className="nola-provider-add" />}><Plus data-icon="inline-start" />{t('add')}</PopoverTrigger><PopoverContent className="nola-provider-picker" align="start"><PopoverTitle>{t('preset')}</PopoverTitle><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={t('searchOptions')} placeholder={t('searchOptions')} value={addSearch} onChange={e => setAddSearch(e.target.value)} /></InputGroup><div className="nola-provider-picker-list">{PROVIDER_PRESETS.filter(p => p.id !== 'nola' && p.name.toLowerCase().includes(addSearch.toLowerCase())).map(p => <Button variant="bare" key={p.id} disabled={pending} onClick={() => {
        const created = createProvider(p.id)
        setPending(true); void onChange([...providers, created]).then(() => { setSelected(created.id); setAdding(false); setAddSearch('') }).catch(() => setResult(t('invalidConfig'))).finally(() => setPending(false))
      }}>{p.name}</Button>)}</div></PopoverContent></Popover>
      {providers.map(p => {
        const count = ['pageProvider', 'selectionProvider', 'inputProvider', 'subtitleProvider', 'asrProvider', 'ttsProvider', 's2sProvider', 'llmProvider'].filter(key => settings[key as keyof Preferences] === p.id).length
        return <Button className="nola-provider-list-item" key={p.id} variant="outline" aria-pressed={p.id === provider?.id} onClick={() => setSelected(p.id)}><ProviderAvatar provider={p} /><span>{p.name}</span>{count > 0 && <Badge variant="accent">{count}</Badge>}</Button>
      })}
    </aside>
    {provider && <Card className="nola-provider-editor"><CardHeader><CardTitle><ProviderAvatar provider={provider} />{provider.name}</CardTitle></CardHeader><CardContent><FieldGroup>
      {provider.preset === 'nola' ? <p className="nola-muted">{t('nativeProviderHelp')}</p> : <TextField label={t('name')} value={provider.name} onChange={name => update({ name })} />}
      {provider.preset === 'nola' && <Button variant="outline" disabled={pending} onClick={() => void test()}>{pending ? t('translating') : t('testConnection')}</Button>}
      {provider.preset !== 'nola' && <>
        <ChoiceField label={t('preset')} value={provider.preset} options={PROVIDER_PRESETS.filter(p => p.id !== 'nola').map(p => ({ value: p.id, label: p.name }))} onChange={id => { const preset = PROVIDER_PRESETS.find(p => p.id === id); if (preset) update({ preset: id, baseUrl: preset.baseUrl, capabilities: [...preset.capabilities], model: preset.model ?? '' }) }} />
        <TextField label={t('baseUrl')} value={provider.baseUrl} onChange={baseUrl => update({ baseUrl })} />
        {(!['google-free', 'microsoft-free', 'edge-tts'].includes(preset?.protocol ?? '')) && <><TextField label={t('apiKey')} type={showKey ? 'text' : 'password'} value={provider.apiKey} onChange={apiKey => update({ apiKey })} /><Toggle label={t('showApiKey')} checked={showKey} onChange={setShowKey} /></>}
        {(!['google-free', 'microsoft-free', 'edge-tts', 'deepl', 'deeplx'].includes(preset?.protocol ?? '')) && <TextField label={t('model')} value={provider.model} onChange={model => update({ model })} />}
        <details><summary>{t('advancedOptions')}</summary><FieldGroup>
          <JsonField key={`${provider.id}-headers`} label={t('headers')} value={provider.headers} onChange={headers => update({ headers })} error={t('invalidConfig')} />
          <JsonField key={`${provider.id}-options`} label={t('advancedOptions')} value={provider.options} onChange={options => update({ options })} error={t('invalidConfig')} />
        </FieldGroup></details>
      </>}
      {provider.preset !== 'nola' && <div className="nola-actions"><Button disabled={pending || !provider.name.trim()} onClick={() => void save()}>{t('save')}</Button><Button variant="outline" disabled={pending} onClick={() => void test()}>{pending ? t('translating') : t('testConnection')}</Button><ConfirmAction label={t('remove')} description={t('confirmRemoveProvider')} t={t} onConfirm={async () => {
        const bindings = ['pageProvider', 'selectionProvider', 'inputProvider', 'subtitleProvider', 'asrProvider', 'ttsProvider', 's2sProvider', 'llmProvider'].filter(key => settings[key as keyof Preferences] === provider.id)
        if (bindings.length) await savePreferences(Object.fromEntries(bindings.map(key => [key, 'desktop'])))
        await onChange(providers.filter(p => p.id !== provider.id)); drafts.current.delete(provider.id); setSelected('desktop')
      }} /></div>}
      {result && <p role="status" className="nola-muted">{result}</p>}
    </FieldGroup></CardContent></Card>}
  </div>
}
function TranslationCenter({ settings, providers, locale, t }: { settings: Preferences; providers: ProviderConnection[]; locale: Parameters<typeof languageOptions>[0]; t: T }) {
  const [text, setText] = useState('')
  const [source, setSource] = useState(settings.sourceLanguage)
  const [target, setTarget] = useState(settings.pageLanguage)
  const [selected, setSelected] = useState<string[]>([settings.pageProvider])
  const [results, setResults] = useState<Record<string, { text?: string; error?: string; pending?: boolean }>>({})
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [copied, setCopied] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [feedback, setFeedback] = useState('')
  const requests = useRef(new Map<string, AbortController>())
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef('')
  const speechRequest = useRef<AbortController | null>(null)
  useEffect(() => () => { requests.current.forEach(controller => controller.abort()); speechRequest.current?.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current) }, [])
  const available = providers.filter(p => p.capabilities.includes('mt'))
  const active = selected.filter(id => available.some(p => p.id === id))
  const pending = Object.values(results).some(result => result.pending)
  async function run(ids = active) {
    setFeedback('')
    await Promise.all(ids.map(async providerId => {
      requests.current.get(providerId)?.abort()
      const controller = new AbortController(); requests.current.set(providerId, controller)
      setResults(current => ({ ...current, [providerId]: { pending: true } }))
      try {
        const provider = providers.find(p => p.id === providerId)
        if (!provider || !await requestProviderAccess(provider)) throw new Error('providerPermission')
        if (controller.signal.aborted) return
        const translation = await translate(text, source, target, 'selection', controller.signal, providerId)
        if (!controller.signal.aborted) setResults(current => ({ ...current, [providerId]: { text: translation } }))
      } catch (error) { if (!controller.signal.aborted) setResults(current => ({ ...current, [providerId]: { error: t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed')) } })) }
    }))
  }
  function selectProvider(id: string, checked: boolean) {
    if (!checked) { requests.current.get(id)?.abort(); setResults(current => { const next = { ...current }; delete next[id]; return next }) }
    setSelected(current => checked ? [...current, id] : current.filter(value => value !== id))
  }
  async function speak(value: string, language: string) {
    speechRequest.current?.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    const controller = new AbortController(); speechRequest.current = controller
    setSpeaking(true); setFeedback('')
    try {
      const sound = await synthesize(value, language, controller.signal, settings.ttsProvider)
      if (controller.signal.aborted) return
      const bytes = Uint8Array.from(atob(sound.audioBase64), value => value.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: sound.contentType })); audioUrl.current = url
      const player = new Audio(url); audio.current = player; player.playbackRate = settings.ttsRate; player.volume = settings.ttsVolume
      const release = () => { URL.revokeObjectURL(url); if (audioUrl.current === url) audioUrl.current = '' }
      player.addEventListener('ended', release, { once: true }); player.addEventListener('error', release, { once: true })
      try { await player.play() } catch (error) { release(); throw error }
    } catch (error) { if (!controller.signal.aborted) setFeedback(t(errorKey(error instanceof Error ? error.message : 'internalError'))) } finally { if (speechRequest.current === controller) setSpeaking(false) }
  }
  return <div className="nola-translation-center">
    <div className="nola-hub-source">
      <div className="nola-hub-languages"><PopupLanguage size="sm" label={t('source')} value={source} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={setSource} t={t} /><Button variant="bare" size="icon-sm" aria-label={t('swapLanguages')} title={t('swapLanguages')} disabled={source === 'auto'} onClick={() => { setSource(target); setTarget(source) }}><ArrowLeftRight /></Button><PopupLanguage size="sm" label={t('target')} value={target} options={languageOptions(locale)} onChange={setTarget} t={t} /></div>
      <div className="nola-hub-input"><Textarea aria-label={t('inputText')} placeholder={t('inputText')} value={text} onChange={e => setText(e.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && text.trim() && active.length && !pending) { event.preventDefault(); void run() } }} /><div className="nola-hub-input-actions"><Button variant="bare" size="icon-sm" disabled={!text.trim() || speaking} aria-label={t('readAloud')} title={t('readAloud')} onClick={() => void speak(text, source)}><Volume2 /></Button><Button disabled={pending || !text.trim() || !active.length} onClick={() => void run()}>{t(pending ? 'translating' : 'translateText')}</Button></div></div>
    </div>
    <div className="nola-hub-results"><div className="nola-hub-toolbar"><Popover><PopoverTrigger render={<Button variant="outline" />}><Languages data-icon="inline-start" />{t('provider')}<Badge>{active.length}</Badge><ChevronDown data-icon="inline-end" /></PopoverTrigger><PopoverContent className="nola-hub-provider-picker" align="end"><PopoverTitle>{t('selectProviders')}</PopoverTitle>{available.map(p => <Toggle key={p.id} label={p.name} checked={selected.includes(p.id)} onChange={checked => selectProvider(p.id, checked)} />)}</PopoverContent></Popover><Button variant="bare" size="icon-sm" aria-label={t('apiProviders')} title={t('apiProviders')} onClick={() => { window.location.hash = 'apiProviders' }}><Settings2 /></Button><Button variant="bare" size="icon-sm" disabled={!active.length} aria-label={t('expand')} title={t('expand')} onClick={() => setCollapsed([])}><ChevronDown /></Button><Button variant="bare" size="icon-sm" disabled={!active.length} aria-label={t('collapse')} title={t('collapse')} onClick={() => setCollapsed(active)}><ChevronUp /></Button></div>
      {active.map(id => { const provider = available.find(p => p.id === id)!; const result = results[id]; const expanded = !collapsed.includes(id); return <Card className="nola-hub-result" key={id}><CardHeader><CardTitle><ProviderAvatar provider={provider} />{provider.name}</CardTitle><div className="nola-hub-card-actions"><Button variant="bare" size="icon-sm" disabled={!text.trim() || result?.pending} aria-label={t('refresh')} title={t('refresh')} onClick={() => void run([id])}><RefreshCw /></Button><Button variant="bare" size="icon-sm" disabled={!result?.text || speaking} aria-label={t('readAloud')} title={t('readAloud')} onClick={() => void speak(result!.text!, target)}><Volume2 /></Button><Button variant="bare" size="icon-sm" disabled={!result?.text} aria-label={t(copied === id ? 'copied' : 'copyTranslation')} title={t(copied === id ? 'copied' : 'copyTranslation')} onClick={() => { void navigator.clipboard.writeText(result!.text!).then(() => { setCopied(id); setTimeout(() => setCopied(''), 1500) }).catch(() => setFeedback(t('internalError'))) }}>{copied === id ? <Check /> : <Copy />}</Button><Button variant="bare" size="icon-sm" aria-label={t(expanded ? 'collapse' : 'expand')} aria-expanded={expanded} title={t(expanded ? 'collapse' : 'expand')} onClick={() => setCollapsed(current => expanded ? [...current, id] : current.filter(value => value !== id))}>{expanded ? <ChevronUp /> : <ChevronDown />}</Button><Button variant="bare" size="icon-sm" aria-label={t('close')} title={t('close')} onClick={() => selectProvider(id, false)}><X /></Button></div></CardHeader>{expanded && <CardContent aria-live="polite">{result?.pending ? <p className="nola-muted">{t('translating')}</p> : result?.error ? <p className="nola-error" role="alert">{result.error}</p> : <p>{result?.text || t('inputText')}</p>}</CardContent>}</Card> })}
    </div>
    {feedback && <p role="alert" className="nola-error">{feedback}</p>}
  </div>
}
function SiteRules({ settings, save, t }: { settings: Preferences; save: Save; t: T }) {
  const [host, setHost] = useState('')
  const [exclude, setExclude] = useState('')
  const [include, setInclude] = useState('')
  return <FieldGroup>
    <TextField label={t('host')} value={host} onChange={setHost} />
    <TextField label={t('excludeSelectors')} value={exclude} onChange={setExclude} />
    <TextField label={t('includeSelectors')} value={include} onChange={setInclude} />
    <Button disabled={!host.trim()} onClick={() => { save('siteRules', [...settings.siteRules, { host: host.trim(), excludeSelectors: exclude, includeSelectors: include }]); setHost(''); setExclude(''); setInclude('') }}>{t('add')}</Button>
    {settings.siteRules.map((rule, i) => <div className="nola-actions" key={i}><code>{rule.host} · {rule.includeSelectors} · {rule.excludeSelectors}</code><ConfirmAction label={t('remove')} description={rule.host} t={t} onConfirm={() => savePreferences({ siteRules: settings.siteRules.filter((_, index) => index !== i) })} /></div>)}
  </FieldGroup>
}
function Backup({ settings, t, report }: { settings: Preferences; t: T; report: (message: string) => void }) {
  const [secrets, setSecrets] = useState(false)
  const [importing, setImporting] = useState(false)
  async function exportConfig() {
    try {
      const data = { version: 2, preferences: settings, providers: await exportProviderConfig(secrets), glossary: await extensionGlossary.snapshot() }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'nola-extension.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { report(t('internalError')) }
  }
  async function importConfig(file?: File) {
    if (!file) return
    setImporting(true)
    try {
      if (file.size > 10_000_000) throw new Error()
      const data: unknown = JSON.parse(await file.text())
      if (!data || typeof data !== 'object' || !('version' in data) || ![1, 2].includes(data.version as number) || !('preferences' in data) || !data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences)) throw new Error()
      const imported = readPreferences(data.preferences as Record<string, unknown>)
      const currentGlossary = await extensionGlossary.snapshot()
      const glossary = data.version === 2 && 'glossary' in data ? glossaryDocumentSchema.parse(data.glossary) : migrateLegacyGlossary(imported.glossary, t('suite.glossaryTitle'), t('suite.migrationReview'))
      await restoreExtensionConfiguration({ glossary, preferences: imported, ...('providers' in data ? { providers: data.providers } : {}) }, currentGlossary.revision)
      report(t('saved'))
    } catch { report(t('invalidConfig')) } finally { setImporting(false) }
  }
  return <>
    <Group title={t('exportConfig')}><p className="nola-muted">{t('exportHelp')}</p><Toggle label={t('includeKeys')} checked={secrets} onChange={setSecrets} /><div className="nola-form-actions"><Button variant="outline" onClick={() => void exportConfig()}><Download data-icon="inline-start" />{t('exportConfig')}</Button><FileAction label={t('importConfig')} accept="application/json,.json" disabled={importing} onFile={file => void importConfig(file)} /></div></Group>
    <Group title={t('storageActions')}>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('clearCache')}</FieldLabel><p>{t('clearCacheHelp')}</p></div><Button variant="outline" onClick={() => { void clearTranslationCache().then(() => report(t('saved'))).catch(() => report(t('internalError'))) }}>{t('clearCache')}</Button></Field>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('resetSettings')}</FieldLabel><p>{t('resetHelp')}</p></div><ConfirmAction label={t('resetSettings')} description={t('confirmResetSettings')} t={t} onConfirm={async () => { const glossary = await extensionGlossary.snapshot(); await restoreExtensionConfiguration({ glossary: emptyGlossary(), preferences: DEFAULT_PREFERENCES }, glossary.revision); report(t('saved')) }} /></Field>
    </Group>
  </>
}

export function Options() {
  const [settings, locale, t] = usePreferences()
  const [section, setSection] = useState<typeof sections[number]>(() => sections.find(section => section === parseOptionsRoute(window.location.hash).section) ?? 'general')
  const [libraryId, setLibraryId] = useState(() => parseOptionsRoute(window.location.hash).libraryId)
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [shortcutError, setShortcutError] = useState('')
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [section, query])
  useEffect(() => {
    const navigate = () => { setSection(sections.find(key => key === parseOptionsRoute(window.location.hash).section) ?? 'general'); setLibraryId(parseOptionsRoute(window.location.hash).libraryId); setQuery('') }
    const search = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() } }
    window.addEventListener('hashchange', navigate); window.addEventListener('keydown', search)
    return () => { window.removeEventListener('hashchange', navigate); window.removeEventListener('keydown', search) }
  }, [])
  useEffect(() => {
    let alive = true
    const refresh = () => { void loadProviders().then(values => { if (alive) setProviders(values) }).catch(() => { if (alive) setMessage(t('invalidConfig')) }) }
    const changed = (changes: Record<string, unknown>) => { if (changes.providerRevision) refresh() }
    refresh(); chrome.storage.onChanged.addListener(changed)
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed) }
  }, [locale])
  const save: Save = (key, value) => { setMessage(''); void savePreferences({ [key]: value }).catch(() => setMessage(t('internalError'))) }
  const updateProviders = async (values: ProviderConnection[]) => { await saveProviders(values); setProviders(values) }
  const modes = [{ value: 'bilingual', label: t('bilingual') }, { value: 'translation', label: t('translationOnly') }]
  const bind = (key: keyof Preferences, label: BrowserKey, capability: Capability = 'mt') => <ProviderField label={t(label)} value={String(settings[key])} providers={providers} onChange={value => save(key, value as never)} capability={capability} t={t} />
  const toggle = (key: keyof Preferences, label: BrowserKey) => <Toggle label={t(label)} checked={Boolean(settings[key])} onChange={value => save(key, value as never)} />
  const text = (key: keyof Preferences, label: BrowserKey, multiline = false) => <TextField label={t(label)} value={String(settings[key])} onChange={value => save(key, value as never)} multiline={multiline} />
  const list = (key: 'autoSites' | 'neverAutoSites' | 'siteBlacklist' | 'skipLanguages' | 'autoSubtitleSites' | 'floatingDisabledSites' | 'selectionDisabledSites', label: BrowserKey) => <TextField description={key === 'skipLanguages' ? undefined : t('siteListHelp')} label={t(label)} value={settings[key].join('\n')} multiline onChange={value => save(key, value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))} />
  const filtered = sections.filter(key => [t(key), t(descriptions[key]), ...searchKeys[key].map(key => t(key)), ...(key === 'apiProviders' ? providers.map(provider => provider.name) : [])].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const active = query.trim() ? filtered : [section]
  return <main className="nola-settings-shell">
    <aside className="nola-settings-sidebar"><header className="nola-options-header"><NolaLogo /><strong>Nola Translator</strong></header><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput ref={searchInput} aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <nav aria-label={t('settings')}>{navGroups.map(group => {
        const items = group.items.filter(key => filtered.includes(key))
        return items.length ? <div className="nola-nav-group" key={group.label}><p>{t(group.label)}</p>{items.map(key => { const Icon = sectionIcons[key]; return <Button key={key} variant="outline" aria-current={section === key ? 'page' : undefined} onClick={() => { setSection(key); setQuery(''); window.location.hash = key }}><Icon aria-hidden="true" /><span>{t(key)}</span></Button> })}</div> : null
      })}</nav>
    </aside>
    <div className="nola-settings-main"><header className="nola-settings-title"><h1>{query ? t('search') : t(section)}</h1>{!query && <p>{t(descriptions[section])}</p>}</header>
      {!query && previewSections.includes(section) && <SettingsPreview key={section} kind={section as PreviewKind} settings={settings} t={t} />}
      {message && <Alert><AlertDescription role="status">{message}</AlertDescription></Alert>}
      {active.length === 0 && <p>{t('noResults')}</p>}
      {active.includes('general') && <><Group title={t('appearance')}>
        <ChoiceField label={t('interfaceLanguage')} value={settings.uiLanguage} options={UI_LANGUAGES.map((value, index) => ({ value, label: index ? languageLabels[index - 1] : t('browserDefault') }))} onChange={value => save('uiLanguage', value as Preferences['uiLanguage'])} />
        <ChoiceField label={t('theme')} value={settings.theme} options={[{ value: 'auto', label: t('browserDefault') }, { value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }]} onChange={value => save('theme', value as Preferences['theme'])} />
      </Group><Group title={t('translationLanguages')}><ChoiceField label={t('source')} value={settings.sourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={value => save('sourceLanguage', value)} />
        <TargetLanguageField value={settings.pageLanguage} locale={locale} t={t} onChange={value => save('pageLanguage', value)} />
      </Group><Group title={t('siteScope')}>{list('siteBlacklist', 'siteBlacklist')}</Group></>}
      {active.includes('apiProviders') && <><Group><ProviderEditor providers={providers} settings={settings} onChange={updateProviders} t={t} /></Group><details className="nola-settings-disclosure"><summary>{t('featureBindings')}</summary><Group>
        {bind('pageProvider', 'web')}{bind('selectionProvider', 'selection')}{bind('inputProvider', 'inputTranslation')}{bind('subtitleProvider', 'video')}<LiveServiceField settings={settings} providers={providers} t={t} />{bind('ttsProvider', 'tts', 'tts')}{bind('llmProvider', 'llm', 'llm')}
      </Group></details><details className="nola-settings-disclosure"><summary>{t('connection')}</summary><Group><ConnectionStatus t={t} /></Group></details></>}
      {active.includes('web') && <><Group>
        <p className="nola-muted">{t('llmSettingsHelp')}</p>{bind('pageProvider', 'provider')}<ChoiceField label={t('display')} value={settings.pageDisplay} options={modes} onChange={value => save('pageDisplay', value as Preferences['pageDisplay'])} />
        <ChoiceField label={t('pageScope')} value={settings.pageScope} options={[{ value: 'main', label: t('mainContent') }, { value: 'all', label: t('entirePage') }]} onChange={value => save('pageScope', value as Preferences['pageScope'])} />
        {toggle('translateTitle', 'translateTitle')}{toggle('hoverTranslation', 'hoverTranslation')}{toggle('contextAware', 'contextAware')}
        <NumberField label={t('minTextLength')} value={settings.minTextLength} min={1} max={1000} onChange={value => save('minTextLength', value)} />
        <LanguageMultiField settings={settings} locale={locale} save={save} t={t} />{list('autoSites', 'autoSites')}{list('neverAutoSites', 'neverAutoSites')}
      </Group><Group title={t('pageStyle')}>
        <ChoiceField label={t('pageStyle')} value={settings.pageStyle} options={(['underline', 'block', 'plain'] as const).map(value => ({ value, label: t(value) }))} onChange={value => save('pageStyle', value as Preferences['pageStyle'])} />
        {text('pageCustomCss', 'customCss', true)}<p className="nola-muted">{t('cssHelp')}</p>{text('pagePrompt', 'prompt', true)}
        <NumberField label={t('requestRate')} value={settings.requestRate} min={1} max={60} onChange={value => save('requestRate', value)} /><NumberField label={t('llmBatchSize')} value={settings.batchSize} min={1} onChange={value => save('batchSize', value)} />
      </Group><Group title={t('siteRules')}><SiteRules settings={settings} save={save} t={t} /></Group></>}
      {active.includes('video') && <><Group title={t('translationLanguages')}>
        {bind('subtitleProvider', 'provider')}<LiveServiceField settings={settings} providers={providers} t={t} /><TargetLanguageField value={settings.videoLanguage} locale={locale} t={t} onChange={value => save('videoLanguage', value)} />
        <ChoiceField label={t('display')} value={settings.videoDisplay} options={[...modes, { value: 'source', label: t('originalOnly') }]} onChange={value => save('videoDisplay', value as Preferences['videoDisplay'])} />
      </Group><Group title={t('sourceCaption')}>
        {text('subtitleSourceFont', 'subtitleFont')}<RangeField label={t('fontSize')} value={settings.subtitleSourceSize} min={10} max={60} suffix="px" onChange={value => save('subtitleSourceSize', value)} /><ColorField label={t('subtitleColor')} value={settings.subtitleSourceColor} onChange={value => save('subtitleSourceColor', value)} />
      </Group><Group title={t('translatedCaption')}>
        {text('subtitleTranslationFont', 'subtitleFont')}<RangeField label={t('fontSize')} value={settings.subtitleTranslationSize} min={10} max={60} suffix="px" onChange={value => save('subtitleTranslationSize', value)} /><ColorField label={t('subtitleColor')} value={settings.subtitleTranslationColor} onChange={value => save('subtitleTranslationColor', value)} />
      </Group><Group title={t('subtitleAppearance')}>
        {toggle('subtitleTranslationFirst', 'subtitleTranslationFirst')}{toggle('subtitleBold', 'subtitleBold')}{toggle('subtitlePauseOnHover', 'subtitlePauseOnHover')}
        <ColorField label={t('subtitleBackground')} value={settings.subtitleBackground} onChange={value => save('subtitleBackground', value)} />
        <RangeField label={t('subtitlePosition')} value={settings.subtitleOffset} max={30} suffix="%" onChange={value => save('subtitleOffset', value)} />
        <RangeField label={t('subtitleBackgroundOpacity')} value={settings.subtitleBackgroundOpacity} max={1} step={0.05} onChange={value => save('subtitleBackgroundOpacity', value)} />
        {toggle('subtitleFollow', 'subtitleFollow')}
        <div className="nola-two-columns"><RangeField label={t('subtitlePositionX')} value={settings.subtitlePositionX} onChange={value => save('subtitlePositionX', value)} /><RangeField label={t('subtitlePositionY')} value={settings.subtitlePositionY} onChange={value => save('subtitlePositionY', value)} /></div>
      </Group><Group title={t('advancedSettings')}>{list('autoSubtitleSites', 'autoSubtitleSites')}{text('subtitleCustomCss', 'customCss', true)}<p className="nola-muted">{t('cssHelp')}</p>{text('subtitlePrompt', 'prompt', true)}
      </Group></>}
      {active.includes('selection') && <><Group>{toggle('selectionTranslation', 'enableFeature')}{bind('selectionProvider', 'provider')}</Group><Group title={t('toolbarActions')}>{toggle('selectionTranslate', 'translateText')}{toggle('selectionSpeak', 'tts')}{toggle('selectionCopy', 'copyTranslation')}</Group><Group title={t('visibility')}><RangeField label={t('opacity')} value={Math.round(settings.selectionOpacity * 100)} min={20} max={100} suffix="%" onChange={value => save('selectionOpacity', value / 100)} />{list('selectionDisabledSites', 'disabledWebsites')}</Group></>}
      {active.includes('inputTranslation') && <Group>{toggle('inputTranslation', 'enableFeature')}{bind('inputProvider', 'provider')}<ChoiceField label={t('source')} value={settings.inputSourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={value => save('inputSourceLanguage', value)} /><TargetLanguageField value={settings.inputTargetLanguage} locale={locale} t={t} onChange={value => save('inputTargetLanguage', value)} /><ChoiceField label={t('inputTrigger')} value={settings.inputTrigger} options={[{ value: 'tripleSpace', label: t('inputTripleSpace') }, { value: 'shortcut', label: t('inputShortcut') }]} onChange={value => save('inputTrigger', value as Preferences['inputTrigger'])} /></Group>}
      {active.includes('floatingButton') && <><Group>{toggle('floatingButton', 'enableFeature')}</Group><Group title={t('visibility')}>
        <ChoiceField label={t('floatingSide')} value={settings.floatingSide} options={[{ value: 'left', label: t('leftSide') }, { value: 'right', label: t('rightSide') }]} onChange={value => save('floatingSide', value as Preferences['floatingSide'])} />
        <RangeField label={t('floatingPosition')} value={Math.round(settings.floatingPosition * 100)} onChange={value => save('floatingPosition', value / 100)} suffix="%" />
        {toggle('floatingLocked', 'pinFloating')}{list('floatingDisabledSites', 'disabledWebsites')}
      </Group><Group title={t('behavior')}><ChoiceField label={t('floatingClickAction')} value={settings.floatingClickAction} options={[{ value: 'panel', label: t('floatingOpenPanel') }, { value: 'translate', label: t('translatePage') }]} onChange={value => save('floatingClickAction', value as Preferences['floatingClickAction'])} /></Group></>}
      {active.includes('contextMenu') && <><Group>{toggle('contextMenuEnabled', 'enableFeature')}</Group><Group title={t('toolbarActions')}>{toggle('contextMenuPage', 'togglePageTranslation')}{toggle('contextMenuSelection', 'translateSelection')}{toggle('contextMenuSpeak', 'speakSelection')}{toggle('contextMenuInput', 'inputTranslation')}</Group></>}
      {active.includes('shortcuts') && <Group>{(['shortcutPage', 'shortcutSelection', 'shortcutHover', 'shortcutSubtitles'] as const).map((key, index) => <ShortcutField key={key} label={t((['translatePage', 'translateSelection', 'hoverTranslation', 'video'] as const)[index])} value={settings[key]} modifierOnly={key === 'shortcutHover'} error={shortcutError === key ? t('shortcutConflict') : undefined} t={t} onChange={value => {
        const normalize = (shortcut: string) => { const parts = shortcut.toLowerCase().split('+'); return [parts.pop(), ...parts.sort()].join('+') }
        if (key !== 'shortcutHover' && (['shortcutPage', 'shortcutSelection', 'shortcutSubtitles'] as const).some(other => other !== key && normalize(settings[other]) === normalize(value))) { setShortcutError(key); return }
        setShortcutError(''); save(key, value)
      }} />)}</Group>}
      {active.includes('tts') && <Group>{bind('ttsProvider', 'provider', 'tts')}{text('ttsVoice', 'voice')}<RangeField label={t('rate')} value={settings.ttsRate} min={0.1} max={10} step={0.1} onChange={value => save('ttsRate', value)} />{['edge-tts', 'minimax'].includes(providers.find(provider => provider.id === settings.ttsProvider)?.preset ?? '') && <RangeField label={t('pitch')} value={settings.ttsPitch} min={0.5} max={2} step={0.1} onChange={value => save('ttsPitch', value)} />}<RangeField label={t('volume')} value={settings.ttsVolume} max={1} step={0.1} onChange={value => save('ttsVolume', value)} /></Group>}
      {active.includes('translationHub') && <Group><TranslationCenter settings={settings} providers={providers} locale={locale} t={t} /></Group>}
      {active.includes('glossary') && <Group><GlossaryManager libraryId={query ? undefined : libraryId} locale={locale} t={t} /></Group>}
      {active.includes('backup') && <Backup settings={settings} t={t} report={setMessage} />}
    </div>
  </main>
}
const mount = document.getElementById('root')
if (mount) createRoot(mount).render(<Options />)
