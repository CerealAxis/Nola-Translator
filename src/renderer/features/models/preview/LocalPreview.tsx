import { Download, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { ModelMark } from '../modelBrand'
import { familyOf } from '../modelFamily'
import { FamilyModelSelect } from '../RecommendedFamilies'
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
        const name = record.name.replace(/\s*·\s*(?:llama\.cpp|CrispASR|PyTorch|ONNX Runtime|OpenCV)\s*$/i, '')
        return <li key={record.resourceId}>
          <div className="cpv-model-info">
            <span className="type-body">{name}</span>
            <span className="cpv-model-tags">{engine && <Badge variant="outline">{engineNames[engine]}</Badge>}</span>
          </div>
          {isLocalDownloadActive(record) ? <div className="flex min-h-8 items-center">
            <Badge variant="secondary">{t(record.state === 'paused' ? 'models.paused' : record.state === 'cancelling' ? 'models.cancelling' : 'status.downloading')}</Badge>
          </div> : <div className="cpv-actions">
            <Button variant="bare" size="icon-sm" disabled={busyIds.includes(record.resourceId) || record.state === 'running'}
              aria-label={`${copy('editModel')} ${name}`} tooltip={copy('editModel')} onClick={() => setEditingId(record.resourceId)}>
              <Pencil aria-hidden="true" />
            </Button>
            <Button variant="bare" size="icon-sm" disabled={busyIds.includes(record.resourceId) || record.state === 'running'}
              aria-label={`${t('modelsSettingsUi.deleteModel')} ${name}`} tooltip={t('modelsSettingsUi.deleteModel')} onClick={() => onRemove(record)}>
              <Trash2 aria-hidden="true" />
            </Button>
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
  if (record.kind === 'recognitionModel' || record.kind === 'translationModel') {
    return <ModelConfigurationDialog record={record} onClose={onClose} hideRemove className="model-editor" />
  }
  const label = modelWorkspaceText(language, record.kind === 'ttsModel' ? 'speechLanguages' : 'supportedLanguages')
  return <ModelEditorDialog editing onCancel={onClose}>
    <SettingsRow label={t('settings.model')}>{record.name}</SettingsRow>
    {record.languages.length > 0
      ? <ModelLanguageSelect label={label} value={record.languages} codes={record.languages} onChange={() => undefined} readOnly genericChinese={record.kind === 'ttsModel'} />
      : (record.kind === 'ttsModel' || record.kind === 'ocrModel') && <SettingsRow label={label}>
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
  const description = familyId === 'other' ? descriptionKeyOf(record) : `models.familyDescriptions.${familyId}` as const
  const entry = modelImportEntry(record.resourceId)
  const sources = entry ? downloadSourcesFor(record.resourceId) : []
  const activeSource = sources.some(option => option.source === source) ? source : sources[0]?.source ?? 'huggingface'
  const inferenceEngine = engine === 'onnx' || engine === 'opencv' ? null : engine

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="models-family-dialog modal__dialog local-model-download">
      <DialogCloseButton aria-label={t('common.close')} />
      <DialogHeader>
        <DialogTitle>{copy('addModel')}</DialogTitle>
        {description && <DialogDescription className="models-family-dialog__intro">{t(description)}</DialogDescription>}
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
          engine={familyId === 'tts' ? undefined : inferenceEngine ?? undefined}
          compute={compute} computeSnapshot={computeSnapshot} onChange={setResourceId} />
        {sources.length > 0 && <section>
          <p className="models-family-dialog__label type-body">{t('models.downloadSources.title')}</p>
          <DownloadSourceTabs options={sources} value={activeSource} onValueChange={setSource}
            ariaLabel={t('models.downloadSources.title')} getLabel={option => t(option.labelKey)} />
        </section>}
      </div>
      <DialogFooter>
        {entry && <Button variant="secondary" onClick={() => { onClose(); offlineActions.openDownloads(record.resourceId) }}>{t('offline.manualDownload')}</Button>}
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button onClick={() => onInstall(record, sources.length ? activeSource : undefined)}><Download data-icon="inline-start" />{t('models.install')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
