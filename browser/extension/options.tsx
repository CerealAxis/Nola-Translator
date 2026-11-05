import './csp'
import { Settings2, Plug, Keyboard, Languages, Captions, MousePointer2, TextCursorInput, Volume2, PanelsTopLeft, MousePointerClick, BookOpen, Archive, PanelTop, Search, Upload, Download, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button } from '../../src/renderer/components/ui/button'
import { Input } from '../../src/renderer/components/ui/input'
import { Textarea } from '../../src/renderer/components/ui/textarea'
import { Alert, AlertDescription } from '../../src/renderer/components/ui/alert'
import { Field, FieldGroup, FieldLabel } from '../../src/renderer/components/ui/field'
import { Switch, SwitchThumb } from '../../src/renderer/components/ui/switch'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '../../src/renderer/components/ui/slider'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../src/renderer/components/ui/input-group'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '../../src/renderer/components/ui/empty'
import { ChoiceField } from './components/ChoiceField'
import { SettingsPreview, type PreviewKind } from './components/SettingsPreview'
import { NolaLogo } from './logo'
import { DEFAULT_PREFERENCES, readPreferences, savePreferences, UI_LANGUAGES, type Preferences } from './preferences'
import { ConnectionStatus, languageOptions, TargetLanguageField, usePreferences } from './settings-fields'
import { loadProviders, saveProviders, requestProviderAccess, PROVIDER_PRESETS, exportProviderConfig, importProviderConfig, type ProviderConnection, type Capability } from './providers'
import { glossaryCsv, parseGlossaryCsv } from './ui/glossary-csv'
import { clearTranslationCache, testProvider, translate } from './provider-client'
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
  video: ['provider', 'display', 'livePipeline', 'subtitleFont', 'fontSize', 'subtitleColor', 'subtitleBackground', 'subtitleBackgroundOpacity', 'subtitlePosition', 'subtitlePositionX', 'subtitlePositionY', 'subtitleFollow', 'subtitleTranslationFirst', 'subtitleBold', 'subtitlePauseOnHover', 'customCss', 'autoSubtitleSites'],
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
function RangeField({ label, value, onChange, min = 0, max = 100, step = 1, suffix = '' }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const id = useId()
  return <Field><FieldLabel id={id}>{label}</FieldLabel><div className="nola-setting-range"><SliderRoot value={value} min={min} max={max} step={step} onValueChange={onChange}><SliderControl className="relative"><SliderTrack><SliderIndicator /></SliderTrack><SliderThumb aria-labelledby={id} /></SliderControl></SliderRoot><output>{Number(value.toFixed(2))}{suffix}</output></div></Field>
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const valid = /^#[\da-f]{6}$/i.test(draft)
  return <Field data-invalid={!valid || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><div className="nola-color-field"><span className="nola-color-swatch" style={{ background: value }} /><Input id={id} value={draft} aria-invalid={!valid || undefined} maxLength={7} onChange={event => { setDraft(event.target.value); if (/^#[\da-f]{6}$/i.test(event.target.value)) onChange(event.target.value) }} /></div></Field>
}
function FileAction({ label, accept, disabled, onFile }: { label: string; accept: string; disabled?: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="nola-file-action"><Button variant="outline" disabled={disabled} onClick={() => input.current?.click()}><Upload data-icon="inline-start" />{label}</Button><input ref={input} type="file" aria-label={label} accept={accept} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onFile(file) }} /></div>
}
function Group({ title, children }: { title?: string; children: ReactNode }) {
  return <section className="nola-settings-section">{title && <h2>{title}</h2>}<FieldGroup>{children}</FieldGroup></section>
}
function ProviderField({ label, value, providers, onChange, capability = 'mt' }: { label: string; value: string; providers: ProviderConnection[]; onChange: (value: string) => void; capability?: Capability }) {
  return <ChoiceField label={label} value={value} options={providers.filter(p => p.capabilities.includes(capability)).map(p => ({ value: p.id, label: p.name }))} onChange={id => { const provider = providers.find(p => p.id === id); if (provider) void requestProviderAccess(provider).then(granted => { if (granted) onChange(id) }) }} />
}
function JsonField({ label, value, onChange, error }: { label: string; value: object; onChange: (value: Record<string, string>) => void; error: string }) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2))
  const [invalid, setInvalid] = useState(false)
  return <><TextField label={label} multiline value={draft} onChange={text => { setDraft(text); try { const parsed: unknown = JSON.parse(text); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); onChange(parsed as Record<string, string>); setInvalid(false) } catch { setInvalid(true) } }} />{invalid && <p className="nola-error" role="alert">{error}</p>}</>
}

function ProviderEditor({ providers, onChange, t }: { providers: ProviderConnection[]; onChange: (providers: ProviderConnection[]) => Promise<void>; t: T }) {
  const [selected, setSelected] = useState('desktop')
  const [result, setResult] = useState('')
  const [pending, setPending] = useState(false)
  const [provider, setProvider] = useState<ProviderConnection>()
  const currentDraft = useRef(provider)
  currentDraft.current = provider
  useEffect(() => setResult(''), [provider])
  const dirty = useRef(false)
  const lastSelected = useRef(selected)
  const preset = PROVIDER_PRESETS.find(item => item.id === provider?.preset)
  useEffect(() => {
    if (lastSelected.current === selected && dirty.current) return
    lastSelected.current = selected; dirty.current = false
    setProvider(providers.find(p => p.id === selected) ?? providers[0])
  }, [providers, selected])
  const update = (patch: Partial<ProviderConnection>) => { dirty.current = true; setProvider(current => current ? { ...current, ...patch } : current) }
  async function test() {
    if (!provider) return
    setPending(true); setResult('')
    try {
      const result = await testProvider(provider)
      if (currentDraft.current === provider) setResult(result)
    } catch (error) { if (currentDraft.current === provider) setResult(t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed'))) } finally { setPending(false) }
  }
  return <>
    <div className="nola-provider-tabs">{providers.map(p => <Button key={p.id} variant={p.id === provider?.id ? 'secondary' : 'outline'} onClick={() => setSelected(p.id)}>{p.name}</Button>)}<Button variant="outline" onClick={() => {
      const preset = PROVIDER_PRESETS.find(p => p.id !== 'nola') ?? PROVIDER_PRESETS[0]
      const id = crypto.randomUUID()
      void onChange([...providers, { id, name: preset.name, preset: preset.id, baseUrl: preset.baseUrl, apiKey: '', model: preset.model ?? '', capabilities: [...preset.capabilities], headers: {}, options: {} }]); setSelected(id)
    }}>+ {t('add')}</Button></div>
    {provider && <FieldGroup>
      {provider.preset === 'nola' ? <p className="nola-muted">{t('nativeProviderHelp')}</p> : <TextField label={t('name')} value={provider.name} onChange={name => update({ name })} />}
      {provider.preset === 'nola' && <Button variant="outline" disabled={pending} onClick={() => void test()}>{pending ? t('translating') : t('testConnection')}</Button>}
      {provider.preset !== 'nola' && <>
        <ChoiceField label={t('preset')} value={provider.preset} options={PROVIDER_PRESETS.filter(p => p.id !== 'nola').map(p => ({ value: p.id, label: p.name }))} onChange={id => { const preset = PROVIDER_PRESETS.find(p => p.id === id); if (preset) update({ preset: id, baseUrl: preset.baseUrl, capabilities: [...preset.capabilities], model: preset.model ?? '' }) }} />
        <TextField label={t('baseUrl')} value={provider.baseUrl} onChange={baseUrl => update({ baseUrl })} />
        {(!['google-free', 'microsoft-free', 'edge-tts'].includes(preset?.protocol ?? '')) && <TextField label={t('apiKey')} type="password" value={provider.apiKey} onChange={apiKey => update({ apiKey })} />}
        {(!['google-free', 'microsoft-free', 'edge-tts', 'deepl', 'deeplx'].includes(preset?.protocol ?? '')) && <TextField label={t('model')} value={provider.model} onChange={model => update({ model })} />}
        <details><summary>{t('advancedOptions')}</summary><FieldGroup>
          <JsonField key={`${provider.id}-headers`} label={t('headers')} value={provider.headers} onChange={headers => update({ headers })} error={t('invalidConfig')} />
          <JsonField key={`${provider.id}-options`} label={t('advancedOptions')} value={provider.options} onChange={options => update({ options })} error={t('invalidConfig')} />
        </FieldGroup></details>
      </>}
      {provider.preset !== 'nola' && <div className="nola-actions"><Button onClick={() => { void requestProviderAccess(provider).then(granted => { if (granted) void onChange(providers.map(p => p.id === provider.id ? provider : p)); else setResult(t('permissionFailed')) }).catch(() => setResult(t('invalidConfig'))) }}>{t('save')}</Button><Button variant="secondary" disabled={pending} onClick={() => void test()}>{pending ? t('translating') : t('testConnection')}</Button>{provider.id !== 'desktop' && <Button variant="outline" onClick={() => { void onChange(providers.filter(p => p.id !== provider.id)); setSelected('desktop') }}>{t('remove')}</Button>}</div>}
      {result && <p role="status" className="nola-muted">{result}</p>}
    </FieldGroup>}
  </>
}
function TranslationCenter({ settings, providers, locale, t }: { settings: Preferences; providers: ProviderConnection[]; locale: Parameters<typeof languageOptions>[0]; t: T }) {
  const [text, setText] = useState('')
  const [source, setSource] = useState(settings.sourceLanguage)
  const [target, setTarget] = useState(settings.pageLanguage)
  const [selected, setSelected] = useState<string[]>([settings.pageProvider])
  const [results, setResults] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  async function run() {
    setPending(true); setResults({})
    try {
      const permissions = selected.map(id => { const provider = providers.find(p => p.id === id); return provider ? requestProviderAccess(provider) : Promise.resolve(false) })
      await Promise.all(selected.map(async (providerId, index) => {
        try {
          if (!await permissions[index]) throw new Error('providerPermission')
          const translation = await translate(text, source, target, 'selection', undefined, providerId)
          setResults(current => ({ ...current, [providerId]: translation }))
        } catch (error) { setResults(current => ({ ...current, [providerId]: t(errorKey(error instanceof Error ? error.message : 'providerRequestFailed')) })) }
      }))
    } finally { setPending(false) }
  }
  return <FieldGroup>
    <div className="nola-two-columns"><ChoiceField label={t('source')} value={source} options={[{ value: 'auto', label: t('autoDetect') }, ...languageOptions(locale)]} onChange={setSource} /><TargetLanguageField value={target} locale={locale} t={t} onChange={setTarget} /></div>
    <TextField label={t('inputText')} value={text} multiline onChange={setText} />
    <p className="nola-muted">{t('selectProviders')}</p>
    {providers.filter(p => p.capabilities.includes('mt')).map(p => <Toggle key={p.id} label={p.name} checked={selected.includes(p.id)} onChange={checked => setSelected(current => checked ? [...current, p.id] : current.filter(id => id !== p.id))} />)}
    <Button disabled={pending || !text.trim() || !selected.length} onClick={() => void run()}>{t(pending ? 'translating' : 'translateText')}</Button>
    {selected.filter(id => results[id] !== undefined).map(id => <section className="nola-translation-result" key={id}><h3>{providers.find(p => p.id === id)?.name}</h3><p>{results[id]}</p><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(results[id]) }}>{t('copyTranslation')}</Button></section>)}
  </FieldGroup>
}
function Glossary({ settings, save, t }: { settings: Preferences; save: Save; t: T }) {
  const [source, setSource] = useState('')
  const [target, setTarget] = useState('')
  const [sites, setSites] = useState('')
  const [error, setError] = useState('')
  return <FieldGroup>
    <div className="nola-two-columns"><TextField label={t('sourceTerm')} value={source} onChange={setSource} /><TextField label={t('targetTerm')} value={target} onChange={setTarget} /></div>
    <TextField label={t('sites')} value={sites} onChange={setSites} />
    <Button disabled={!source.trim() || !target.trim()} onClick={() => { save('glossary', [...settings.glossary, { source: source.trim(), target: target.trim(), sites }]); setSource(''); setTarget('') }}>{t('add')}</Button>
    <div className="nola-form-actions"><Button variant="outline" onClick={() => {
      const url = URL.createObjectURL(new Blob([glossaryCsv(settings.glossary)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = 'nola-terminology.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }}><Download data-icon="inline-start" />{t('exportCsv')}</Button><FileAction label={t('importCsv')} accept=".csv,text/csv" onFile={file => {
      if (file.size > 10_000_000) { setError(t('invalidConfig')); return }
      void file.text().then(text => { save('glossary', [...settings.glossary, ...parseGlossaryCsv(text)].slice(0, 20000)); setError('') }).catch(() => setError(t('invalidConfig')))
    }} /></div>{error && <p className="nola-error" role="alert">{error}</p>}
    {!settings.glossary.length && <Empty><EmptyHeader><EmptyMedia variant="icon"><BookOpen /></EmptyMedia><EmptyTitle>{t('noTerms')}</EmptyTitle><EmptyDescription>{t('noTermsHelp')}</EmptyDescription></EmptyHeader></Empty>}
    {settings.glossary.length > 0 && <div className="nola-table-scroll"><table><thead><tr><th>{t('sourceTerm')}</th><th>{t('targetTerm')}</th><th>{t('sites')}</th><th><span className="sr-only">{t('remove')}</span></th></tr></thead><tbody>{settings.glossary.map((row, index) => <tr key={index}><td>{row.source}</td><td>{row.target}</td><td>{row.sites}</td><td><Button variant="outline" onClick={() => save('glossary', settings.glossary.filter((_, i) => i !== index))}>{t('remove')}</Button></td></tr>)}</tbody></table></div>}
  </FieldGroup>
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
    {settings.siteRules.map((rule, i) => <div className="nola-actions" key={i}><code>{rule.host} · {rule.includeSelectors} · {rule.excludeSelectors}</code><Button variant="outline" onClick={() => save('siteRules', settings.siteRules.filter((_, index) => index !== i))}>{t('remove')}</Button></div>)}
  </FieldGroup>
}
function Backup({ settings, t, report }: { settings: Preferences; t: T; report: (message: string) => void }) {
  const [secrets, setSecrets] = useState(false)
  const [importing, setImporting] = useState(false)
  async function exportConfig() {
    try {
      const data = { version: 1, preferences: settings, providers: await exportProviderConfig(secrets) }
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
      if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('preferences' in data) || !data.preferences || typeof data.preferences !== 'object' || Array.isArray(data.preferences)) throw new Error()
      const imported = readPreferences(data.preferences as Record<string, unknown>)
      if ('providers' in data) await importProviderConfig(data.providers)
      await savePreferences(imported); report(t('saved'))
    } catch { report(t('invalidConfig')) } finally { setImporting(false) }
  }
  return <>
    <Group title={t('exportConfig')}><p className="nola-muted">{t('exportHelp')}</p><Toggle label={t('includeKeys')} checked={secrets} onChange={setSecrets} /><div className="nola-form-actions"><Button variant="outline" onClick={() => void exportConfig()}><Download data-icon="inline-start" />{t('exportConfig')}</Button><FileAction label={t('importConfig')} accept="application/json,.json" disabled={importing} onFile={file => void importConfig(file)} /></div></Group>
    <Group title={t('storageActions')}>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('clearCache')}</FieldLabel><p>{t('clearCacheHelp')}</p></div><Button variant="outline" onClick={() => { void clearTranslationCache().then(() => report(t('saved'))).catch(() => report(t('internalError'))) }}>{t('clearCache')}</Button></Field>
      <Field><div className="nola-setting-copy"><FieldLabel>{t('resetSettings')}</FieldLabel><p>{t('resetHelp')}</p></div><Button variant="destructive" onClick={() => { if (window.confirm(t('resetSettings') + '?')) void savePreferences(DEFAULT_PREFERENCES).then(() => report(t('saved'))).catch(() => report(t('internalError'))) }}>{t('resetSettings')}</Button></Field>
    </Group>
  </>
}

export function Options() {
  const [settings, locale, t] = usePreferences()
  const [section, setSection] = useState<typeof sections[number]>(() => sections.find(section => section === window.location.hash.slice(1)) ?? 'general')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [providers, setProviders] = useState<ProviderConnection[]>([])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [section, query])
  useEffect(() => {
    let alive = true
    const refresh = () => { void loadProviders().then(values => { if (alive) setProviders(values) }).catch(() => { if (alive) setMessage(t('invalidConfig')) }) }
    const changed = (changes: Record<string, unknown>) => { if (changes.providerRevision) refresh() }
    refresh(); chrome.storage.onChanged.addListener(changed)
    return () => { alive = false; chrome.storage.onChanged.removeListener(changed) }
  }, [locale])
  const save: Save = (key, value) => { setMessage(''); void savePreferences({ [key]: value }).catch(() => setMessage(t('internalError'))) }
  const updateProviders = async (values: ProviderConnection[]) => { try { await saveProviders(values); setProviders(values) } catch { setMessage(t('invalidConfig')) } }
  const modes = [{ value: 'bilingual', label: t('bilingual') }, { value: 'translation', label: t('translationOnly') }]
  const bind = (key: keyof Preferences, label: BrowserKey, capability: Capability = 'mt') => <ProviderField label={t(label)} value={String(settings[key])} providers={providers} onChange={value => save(key, value as never)} capability={capability} />
  const toggle = (key: keyof Preferences, label: BrowserKey) => <Toggle label={t(label)} checked={Boolean(settings[key])} onChange={value => save(key, value as never)} />
  const text = (key: keyof Preferences, label: BrowserKey, multiline = false) => <TextField label={t(label)} value={String(settings[key])} onChange={value => save(key, value as never)} multiline={multiline} />
  const list = (key: 'autoSites' | 'neverAutoSites' | 'siteBlacklist' | 'skipLanguages' | 'autoSubtitleSites' | 'floatingDisabledSites' | 'selectionDisabledSites', label: BrowserKey) => <TextField description={key === 'skipLanguages' ? undefined : t('siteListHelp')} label={t(label)} value={settings[key].join('\n')} multiline onChange={value => save(key, value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))} />
  const filtered = sections.filter(key => [t(key), t(descriptions[key]), ...searchKeys[key].map(t), ...(key === 'apiProviders' ? providers.map(provider => provider.name) : [])].some(value => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
  const active = query.trim() ? filtered : [section]
  return <main className="nola-settings-shell">
    <aside className="nola-settings-sidebar"><header className="nola-options-header"><NolaLogo /><strong>Nola Translator</strong></header><InputGroup><InputGroupAddon><Search /></InputGroupAddon><InputGroupInput aria-label={t('search')} placeholder={t('search')} value={query} onChange={event => setQuery(event.target.value)} /></InputGroup>
      <nav aria-label={t('settings')}>{navGroups.map(group => {
        const items = group.items.filter(key => filtered.includes(key))
        return items.length ? <div className="nola-nav-group" key={group.label}><p>{t(group.label)}</p>{items.map(key => { const Icon = sectionIcons[key]; return <Button key={key} variant="outline" aria-current={section === key ? 'page' : undefined} onClick={() => { setSection(key); setQuery(''); window.history.replaceState(null, '', `#${key}`) }}><Icon aria-hidden="true" /><span>{t(key)}</span></Button> })}</div> : null
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
      {active.includes('apiProviders') && <><Group><ProviderEditor providers={providers} onChange={updateProviders} t={t} /></Group><Group title={t('featureBindings')}>
        {bind('pageProvider', 'web')}{bind('selectionProvider', 'selection')}{bind('inputProvider', 'inputTranslation')}{bind('subtitleProvider', 'video')}{bind('asrProvider', 'asr', 'asr')}{bind('ttsProvider', 'tts', 'tts')}{bind('s2sProvider', 's2s', 's2s')}{bind('llmProvider', 'llm', 'llm')}
      </Group><Group title={t('connection')}><ConnectionStatus t={t} /></Group></>}
      {active.includes('web') && <><Group>
        <p className="nola-muted">{t('llmSettingsHelp')}</p>{bind('pageProvider', 'provider')}<ChoiceField label={t('display')} value={settings.pageDisplay} options={modes} onChange={value => save('pageDisplay', value as Preferences['pageDisplay'])} />
        <ChoiceField label={t('pageScope')} value={settings.pageScope} options={[{ value: 'main', label: t('mainContent') }, { value: 'all', label: t('entirePage') }]} onChange={value => save('pageScope', value as Preferences['pageScope'])} />
        {toggle('translateTitle', 'translateTitle')}{toggle('hoverTranslation', 'hoverTranslation')}{toggle('contextAware', 'contextAware')}
        <NumberField label={t('minTextLength')} value={settings.minTextLength} min={1} max={1000} onChange={value => save('minTextLength', value)} />
        {list('skipLanguages', 'skipLanguages')}{list('autoSites', 'autoSites')}{list('neverAutoSites', 'neverAutoSites')}
      </Group><Group title={t('pageStyle')}>
        <ChoiceField label={t('pageStyle')} value={settings.pageStyle} options={(['underline', 'block', 'plain'] as const).map(value => ({ value, label: t(value) }))} onChange={value => save('pageStyle', value as Preferences['pageStyle'])} />
        {text('pageCustomCss', 'customCss', true)}<p className="nola-muted">{t('cssHelp')}</p>{text('pagePrompt', 'prompt', true)}
        <NumberField label={t('requestRate')} value={settings.requestRate} min={1} max={60} onChange={value => save('requestRate', value)} /><NumberField label={t('llmBatchSize')} value={settings.batchSize} min={1} onChange={value => save('batchSize', value)} />
      </Group><Group title={t('siteRules')}><SiteRules settings={settings} save={save} t={t} /></Group></>}
      {active.includes('video') && <><Group title={t('translationLanguages')}>
        {bind('subtitleProvider', 'provider')}<TargetLanguageField value={settings.videoLanguage} locale={locale} t={t} onChange={value => save('videoLanguage', value)} />
        <ChoiceField label={t('display')} value={settings.videoDisplay} options={[...modes, { value: 'source', label: t('originalOnly') }]} onChange={value => save('videoDisplay', value as Preferences['videoDisplay'])} />
      </Group><Group title={t('audioRouting')}>{bind('asrProvider', 'asr', 'asr')}{bind('s2sProvider', 's2s', 's2s')}
        <ChoiceField label={t('livePipeline')} value={settings.pipeline} options={[{ value: 'cascade', label: t('stepSpeechTranslation') }, { value: 's2s', label: t('directSpeechTranslation') }]} onChange={value => save('pipeline', value as Preferences['pipeline'])} />
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
      {active.includes('shortcuts') && <Group>{text('shortcutPage', 'translatePage')}{text('shortcutSelection', 'translateSelection')}{text('shortcutHover', 'hoverTranslation')}{text('shortcutSubtitles', 'video')}</Group>}
      {active.includes('tts') && <Group>{bind('ttsProvider', 'provider', 'tts')}{text('ttsVoice', 'voice')}<RangeField label={t('rate')} value={settings.ttsRate} min={0.1} max={10} step={0.1} onChange={value => save('ttsRate', value)} />{['edge-tts', 'minimax'].includes(providers.find(provider => provider.id === settings.ttsProvider)?.preset ?? '') && <RangeField label={t('pitch')} value={settings.ttsPitch} min={0.5} max={2} step={0.1} onChange={value => save('ttsPitch', value)} />}<RangeField label={t('volume')} value={settings.ttsVolume} max={1} step={0.1} onChange={value => save('ttsVolume', value)} /></Group>}
      {active.includes('translationHub') && <Group><TranslationCenter settings={settings} providers={providers} locale={locale} t={t} /></Group>}
      {active.includes('glossary') && <Group><Glossary settings={settings} save={save} t={t} /></Group>}
      {active.includes('backup') && <Backup settings={settings} t={t} report={setMessage} />}
    </div>
  </main>
}
const mount = document.getElementById('root')
if (mount) createRoot(mount).render(<Options />)
