import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { useTtsCapabilities } from '@/components/tts/use-tts-capabilities'
import { ttsCatalogCapabilities } from '../../../../shared/tts/catalog'
import type { TtsVoiceRef } from '../../../../shared/tts/voice-ref'
import { TtsVoiceConfiguration, ttsVoiceDrafts, serializeTtsVoices } from './TtsVoiceConfiguration'
import { TtsVoiceSelector } from '@/components/tts/TtsVoiceSelector'
import { ttsText } from '@/i18n/tts-ui'
import { llmPreviewCopy } from './llm-preview-copy'
import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { offlineActions } from '@/store/offlineStore'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../../shared/compute'
import { downloadSourcesFor } from '../../../../shared/model-download-sources'
import { localChatSettingsOf, localChatSettingsSchema } from '../../../../shared/language-model'
import { modelImportEntry } from '../../../../shared/model-import-catalog'
import { DownloadSourceTabs } from '../DownloadSourceTabs'
import { ModelConfigurationDialog, ModelLanguageSelect } from '../ModelConfigurationDialog'
import { SettingsRow } from '../../settings/SettingsRow'
import { descriptionKeyOf, paramsOf } from '../ModelCard'
import { visualModelName, visualModelDescription, visualSeriesOf } from '../visual-model-display'
import { ModelMark } from '../modelBrand'
import { familyOf } from '../modelFamily'
import { FamilyModelSelect } from '../FamilyModelSelect'
import { useCloudPreviewCopy } from './cloud-preview-copy'
import { engineNames, isLocalDownloadActive, previewEngine, type PreviewFamily } from './local-preview-catalog'
import { localSeriesName, modelWorkspaceText } from './preview-copy'
import { ModelEditorDialog } from './ModelEditorDialog'
import { LlmPreviewEditor } from './LlmPreviewEditor'
import { emptyWorkspace, enqueueModelWorkspaceSave } from './model-workspace-settings'

export function LocalMark({ family }: { family: PreviewFamily }) {
  return <ModelMark record={family.records[0]} kind={family.records[0].kind} size={24} brandColors />
}

export function LocalDetails({ family, installed, onAdd, onRemove, busyIds = [] }: {
  family: PreviewFamily
  installed: ReadonlySet<string>
  onAdd: () => void
  onRemove: (record: ResourceRecord) => void
  busyIds?: readonly string[]
}) {
  const { t, language } = useI18n()
  const copy = useCloudPreviewCopy()
  const [editingId, setEditingId] = useState('')
  const [removingId, setRemovingId] = useState('')
  const records = family.records.filter(record => installed.has(record.resourceId) || isLocalDownloadActive(record))
  const editing = records.find(record => record.resourceId === editingId && installed.has(record.resourceId))
  const hasDownloads = records.some(isLocalDownloadActive)

  return <div className="model-settings">
    <header className="model-settings__header">
      <h2 className="model-settings__identity type-h4"><LocalMark family={family} />{localSeriesName(language, family.name)}</h2>
    </header>
    <section className="cpv-models">
      <div className="model-settings__heading">
        <h3 className="type-body font-semibold">{hasDownloads ? t('modelsSettingsUi.localModels') : modelWorkspaceText(language, 'installedModels')}</h3>
        {family.records.some(record => !installed.has(record.resourceId) && canInstall(record, busyIds)) && <Button variant="secondary" size="sm" onClick={onAdd}>
          <Plus data-icon="inline-start" />{copy('addModel')}
        </Button>}
      </div>
      {records.length ? <ul>{records.map(record => {
        const engine = previewEngine(record)
        const name = visualModelName(record).replace(/\s*·\s*(?:llama\.cpp|CrispASR|PyTorch|ONNX Runtime|OpenCV)\s*$/i, '')
        return <li key={record.resourceId}>
          <div className="cpv-model-info">
            {visualSeriesOf(record) && <ModelMark record={record} kind={record.kind} size={16} brandColors />}
            <span className="type-body">{name}</span>
            <span className="cpv-model-tags">{engine && <Badge variant="outline">{engineNames[engine]}</Badge>}</span>
          </div>
          {isLocalDownloadActive(record) ? <div className="flex min-h-8 items-center">
            <Badge variant="secondary">{t(record.state === 'paused' ? 'models.paused' : record.state === 'cancelling' ? 'models.cancelling' : 'status.downloading')}</Badge>
          </div> : <div className="cpv-actions">
            {removingId === record.resourceId ? <>
              <span className="type-small">{copy('confirmRemoval')}</span>
              <Button variant="secondary" size="sm" onClick={() => setRemovingId('')}>{t('common.cancel')}</Button>
              <Button variant="danger" size="sm" disabled={busyIds.includes(record.resourceId) || record.state === 'running'} onClick={() => {
                setRemovingId('')
                onRemove(record)
              }}>{t('common.confirm')}</Button>
            </> : <>
              <Button variant="bare" size="icon-sm" disabled={busyIds.includes(record.resourceId) || record.state === 'running'}
                aria-label={`${copy('editModel')} ${name}`} tooltip={copy('editModel')} onClick={() => setEditingId(record.resourceId)}>
                <Pencil aria-hidden="true" />
              </Button>
              <Button variant="bare" size="icon-sm" disabled={busyIds.includes(record.resourceId) || record.state === 'running'}
                aria-label={`${t('modelsSettingsUi.deleteModel')} ${name}`} tooltip={t('modelsSettingsUi.deleteModel')} onClick={() => setRemovingId(record.resourceId)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </>}
          </div>}
        </li>
      })}</ul> : <p className="type-muted">{modelWorkspaceText(language, 'noInstalledModels')}</p>}
    </section>
    {editing && (family.category === 'LLM'
      ? <LocalChatEditor key={editing.resourceId} record={editing} onClose={() => setEditingId('')} />
      : <LocalModelEditor key={editing.resourceId} record={editing} onClose={() => setEditingId('')} />)}
  </div>
}

function LocalChatEditor({ record, onClose }: { record: ResourceRecord; onClose: () => void }) {
  const { t } = useI18n()
  const workspace = useStore(stores.settings, state => state.settings?.modelWorkspace)
  const [saving, setSaving] = useState(false)
  const model = { id: record.resourceId, name: record.name, images: false, ...localChatSettingsOf(workspace, record.resourceId) }
  return <LlmPreviewEditor provider={record.provider} model={model} local saving={saving}
    onCancel={() => { if (!saving) onClose() }} onSave={async ({ contextWindow, maxOutputTokens, reasoningLevels }) => {
      if (saving) return
      setSaving(true)
      try {
        const saved = localChatSettingsSchema.parse({ contextWindow, maxOutputTokens, reasoningLevels })
        await enqueueModelWorkspaceSave(() => {
          const current = stores.settings.getState().settings?.modelWorkspace ?? emptyWorkspace
          return updateSettings({ modelWorkspace: { ...current, localChat: { ...current.localChat, [record.resourceId]: saved } } })
        })
        notifySuccess(t('modelConfig.saved'))
        onClose()
      } catch (cause) {
        notifyError(t('modelConfig.saveFailed'), { cause })
      } finally {
        setSaving(false)
      }
    }} />
}

function LocalModelEditor({ record, onClose }: { record: ResourceRecord; onClose: () => void }) {
  const { t, language } = useI18n()
  if (record.kind === 'ttsModel') return <LocalTtsEditor record={record} onClose={onClose} />
  if (record.kind === 'recognitionModel' || record.kind === 'translationModel') {
    return <ModelConfigurationDialog record={record} onClose={onClose} hideRemove className="model-editor" />
  }
  const label = modelWorkspaceText(language, 'supportedLanguages')
  return <ModelEditorDialog editing onCancel={onClose}>
    <SettingsRow label={t('settings.model')}>{visualModelName(record)}</SettingsRow>
    {record.languages.length > 0
      ? <ModelLanguageSelect label={label} value={record.languages} codes={record.languages} onChange={() => undefined} readOnly />
      : record.kind === 'ocrModel' && <SettingsRow label={label}>
        <span className="type-muted">{modelWorkspaceText(language, 'languagesUnknown')}</span>
      </SettingsRow>}
  </ModelEditorDialog>
}

function canInstall(record: ResourceRecord, busyIds: readonly string[]) {
  return !busyIds.includes(record.resourceId) && (record.state === 'idle' || record.state === 'failed')
}

export function LocalDownloadDialog({ family, installed, onClose, onInstall, busyIds = [] }: {
  family: PreviewFamily
  installed: ReadonlySet<string>
  onClose: () => void
  onInstall: (record: ResourceRecord, source?: ModelDownloadSource) => void
  busyIds?: readonly string[]
}) {
  const { t, language } = useI18n()
  const copy = useCloudPreviewCopy()
  const compute = useStore(stores.settings, state => state.settings?.compute) ?? DEFAULT_COMPUTE_SETTINGS
  const computeSnapshot = useStore(stores.settings, state => state.computeSnapshot)
  const [resourceId, setResourceId] = useState('')
  const [source, setSource] = useState<ModelDownloadSource>('huggingface')
  const available = family.records.filter(record => !installed.has(record.resourceId) && canInstall(record, busyIds))
  const record = available.find(option => option.resourceId === resourceId) ?? available[0]
  if (!record) return null

  const engine = previewEngine(record) ?? family.engines[0]
  const engineRecords = available.filter(option => previewEngine(option) === engine)
  const scale = paramsOf(record) ?? ''
  const scales = [...new Set(engineRecords.map(option => paramsOf(option) ?? ''))]
  const showScales = scales.length > 0 && !scales.includes('')
  const variants = family.records.filter(option => (installed.has(option.resourceId) || canInstall(option, busyIds)) && previewEngine(option) === engine
    && (!showScales || paramsOf(option) === scale))
  const engines = family.engines.filter(option => available.some(record => previewEngine(record) === option))
  const familyId = familyOf(record)
  const descriptionKey = familyId === 'other' ? descriptionKeyOf(record) : `models.familyDescriptions.${familyId}` as const
  const description = visualModelDescription(record, language) ?? (descriptionKey ? t(descriptionKey) : undefined)
  const entry = modelImportEntry(record.resourceId)
  const sources = entry ? downloadSourcesFor(record.resourceId) : []
  const activeSource = sources.some(option => option.source === source) ? source : sources[0]?.source ?? 'huggingface'
  const inferenceEngine = engine === 'onnx' || engine === 'opencv' ? null : engine

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="models-family-dialog modal__dialog local-model-download">
      <DialogCloseButton aria-label={t('common.close')} />
      <DialogHeader>
        <DialogTitle>{copy('addModel')}</DialogTitle>
        {description && <DialogDescription className="models-family-dialog__intro">{description}</DialogDescription>}
      </DialogHeader>
      <div className="models-family-dialog__body">
        <div className="models-family-dialog__filters">
          <section>
            <p className="models-family-dialog__label type-body">{t('modelConfig.engine')}</p>
            <TabsRoot value={engine} onValueChange={value => {
              const next = available.find(option => previewEngine(option) === value)
              if (next) setResourceId(next.resourceId)
            }}>
              <TabsList className="models-family-dialog__choices" aria-label={t('modelConfig.engine')}>
                {engines.map(value => <TabsTrigger key={value} value={value}>{engineNames[value]}</TabsTrigger>)}
              </TabsList>
            </TabsRoot>
          </section>
          {showScales && <section>
            <p className="models-family-dialog__label type-body">{t('models.parameterScale')}</p>
            <TabsRoot value={scale} onValueChange={value => {
              const next = engineRecords.find(option => paramsOf(option) === value)
              if (next) setResourceId(next.resourceId)
            }}>
              <TabsList className="models-family-dialog__choices" aria-label={t('models.parameterScale')}>
                {scales.map(value => <TabsTrigger key={value} value={value}>{value}</TabsTrigger>)}
              </TabsList>
            </TabsRoot>
          </section>}
        </div>
        <FamilyModelSelect selected={record} records={variants} installedIds={installed}
          engine={familyId === 'tts' || visualSeriesOf(record) ? undefined : inferenceEngine ?? undefined}
          compute={compute} computeSnapshot={computeSnapshot} onChange={setResourceId} />
        {sources.length > 0 && <section>
          <p className="models-family-dialog__label type-body">{t('models.downloadSources.title')}</p>
          <DownloadSourceTabs options={sources} value={activeSource} onValueChange={setSource}
            ariaLabel={t('models.downloadSources.title')} getLabel={option => t(option.labelKey)} />
        </section>}
      </div>
      <DialogFooter>
        {entry && <Button variant="secondary" onClick={() => { onClose(); offlineActions.openDownloads(record.resourceId, activeSource) }}>{t('offline.manualDownload')}</Button>}
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={() => onInstall(record, sources.length ? activeSource : undefined)}><Download data-icon="inline-start" />{t('models.install')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

function LocalTtsEditor({ record, onClose }: { record: ResourceRecord; onClose(): void }) {
  const { language, t } = useI18n()
  const binding = `resource:${record.resourceId}`
  const saved = stores.settings.getState().settings?.modelWorkspace?.localTts?.[record.resourceId]
  const { capabilities } = useTtsCapabilities(binding, undefined, true)
  const base = ttsCatalogCapabilities(/qwen3.*tts|tts.*qwen3/i.test(record.resourceId + record.name) ? 'qwen3-tts' : record.provider, record.resourceId, binding)
  if (base.languages.mode === 'unknown' && record.languages.length) base.languages = { mode: 'finite', values: record.languages }
  const caps = capabilities ?? base
  const [selected, setSelected] = useState<TtsVoiceRef>(saved?.defaultVoiceRef ?? (base.presetVoices[0] ? { kind: 'preset', modelBinding: binding, voiceId: base.presetVoices[0].id } : { kind: 'engine-default' }))
  const [rows, setRows] = useState(() => ttsVoiceDrafts(base, saved?.capabilityOverride?.presetVoices, selected, saved?.presetVoiceIds))
  const [smart, setSmart] = useState(true)
  const [edited, setEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const key = JSON.stringify(capabilities)
  useEffect(() => { if (capabilities && smart && !edited) setRows(current => ttsVoiceDrafts(capabilities, serializeTtsVoices(current), selected, saved?.presetVoiceIds)) }, [key, smart])
  const profileOnly = !caps.conditioning?.includes('preset') && (caps.supports.cloning === true || caps.supports.voiceDesign === true)
  const configured = rows.filter(row => row.configured)
  const valid = configured.every(row => !!row.id.trim() && rows.every(other => row === other || row.id.trim() !== other.id.trim()))
  return <ModelEditorDialog editing onCancel={onClose} canSave={!saving && valid} onSave={async () => {
    setSaving(true)
    try {
      await enqueueModelWorkspaceSave(() => {
        const current = stores.settings.getState().settings?.modelWorkspace ?? emptyWorkspace
        return updateSettings({ modelWorkspace: { ...current, localTts: { ...current.localTts, [record.resourceId]: {
          ...saved, defaultVoiceRef: selected.kind === 'preset' ? { ...selected, voiceId: selected.voiceId.trim() } : selected,
          presetVoiceIds: rows.map(row => row.configured ? row.id.trim() : row.id),
          capabilityOverride: { ...saved?.capabilityOverride, presetVoices: serializeTtsVoices(rows) },
        } } } })
      })
      notifySuccess(t('modelConfig.saved')); onClose()
    } catch (cause) { notifyError(t('modelConfig.saveFailed'), { cause }) }
    finally { setSaving(false) }
  }}>
    <Field className="flex-row items-center justify-between"><FieldLabel htmlFor="local-tts-smart">{llmPreviewCopy[language].smart}</FieldLabel><Switch id="local-tts-smart" checked={smart} onCheckedChange={checked => { setSmart(checked); setEdited(checked); if (checked) { setRows(ttsVoiceDrafts(caps)); notifySuccess(llmPreviewCopy[language].matched) } }}><SwitchThumb /></Switch></Field>
    <Field><FieldLabel htmlFor="local-tts-model">{t('settings.modelId')}</FieldLabel><Input id="local-tts-model" value={record.resourceId} readOnly /></Field>
    {profileOnly ? <Field><FieldLabel>{ttsText(language, caps.supports.voiceDesign === true ? 'designs' : 'clones')}</FieldLabel><TtsVoiceSelector profilesOnly modelBinding={binding} targetLanguage={record.languages[0] ?? 'auto'} value={selected} onChange={setSelected} /></Field>
      : <TtsVoiceConfiguration rows={rows} onChange={next => { setEdited(true); setRows(next) }} selected={selected} onSelect={setSelected} capabilities={caps} catalogCapabilities={base} binding={binding} />}
  </ModelEditorDialog>
}
