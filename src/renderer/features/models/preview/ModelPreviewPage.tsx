import { useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, AudioWaveform, Brush, Languages, MessagesSquare, Mic, Plus, ScanLine, ScanText, Trash2 } from 'lucide-react'
import type { ModelDownloadSource } from '@/bridge'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from '@/i18n'
import { modelManagementPath, settingsPath, useRoute } from '@/routes'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { CredentialProvider } from '../../../../shared/settings'
import { DownloadsTab } from '../DownloadsTab'
import { HubSearchTab } from '../HubSearchTab'
import { notifyModelDownloadFailure } from '../ModelDownloadNotice'
import { useIndexTranslateVisionSupplement } from '../index-translate-vision-supplement'
import { LocalModelImport } from '../../offline/OfflineResources'
import { CloudDetails, useConnectionName } from './CloudPreview'
import { CloudMark } from './ProviderIconPicker'
import { LocalDetails, LocalDownloadDialog, LocalMark } from './LocalPreview'
import { SourcePicker, type ModelType } from './SourcePicker'
import type { Connection } from './cloud-preview-data'
import { isLocalDownloadActive, localModelFamilies, type PreviewFamily } from './local-preview-catalog'
import { localSeriesName, modelWorkspaceText } from './preview-copy'
import { ChatGptPlanDetails, requestChatGptPlan } from './ChatGptPlanDetails'
import { CHATGPT_PLAN_SERVICE } from '../../../../shared/chatgpt-plan'
import { configuredConnections, createWorkspaceConnection, credentialSlot, emptyWorkspace, enqueueModelWorkspaceSave, saveWorkspaceConnection } from './model-workspace-settings'
import './model-preview.css'

const categories = [
  { id: 'LLM', Icon: MessagesSquare }, { id: 'ASR', Icon: Mic }, { id: 'MT', Icon: Languages },
  { id: 'TTS', Icon: AudioLines }, { id: 'S2S', Icon: AudioWaveform }, { id: 'OCR', Icon: ScanText },
  { id: 'detect', Icon: ScanLine }, { id: 'inpaint', Icon: Brush },
] as const

type CloudSource = { kind: 'cloud'; connection: Connection }
type Source = CloudSource | { kind: 'local'; family: PreviewFamily }

function sourceId(item: Source) {
  return item.kind === 'cloud' ? `cloud:${item.connection.id}` : `local:${item.family.key}`
}

function useModelTypeName() {
  const { t, language } = useI18n()
  return (type: ModelType) => {
    if (type === 'ASR') return t('modelConfig.recognition')
    if (type === 'TTS') return t('modelConfig.synthesis')
    return type === 'OCR' ? type : modelWorkspaceText(language, type)
  }
}

export default function ModelPreviewPage() {
  const { language, t } = useI18n()
  const { modelManagementView = 'sources', navigate } = useRoute()
  const typeName = useModelTypeName()
  const [type, setType] = useState<ModelType>('LLM')
  const [saving, setSaving] = useState(false)
  const CategoryIcon = (categories.find(category => category.id === type) ?? categories[0]).Icon
  return <TabsRoot className="model-workspace" data-slot="model-workspace" data-view={modelManagementView}
    value={modelManagementView} onValueChange={view => {
      if (view === 'sources' || view === 'search' || view === 'downloads') navigate(modelManagementPath(view))
    }}>
    <h1 className="type-h3">{t('models.title')}</h1>
    <div className="model-workspace__toolbar">
      <div className="model-workspace__controls">
        <TabsList aria-label={t('models.title')} data-onboarding="models-tabs">
          <TabsTrigger value="sources">{modelWorkspaceText(language, 'sources')}</TabsTrigger>
          <TabsTrigger value="search" data-onboarding="models-search-tab">{t('models.tabSearch')}</TabsTrigger>
          <TabsTrigger value="downloads" data-onboarding="models-downloads-tab">{modelWorkspaceText(language, 'downloads')}</TabsTrigger>
        </TabsList>
        {modelManagementView === 'sources' && <div className="model-workspace__category">
          <Select<ModelType> value={type} disabled={saving} onValueChange={value => { if (value) setType(value) }}>
            <SelectTrigger aria-label={modelWorkspaceText(language, 'category')} data-onboarding="models-category" data-category={type}>
              <CategoryIcon aria-hidden="true" />
              <SelectValue>{typeName(type)}</SelectValue>
            </SelectTrigger>
            <SelectContent><SelectGroup>
              {categories.map(({ id, Icon }) => {
                const label = typeName(id)
                return <SelectItem key={id} value={id} label={label} data-onboarding={`models-category-${id}`}><Icon aria-hidden="true" />{label}</SelectItem>
              })}
            </SelectGroup></SelectContent>
          </Select>
        </div>}
      </div>
      <div className="model-workspace__tools" data-onboarding="models-tools">
        <Button variant="secondary" onClick={() => navigate(`${settingsPath('engine')}?component=engine`)}>
          {t('modelsSettingsUi.runtimeSetup')}
        </Button>
        <LocalModelImport />
      </div>
    </div>
    <TabsContent value="sources" keepMounted className="model-workspace__source-view">
      <ModelSources type={type} saving={saving} setSaving={setSaving} />
    </TabsContent>
    <TabsContent value="search">
      <HubSearchTab onGoSources={() => navigate(modelManagementPath())} />
    </TabsContent>
    <TabsContent value="downloads">
      <DownloadsTab />
    </TabsContent>
  </TabsRoot>
}

function ModelSources({ type, saving, setSaving }: { type: ModelType; saving: boolean; setSaving: (saving: boolean) => void }) {
  const { language, t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings)
  const preferences = settings?.modelWorkspace ?? emptyWorkspace
  const settingsError = useStore(stores.settings, state => state.loadError)
  const credentials = useStore(stores.models, state => state.credentials)
  const resources = useStore(stores.models, state => state.resources)
  const loaded = useStore(stores.models, state => state.loaded)
  const loading = useStore(stores.models, state => state.loading)
  const modelError = useStore(stores.models, state => state.error)
  const busyIds = useStore(stores.models, state => state.busyIds)
  const families = useMemo(() => localModelFamilies(resources), [resources])
  const installed = useMemo(() => new Set(resources.filter(record => record.installed).map(record => record.resourceId)), [resources])
  const connections = useMemo(() => settings ? configuredConnections(settings, credentials) : [], [settings, credentials])
  const reportedLoadError = useRef<string | null>(null)
  const loadError = settingsError || (!loading && !loaded ? modelError : null)
  const loadErrorTitle = modelWorkspaceText(language, settingsError ? 'sourceLoadFailed' : 'localModelsLoadFailed')

  useIndexTranslateVisionSupplement(loaded, resources)

  useEffect(() => {
    if (loadError && reportedLoadError.current !== loadError) notifyError(loadErrorTitle, { cause: loadError })
    reportedLoadError.current = loadError
  }, [loadError, loadErrorTitle])

  useEffect(() => {
    if (!loaded && !stores.models.getState().loading) void actions.models.loadModels({ includeDevices: false }).catch(() => undefined)
  }, [loaded])

  const setLocalSource = (key: string, added: boolean) => enqueueModelWorkspaceSave(async () => {
    try {
      const workspace = stores.settings.getState().settings?.modelWorkspace ?? emptyWorkspace
      await updateSettings({ modelWorkspace: { ...workspace, localSources: { ...workspace.localSources, [key]: added } } })
    }
    catch (cause) { notifyError(modelWorkspaceText(language, added ? 'sourceAddFailed' : 'sourceRemoveFailed'), { cause }) }
  })

  const saveConnection: CategoryProps['onSave'] = (connection, removing = false, edit) => enqueueModelWorkspaceSave(async () => {
    const interactive = edit !== 'connection'
    let removingModel = false
    if (interactive) setSaving(true)
    try {
      const currentSettings = stores.settings.getState().settings
      const currentConnections = currentSettings ? configuredConnections(currentSettings, stores.models.getState().credentials) : []
      const previous = currentConnections.find(entry => entry.id === connection.id)
      if (edit && !previous) return
      removingModel = edit === 'models' && !!previous && connection.models.length < previous.models.length
      const next = removing ? { ...connection, models: [] }
        : edit === 'connection' && previous ? { ...connection, models: previous.models }
          : edit === 'models' && previous ? { ...previous, models: connection.models } : connection
      const slot = credentialSlot(connection)
      const keepCredential = currentConnections.some(entry => entry.id !== connection.id && credentialSlot(entry) === slot)
      await saveWorkspaceConnection(next, previous, removing, keepCredential)
      if (removing && connection.service === CHATGPT_PLAN_SERVICE) await requestChatGptPlan(connection.id, 'disconnect')
      notifySuccess(t(removing ? 'common.done' : 'modelConfig.saved'))
    } catch (cause) {
      const title = removing ? modelWorkspaceText(language, 'sourceRemoveFailed')
        : !edit ? modelWorkspaceText(language, 'sourceAddFailed')
        : t(removingModel ? 'modelsSettingsUi.removeFailed' : 'modelConfig.saveFailed')
      notifyError(title, { cause })
      throw cause
    } finally {
      if (interactive) setSaving(false)
    }
  })

  function install(id: string, source?: ModelDownloadSource) {
    void actions.models.manageResource(id, 'install', source).catch((cause: unknown) => {
      notifyModelDownloadFailure(t, () => install(id, source), { cause })
    })
  }
  return <>
    {!settings || !loaded ? <div className="flex items-center gap-2" role="status">
      {loadError ? <>
        <span>{loadErrorTitle}</span>
        <Button variant="secondary" size="sm" onClick={() => {
          if (!settings) void actions.settings.loadSettings().catch(() => undefined)
          if (!loaded) void actions.models.loadModels({ includeDevices: false }).catch(() => undefined)
        }}>{t('common.retry')}</Button>
      </> : <><Spinner />{t('common.loading')}</>}
    </div> : null}
    <div key={type} className="model-workspace__panel">
      <CategoryWorkspace type={type} connections={connections} families={families} installed={installed}
        settingsReady={!!settings} saving={saving} credentials={credentials} busyIds={busyIds}
        localSources={preferences.localSources} onSave={saveConnection}
        onSetLocalSource={setLocalSource} onInstall={install}
        onRemoveModel={async id => {
          try { await actions.models.manageResource(id, 'remove') }
          catch (cause) { notifyError(t('modelsSettingsUi.removeFailed'), { cause }) }
        }} />
    </div>
  </>
}

interface CategoryProps {
  type: ModelType
  connections: Connection[]
  families: readonly PreviewFamily[]
  installed: ReadonlySet<string>
  localSources: Record<string, boolean>
  settingsReady: boolean
  saving: boolean
  credentials: Readonly<Record<CredentialProvider, boolean>>
  busyIds: readonly string[]
  onSetLocalSource: (key: string, added: boolean) => Promise<void>
  onSave: (connection: Connection, removing?: boolean, edit?: 'connection' | 'models') => Promise<void>
  onInstall: (id: string, source?: ModelDownloadSource) => void
  onRemoveModel: (id: string) => Promise<void>
}

function CategoryWorkspace({ type, connections, families, installed, localSources, settingsReady, saving, credentials, busyIds, onSetLocalSource, onSave, onInstall, onRemoveModel }: CategoryProps) {
  const { t, language } = useI18n()
  const nameOf = useConnectionName()
  const [picker, setPicker] = useState(false)
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<CloudSource | null>(null)
  const [downloadKey, setDownloadKey] = useState<string | null>(null)
  const [removing, setRemoving] = useState<{ name: string; confirm: () => void | Promise<void> } | null>(null)
  const categoryFamilies = families.filter(item => item.category === type)
  const downloadFamily = categoryFamilies.find(family => family.key === downloadKey)
  const entries: Source[] = connections.filter(item => item.capability === type).map(connection => ({ kind: 'cloud', connection }))
  for (const family of categoryFamilies) {
    const legacyVisible = family.records.some(record =>
      localSources[record.resourceId] ?? (record.installed || isLocalDownloadActive(record)))
    if (localSources[family.key] ?? legacyVisible) entries.push({ kind: 'local', family })
  }
  const current = draft ?? entries.find(item => sourceId(item) === selected) ?? entries[0]
  const shown = draft ? [...entries.filter(item => sourceId(item) !== sourceId(draft)), draft] : entries
  const sourceName = (item: Source) => item.kind === 'cloud' ? nameOf(item.connection) : localSeriesName(language, item.family.name)
  function select(source: Source) {
    setDraft(null)
    setSelected(sourceId(source))
  }
  function openSource(source: CloudSource) {
    const id = sourceId(source)
    if (entries.some(item => sourceId(item) === id)) select(source)
    else setDraft(source)
    setPicker(false)
  }

  return <>
    <aside className="model-workspace__rail" data-slot="source-list" aria-label={modelWorkspaceText(language, 'sources')}>
      <div className="model-workspace__rail-heading">
        <h2 className="type-body font-semibold">{modelWorkspaceText(language, 'sources')}</h2>
        <Button size="sm" variant="secondary" data-onboarding="models-add-source" disabled={!settingsReady || saving} onClick={() => setPicker(true)}>
          <Plus data-icon="inline-start" />{modelWorkspaceText(language, 'add')}
        </Button>
      </div>
      <ul className="model-workspace__sources">
        {shown.map(item => {
          const id = sourceId(item)
          const active = current && sourceId(current) === id
          const name = sourceName(item)
          const sourceLabel = modelWorkspaceText(language, item.kind)
          return <li key={id} className="model-workspace__source" data-active={active || undefined}>
            <Button variant="bare" disabled={saving} className="model-workspace__source-choice" aria-pressed={!!active}
              tooltip={name}
              aria-description={sourceLabel} aria-controls="model-source-details" onClick={() => { if (item !== draft) select(item) }}>
              {item.kind === 'cloud' ? <CloudMark service={item.connection.service} icon={item.connection.icon} /> : <LocalMark family={item.family} />}
              <span className="model-workspace__source-name">
                <span className="type-body">{name}</span>
                <Badge variant="outline" aria-hidden="true">{sourceLabel}</Badge>
              </span>
            </Button>
            {item !== draft && <Button variant="bare" size="icon-sm" disabled={saving} className="model-workspace__remove"
              aria-label={modelWorkspaceText(language, 'remove') + ' ' + sourceName(item)}
              onClick={() => setRemoving({
                name: sourceName(item),
                confirm: () => item.kind === 'cloud' ? onSave(item.connection, true).catch(() => undefined) : onSetLocalSource(item.family.key, false),
              })}>
              <Trash2 aria-hidden="true" />
            </Button>}
          </li>
        })}
      </ul>
    </aside>
    <section id="model-source-details" data-slot="source-details" className="model-workspace__details" aria-label={current ? sourceName(current) : modelWorkspaceText(language, 'title')}>
      {current?.kind === 'cloud' && current.connection.service === CHATGPT_PLAN_SERVICE
        ? <ChatGptPlanDetails key={current.connection.id} connection={current.connection} creating={!!draft} saving={saving}
          onSave={async (value, edit) => {
            await onSave(value, false, edit)
            if (!edit) select({ kind: 'cloud', connection: value })
          }} onCancel={() => setDraft(null)} />
        : current?.kind === 'cloud' ? <CloudDetails key={current.connection.id} connection={current.connection} creating={!!draft}
        production saving={saving} storedKey={!!credentials[credentialSlot(current.connection)!]}
        onSave={async (value, edit) => {
          await onSave(value, false, edit)
          if (!edit) select({ kind: 'cloud', connection: value })
        }} onCancel={() => setDraft(null)} />
        : current?.kind === 'local' ? <LocalDetails key={sourceId(current)} family={current.family} installed={installed}
          busyIds={busyIds}
          onAdd={() => setDownloadKey(current.family.key)}
          onRemove={record => void onRemoveModel(record.resourceId)} />
        : <p className="model-workspace__empty type-muted">{modelWorkspaceText(language, 'empty')}</p>}
    </section>
    {picker && <SourcePicker type={type} families={categoryFamilies} onClose={() => setPicker(false)}
      onCloud={(service, capability) => openSource({ kind: 'cloud', connection: createWorkspaceConnection(service, capability) })}
      onLocal={family => {
        void onSetLocalSource(family.key, true)
        select({ kind: 'local', family })
        setPicker(false)
      }} />}
    {downloadFamily && <LocalDownloadDialog key={downloadFamily.key} family={downloadFamily} installed={installed} busyIds={busyIds}
      onClose={() => setDownloadKey(null)} onInstall={(record, source) => {
        onInstall(record.resourceId, source)
        select({ kind: 'local', family: downloadFamily })
        setDownloadKey(null)
      }} />}
    {removing && <AlertDialog open onOpenChange={open => { if (!open) setRemoving(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{modelWorkspaceText(language, 'removeSource').replace('{name}', removing.name)}</AlertDialogTitle></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={() => { void removing.confirm(); setRemoving(null) }}>{modelWorkspaceText(language, 'remove')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>
}
