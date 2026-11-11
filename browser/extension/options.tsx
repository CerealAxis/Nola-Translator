import './csp'
import { Settings2, Plug, Keyboard, Languages, Captions, MousePointer2, TextCursorInput, Volume2, PanelsTopLeft, MousePointerClick, BookOpen, Archive, PanelTop, Search, Upload, Download, Plus, ArrowLeftRight, ChevronDown, ChevronUp, Copy, RefreshCw, X, CircleHelp, FileText, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ClipboardEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, buttonVariants } from '../../src/renderer/components/ui/button'
import { showToast, ToastProvider } from '../../src/renderer/components/ui/toast'
import { Input } from '../../src/renderer/components/ui/input'
import { Textarea } from '../../src/renderer/components/ui/textarea'
import { Field, FieldGroup, FieldLabel } from '../../src/renderer/components/ui/field'
import { Switch, SwitchThumb } from '../../src/renderer/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../src/renderer/components/ui/tooltip'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../src/renderer/components/ui/input-group'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '../../src/renderer/components/ui/empty'
import { Popover, PopoverContent, PopoverTrigger, PopoverTitle } from '../../src/renderer/components/ui/popover'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../src/renderer/components/ui/dialog'
import { Card, CardAction, CardHeader, CardTitle, CardContent } from '../../src/renderer/components/ui/card'
import { Badge } from '../../src/renderer/components/ui/badge'
import { Kbd, KbdGroup } from '../../src/renderer/components/ui/kbd'
import { ChoiceField } from './components/ChoiceField'
import { PopupLanguage } from './components/PopupLanguage'
import { ProviderAvatar } from './components/ProviderAvatar'
import { SettingsPreview, type PreviewKind } from './components/SettingsPreview'
import { NolaLogo } from './logo'
import { DEFAULT_PREFERENCES, DISABLED_PROVIDER, MAX_WEB_TRANSLATION_CONCURRENCY, readPreferences, savePreferences, UI_LANGUAGES, type Preferences } from './preferences'
import { ColorField, ConnectionStatus, languageOptions, LiveServiceField, RangeField, subtitleFontOptions, TargetLanguageField, usePreferences } from './settings-fields'
import { createProvider, DEFAULT_PROVIDERS, isBundledProviderCopy, loadProviders, saveProviders, requestProviderAccess, PROVIDER_PRESETS, exportProviderConfig, visibleProviderConnections, type ProviderConnection, type Capability } from './providers'
import { GlossaryManager } from './components/GlossaryManager'
import { parseOptionsRoute } from './options-route'
import { extensionGlossary, migrateLegacyGlossary, restoreExtensionConfiguration } from './glossary-store'
import { emptyGlossary, glossaryDocumentSchema } from '../../src/shared/glossary'
import { clearTranslationCache, synthesize, testProvider, translate, translateImage } from './provider-client'
import { encodeClipboardImage } from './image-translation'
import { browserText, errorKey, type BrowserKey } from './i18n'
import { captureDiagnostics, clearDiagnostics, readDiagnostics, type DiagnosticEntry } from './diagnostics'
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
  general: ['interfaceLanguage', 'theme', 'liquidGlass', 'source', 'target', 'siteBlacklist'],
  apiProviders: ['apiKey', 'baseUrl', 'model', 'webConcurrency', 'featureBindings', 'asr', 'tts', 's2s', 'llm', 'connection'],
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
function Toggle({ label, checked, disabled, hint, description, onChange }: { label: string; checked: boolean; disabled?: boolean; hint?: string; description?: string; onChange: (value: boolean) => void }) {
  const id = useId()
  const fieldLabel = <FieldLabel htmlFor={id}>{label}</FieldLabel>
  return <Field className="nola-setting-toggle flex-row items-center justify-between">
    {hint ? <div className="flex min-w-0 items-center gap-1">
      {fieldLabel}
      <TooltipProvider><Tooltip>
        <TooltipTrigger render={<Button variant="bare" size="icon-xs" aria-label={label} />}><CircleHelp aria-hidden="true" /></TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip></TooltipProvider>
    </div> : description ? <div className="nola-setting-copy">{fieldLabel}<p>{description}</p></div> : fieldLabel}
    <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange}><SwitchThumb /></Switch>
  </Field>
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
  return <ChoiceField label={label} value={value} options={[{ value: DISABLED_PROVIDER, label: t('providerNone') }, ...visibleProviderConnections(providers, value).filter(p => p.capabilities.includes(capability)).map(p => ({ value: p.id, label: p.name }))]} onChange={id => {
    if (id === DISABLED_PROVIDER) { onChange(id); return }
    const provider = providers.find(p => p.id === id)
    if (provider) void requestProviderAccess(provider).then(granted => { if (!granted) throw new Error('permissionFailed'); onChange(id) }).catch(() => showToast({ type: 'error', description: t('permissionFailed') }))
  }} />
}
function ShortcutField({ label, value, defaultValue, onChange, modifierOnly = false, error, t }: { label: string; value: string; defaultValue: string; onChange(value: string): void; modifierOnly?: boolean; error?: string; t: T }) {
  const id = useId()
  return <Field data-invalid={Boolean(error) || undefined}><div className="nola-setting-copy"><FieldLabel htmlFor={id}>{label}</FieldLabel><p id={id + '-help'}>{t('shortcutRecordHelp')}</p></div><div className="nola-shortcut-actions"><div className="nola-shortcut-input"><Input id={id} value={value} readOnly aria-invalid={Boolean(error) || undefined} aria-describedby={id + '-help'} onKeyDown={event => {
    if (event.key === 'Tab' || event.key === 'Escape') return
    event.preventDefault()
    const modifier = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta' }[event.key]
    if (modifierOnly) { if (modifier) onChange(modifier); return }
    if (modifier || event.key === '+' || (!event.ctrlKey && !event.altKey && !event.metaKey)) return
    onChange([event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', event.key.length === 1 ? event.key.toUpperCase() : event.key].filter(Boolean).join('+'))
  }} /><KbdGroup aria-hidden="true">{value ? value.split('+').filter(Boolean).map((key, index) => <Kbd key={index}>{key}</Kbd>) : t('shortcutUnassigned')}</KbdGroup></div><Button variant="bare" size="icon-sm" aria-label={`${t('resetShortcut')} · ${label}`} title={t('resetShortcut')} disabled={value === defaultValue} onClick={() => onChange(defaultValue)}><RefreshCw /></Button><Button variant="bare" size="icon-sm" aria-label={`${t('removeShortcut')} · ${label}`} title={t('removeShortcut')} disabled={!value} onClick={() => onChange('')}><Trash2 /></Button></div></Field>
}
function LanguageMultiField({ settings, locale, save, t }: { settings: Preferences; locale: Parameters<typeof languageOptions>[0]; save: Save; t: T }) {
  const [query, setQuery] = useState('')
  const languages = languageOptions(locale)
  return <Field><FieldLabel>{t('skipLanguages')}</FieldLabel><Popover><PopoverTrigger render={<Button variant="outline" aria-label={t('skipLanguages')} />}><span className="nola-language-selection">{settings.skipLanguages.length ? languages.filter(option => settings.skipLanguages.includes(option.value)).map(option => option.label).join(', ') : t('none')}</span><ChevronDown data-icon="inline-end" /></PopoverTrigger><PopoverContent className="nola-hub-provider-picker"><PopoverTitle>{t('skipLanguages')}</PopoverTitle><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={t('searchLanguages')} placeholder={t('searchLanguages')} value={query} onChange={e => setQuery(e.target.value)} /></InputGroup>{languages.filter(option => option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(option => <Toggle key={option.value} label={option.label} checked={settings.skipLanguages.includes(option.value)} onChange={checked => save('skipLanguages', checked ? [...settings.skipLanguages, option.value] : settings.skipLanguages.filter(value => value !== option.value))} />)}</PopoverContent></Popover></Field>
}
function JsonField({ label, value, onChange, error }: { label: string; value: object; onChange: (value: Record<string, string>) => void; error: string }) {
  const id = useId()
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)
  return <Field className="nola-field-stack" data-invalid={invalid || undefined}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Textarea id={id} value={draft} aria-invalid={invalid || undefined} onBlur={() => { if (invalid) showToast({ type: 'error', description: error }) }} onChange={event => {
      const text = event.target.value
      setDraft(text)
      try {
        const parsed: unknown = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        onChange(parsed as Record<string, string>); setInvalid(false)
      } catch { setInvalid(true) }
    }} />
  </Field>
}

function ConfirmAction({ label, description, onConfirm, t }: { label: string; description: string; onConfirm(): Promise<void>; t: T }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  return <><Button variant="outline" onClick={() => setOpen(true)}>{label}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>{label}</DialogTitle><DialogDescription>{description}</DialogDescription><DialogFooter><DialogClose render={<Button variant="outline" disabled={pending} />}>{t('cancel')}</DialogClose><Button variant="destructive" disabled={pending} onClick={() => { setPending(true); void onConfirm().then(() => setOpen(false)).catch(() => showToast({ type: 'error', description: t('internalError') })).finally(() => setPending(false)) }}>{label}</Button></DialogFooter></DialogContent></Dialog></>
}
function ProviderEditor({ providers, settings, onChange, t }: { providers: ProviderConnection[]; settings: Preferences; onChange: (providers: ProviderConnection[]) => Promise<void>; t: T }) {
  const [selected, setSelected] = useState('desktop')
  const [pending, setPending] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [provider, setProvider] = useState<ProviderConnection>()
  const currentDraft = useRef(provider)
  currentDraft.current = provider
  useEffect(() => { setShowKey(false) }, [provider?.id])
  const dirty = useRef(false)
  const drafts = useRef(new Map<string, ProviderConnection>())
  const lastSelected = useRef(selected)
  const preset = PROVIDER_PRESETS.find(item => item.id === provider?.preset)
  const bundledIndex = provider?.id === 'index-translate' && isBundledProviderCopy(provider)
  useEffect(() => {
    if (lastSelected.current === selected && dirty.current) return
    lastSelected.current = selected; dirty.current = false
    setProvider(drafts.current.get(selected) ?? providers.find(p => p.id === selected) ?? providers[0])
  }, [providers, selected])
  const update = (patch: Partial<ProviderConnection>) => { dirty.current = true; setProvider(current => { if (!current) return current; const next = { ...current, ...patch }; drafts.current.set(current.id, next); return next }) }
  async function test() {
    if (!provider) return
    setPending(true)
    try {
      const result = await testProvider(provider)
      if (currentDraft.current === provider) showToast({ type: 'success', title: provider.name, description: result })
    } catch (error) { if (currentDraft.current === provider) showToast({ type: 'error', title: provider.name, description: t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed')) }) } finally { setPending(false) }
  }
  async function save() {
    if (!provider) return
    setPending(true)
    try {
      if (!await requestProviderAccess(provider)) throw new Error('permissionFailed')
      const bundled = isBundledProviderCopy(provider)
      await onChange(providers.map(p => {
        if (p.id === provider.id) return provider
        if (bundled && p.preset === provider.preset && isBundledProviderCopy(p)) return { ...p, translationConcurrency: provider.translationConcurrency }
        return p
      }))
      dirty.current = false; drafts.current.delete(provider.id); showToast({ type: 'success', description: t('saved') })
    } catch (error) { showToast({ type: 'error', description: t(errorKey(error instanceof Error ? error.message : 'providerInvalid')) }) } finally { setPending(false) }
  }
  return <div className="nola-provider-layout">
    <aside className="nola-provider-rail" aria-label={t('apiProviders')}>
      <Popover open={adding} onOpenChange={setAdding}><PopoverTrigger render={<Button variant="outline" className="nola-provider-add" />}><Plus data-icon="inline-start" />{t('add')}</PopoverTrigger><PopoverContent className="nola-provider-picker" align="start"><PopoverTitle>{t('preset')}</PopoverTitle><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={t('searchOptions')} placeholder={t('searchOptions')} value={addSearch} onChange={e => setAddSearch(e.target.value)} /></InputGroup><div className="nola-provider-picker-list">{PROVIDER_PRESETS.filter(p => p.id !== 'nola' && p.name.toLowerCase().includes(addSearch.toLowerCase())).map(p => <Button variant="bare" className="justify-start" key={p.id} disabled={pending} onClick={() => {
        const existing = p.id === 'index-translate' ? undefined : providers.find(item => item.preset === p.id && isBundledProviderCopy(item))
        if (existing) { setSelected(existing.id); setAdding(false); setAddSearch(''); return }
        const created = createProvider(p.id)
        if (created.capabilities.includes('mt')) created.translationConcurrency = DEFAULT_PREFERENCES.webConcurrency
        setPending(true); void onChange([...providers, created]).then(() => { setSelected(created.id); setAdding(false); setAddSearch('') }).catch(() => showToast({ type: 'error', description: t('invalidConfig') })).finally(() => setPending(false))
      }}><ProviderAvatar provider={{ preset: p.id, name: p.name }} />{p.name}</Button>)}</div></PopoverContent></Popover>
      {visibleProviderConnections(providers, selected).map(p => {
        const count = ['pageProvider', 'selectionProvider', 'inputProvider', 'subtitleProvider', 'asrProvider', 'ttsProvider', 's2sProvider', 'llmProvider'].filter(key => settings[key as keyof Preferences] === p.id).length
        return <Button className="nola-provider-list-item nola-nav-button" key={p.id} variant="nav" data-active={p.id === provider?.id} aria-pressed={p.id === provider?.id} onClick={() => setSelected(p.id)}><ProviderAvatar provider={p} /><span>{p.name}</span>{count > 0 && <Badge variant="accent">{count}</Badge>}</Button>
      })}
    </aside>
    {provider && <Card className="nola-provider-editor"><CardHeader><CardTitle><ProviderAvatar provider={provider} />{provider.name}</CardTitle>{provider.preset === 'nola' && <CardAction className="self-center"><ConnectionStatus t={t} /></CardAction>}</CardHeader>
    {provider.preset !== 'nola' && <CardContent><FieldGroup>
      {provider.preset !== 'nola' && !bundledIndex && <TextField label={t('name')} value={provider.name} onChange={name => update({ name })} />}
      {provider.preset !== 'nola' && <>
        {bundledIndex ? <><Field><FieldLabel>{t('baseUrl')}</FieldLabel><span>{provider.baseUrl}</span></Field><Field><FieldLabel>{t('model')}</FieldLabel><span>{provider.model}</span></Field></> : <>
        <ChoiceField label={t('preset')} value={provider.preset} options={PROVIDER_PRESETS.filter(p => p.id !== 'nola').map(p => ({ value: p.id, label: p.name }))} onChange={id => { const preset = PROVIDER_PRESETS.find(p => p.id === id); if (preset) update({ preset: id, baseUrl: preset.baseUrl, capabilities: [...preset.capabilities], model: preset.model ?? '' }) }} />
        <TextField label={t('baseUrl')} value={provider.baseUrl} onChange={baseUrl => update({ baseUrl })} />
        </>}
        {provider.capabilities.includes('mt') && <NumberField key={provider.id} label={t('webConcurrency')} value={provider.translationConcurrency ?? settings.webConcurrency} min={1} max={MAX_WEB_TRANSLATION_CONCURRENCY} onChange={translationConcurrency => {
          if (translationConcurrency !== (provider.translationConcurrency ?? settings.webConcurrency)) update({ translationConcurrency })
        }} />}
        {!bundledIndex && (!['google-free', 'microsoft-free', 'edge-tts'].includes(preset?.protocol ?? '')) && <><TextField label={t('apiKey')} type={showKey ? 'text' : 'password'} value={provider.apiKey} onChange={apiKey => update({ apiKey })} /><Toggle label={t('showApiKey')} checked={showKey} onChange={setShowKey} /></>}
        {!bundledIndex && (!['google-free', 'microsoft-free', 'edge-tts', 'deepl', 'deeplx'].includes(preset?.protocol ?? '')) && <TextField label={t('model')} value={provider.model} onChange={model => update({ model })} />}
        {!bundledIndex && <details><summary>{t('advancedOptions')}</summary><FieldGroup>
          <JsonField key={`${provider.id}-headers`} label={t('headers')} value={provider.headers} onChange={headers => update({ headers })} error={t('invalidConfig')} />
          <JsonField key={`${provider.id}-options`} label={t('advancedOptions')} value={provider.options} onChange={options => update({ options })} error={t('invalidConfig')} />
        </FieldGroup></details>}
      </>}
      {provider.preset !== 'nola' && <div className="nola-actions"><Button disabled={pending || !provider.name.trim()} onClick={() => void save()}>{t('save')}</Button><Button variant="outline" disabled={pending} onClick={() => void test()}>{pending ? t('translating') : t('testConnection')}</Button>{!bundledIndex && <ConfirmAction label={t('remove')} description={t('confirmRemoveProvider')} t={t} onConfirm={async () => {
        const bindings = ['pageProvider', 'selectionProvider', 'inputProvider', 'subtitleProvider', 'asrProvider', 'ttsProvider', 's2sProvider', 'llmProvider'].filter(key => settings[key as keyof Preferences] === provider.id)
        if (bindings.length) await savePreferences(Object.fromEntries(bindings.map(key => [key, 'desktop'])))
        await onChange(providers.filter(p => p.id !== provider.id)); drafts.current.delete(provider.id); setSelected('desktop')
      }} />}</div>}
    </FieldGroup></CardContent>}</Card>}
  </div>
}
function TranslationCenter({ settings, providers, locale, t }: { settings: Preferences; providers: ProviderConnection[]; locale: Parameters<typeof languageOptions>[0]; t: T }) {
  const [text, setText] = useState('')
  const [image, setImage] = useState('')
  const [preparingImage, setPreparingImage] = useState(false)
  const [source, setSource] = useState(settings.sourceLanguage)
  const [target, setTarget] = useState(settings.pageLanguage)
  const [selected, setSelected] = useState<string[]>([settings.pageProvider])
  const [results, setResults] = useState<Record<string, { text?: string; elapsed?: number; pending?: boolean }>>({})
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [speaking, setSpeaking] = useState(false)
  const pasteRevision = useRef(0)
  const requests = useRef(new Map<string, AbortController>())
  const audio = useRef<HTMLAudioElement | null>(null)
  const audioUrl = useRef('')
  const speechRequest = useRef<AbortController | null>(null)
  useEffect(() => () => { pasteRevision.current++; requests.current.forEach(controller => controller.abort()); speechRequest.current?.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current) }, [])
  const available = visibleProviderConnections(providers, settings.pageProvider).filter(p => p.capabilities.includes('mt'))
  const imageProvider = 'index-translate'
  const active = [...new Set(image ? [imageProvider, ...selected] : selected)].filter(id => (id === imageProvider && !!image) || available.some(p => p.id === id))
  const ttsEnabled = settings.ttsProvider !== DISABLED_PROVIDER
  const pending = Object.values(results).some(result => result.pending)
  const hasInput = Boolean(image || text.trim()) && !preparingImage
  function changeImage(value: string) {
    requests.current.forEach(controller => controller.abort())
    requests.current.clear()
    setResults({})
    setImage(value)
  }
  async function paste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find(file => file.type.startsWith('image/'))
    if (!file) return
    event.preventDefault()
    const revision = ++pasteRevision.current
    setPreparingImage(true)
    try {
      const data = await encodeClipboardImage(file)
      if (revision === pasteRevision.current) changeImage(data)
    } catch (error) {
      if (revision === pasteRevision.current) showToast({ type: 'error', description: t(error instanceof Error && error.message === 'imageTooLarge' ? 'pastedImageTooLarge' : 'pastedImageInvalid') })
    } finally { if (revision === pasteRevision.current) setPreparingImage(false) }
  }
  async function run(ids = active) {
    if (!hasInput) return
    await Promise.all(ids.filter(id => !image || id === imageProvider).map(async providerId => {
      requests.current.get(providerId)?.abort()
      const controller = new AbortController(); requests.current.set(providerId, controller)
      setResults(current => ({ ...current, [providerId]: { pending: true } }))
      const provider = providers.find(p => p.id === providerId)
      let started: number | undefined
      try {
        if (!image && (!provider || !await requestProviderAccess(provider))) throw new Error('providerPermission')
        if (controller.signal.aborted) return
        started = performance.now()
        const translation = image ? await (text.trim() ? translateImage(image, target, controller.signal, text.trim()) : translateImage(image, target, controller.signal)) : await translate(text, source, target, 'selection', controller.signal, providerId)
        const elapsed = performance.now() - started
        if (!controller.signal.aborted) setResults(current => ({ ...current, [providerId]: { text: translation, elapsed } }))
      } catch (error) {
        if (controller.signal.aborted) return
        const elapsed = started === undefined ? undefined : performance.now() - started
        setResults(current => ({ ...current, [providerId]: { elapsed } }))
        showToast({ type: 'error', title: provider?.name ?? 'Index-Translate', description: t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed')) })
      } finally { if (requests.current.get(providerId) === controller) requests.current.delete(providerId) }
    }))
  }
  function selectProvider(id: string, checked: boolean) {
    if (!checked) { requests.current.get(id)?.abort(); setResults(current => { const next = { ...current }; delete next[id]; return next }) }
    setSelected(current => checked ? [...current, id] : current.filter(value => value !== id))
  }
  async function speak(value: string, language: string) {
    if (!ttsEnabled) return
    speechRequest.current?.abort(); audio.current?.pause(); if (audioUrl.current) URL.revokeObjectURL(audioUrl.current)
    const controller = new AbortController(); speechRequest.current = controller
    setSpeaking(true)
    try {
      const sound = await synthesize(value, language, controller.signal, settings.ttsProvider)
      if (controller.signal.aborted) return
      const bytes = Uint8Array.from(atob(sound.audioBase64), value => value.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: sound.contentType })); audioUrl.current = url
      const player = new Audio(url); audio.current = player; player.playbackRate = settings.ttsRate; player.volume = settings.ttsVolume
      const release = () => { URL.revokeObjectURL(url); if (audioUrl.current === url) audioUrl.current = '' }
      player.addEventListener('ended', release, { once: true }); player.addEventListener('error', release, { once: true })
      try { await player.play() } catch (error) { release(); throw error }
    } catch (error) { if (!controller.signal.aborted) showToast({ type: 'error', description: t(errorKey(error instanceof Error ? error.message : 'internalError')) }) } finally { if (speechRequest.current === controller) setSpeaking(false) }
  }
  return <div className="nola-translation-center">
    <div className="nola-hub-source">
      <div className="nola-hub-languages"><PopupLanguage size="sm" label={t('source')} value={source} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={setSource} t={t} /><Button variant="bare" size="icon-sm" aria-label={t('swapLanguages')} title={t('swapLanguages')} disabled={source === 'auto'} onClick={() => { setSource(target); setTarget(source) }}><ArrowLeftRight /></Button><PopupLanguage size="sm" label={t('target')} value={target} options={languageOptions(locale)} onChange={setTarget} t={t} /></div>
      <div className="nola-hub-input nola-card nola-glass" onPaste={event => void paste(event)}>
        {image && <div className="nola-hub-attachment">
          <img src={image} alt={t('imageTranslate')} />
          <Button variant="bare" size="icon-sm" aria-label={t('remove')} title={t('remove')} onClick={() => { pasteRevision.current++; setPreparingImage(false); changeImage('') }}><X /></Button>
        </div>}
        <Textarea className="focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nola-ui-ring" aria-label={t('inputText')} placeholder={t(active.includes(imageProvider) ? 'pasteTranslationInput' : 'inputText')} value={text} onChange={e => setText(e.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && hasInput && active.length && !pending) { event.preventDefault(); void run() } }} />
        <div className="nola-hub-input-actions">
          {ttsEnabled && <Button variant="bare" size="icon-sm" disabled={!text.trim() || speaking} aria-label={t('readAloud')} title={t('readAloud')} onClick={() => void speak(text, source)}><Volume2 /></Button>}
          <Button disabled={pending || !hasInput || !active.length} onClick={() => void run()}>{t(pending ? 'translating' : 'startTranslation')}</Button>
        </div>
      </div>
    </div>
    <div className="nola-hub-results"><div className="nola-hub-toolbar"><Popover><PopoverTrigger render={<Button variant="outline" />}><Languages data-icon="inline-start" />{t('provider')}<Badge>{active.length}</Badge><ChevronDown data-icon="inline-end" /></PopoverTrigger><PopoverContent className="nola-hub-provider-picker" align="end"><PopoverTitle>{t('selectProviders')}</PopoverTitle>{available.map(p => <Toggle key={p.id} label={p.name} checked={selected.includes(p.id)} onChange={checked => selectProvider(p.id, checked)} />)}</PopoverContent></Popover><Button variant="bare" size="icon-sm" aria-label={t('apiProviders')} title={t('apiProviders')} onClick={() => { window.location.hash = 'apiProviders' }}><Settings2 /></Button><Button variant="bare" size="icon-sm" disabled={!active.length} aria-label={t('expand')} title={t('expand')} onClick={() => setCollapsed([])}><ChevronDown /></Button><Button variant="bare" size="icon-sm" disabled={!active.length} aria-label={t('collapse')} title={t('collapse')} onClick={() => setCollapsed(active)}><ChevronUp /></Button></div>
      {active.map(id => {
        const provider = available.find(p => p.id === id) ?? DEFAULT_PROVIDERS.find(p => p.id === imageProvider)!
        const result = results[id], expanded = !collapsed.includes(id)
        const unsupported = image && id !== imageProvider
        const elapsed = result?.elapsed
        return <Card className="nola-hub-result" key={id}>
          <CardHeader>
            <CardTitle className="flex-wrap"><ProviderAvatar provider={provider} /><span className="min-w-0 wrap-anywhere">{provider.name}</span>{elapsed !== undefined && <Badge variant="secondary" className="tabular-nums" dir="ltr">{elapsed < 1000 ? `${Math.floor(elapsed)} ms` : `${(elapsed / 1000).toFixed(2)} s`}</Badge>}</CardTitle>
            <div className="nola-hub-card-actions">
              {!unsupported && <>
                <Button variant="bare" size="icon-sm" disabled={!hasInput || result?.pending} aria-label={t('refresh')} title={t('refresh')} onClick={() => void run([id])}><RefreshCw /></Button>
                {ttsEnabled && <Button variant="bare" size="icon-sm" disabled={!result?.text || speaking} aria-label={t('readAloud')} title={t('readAloud')} onClick={() => void speak(result!.text!, target)}><Volume2 /></Button>}
                <Button variant="bare" size="icon-sm" disabled={!result?.text} aria-label={t('copyTranslation')} title={t('copyTranslation')} onClick={() => { void Promise.resolve().then(() => navigator.clipboard.writeText(result!.text!)).then(() => showToast({ type: 'success', description: t('copied') })).catch(() => showToast({ type: 'error', description: t('internalError') })) }}><Copy /></Button>
              </>}
              <Button variant="bare" size="icon-sm" aria-label={t(expanded ? 'collapse' : 'expand')} aria-expanded={expanded} title={t(expanded ? 'collapse' : 'expand')} onClick={() => setCollapsed(current => expanded ? [...current, id] : current.filter(value => value !== id))}>{expanded ? <ChevronUp /> : <ChevronDown />}</Button>
              {!(image && id === imageProvider) && <Button variant="bare" size="icon-sm" aria-label={t('close')} title={t('close')} onClick={() => selectProvider(id, false)}><X /></Button>}
            </div>
          </CardHeader>
          {expanded && <CardContent aria-live="polite"><p className={result?.text ? undefined : 'nola-muted'} dir="auto">{unsupported ? t('providerImageUnsupported') : result?.pending ? t('translating') : result?.text || t('awaitingTranslation')}</p></CardContent>}
        </Card>
      })}
    </div>
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
function Backup({ settings, t }: { settings: Preferences; t: T }) {
  const [secrets, setSecrets] = useState(false)
  const [importing, setImporting] = useState(false)
  const [logs, setLogs] = useState<DiagnosticEntry[]>([])
  const logId = useId()
  const refreshLogs = async () => setLogs(await readDiagnostics())
  useEffect(() => { void refreshLogs().catch(() => showToast({ type: 'error', description: t('internalError') })) }, [])
  async function exportLogs() {
    try {
      const entries = await readDiagnostics()
      setLogs(entries)
      const url = URL.createObjectURL(new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'nola-diagnostics.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { showToast({ type: 'error', description: t('internalError') }) }
  }
  async function exportConfig() {
    try {
      const data = { version: 2, preferences: settings, providers: await exportProviderConfig(secrets), glossary: await extensionGlossary.snapshot() }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = 'nola-extension.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { showToast({ type: 'error', description: t('internalError') }) }
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
      showToast({ type: 'success', description: t('saved') })
    } catch { showToast({ type: 'error', description: t('invalidConfig') }) } finally { setImporting(false) }
  }
  return <>
    <Group title={t('exportConfig')}><p className="nola-muted">{t('exportHelp')}</p><Toggle label={t('includeKeys')} checked={secrets} onChange={setSecrets} /><div className="nola-form-actions"><Button variant="outline" onClick={() => void exportConfig()}><Download data-icon="inline-start" />{t('exportConfig')}</Button><FileAction label={t('importConfig')} accept="application/json,.json" disabled={importing} onFile={file => void importConfig(file)} /></div></Group>
    <Group title={t('storageActions')}>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('clearCache')}</FieldLabel><p>{t('clearCacheHelp')}</p></div><Button variant="outline" onClick={() => { void clearTranslationCache().then(() => showToast({ type: 'success', description: t('saved') })).catch(() => showToast({ type: 'error', description: t('internalError') })) }}>{t('clearCache')}</Button></Field>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('resetSettings')}</FieldLabel><p>{t('resetHelp')}</p></div><ConfirmAction label={t('resetSettings')} description={t('confirmResetSettings')} t={t} onConfirm={async () => { const glossary = await extensionGlossary.snapshot(); await restoreExtensionConfiguration({ glossary: emptyGlossary(), preferences: DEFAULT_PREFERENCES }, glossary.revision); showToast({ type: 'success', description: t('saved') }) }} /></Field>
    </Group>
    <Group title={t('logTitle')}>
      <Field className="nola-field-stack">
        <div className="nola-setting-copy"><FieldLabel htmlFor={logId}>{t('logTitle')}</FieldLabel><p>{t('logHelp')}</p></div>
        <Textarea id={logId} readOnly rows={8} value={logs.length ? logs.slice().reverse().map(entry => `${entry.time}  ${entry.context}  ${entry.event}  ${entry.code}  v${entry.version}  ${entry.browser || ''}`).join('\n') : t('logEmpty')} />
      </Field>
      <div className="nola-form-actions">
        <Button variant="outline" onClick={() => { void refreshLogs().catch(() => showToast({ type: 'error', description: t('internalError') })) }}><RefreshCw data-icon="inline-start" />{t('refresh')}</Button>
        <Button variant="outline" onClick={() => void exportLogs()}><Download data-icon="inline-start" />{t('logExport')}</Button>
        <ConfirmAction label={t('logClear')} description={t('logClearConfirm')} t={t} onConfirm={async () => { await clearDiagnostics(); setLogs([]) }} />
      </div>
    </Group>
  </>
}

export function Options() {
  const [settings, locale, t] = usePreferences()
  const supportsGlass = Boolean(globalThis.CSS?.supports?.('backdrop-filter', 'blur(1px)') || globalThis.CSS?.supports?.('-webkit-backdrop-filter', 'blur(1px)'))
  const [section, setSection] = useState<typeof sections[number]>(() => sections.find(section => section === parseOptionsRoute(window.location.hash).section) ?? 'general')
  const [libraryId, setLibraryId] = useState(() => parseOptionsRoute(window.location.hash).libraryId)
  const [query, setQuery] = useState('')
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
    const refresh = () => { void loadProviders().then(values => { if (alive) setProviders(values) }).catch(() => { if (alive) showToast({ type: 'error', description: t('invalidConfig') }) }) }
    const changed = (changes: Record<string, unknown>) => { if (changes.providerRevision) refresh() }
    refresh(); chrome.storage.onChanged.addListener(changed)
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed) }
  }, [locale])
  const save: Save = (key, value) => { void savePreferences({ [key]: value }).catch(() => showToast({ type: 'error', description: t('internalError') })) }
  const updateProviders = async (values: ProviderConnection[]) => { await saveProviders(values); setProviders(values) }
  const modes = [{ value: 'bilingual', label: t('bilingual') }, { value: 'translation', label: t('translationOnly') }]
  const bind = (key: keyof Preferences, label: BrowserKey, capability: Capability = 'mt') => <ProviderField label={t(label)} value={String(settings[key])} providers={providers} onChange={value => {
    if (key === 'selectionProvider' || key === 'inputProvider') {
      void savePreferences({ [key]: value, [key === 'selectionProvider' ? 'selectionTranslation' : 'inputTranslation']: value !== 'disabled' }).catch(() => showToast({ type: 'error', description: t('internalError') }))
    } else save(key, value as never)
  }} capability={capability} t={t} />
  const toggle = (key: keyof Preferences, label: BrowserKey, disabled = false) => <Toggle label={t(label)} checked={!disabled && Boolean(settings[key])} disabled={disabled} onChange={value => save(key, value as never)} />
  const text = (key: keyof Preferences, label: BrowserKey, multiline = false) => <TextField label={t(label)} value={String(settings[key])} onChange={value => save(key, value as never)} multiline={multiline} />
  const list = (key: 'autoSites' | 'neverAutoSites' | 'siteBlacklist' | 'skipLanguages' | 'autoSubtitleSites' | 'floatingDisabledSites' | 'selectionDisabledSites', label: BrowserKey) => <TextField description={key === 'skipLanguages' ? undefined : t('siteListHelp')} label={t(label)} value={settings[key].join('\n')} multiline onChange={value => save(key, value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))} />
  const documentMatches = t('documentTranslation').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const documentLink = <a href="document.html" data-slot="button" data-variant="nav" data-active="false" className={buttonVariants({ variant: 'nav', className: 'button nola-nav-button' })}><FileText aria-hidden="true" /><span>{t('documentTranslation')}</span></a>
  const filtered = sections.filter(key => [t(key), t(descriptions[key]), ...searchKeys[key].map(key => t(key)), ...(key === 'apiProviders' ? providers.map(provider => provider.name) : [])].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const active = query.trim() ? filtered : [section]
  return <main className="nola-settings-shell">
    <aside className="nola-settings-sidebar nola-sidebar" data-slot="sidebar-inner"><header className="nola-options-header"><NolaLogo /><strong>Nola Translator</strong></header><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput ref={searchInput} aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <nav aria-label={t('settings')}>{navGroups.map(group => {
        const items = group.items.filter(key => filtered.includes(key))
        const hasDocumentLink = group.label === 'translationGroup' && documentMatches
        return items.length || hasDocumentLink ? <div className="nola-nav-group" key={group.label}><p>{t(group.label)}</p>{items.map(key => { const Icon = sectionIcons[key]; return <Button key={key} variant="nav" className="nola-nav-button" data-active={section === key} aria-current={section === key ? 'page' : undefined} onClick={() => { setSection(key); setQuery(''); window.location.hash = key }}><Icon aria-hidden="true" /><span>{t(key)}</span></Button> })}
          {hasDocumentLink && documentLink}
        </div> : null
      })}</nav>
    </aside>
    <div className="nola-settings-main"><header className="nola-settings-title"><h1>{query ? t('search') : t(section)}</h1>{!query && <p>{t(descriptions[section])}</p>}</header>
      {!query && previewSections.includes(section) && <SettingsPreview key={section} kind={section as PreviewKind} settings={settings} t={t} />}
      {active.length === 0 && (documentMatches ? documentLink : <p>{t('noResults')}</p>)}
      {active.includes('general') && <><Group title={t('appearance')}>
        <ChoiceField label={t('interfaceLanguage')} value={settings.uiLanguage} options={UI_LANGUAGES.map((value, index) => ({ value, label: index ? languageLabels[index - 1] : t('browserDefault') }))} onChange={value => save('uiLanguage', value as Preferences['uiLanguage'])} />
        <ChoiceField label={t('theme')} value={settings.theme} options={[{ value: 'auto', label: t('browserDefault') }, { value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }]} onChange={value => save('theme', value as Preferences['theme'])} />
        <Toggle label={t('liquidGlass')} checked={supportsGlass && settings.liquidGlass} disabled={!supportsGlass} hint={t(supportsGlass ? 'liquidGlassHint' : 'liquidGlassUnavailable')} onChange={value => save('liquidGlass', value)} />
      </Group><Group title={t('translationLanguages')}><ChoiceField label={t('source')} value={settings.sourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={value => save('sourceLanguage', value)} />
        <TargetLanguageField value={settings.pageLanguage} locale={locale} t={t} onChange={value => save('pageLanguage', value)} />
      </Group><Group title={t('siteScope')}>{list('siteBlacklist', 'siteBlacklist')}</Group></>}
      {active.includes('apiProviders') && <><Group><ProviderEditor providers={providers} settings={settings} onChange={updateProviders} t={t} /></Group><Group title={t('featureBindings')}>
        {bind('pageProvider', 'web')}{bind('selectionProvider', 'selection')}{bind('inputProvider', 'inputTranslation')}{bind('subtitleProvider', 'video')}<LiveServiceField settings={settings} providers={providers} t={t} />{bind('ttsProvider', 'tts', 'tts')}{bind('llmProvider', 'llm', 'llm')}
      </Group></>}
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
        <ChoiceField t={t} label={t('subtitleFont')} value={settings.subtitleSourceFont} options={subtitleFontOptions(settings.subtitleSourceFont, t)} onChange={value => save('subtitleSourceFont', value)} /><RangeField label={t('fontSize')} value={settings.subtitleSourceSize} min={10} max={60} suffix="px" onChange={value => save('subtitleSourceSize', value)} /><ColorField label={t('subtitleColor')} value={settings.subtitleSourceColor} onChange={value => save('subtitleSourceColor', value)} />
      </Group><Group title={t('translatedCaption')}>
        <ChoiceField t={t} label={t('subtitleFont')} value={settings.subtitleTranslationFont} options={subtitleFontOptions(settings.subtitleTranslationFont, t)} onChange={value => save('subtitleTranslationFont', value)} /><RangeField label={t('fontSize')} value={settings.subtitleTranslationSize} min={10} max={60} suffix="px" onChange={value => save('subtitleTranslationSize', value)} /><ColorField label={t('subtitleColor')} value={settings.subtitleTranslationColor} onChange={value => save('subtitleTranslationColor', value)} />
      </Group><Group title={t('subtitleAppearance')}>
        {toggle('subtitleTranslationFirst', 'subtitleTranslationFirst')}{toggle('subtitleBold', 'subtitleBold')}{toggle('subtitlePauseOnHover', 'subtitlePauseOnHover')}
        <ColorField label={t('subtitleBackground')} value={settings.subtitleBackground} onChange={value => save('subtitleBackground', value)} />
        <RangeField label={t('subtitlePosition')} value={settings.subtitleOffset} max={30} suffix="%" onChange={value => save('subtitleOffset', value)} />
        <RangeField label={t('subtitleBackgroundOpacity')} value={settings.subtitleBackgroundOpacity} max={1} step={0.05} onChange={value => save('subtitleBackgroundOpacity', value)} />
        {toggle('subtitleFollow', 'subtitleFollow')}
        <div className="nola-two-columns"><RangeField label={t('subtitlePositionX')} value={settings.subtitlePositionX} onChange={value => save('subtitlePositionX', value)} /><RangeField label={t('subtitlePositionY')} value={settings.subtitlePositionY} onChange={value => save('subtitlePositionY', value)} /></div>
      </Group><Group title={t('advancedSettings')}>{list('autoSubtitleSites', 'autoSubtitleSites')}{text('subtitleCustomCss', 'customCss', true)}<p className="nola-muted">{t('cssHelp')}</p>{text('subtitlePrompt', 'prompt', true)}
      </Group></>}
      {active.includes('selection') && <><Group>{toggle('selectionTranslation', 'enableFeature', settings.selectionProvider === 'disabled')}{bind('selectionProvider', 'provider')}</Group><Group title={t('toolbarActions')}>{toggle('selectionTranslate', 'translateText')}{toggle('selectionSpeak', 'tts')}{toggle('selectionCopy', 'copyTranslation')}</Group><Group title={t('visibility')}><RangeField label={t('opacity')} value={Math.round(settings.selectionOpacity * 100)} min={20} max={100} suffix="%" onChange={value => save('selectionOpacity', value / 100)} />{list('selectionDisabledSites', 'disabledWebsites')}</Group></>}
      {active.includes('inputTranslation') && <Group>{toggle('inputTranslation', 'enableFeature', settings.inputProvider === 'disabled')}{bind('inputProvider', 'provider')}<ChoiceField label={t('source')} value={settings.inputSourceLanguage} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={value => save('inputSourceLanguage', value)} /><TargetLanguageField value={settings.inputTargetLanguage} locale={locale} t={t} onChange={value => save('inputTargetLanguage', value)} /><ChoiceField label={t('inputTrigger')} value={settings.inputTrigger} options={[{ value: 'tripleSpace', label: t('inputTripleSpace') }, { value: 'shortcut', label: t('inputShortcut') }]} onChange={value => save('inputTrigger', value as Preferences['inputTrigger'])} /></Group>}
      {active.includes('floatingButton') && <><Group>{toggle('floatingButton', 'enableFeature')}</Group><Group title={t('visibility')}>
        <ChoiceField label={t('floatingSide')} value={settings.floatingSide} options={[{ value: 'left', label: t('leftSide') }, { value: 'right', label: t('rightSide') }]} onChange={value => save('floatingSide', value as Preferences['floatingSide'])} />
        <RangeField label={t('floatingPosition')} value={Math.round(settings.floatingPosition * 100)} onChange={value => save('floatingPosition', value / 100)} suffix="%" />
        {toggle('floatingLocked', 'pinFloating')}{list('floatingDisabledSites', 'disabledWebsites')}
      </Group><Group title={t('behavior')}><ChoiceField label={t('floatingClickAction')} value={settings.floatingClickAction} options={[{ value: 'panel', label: t('floatingOpenPanel') }, { value: 'translate', label: t('translatePage') }]} onChange={value => save('floatingClickAction', value as Preferences['floatingClickAction'])} /></Group></>}
      {active.includes('contextMenu') && <><Group>{toggle('contextMenuEnabled', 'enableFeature')}</Group><Group title={t('toolbarActions')}>{toggle('contextMenuPage', 'togglePageTranslation')}{toggle('contextMenuSelection', 'translateSelection')}{toggle('contextMenuSpeak', 'speakSelection')}{toggle('contextMenuInput', 'inputTranslation')}<Toggle label={t('imageTranslate')} description={t('imageMenuHint')} checked={settings.contextMenuImage} onChange={value => save('contextMenuImage', value)} /></Group></>}
      {active.includes('shortcuts') && <Group>{(['shortcutPage', 'shortcutSelection', 'shortcutHover', 'shortcutSubtitles'] as const).map((key, index) => <ShortcutField key={key} label={t((['translatePage', 'translateSelection', 'hoverTranslation', 'video'] as const)[index])} value={settings[key]} defaultValue={DEFAULT_PREFERENCES[key]} modifierOnly={key === 'shortcutHover'} error={shortcutError === key ? t('shortcutConflict') : undefined} t={t} onChange={value => {
        const normalize = (shortcut: string) => { const parts = shortcut.toLowerCase().split('+'); return [parts.pop(), ...parts.sort()].join('+') }
        if (value && key !== 'shortcutHover' && (['shortcutPage', 'shortcutSelection', 'shortcutSubtitles'] as const).some(other => other !== key && normalize(settings[other]) === normalize(value))) { setShortcutError(key); showToast({ type: 'error', description: t('shortcutConflict') }); return }
        setShortcutError(''); save(key, value)
      }} />)}</Group>}
      {active.includes('tts') && <Group>{bind('ttsProvider', 'provider', 'tts')}{text('ttsVoice', 'voice')}<RangeField label={t('rate')} value={settings.ttsRate} min={0.1} max={10} step={0.1} onChange={value => save('ttsRate', value)} />{['edge-tts', 'minimax'].includes(providers.find(provider => provider.id === settings.ttsProvider)?.preset ?? '') && <RangeField label={t('pitch')} value={settings.ttsPitch} min={0.5} max={2} step={0.1} onChange={value => save('ttsPitch', value)} />}<RangeField label={t('volume')} value={settings.ttsVolume} max={1} step={0.1} onChange={value => save('ttsVolume', value)} /></Group>}
      {active.includes('translationHub') && <Group><TranslationCenter settings={settings} providers={providers} locale={locale} t={t} /></Group>}
      {active.includes('glossary') && <Group><GlossaryManager libraryId={query ? undefined : libraryId} locale={locale} t={t} /></Group>}
      {active.includes('backup') && <Backup settings={settings} t={t} />}
    </div>
    <ToastProvider closeLabel={t('close')} />
  </main>
}
const mount = document.getElementById('root')
if (mount) { captureDiagnostics('settings'); createRoot(mount).render(<Options />) }
