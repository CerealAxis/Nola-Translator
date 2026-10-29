import { Button } from '@/components/ui/button'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui'
import { Empty, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LocalModelImport } from '../offline/OfflineResources'
import { offlineActions } from '@/store/offlineStore'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import { configurationOf, isModelReady } from '../../../shared/model-capabilities'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'
import { modelEngines, supportsSelectedEngine } from '../../../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
import { defaultModelBinding, defaultModelPatch } from '../../../shared/model-policy'
import { ModelPolicyPanel } from './ModelPolicyPanel'
/** Model catalog and download manager. The router owns the page padding. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Cpu } from 'lucide-react'
import { getBridge } from '@/store'

import { useI18n } from '@/i18n'
import { settingsPath, useRoute } from '@/routes'
import { actions, stores, updateSettings, useStore } from '@/store'
import { notifyError, notifyInfo, notifySuccess } from '@/components/primitives/notify'
import type { ModelDownloadSource, ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { DownloadsTab } from './DownloadsTab'
import { HubSearchTab } from './HubSearchTab'
import { ModelCard, ModelCardSkeleton, defaultTargetOf, isDefaultOf } from './ModelCard'
import { DownloadSourceDialog } from './DownloadSourceDialog'
import { ModelMark } from './modelBrand'
import { RecommendedFamilyCard, RecommendedFamilyDialog } from './RecommendedFamilies'
import { familyOf, type RecommendedFamily } from './modelFamily'
import { isEngineAvailable } from './engine-availability'
import { notifyModelDownloadFailure, suppressNextDownloadStartNotice } from './ModelDownloadNotice'
import { CloudMark, CloudModelCard, CloudModelDialog, cloudModelsOf, type CloudModel, type CloudModelId } from './CloudModels'
import './models.css'

export type ModelsTab = 'recommended' | 'installed' | 'search' | 'downloads'

/** Three catalog columns collapse to two and one as the application narrows. */
const GRID = 'models-grid'
const attemptedVisionSupplements = new Set<string>()

export function ModelsPage() {
  const { t } = useI18n()
  const { modelsTab, navigate } = useRoute()
  const [tab, setTab] = useState<ModelsTab>('recommended')
  useEffect(() => { if (modelsTab === 'downloads') setTab('downloads') }, [modelsTab])
  const [configuring, setConfiguring] = useState<{ record: ResourceRecord; readOnly: boolean } | null>(null)
  const [downloadTarget, setDownloadTarget] = useState<ResourceRecord | null>(null)
  const [openFamily, setOpenFamily] = useState<RecommendedFamily | null>(null)
  const [voiceMetadata, setVoiceMetadata] = useState<{ modelId: string; voices: string[] }>({ modelId: '', voices: [] })
  const [cloudDetail, setCloudDetail] = useState<CloudModelId | null>(null)

  const resources = useStore(stores.models, (state) => state.resources)
  const loaded = useStore(stores.models, (state) => state.loaded)
  const loading = useStore(stores.models, (state) => state.loading)
  const busyIds = useStore(stores.models, (state) => state.busyIds)
  const error = useStore(stores.models, (state) => state.error)
  const settings = useStore(stores.settings, (state) => state.settings)
  const computeSnapshot = useStore(stores.settings, (state) => state.computeSnapshot)
  const runtimes = useStore(stores.settings, (state) => state.runtimes)

  useEffect(() => {
    if (!loaded) return
    const legacyModels = [
      ['index-translate-2b-q4-k-m', 1_312_164_352],
      ['index-translate-9b-q4-k-m', 5_780_090_304],
      ['index-translate-35b-a3b-q4-k-m', 21_713_462_400],
    ] as const
    for (const [resourceId, weightBytes] of legacyModels) {
      const record = resources.find(item => item.resourceId === resourceId)
      if (!record || record.installed || record.state !== 'idle' || record.installedBytes < weightBytes) continue
      const key = `nola:index-translate-vision-supplement:${resourceId}:v1`
      if (attemptedVisionSupplements.has(resourceId)) continue
      attemptedVisionSupplements.add(resourceId)
      try {
        if (window.localStorage.getItem(key)) continue
        window.localStorage.setItem(key, 'started')
      } catch {
        // Keep the migration available if browser storage is disabled; the in-memory guard
        // still prevents duplicate starts while this page remains mounted.
      }
      notifyInfo(t('models.visionSupplementStarted', { name: record.name }), {
        action: { label: t('models.viewProgress'), onPress: () => { window.location.hash = '#/models/downloads' } },
        duration: 12000,
      })
      suppressNextDownloadStartNotice(resourceId)
      void actions.models.manageResource(resourceId, 'install').catch((cause: unknown) => {
        notifyError(t('models.downloadError', { name: record.name }), { cause })
      })
    }
  }, [loaded, resources, t])

  const credentials = useStore(stores.models, state => state.credentials)
  const cloudModels = cloudModelsOf(settings, credentials)
  const installedCloudModels = cloudModels.filter(model => model.ready || model.profile)
  const openCloudModel = (id: CloudModelId) => {
    if (id !== 'recognition') { setCloudDetail(id); return }
    const current = stores.settings.getState().settings
    const ready = cloudModelsOf(current, stores.models.getState().credentials).some(model => model.id === 'recognition' && model.ready)
    if (!current || !ready) { setCloudDetail('aliyun'); return }
    void updateSettings(defaultModelPatch(current, 'mt', 'cloud:recognition')).then(() => notifySuccess(t('modelsSettingsUi.cloudProviderEnabled', { name: t('settings.providerRecognitionTranslation') })))
      .catch((cause: unknown) => notifyError(t('modelsSettingsUi.saveError'), { cause }))
  }

  const installed = useMemo(() => resources.filter((item) => item.installed), [resources])
  const activeCount = useMemo(() => countActive(resources), [resources])
  const asrDefault = settings ? defaultModelBinding(settings, 'asr') : ''
  const mtDefault = settings ? defaultModelBinding(settings, 'mt') : ''
  const ttsDefault = settings ? defaultModelBinding(settings, 'tts') : ''
  const recognition = resources.find(item => item.resourceId === asrDefault.replace(/^resource:/, '') && asrDefault.startsWith('resource:'))
  const synthesis = resources.find(item => item.resourceId === ttsDefault.replace(/^resource:/, '') && ttsDefault.startsWith('resource:'))
  const translation = resources.find(item => item.resourceId === mtDefault.replace(/^resource:/, '') && mtDefault.startsWith('resource:'))
  const currentRecognitionCloud = cloudModels.find(model => model.kind === 'recognitionModel' && model.active)
  const currentTranslationCloud = cloudModels.find(model => model.kind === 'translationModel' && model.active)
  const currentTranslationCloudReady = currentTranslationCloud?.ready ?? false
  const voices = voiceMetadata.modelId === settings?.synthesis?.modelId ? voiceMetadata.voices : []
  useEffect(() => {
    const gateway = getBridge()?.gateway
    if (!gateway) return
    const receive = (snapshot: Awaited<ReturnType<typeof gateway.snapshot>>) => setVoiceMetadata({ modelId: snapshot.services.tts.model.replace(/^resource:/, ''), voices: snapshot.services.tts.voices ?? [] })
    let alive = true
    const off = gateway.onChanged(receive)
    void gateway.snapshot().then(snapshot => { if (alive) receive(snapshot) }).catch(() => undefined)
    return () => { alive = false; off() }
  }, [settings?.synthesis?.modelId])
  useEffect(() => {
    if (voices.length && settings?.synthesis && !voices.includes(settings.synthesis.voice)) {
      void updateSettings({ synthesis: { voice: voices[0] } }).catch(() => undefined)
    }
  }, [voices, settings?.synthesis?.voice])
  const localTranslation = mtDefault.startsWith('resource:')
  const remoteRecognition = !!currentRecognitionCloud
  const currentRecognition = currentRecognitionCloud
    ? currentRecognitionCloud.id === 'aliyun' ? t('modelsSettingsUi.aliyunAsr') : t('settings.providerMiniMax')
    : recognition?.installed ? recognition.name : t('modelsSettingsUi.noModelSelected')
  const providerNames = {
    cloud: t('settings.providerCloud'), microsoft: t('settings.providerMicrosoft'), mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'), 'index-translate': t('settings.providerIndexTranslate'),
    recognition: t('settings.providerRecognitionTranslation'),
  }
  const currentTranslation = localTranslation
    ? translation?.installed ? translation.name : t('modelsSettingsUi.noModelSelected')
    : currentTranslationCloud?.profile?.name ?? (currentTranslationCloud?.id === 'cloud'
      ? settings?.translation.cloudModel?.trim() || providerNames.cloud
      : currentTranslationCloud ? providerNames[currentTranslationCloud.id as keyof typeof providerNames] : t('modelsSettingsUi.noModelSelected'))
  const openFamilyRecords = openFamily
    ? resources.filter(record => !record.resourceId.startsWith('hub:') && familyOf(record) === openFamily)
    : []
  const openFamilyKey = openFamily ? `${openFamily}:${openFamilyRecords.map(record => record.resourceId).join('|')}` : ''

  // store.error is a diagnostic string, not interface copy: it goes to the log, and the
  // failure itself reaches the user as a translated notice.
  useEffect(() => {
    if (error) console.error('[models]', error)
  }, [error])

  /*
   * A catalog that never arrived and a catalog with nothing in it are different states, and
   * the empty state claims the user has no models. The store keeps the reason; the notice
   * tells the user, and the retry button lets them ask again.
   */
  const loadFailed = !loaded && !loading && error !== null
  const reportedFailure = useRef<string | null>(null)
  useEffect(() => {
    if (!loadFailed) {
      reportedFailure.current = null
      return
    }
    if (reportedFailure.current === error) return
    reportedFailure.current = error
    notifyError(t('errors.modelsLoadFailed'), { cause: error })
  }, [loadFailed, error, t])
  const retryLoad = useCallback(() => {
    // The failure is the one the effect above reports: it watches the store's error field.
    // A load that is already running resolves without reading anything, so the notice
    // would announce a list that was never fetched.
    if (stores.models.getState().loading) return
    void actions.models.loadModels().then(() => {
      notifySuccess(t('common.refreshed'))
    }).catch(() => undefined)
  }, [t])

  const run = (record: ResourceRecord, action: 'install' | 'remove' | 'cancel') => () => {
    if (action === 'install') {
      setDownloadTarget(record)
      return
    }
    void actions.models.manageResource(record.resourceId, action).catch((cause: unknown) => {
      notifyError(action === 'remove' ? t('modelsSettingsUi.removeFailed') : t('errors.engineOperationFailed'), { cause })
    })
  }

  /*
   * A failed install keeps its own way out: the retry in the notice starts the very
   * same download again, and a retry that fails reports itself the same way.
   */
  const install = (target: ResourceRecord, source: ModelDownloadSource) => {
    void actions.models.manageResource(target.resourceId, 'install', source).catch(() => {
      notifyModelDownloadFailure(
        t('models.downloadError', { name: target.name }),
        t('errors.downloadFailed'),
        t('errors.downloadFailedAction'),
        () => install(target, source),
      )
    })
  }

  // Capability defaults and scene selections are independent, including for local language models.
  const setDefault = (record: ResourceRecord) => {
    const patch = defaultTargetOf(record)
    if (!(record.kind === 'ttsModel' ? record.installed : isModelReady(record)) || !patch || !supportsSelectedEngine(record, settings?.compute ?? DEFAULT_COMPUTE_SETTINGS, record.resourceId)) return
    if (!settings) return
    const kind = record.kind === 'recognitionModel' ? 'asr' : record.kind === 'ttsModel' ? 'tts' : familyOf(record) === 'qwen35' ? 'llm' : 'mt'
    void updateSettings(defaultModelPatch(settings, kind, `resource:${record.resourceId}`)).catch((cause: unknown) => notifyError(t('modelsSettingsUi.saveError'), { cause }))
  }

  /*
   * 卡片底部的第二个动作分两种：
   *   · Hub 装来的（含本地导入）模型，配置是用户自己存下来的，可以改，弹窗可编辑；
   *   · 推荐列表里下下来的模型用的是内置配置，只给一个「查看配置」的只读弹窗。
   */
  const footerOf = (record: ResourceRecord) => {
    if (record.resourceId.startsWith('hub:') && record.installed && record.kind !== 'ttsModel') {
      return <Button variant="secondary" onClick={() => setConfiguring({ record, readOnly: false })}>{t(configurationOf(record) ? 'modelConfig.edit' : 'modelConfig.configure')}</Button>
    }
    if (!modelImportEntry(record.resourceId)) return undefined
    if (record.installed && record.kind !== 'ttsModel') {
      return <Button variant="secondary" size="sm" onClick={() => setConfiguring({ record, readOnly: true })}>{t('modelConfig.view')}</Button>
    }
    return <Button variant="secondary" size="sm" onClick={() => offlineActions.openDownloads(record.resourceId)}>{t('offline.manualDownload')}</Button>
  }

  const card = (record: ResourceRecord) => {
    const compute = settings?.compute ?? DEFAULT_COMPUTE_SETTINGS
    const ready = (record.kind === 'ttsModel' ? record.installed : isModelReady(record)) && defaultTargetOf(record) !== null
    const compatible = supportsSelectedEngine(record, compute, record.resourceId)
    const engine = modelEngines(record)[0]
    const loaderUnavailableReason = engine && runtimes?.local && !isEngineAvailable(engine, runtimes.local)
      ? t('models.engineUnavailable', { engine: engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch' })
      : undefined
    const defaultDisabledReason = record.kind !== 'ttsModel' && record.installed && !configurationOf(record)
      ? t('modelsSettingsUi.configureBeforeDefault')
      : loaderUnavailableReason
    return <ModelCard
      key={record.resourceId}
      record={record}
      busy={busyIds.includes(record.resourceId)}
      isDefault={isDefaultOf(record, settings)}
      canBeDefault={ready && compatible && !loaderUnavailableReason}
      defaultDisabledReason={defaultDisabledReason}
      loaderUnavailableReason={loaderUnavailableReason}
      onInstall={run(record, 'install')}
      onCancel={run(record, 'cancel')}
      onRemove={run(record, 'remove')}
      onSetDefault={() => setDefault(record)}
      footer={footerOf(record)}
    />
  }

  return (
    <div className="models-page">
      {configuring ? <ModelConfigurationDialog key={configuring.record.resourceId} record={configuring.record} readOnly={configuring.readOnly} onClose={() => setConfiguring(null)} /> : null}
      <DownloadSourceDialog record={downloadTarget} onClose={() => setDownloadTarget(null)} onSelect={source => {
        const target = downloadTarget
        setDownloadTarget(null)
        if (target) install(target, source)
      }} />
      {cloudDetail ? <CloudModelDialog id={cloudDetail} onClose={() => setCloudDetail(null)} /> : null}
      {openFamily ? <RecommendedFamilyDialog
        key={openFamilyKey}
        family={openFamily}
        records={openFamilyRecords}
        compute={settings?.compute ?? DEFAULT_COMPUTE_SETTINGS}
        computeSnapshot={computeSnapshot}
        runtimes={runtimes}
        busyIds={busyIds}
        onClose={() => setOpenFamily(null)}
        onInstall={(record, source) => install(record, source)}
        onCancel={record => { void actions.models.manageResource(record.resourceId, 'cancel').catch((cause: unknown) => {
          notifyError(t('errors.engineOperationFailed'), { cause })
        }) }}
        onManualDownload={record => { setOpenFamily(null); offlineActions.openDownloads(record.resourceId) }}
      /> : null}
      <section className="models-overview">
        <header className="models-overview__heading">
          <span className="models-overview__icon"><Box aria-hidden="true" /></span>
          <div><h1>{t('models.title')}</h1><p>{t('modelsSettingsUi.modelsSubtitle')}</p></div>
          <div className="models-overview__actions">
            <Button variant="secondary" data-onboarding="models-runtime-setup" onClick={() => navigate(`${settingsPath('compute')}?component=engine`)}>
              <Cpu aria-hidden="true" />{t('modelsSettingsUi.runtimeSetup')}
            </Button>
            <LocalModelImport />
          </div>
        </header>
        <div className="models-overview__summaries" data-onboarding="models-active">
          <CurrentModel label={t('modelsSettingsUi.currentRecognition')} name={currentRecognition} record={remoteRecognition ? null : recognition ?? null} installed={remoteRecognition ? null : recognition?.installed ?? false} kind="recognitionModel" onChange={() => setTab('installed')} />
          <CurrentModel label={t('modelsSettingsUi.currentTranslation')} name={currentTranslation} record={localTranslation ? translation ?? null : null} cloudId={localTranslation ? undefined : currentTranslationCloud?.id} installed={localTranslation ? translation?.installed ?? false : settings ? currentTranslationCloudReady : null} kind="translationModel" onChange={() => setTab('installed')} />
          <CurrentModel label={t('gateway.synthesisDefault')} name={synthesis?.installed ? synthesis.name : t('modelsSettingsUi.noModelSelected')} record={synthesis ?? null} installed={synthesis?.installed ?? false} kind="ttsModel" onChange={() => setTab('installed')} />
        </div>
      </section>

      <ModelPolicyPanel />

      <TabsRoot

        value={tab}
        onValueChange={(key) => setTab(String(key) as ModelsTab)}
        className="models-tabs"
      >
        <div className="tabs__list-container" data-onboarding="models-tabs">
          <TabsList className="tabs__list" aria-label={t('modelsSettingsUi.catalogTabs')}>
            <CountTab id="recommended" label={t('models.tabRecommended')} count={null} />
            <CountTab id="installed" label={t('models.tabInstalled')} count={installed.length + installedCloudModels.length} />
            <CountTab id="search" label={t('models.tabSearch')} count={null} />
            <CountTab id="downloads" label={t('models.tabDownloads')} count={activeCount} />
          </TabsList>
        </div>

        <TabsContent className="tabs__panel" value="recommended" data-onboarding="model-downloads">
          <RecommendedCatalog
            records={resources.filter(record => !record.resourceId.startsWith('hub:'))}
            loading={loading && !loaded}
            failed={loadFailed}
            onRetry={retryLoad}
            onOpen={setOpenFamily}
            cloudModels={cloudModels.filter(model => !model.profile)}
            onOpenCloud={openCloudModel}
            emptyAction={<Button variant="tertiary" size="sm" onClick={() => setTab('search')}>{t('models.tabSearch')}</Button>}
          />
        </TabsContent>

        <TabsContent className="tabs__panel" value="installed">
          <Catalog
            records={installed}
            cloudModels={installedCloudModels}
            onOpenCloud={openCloudModel}
            loading={loading && !loaded}
            failed={loadFailed}
            onRetry={retryLoad}
            card={card}
            compute={settings?.compute ?? DEFAULT_COMPUTE_SETTINGS}
            emptyAction={<Button variant="tertiary" size="sm" onClick={() => setTab('recommended')}>{t('models.tabRecommended')}</Button>}
          />
        </TabsContent>

        <TabsContent className="tabs__panel" value="search">
          <HubSearchTab onGoRecommended={() => setTab('recommended')} />
        </TabsContent>
        <TabsContent className="tabs__panel" value="downloads"><DownloadsTab /></TabsContent>
      </TabsRoot>
    </div>
  )
}

interface CountTabProps {
  id: ModelsTab
  label: string
  /** Null omits counts for tabs whose totals are not meaningful. */
  count: number | null
}

function CountTab({ id, label, count }: CountTabProps) {
  return (
    <TabsTrigger value={id} className="nola-body-strong">
      <span className="flex items-center gap-2">
        {label}
        {count === null ? null : (
          <Badge
            variant="secondary"

            // Utility typography keeps compact counts aligned with the tab label.
            className="rounded-full text-[12px] leading-[1.45] font-normal tabular"
          >
            {count}
          </Badge>
        )}
      </span>

    </TabsTrigger>
  )
}

interface CatalogProps {
  cloudModels: readonly CloudModel[]
  onOpenCloud: (id: CloudModelId) => void
  records: readonly ResourceRecordWithRate[]
  loading: boolean
  /** The catalog could not be read, so the list it would show is unknown rather than empty. */
  failed: boolean
  onRetry: () => void
  card: (record: ResourceRecord) => ReactNode
  compute: typeof DEFAULT_COMPUTE_SETTINGS
  emptyAction: ReactNode
}

function RecommendedCatalog({ records, loading, failed, onRetry, onOpen, emptyAction, cloudModels, onOpenCloud }: Pick<CatalogProps, 'records' | 'loading' | 'failed' | 'onRetry' | 'emptyAction' | 'cloudModels' | 'onOpenCloud'> & { onOpen: (family: RecommendedFamily) => void }) {
  const { t } = useI18n()
  if (!loading && !failed && records.length === 0 && cloudModels.length === 0) return <Empty className="flex flex-col items-start gap-4 py-8"><EmptyTitle>{t('models.notInstalled')}</EmptyTitle>{emptyAction}</Empty>
  const groups = new Map<RecommendedFamily, ResourceRecord[]>()
  for (const record of records) {
    const family = familyOf(record)
    groups.set(family, [...(groups.get(family) ?? []), record])
  }
  const sections: { title: string; kind: ResourceRecord['kind']; families: RecommendedFamily[]; language?: boolean }[] = [
    { title: t('models.asrModels'), kind: 'recognitionModel', families: ['qwen', 'sensevoice', 'funasr', 'vibevoice', 'mimo'] },
    { title: t('workbench.llm'), kind: 'translationModel', families: ['qwen35'], language: true },
    { title: t('models.mtModels'), kind: 'translationModel', families: ['hymt2', 'index', 'other'] },
    { title: t('models.ttsModels'), kind: 'ttsModel', families: ['tts', 'kokoro', 'piper', 'cosyvoice3'] },
  ]
  return <div className="flex flex-col gap-6">
    {failed ? <FailedCatalog onRetry={onRetry} /> : null}
    {loading ? <div className={GRID}>{[0, 1, 2].map(index => <ModelCardSkeleton key={index} />)}</div> : null}
    {sections.filter(section => section.families.some(family => groups.has(family)) || cloudModels.some(model => model.kind === section.kind && Boolean(model.profile || model.id === 'cloud') === Boolean(section.language))).map(section => <section key={section.title} className="flex flex-col gap-3">
    <h2 className="models-section-title">{section.title}</h2>
    <div className={GRID}>{section.families.map(family => {
      const familyRecords = groups.get(family)
      return familyRecords ? <RecommendedFamilyCard key={family} family={family} records={familyRecords} onOpen={() => onOpen(family)} /> : null
    })}{cloudModels.filter(model => model.kind === section.kind && Boolean(model.profile || model.id === 'cloud') === Boolean(section.language)).map(model => <CloudModelCard key={model.id} model={model} onOpen={onOpenCloud} />)}</div>
  </section>)}</div>
}

/**
 * A catalog that could not be read. The list it would show is unknown rather than empty, so
 * the way out is asking for it again. The failure is also raised as a notice, which is what
 * carries the reason; the line here says which state the page is in.
 */
function FailedCatalog({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <Empty className="flex flex-col items-start gap-4 py-8">
      <EmptyTitle>{t('errors.modelsLoadFailed')}</EmptyTitle>
      <Button variant="default" onClick={onRetry}>{t('common.retry')}</Button>
    </Empty>
  )
}

function Catalog({ records, loading, failed, onRetry, card, emptyAction, compute, cloudModels, onOpenCloud }: CatalogProps) {
  const { t } = useI18n()

  if (!loading && !failed && records.length === 0 && cloudModels.length === 0) {
    return (
      <Empty className="flex flex-col items-start gap-4 py-8">
        <EmptyTitle>{t('models.notInstalled')}</EmptyTitle>
        {emptyAction}
      </Empty>
    )
  }

  const ordered = [...records].sort((left, right) =>
    Number(supportsSelectedEngine(right, compute, right.resourceId)) - Number(supportsSelectedEngine(left, compute, left.resourceId)),
  )
  const recognition = ordered.filter((item) => item.kind === 'recognitionModel')
  const translation = ordered.filter((item) => item.kind === 'translationModel')
  const languageModels = translation.filter(item => familyOf(item) === 'qwen35')
  const mtModels = translation.filter(item => familyOf(item) !== 'qwen35')

  return (
    <div className="flex flex-col gap-6">
      {loading ? <div className={GRID}>{[0, 1, 2].map(index => <ModelCardSkeleton key={index} />)}</div> : null}
      {failed ? <FailedCatalog onRetry={onRetry} /> : null}
      <Section title={t('models.asrModels')} records={recognition} card={card}>{cloudModels.filter(model => model.kind === 'recognitionModel').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('workbench.llm')} records={languageModels} card={card}>{cloudModels.filter(model => model.profile || model.id === 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.mtModels')} records={mtModels} card={card}>{cloudModels.filter(model => model.kind === 'translationModel' && !model.profile && model.id !== 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.ttsModels')} records={ordered.filter(record => record.kind === 'ttsModel')} card={card} />
    </div>
  )
}

function Section({
  title,
  records,
  card,
  children,
}: {
  title: string
  records: readonly ResourceRecordWithRate[]
  card: (record: ResourceRecord) => ReactNode
  children?: ReactNode[]
}) {
  if (records.length === 0 && !children?.length) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="models-section-title">{title}</h2>
      <div className={GRID}>{records.map(card)}{children}</div>
    </section>
  )
}

function CurrentModel({ label, name, record, cloudId, installed, kind, onChange }: { label:string; name:string; record:ResourceRecord | null; cloudId?: CloudModelId; installed:boolean | null; kind:'recognitionModel' | 'translationModel' | 'ttsModel'; onChange: () => void }) {
  const { t } = useI18n()
  const pending = kind !== 'ttsModel' && installed && record && !configurationOf(record)
  return <Card size="sm" className="models-current">
    <CardHeader>
    <CardAction>
    <span aria-hidden="true" className={`models-card__icon models-card__icon--${kind === 'recognitionModel' ? 'recognition' : 'translation'}`} data-cloud-model={cloudId}>{cloudId ? <CloudMark id={cloudId} /> : <ModelMark record={record} kind={kind} />}</span>
    </CardAction>
    <CardTitle>{name}</CardTitle><CardDescription>{label}</CardDescription>
    {installed === null ? null : <Badge variant={installed && !pending ? 'success' : 'warning'}  >{pending ? t('modelConfig.pending') : installed ? t('modelsSettingsUi.active') : t('modelsSettingsUi.unavailable')}</Badge>}
    <Button variant="secondary" size="sm" onClick={onChange}>{t('gateway.change')}</Button>
    </CardHeader>
  </Card>
}

/** 在飞 + 失败。失败的留在表里是为了让"重试"有个落点。 */
function countActive(records: readonly ResourceRecordWithRate[]): number {
  return records.filter(
    (item) => item.phase !== 'remove' && (item.state === 'running' || item.state === 'paused' || item.state === 'cancelling' || item.state === 'failed'),
  ).length
}
