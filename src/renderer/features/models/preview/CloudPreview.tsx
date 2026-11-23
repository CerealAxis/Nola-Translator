import { TooltipHint, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ttsVoicePresets } from '../../../../shared/tts-voice-presets'
import { astrBotSpeechPreset } from '../../../../shared/astrbot-speech-presets'
import { CHATGPT_PLAN_SERVICE } from '../../../../shared/chatgpt-plan'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { notifyError, notifyInfo } from '@/components/primitives/notify'
import { ChevronDown, Download, Eye, EyeOff, Image, Pencil, Plus, Trash2 } from 'lucide-react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox'
import { Combobox, ComboboxContent, ComboboxItem, ComboboxList } from '@/components/ui/combobox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { useI18n } from '@/i18n'
import { SettingSelect } from '../../settings/SettingsPage'
import { SettingsRow } from '../../settings/SettingsRow'
import { ProviderIconPicker } from './ProviderIconPicker'
import { LlmPreviewEditor } from './LlmPreviewEditor'
import { ModelEditorDialog } from './ModelEditorDialog'
import { CloudModelListDialog, CloudModelTest, loadCloudModelList, useCloudModelFailure } from './CloudModelTools'
import type { RemoteChatModel } from '../../../../shared/cloud-model-tools'
import { ModelLanguageSelect } from '../ModelConfigurationDialog'
import { cloudModelLanguages } from './cloud-model-languages'
import { modelWorkspaceText } from './preview-copy'
import { templates, type CloudModel, type Connection } from './cloud-preview-data'
import { speechFieldLabel, useCloudPreviewCopy, useCloudTemplateName } from './cloud-preview-copy'
import './cloud-preview-layout.css'

const protocols = [
  { value: 'chat-completions', label: 'OpenAI Chat Completions' },
  { value: 'chat-responses', label: 'OpenAI Responses' },
  { value: 'anthropic', label: 'Anthropic Messages' },
  { value: 'google-native', label: 'Gemini API' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
  { value: 'ollama', label: 'Ollama Chat' },
]

function contextTag(tokens: number) {
  if (tokens >= 1_000_000) {
    const unit = tokens % 1_048_576 === 0 ? 1_048_576 : 1_000_000
    return `${Math.round(tokens / unit * 10) / 10}M`
  }
  if (tokens < 1_000) return String(tokens)
  const unit = tokens % 1_000 !== 0 && tokens % 1024 === 0 ? 1024 : 1_000
  return `${Math.round(tokens / unit)}K`
}

export interface CloudDetailsProps {
  connection: Connection
  creating: boolean
  onSave: (connection: Connection, edit?: 'connection' | 'models') => void | Promise<void>
  onCancel: () => void
  saving?: boolean
  storedKey?: boolean
  production?: boolean
}

export function useConnectionName() {
  const templateName = useCloudTemplateName()
  return (connection: Pick<Connection, 'service' | 'name'>) => {
    if (connection.name === templates[connection.service].name) {
      return connection.service === CHATGPT_PLAN_SERVICE ? 'ChatGPT' : templateName(connection.service)
    }
    return connection.name
  }
}

export function CloudSourceHeader({ connection, onIdentityChange, disabled, children }: {
  connection: Connection
  onIdentityChange: (fields: Partial<Pick<Connection, 'name' | 'icon'>>) => void
  disabled?: boolean
  children?: ReactNode
}) {
  const { t } = useI18n()
  const nameOf = useConnectionName()
  const name = nameOf(connection)
  const [renameInput, setRenameInput] = useState<string | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  const finishRename = (confirmed: boolean) => {
    if (confirmed && renameInput?.trim()) onIdentityChange({ name: renameInput.trim() })
    setRenameInput(null)
  }
  return <header className="model-settings__header">
    <div className="model-settings__identity">
      <ProviderIconPicker service={connection.service} icon={connection.icon} disabled={disabled} onChange={icon => onIdentityChange({ icon })} />
      <h2 className="type-h4" aria-label={renameInput !== null ? name : undefined}>
        {renameInput === null ? name : <Input className="model-settings__rename"
          autoFocus aria-label={t('settings.apiName')} maxLength={64} value={renameInput} onValueChange={setRenameInput}
          onBlur={() => finishRename(true)} onKeyDown={event => {
            if (event.nativeEvent.isComposing || (event.key !== 'Enter' && event.key !== 'Escape')) return
            event.preventDefault()
            finishRename(event.key === 'Enter')
            requestAnimationFrame(() => renameButton.current?.focus())
          }} />}
      </h2>
      {renameInput === null && <Button ref={renameButton} variant="bare" size="icon-sm" type="button"
        disabled={disabled} aria-label={t('settings.apiName')} onClick={() => setRenameInput(name)}><Pencil /></Button>}
    </div>
    {children && <div className="cpv-actions">{children}</div>}
  </header>
}

export function CloudDetails({ connection, creating, onSave, onCancel, saving, storedKey, production }: CloudDetailsProps) {
  const { language, t } = useI18n()
  const copy = useCloudPreviewCopy()
  const notifyModelFailure = useCloudModelFailure()
  const nameOf = useConnectionName()
  const formId = useId()
  const speech = astrBotSpeechPreset(connection.service)
  const presets = templates[connection.service].models[connection.capability] ?? []
  const [draft, setDraft] = useState(() => ({
    ...connection,
    models: creating && presets[0] ? [{
      id: presets[0], name: speech?.voiceOnly ? speech.name : presets[0], enabled: true,
      ...(speech?.voice !== undefined ? { voice: speech.voice } : {}),
    }] : connection.models,
  }))
  const draftRef = useRef(draft)
  const queued = useRef(connection)
  const patch = (fields: Partial<Connection>) => {
    const next = { ...draftRef.current, ...fields }
    draftRef.current = next
    setDraft(next)
    return next
  }
  useEffect(() => {
    if (creating) return
    draftRef.current = { ...draftRef.current, models: connection.models }
    setDraft(draftRef.current)
  }, [connection.models, creating])
  const [keyVisible, setKeyVisible] = useState(false)
  const [editor, setEditor] = useState<{ modelId?: string } | null>(null)
  const [modelList, setModelList] = useState<RemoteChatModel[] | null>(null)
  const [fetchingModels, setFetchingModels] = useState(false)
  const listRequest = useRef<AbortController | null>(null)
  useEffect(() => () => listRequest.current?.abort(), [])
  const [removal, setRemoval] = useState('')
  const [search, setSearch] = useState('')
  const llm = connection.capability === 'LLM'
  const speechAccount = connection.service === 'aliyun' && !llm
  const editableEndpoint = connection.service !== 'edge-tts'
  const optionalEndpoint = !!speech?.fallback || connection.service === 'aliyun' || connection.service === 'azure-tts' || connection.service === 'dashscope-tts'
  const websocket = connection.service === 'aliyun' || connection.service === 'dashscope-tts' && !/^qwen.*tts/i.test(draft.models[0]?.id ?? '')
  const endpointProtocols = websocket ? ['ws:', 'wss:'] : ['http:', 'https:']
  const validEndpoint = (endpoint: string) => !editableEndpoint || (optionalEndpoint && !endpoint)
    || URL.canParse(endpoint) && endpointProtocols.includes(new URL(endpoint).protocol)
      && !new URL(endpoint).username && !new URL(endpoint).password
  const fetchModels = async () => {
    if (listRequest.current) return
    const source = draftRef.current
    if (!validEndpoint(source.endpoint.trim())) {
      notifyError(copy('fetchModelsFailed'), { description: copy('invalidAddress') })
      return
    }
    const request = new AbortController()
    listRequest.current = request
    const isCurrent = () => !request.signal.aborted && source.endpoint === draftRef.current.endpoint && source.protocol === draftRef.current.protocol
    setFetchingModels(true)
    try {
      const models = await loadCloudModelList(source)
      if (!isCurrent()) return
      if (models.length) setModelList(models)
      else notifyInfo(copy('remoteEmpty'))
    } catch (error) {
      if (isCurrent()) notifyModelFailure('fetchModelsFailed', error)
    } finally {
      listRequest.current = null
      if (!request.signal.aborted) setFetchingModels(false)
    }
  }
  const canStore = (value: Connection) => {
    const requiresKey = production && (speechAccount || !!speech && !speech.keyless || connection.service === 'minimax'
      || ['anthropic', 'google-native', 'azure-openai'].includes(value.protocol))
    return (value.name.trim() || nameOf(value)) && validEndpoint(value.endpoint.trim()) && (!speechAccount || value.workspace.trim())
      && (!requiresKey || storedKey || value.key.trim())
  }
  const activeModel = draft.models.find(model => model.id === editor?.modelId)
  const saveConnection = async (value: Connection) => {
    if (!canStore(value) || (creating && (saving || queued.current !== connection))) return
    const next = { ...value, name: value.name.trim() || nameOf(value), workspace: value.workspace.trim(), endpoint: value.endpoint.trim(), key: value.key.trim() }
    const previous = queued.current
    const fields = ['name', 'endpoint', 'key', 'protocol', 'region', 'workspace', 'icon', 'options'] as const
    if (!creating && fields.every(field => next[field] === previous[field])) return
    queued.current = next
    try {
      if (creating) await onSave(next)
      else await onSave(next, 'connection')
      if (production && queued.current === next) queued.current = { ...next, key: '' }
      if (production && draftRef.current.key.trim() === next.key) patch({ key: '' })
    } catch {
      if (queued.current === next) queued.current = previous
    }
  }
  const commit = (fields: Partial<Connection>) => {
    const next = patch(fields)
    if (!creating) void saveConnection(next)
  }
  const updateModels = async (models: CloudModel[]) => {
    if (saving) return
    try {
      if (creating) patch({ models })
      else await onSave({ ...connection, models }, 'models')
      setEditor(null)
      return true
    } catch { return false }
  }
  const saveModel = (model: CloudModel, previous?: string) => updateModels(previous
    ? draft.models.map(row => row.id === previous ? model : row)
    : [...draft.models, model])
  const canAddModel = llm || (speech && !speech.voiceOnly) || draft.models.length === 0
  const query = search.trim().toLowerCase()
  const visible = draft.models.filter(model => (model.name + ' ' + model.id).toLowerCase().includes(query))
  return <div className="model-settings">
    <CloudSourceHeader connection={draft} onIdentityChange={commit}>
      {creating && <>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button form={formId} type="submit" size="sm" disabled={saving || !canStore(draft)}>{modelWorkspaceText(language, 'addSource')}</Button>
      </>}
    </CloudSourceHeader>
    <form className="settings-group" id={formId}
      onSubmit={event => { event.preventDefault(); void saveConnection(draftRef.current) }}
      onBlur={event => {
        if (!creating && event.target instanceof HTMLInputElement) void saveConnection(draftRef.current)
      }}
      onKeyDown={event => {
        if (!creating && event.key === 'Enter' && !event.nativeEvent.isComposing && event.target instanceof HTMLInputElement) {
          event.preventDefault()
          void saveConnection(draftRef.current)
        }
      }}>
      <h3 className="model-settings__heading type-body font-semibold">{copy('connection')}</h3>
      {connection.capability !== 'MT' && !speech?.keyless && <SettingsRow label={t('settings.apiKey')}><div className="cpv-key settings-control-field">
          <Input aria-label={t('settings.apiKey')} type={keyVisible ? 'text' : 'password'} autoComplete="off" placeholder={t(storedKey ? 'modelsSettingsUi.savedKeyPlaceholder' : 'settings.apiKeyPlaceholder')} value={draft.key} onValueChange={key => patch({ key })} />
          <Button type="button" variant="bare" size="icon-sm" aria-pressed={keyVisible}
            aria-label={t(keyVisible ? 'modelsSettingsUi.hideApiKey' : 'modelsSettingsUi.showApiKey')} onClick={() => setKeyVisible(!keyVisible)}>
            {keyVisible ? <EyeOff /> : <Eye />}
          </Button>
        </div></SettingsRow>}
      {editableEndpoint && <SettingsRow label={t('settings.endpoint')}><Input aria-label={t('settings.endpoint')} className="settings-control-field" required={!optionalEndpoint} type="url" value={draft.endpoint} aria-invalid={!validEndpoint(draft.endpoint.trim())} placeholder={speech?.fallback ?? (websocket ? "wss://…" : "https://…")} onValueChange={endpoint => patch({ endpoint })} /></SettingsRow>}
      {llm && <SettingsRow label={t('settings.apiFormat')}><SettingSelect ariaLabel={t('settings.apiFormat')} value={draft.protocol} options={protocols} onChange={protocol => commit({ protocol })} /></SettingsRow>}
      {draft.protocol === 'azure-openai' && <SettingsRow label="API Version">
        <Input aria-label="API Version" className="settings-control-field" value={draft.workspace}
          onValueChange={workspace => patch({ workspace })} />
      </SettingsRow>}
      {Object.entries(speech?.fields ?? {}).map(([field, initial]) => {
        const label = speechFieldLabel(language, field)
        const value = draft.options?.[field] ?? initial
        const update = (next: string) => ({ options: { ...draftRef.current.options, [field]: next } })
        return <SettingsRow key={field} label={label}>
          {initial === 'true' || initial === 'false'
            ? <Switch aria-label={label} checked={value === 'true'} onCheckedChange={checked => commit(update(String(checked)))}><SwitchThumb /></Switch>
            : field === 'format'
              ? <SettingSelect ariaLabel={label} value={value} options={['wav', 'mp3', 'pcm'].map(value => ({ value, label: value.toUpperCase() }))} onChange={next => commit(update(next))} />
              : <Input aria-label={label} className="settings-control-field" maxLength={2048} value={value} onValueChange={next => patch(update(next))} />}
        </SettingsRow>
      })}
      {speechAccount && <>
        <SettingsRow label={t('settings.region')}><SettingSelect ariaLabel={t('settings.region')} value={draft.region}
          options={[{ value: 'cn-beijing', label: t('settings.aliyunBeijing') }, { value: 'ap-southeast-1', label: t('settings.aliyunSingapore') }]} onChange={region => commit({ region })} /></SettingsRow>
        <SettingsRow label={t('settings.aliyunWorkspace')}><Input aria-label={t('settings.aliyunWorkspace')} className="settings-control-field" value={draft.workspace} required onValueChange={workspace => patch({ workspace })} /></SettingsRow>
      </>}
    </form>
    <section className="cpv-models">
      <div className="model-settings__heading"><h3 className="type-body font-semibold">{copy('models')}</h3>
        {draft.models.length > 1 && <Input className="cpv-model-search" type="search"
          aria-label={t('workbench.searchModels')} placeholder={t('workbench.searchModels')} value={search} onValueChange={setSearch} />}
        <div className="cpv-actions">
          {llm && <Button variant="secondary" size="sm" disabled={saving || fetchingModels} aria-busy={fetchingModels}
            onClick={() => void fetchModels()}><Download data-icon="inline-start" />{fetchingModels ? copy('fetchingModels') : copy('fetchModels')}</Button>}
          {canAddModel && <Button variant="secondary" size="sm" disabled={saving || fetchingModels} onClick={() => { setEditor({}); setRemoval('') }}><Plus />{copy('addModel')}</Button>}
        </div>
      </div>
      {modelList && <CloudModelListDialog connection={draft} models={modelList} creating={creating} onClose={() => setModelList(null)}
        onAdd={models => {
          const current = draftRef.current.models
          const ids = new Set(current.map(model => model.id))
          return updateModels([...current, ...models.filter(model => !ids.has(model.id)).slice(0, Math.max(0, 100 - current.length))])
        }} />}
      {editor && llm && <LlmPreviewEditor key={editor.modelId ?? 'new'} provider={connection.service}
        model={activeModel?.llm} existingIds={draft.models.map(model => model.id)} onCancel={() => setEditor(null)}
        onSave={model => void saveModel({ id: model.id, name: model.name, llm: model, profileId: activeModel?.profileId, enabled: activeModel?.enabled ?? true }, editor.modelId)} />}
      {editor && !llm && <PresetModelEditor key={editor.modelId ?? 'new'} connection={draft} model={activeModel}
        onSave={model => saveModel(model, editor.modelId)} onCancel={() => setEditor(null)} />}
      {visible.length ? <ul>{visible.map(model => <li key={model.id}>
        <div className="cpv-model-info">
          <Tooltip><TooltipTrigger render={<span className="type-body" />}>{model.name || model.id}</TooltipTrigger><TooltipContent>{model.id}</TooltipContent></Tooltip>
          {model.voice && <span className="cpv-model-tags"><TooltipHint content={t('workbench.voice')}><Badge variant="outline">{model.voice}</Badge></TooltipHint></span>}
          {model.llm && <span className="cpv-model-tags">
            <TooltipHint content={`${t('settings.contextWindow')} ${model.llm.contextWindow.toLocaleString()}`}><Badge variant="outline">{contextTag(model.llm.contextWindow)}</Badge></TooltipHint>
            {model.llm.images && <TooltipHint content={t('suite.supportsImages')}><Badge variant="outline">
              <Image aria-hidden="true" /><span className="sr-only">{t('suite.supportsImages')}</span>
            </Badge></TooltipHint>}
          </span>}
        </div>
        <div className="cpv-actions">
          {removal === model.id ? <>
            <span className="type-small">{copy('confirmRemoval')}</span>
            <Button variant="secondary" size="sm" onClick={() => setRemoval('')}>{t('common.cancel')}</Button>
            <Button variant="danger" size="sm" disabled={saving} onClick={async () => {
              try {
                if (!await updateModels(draft.models.filter(row => row.id !== model.id))) return
                setRemoval('')
                setSearch('')
              } catch { /* The parent displays the save error. */ }
            }}>{t('common.confirm')}</Button>
          </> : <>
            <CloudModelTest key={JSON.stringify([model.id, model.profileId, model.voice, connection.endpoint, connection.protocol, connection.workspace, connection.region])}
              connection={connection} model={model} disabled={Boolean(creating || saving)} />
            <Button variant="bare" size="icon-sm" disabled={fetchingModels} tooltip={copy('editModel')} aria-label={copy('editModel') + ' ' + model.id} onClick={() => setEditor({ modelId: model.id })}><Pencil /></Button>
            <Button variant="bare" size="icon-sm" tooltip={t('modelsSettingsUi.deleteModel')} aria-label={t('modelsSettingsUi.deleteModel') + ' ' + model.id} onClick={() => setRemoval(model.id)}><Trash2 /></Button>
            <Switch checked={model.enabled} disabled={saving} aria-label={t('workbench.enable') + ' ' + model.id} onCheckedChange={enabled => void saveModel({ ...model, enabled }, model.id)}><SwitchThumb /></Switch>
          </>}
        </div>
      </li>)}</ul> : <p className="type-muted text-muted">{query ? t('models.noResults') : copy('noModels')}</p>}
    </section>
  </div>
}

function CloudLanguageDetails({ connection, modelId }: { connection: Connection; modelId: string }) {
  const { language, t } = useI18n()
  const { source, target, audio, languages, dependsOnVoice, partial } = cloudModelLanguages(connection, modelId)
  const list = (label: string, codes: readonly string[], genericChinese = false) => <ModelLanguageSelect label={label}
    value={[...codes]} codes={codes} onChange={() => undefined} readOnly genericChinese={genericChinese} />
  if (source && target) return <>
    {list(t('modelConfig.sourceLanguages'), source)}
    {list(t('modelConfig.targetLanguages'), target)}
    {audio && list(modelWorkspaceText(language, 'speechLanguages'), audio, true)}
  </>
  const label = connection.capability === 'ASR' ? t('modelConfig.languages')
    : modelWorkspaceText(language, connection.capability === 'TTS' ? 'speechLanguages' : 'supportedLanguages')
  return languages ? list(partial ? modelWorkspaceText(language, 'languagesPartial') : label, languages, true)
    : <SettingsRow className="model-configuration-dialog__language" label={label}>
      <span className="type-muted">{modelWorkspaceText(language, dependsOnVoice ? 'languagesByVoice' : 'languagesUnknown')}</span>
    </SettingsRow>
}

function PresetModelEditor({ model, connection, onSave, onCancel }: {
  model?: CloudModel; connection: Connection; onSave: (value: CloudModel) => void; onCancel: () => void
}) {
  const { t } = useI18n()
  const uid = useId()
  const presets = templates[connection.service].models[connection.capability] ?? []
  const choices = [...new Set(model ? [model.id, ...presets] : presets)].filter(id =>
    model?.id === id || !connection.models.some(existing => existing.id === id))
  const initialId = model?.id ?? choices[0] ?? ''
  const speech = astrBotSpeechPreset(connection.service)
  const initialVoice = model?.voice ?? speech?.voice ?? 'mimo_default'
  const [id, setId] = useState(initialId)
  const [voice, setVoice] = useState(initialVoice)
  const tts = connection.capability === 'TTS'
  const copy = useCloudPreviewCopy()
  const voices = speech ? ttsVoicePresets(speech.id, id.trim()) : []
  const fixedModels = connection.service === 'aliyun' || connection.service === 'minimax' || connection.service === 'google' || connection.service === 'microsoft' || connection.service === 'mymemory'

  return <ModelEditorDialog editing={!!model} canSave={!!id.trim() && !connection.models.some(row => row !== model && row.id === id.trim())} onCancel={onCancel}
    onReset={() => { setId(initialId); setVoice(initialVoice) }} onSave={() => {
      onSave({ id: id.trim(), name: speech?.voiceOnly ? speech.name : model?.id === id ? model.name : id.trim(), enabled: model?.enabled ?? true, ...(model?.profileId ? { profileId: model.profileId } : {}), ...(tts ? { voice: voice.trim() } : {}) })
    }}>
    {!speech?.voiceOnly && <Field>
      <FieldLabel htmlFor={uid + '-model'}>{t('settings.modelId')}</FieldLabel>
      {fixedModels ? <SettingSelect id={uid + '-model'} ariaLabel={t('settings.modelId')} value={id}
        options={choices.map(value => ({ value, label: value }))} onChange={setId} />
        : <Input id={uid + '-model'} value={id} maxLength={256} onValueChange={setId} />}
    </Field>}
    {tts && <Field>
      <FieldLabel htmlFor={uid + '-voice'}>{t('workbench.voice')}</FieldLabel>
      {voices.length ? <Combobox
        items={voices}
        value={voices.find(option => option.value === voice) ?? null}
        inputValue={voice}
        itemToStringValue={option => option.value}
        itemToStringLabel={option => option.value}
        filter={null}
        onInputValueChange={(value, details) => { if (details.reason === 'input-change') setVoice(value) }}
        onValueChange={option => { if (option) setVoice(option.value) }}>
        <InputGroup>
          <ComboboxPrimitive.Input id={uid + '-voice'} maxLength={256} render={<InputGroupInput />} />
          <InputGroupAddon align="inline-end">
            <ComboboxPrimitive.Trigger aria-label={copy('presetVoices')} render={<Button type="button" variant="bare" size="icon-sm" />}>
              <ChevronDown aria-hidden="true" />
            </ComboboxPrimitive.Trigger>
          </InputGroupAddon>
        </InputGroup>
        <ComboboxContent>
          <ComboboxList>
            {(option: typeof voices[number]) => <ComboboxItem key={option.value} value={option}>{option.label}</ComboboxItem>}
          </ComboboxList>
        </ComboboxContent>
      </Combobox> : <Input id={uid + '-voice'} value={voice} maxLength={256} onValueChange={setVoice} />}
    </Field>}
    {id.trim() && <CloudLanguageDetails connection={connection} modelId={id.trim()} />}
  </ModelEditorDialog>
}
