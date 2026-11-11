import { Button } from '@/components/ui/button'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui'
import { Empty, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { LocalModelImport } from '../offline/OfflineResources'
import { offlineActions } from '@/store/offlineStore'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'
import { modelEngines, supportsSelectedEngine } from '../../../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
/** Model catalog and download manager. The router owns the page padding. */

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'
import { getBridge } from '@/store'

import { useI18n } from '@/i18n'
import { settingsPath, useRoute } from '@/routes'
import { actions, stores, updateSettings, useStore } from '@/store'
import { notifyError, notifyInfo } from '@/components/primitives/notify'
import { PageHeader } from '@/components/primitives'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ModelDownloadSource, ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { DownloadsTab } from './DownloadsTab'
import { HubSearchTab } from './HubSearchTab'
import { ModelCard, ModelCardSkeleton } from './ModelCard'
import { DownloadSourceDialog } from './DownloadSourceDialog'
import { LocalModelFamilyCard, LocalModelFamilyDialog, RecommendedFamilyCard, RecommendedFamilyDialog, type LocalModelFamilyKind } from './RecommendedFamilies'
import { familyOf, type RecommendedFamily } from './modelFamily'
import { isEngineAvailable } from './engine-availability'
import { notifyModelDownloadFailure, suppressNextDownloadStartNotice } from './ModelDownloadNotice'
import { CloudModelCard, CloudModelDialog, cloudModelsOf, type CatalogCloudModel, type CatalogCloudModelId } from './CloudModels'
import { MIMO_TTS_MODEL, REALTIME_S2S_MODELS } from '../../../shared/settings'
import type { ModelGatewaySnapshot } from '../../../shared/model-gateway'

export type ModelsTab = 'recommended' | 'installed' | 'search' | 'downloads'

/** Three catalog columns collapse to two and one as the application narrows. */
const GRID = 'models-grid'
const attemptedVisionSupplements = new Set<string>()

export function ModelsPage() {
  const { t } = useI18n()
  const { modelsTab, navigate } = useRoute()
  const [tab, setTab] = useState<ModelsTab>('recommended')
  useEffect(() => { setTab(modelsTab === 'downloads' ? 'downloads' : 'recommended') }, [modelsTab])
  const [configuring, setConfiguring] = useState<{ record: ResourceRecord; readOnly: boolean } | null>(null)
  const [downloadTarget, setDownloadTarget] = useState<ResourceRecord | null>(null)
  const [localFamily, setLocalFamily] = useState<{ kind: LocalModelFamilyKind; resourceId?: string } | null>(null)
  const [openFamily, setOpenFamily] = useState<RecommendedFamily | null>(null)
  const [voiceMetadata, setVoiceMetadata] = useState<{ modelId: string; voices: string[] }>({ modelId: '', voices: [] })
  const [realtime, setRealtime] = useState<ModelGatewaySnapshot['realtime']>()
  const [cloudDetail, setCloudDetail] = useState<CatalogCloudModelId | null>(null)

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
      notifyInfo(t('models.visionSupplementStarted'), {
        description: t('models.visionSupplementDescription', { name: record.name }),
        action: { label: t('models.viewProgress'), onPress: () => { window.location.hash = '#/models/downloads' } },
        duration: 12000,
      })
      suppressNextDownloadStartNotice(resourceId)
      void actions.models.manageResource(resourceId, 'install').catch((cause: unknown) => {
        notifyError(t('models.downloadFailed'), {
          cause,
          description: t('models.downloadFailedDescription'),
        })
      })
    }
  }, [loaded, resources, t])

  const credentials = useStore(stores.models, state => state.credentials)
  const cloudModels = cloudModelsOf(settings, credentials)
  const aliyunReady = cloudModels.some(model => model.id === 'aliyun' && model.ready)
  const runtimeState = (ids: readonly string[]): CatalogCloudModel['runtimeState'] => {
    const instances = realtime?.instances.filter(instance => ids.includes(instance.model_id)) ?? []
    if (instances.some(instance => instance.active_leases > 0)) return 'running'
    for (const state of ['loading', 'ready', 'failed'] as const) {
      if (instances.some(instance => instance.state === state)) return state
    }
  }
  const catalogCloudModels: CatalogCloudModel[] = [
    ...cloudModels.filter(model => model.id !== 'recognition'),
    { id: 'aliyun-s2s', kind: 's2sModel', free: false, ready: aliyunReady,
      runtimeState: runtimeState(REALTIME_S2S_MODELS) },
    { id: MIMO_TTS_MODEL, kind: 'ttsModel', free: false, ready: credentials['mimo-tts'],
      runtimeState: runtimeState([MIMO_TTS_MODEL]) },
  ]
  const installedCloudModels = catalogCloudModels.filter(model => model.ready || model.profile)

  const installed = useMemo(() => resources.filter((item) => item.installed), [resources])
  const activeCount = useMemo(() => countActive(resources), [resources])
  const voices = voiceMetadata.modelId === settings?.synthesis?.modelId ? voiceMetadata.voices : []
  useEffect(() => {
    const gateway = getBridge()?.gateway
    if (!gateway) return
    const receive = (snapshot: Awaited<ReturnType<typeof gateway.snapshot>>) => setVoiceMetadata({ modelId: snapshot.services.tts.model.replace(/^resource:/, ''), voices: snapshot.services.tts.voices ?? [] })
    let alive = true
    const off = gateway.onChanged(receive)
    const refresh = () => { void gateway.snapshot().then(snapshot => { if (alive) { receive(snapshot); setRealtime(snapshot.realtime) } }).catch(() => undefined) }
    refresh()
    const interval = window.setInterval(refresh, 3000)
    return () => { alive = false; off(); window.clearInterval(interval) }
  }, [settings?.synthesis?.modelId])
  useEffect(() => {
    if (voices.length && settings?.synthesis && !voices.includes(settings.synthesis.voice)) {
      void updateSettings({ synthesis: { voice: voices[0] } }).catch(() => undefined)
    }
  }, [voices, settings?.synthesis?.voice])
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
  const retryLoad = useCallback(() => {
    if (stores.models.getState().loading) return
    void actions.models.loadModels().catch(() => undefined)
  }, [])

  const run = (record: ResourceRecord, action: 'install' | 'cancel') => () => {
    if (action === 'install') {
      if (record.kind === 'ocrModel' || record.kind === 'inpaintModel' || record.kind === 'detectModel') {
        void actions.models.manageResource(record.resourceId, 'install').catch((cause: unknown) => notifyError(t('models.downloadFailed'), { cause }))
        return
      }
      setDownloadTarget(record)
      return
    }
    void actions.models.manageResource(record.resourceId, action).catch((cause: unknown) => notifyError(t('errors.engineOperationFailed'), { cause }))
  }

  /*
   * A failed install keeps its own way out: the retry in the notice starts the very
   * same download again, and a retry that fails reports itself the same way.
   */
  const install = (target: ResourceRecord, source: ModelDownloadSource) => {
    void actions.models.manageResource(target.resourceId, 'install', source).catch(() => {
      notifyModelDownloadFailure(
        t('models.downloadFailed'),
        t('errors.downloadFailed'),
        t('errors.downloadFailedAction'),
        () => install(target, source),
      )
    })
  }

  const footerOf = (record: ResourceRecord) => {
    const { kind, resourceId } = record
    if (kind === 'ocrModel' || kind === 'inpaintModel' || kind === 'detectModel') return (
      <Button onClick={() => setLocalFamily({ kind, resourceId })}>{t('models.openDetails')}</Button>
    )
    if (record.installed) {
      const readOnly = !record.resourceId.startsWith('hub:') || record.kind === 'ttsModel'
      return <Button onClick={() => setConfiguring({ record, readOnly })}>{t('models.openDetails')}</Button>
    }
    if (!modelImportEntry(record.resourceId)) return undefined
    return <Button variant="secondary" size="sm" onClick={() => offlineActions.openDownloads(record.resourceId)}>{t('offline.manualDownload')}</Button>
  }

  const card = (record: ResourceRecord) => {
    const engine = modelEngines(record)[0]
    const loaderUnavailableReason = engine && runtimes?.local && !isEngineAvailable(engine, runtimes.local)
      ? t('models.engineUnavailable', { engine: engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch' })
      : undefined
    return <ModelCard
      key={record.resourceId}
      record={record}
      busy={busyIds.includes(record.resourceId)}
      loaderUnavailableReason={loaderUnavailableReason}
      onInstall={run(record, 'install')}
      onCancel={run(record, 'cancel')}
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
      {localFamily ? <LocalModelFamilyDialog
        key={localFamily.resourceId ?? localFamily.kind}
        kind={localFamily.kind}
        initialResourceId={localFamily.resourceId}
        records={resources.filter(record => record.kind === localFamily.kind && (record.resourceId !== 'pp-ocrv5-mobile-onnx' || record.installed))}
        busyIds={busyIds}
        onClose={() => setLocalFamily(null)}
        onInstall={record => {
          if (record.kind === 'ocrModel') install(record, 'modelscope')
          else run(record, 'install')()
        }}
        onCancel={record => run(record, 'cancel')()}
      /> : null}
      {cloudDetail ? <CloudModelDialog id={cloudDetail} onClose={() => setCloudDetail(null)} /> : null}
      {openFamily && openFamilyRecords.length > 0 ? <RecommendedFamilyDialog
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
      <div data-onboarding="models-page-heading">
        <PageHeader
          className="nola-page-heading"
          title={t('models.title')}
          actions={<>
            <Button variant="secondary" data-onboarding="models-runtime-setup" onClick={() => navigate(`${settingsPath('engine')}?component=engine`)}>
              {t('modelsSettingsUi.runtimeSetup')}
            </Button>
            <LocalModelImport />
          </>}
        />
      </div>


      <TabsRoot

        value={tab}
        onValueChange={(key) => setTab(String(key) as ModelsTab)}
        className="models-tabs"
      >
        <div className="tabs__list-container" data-onboarding="models-tabs">
          <TabsList variant="line" aria-label={t('modelsSettingsUi.catalogTabs')}>
            <CountTab id="recommended" label={t('models.tabRecommended')} count={null} />
            <CountTab id="installed" label={t('models.tabInstalled')} count={installed.length + installedCloudModels.length} />
            <CountTab id="search" label={t('models.tabSearch')} count={null} />
            <CountTab id="downloads" label={t('models.tabDownloads')} count={activeCount} />
          </TabsList>
        </div>

        <TabsContent className="tabs__panel" value="recommended" data-onboarding="model-downloads">
          <RecommendedCatalog
            records={resources.filter(record => !record.resourceId.startsWith('hub:') && (record.resourceId !== 'pp-ocrv5-mobile-onnx' || record.installed))}
            loading={loading && !loaded}
            failed={loadFailed}
            onRetry={retryLoad}
            onOpen={setOpenFamily}
            onOpenLocal={kind => setLocalFamily({ kind })}
            cloudModels={catalogCloudModels.filter(model => !model.profile)}
            onOpenCloud={setCloudDetail}
            emptyAction={<Button variant="tertiary" size="sm" onClick={() => setTab('search')}>{t('models.tabSearch')}</Button>}
          />
        </TabsContent>

        <TabsContent className="tabs__panel" value="installed">
          <Catalog
            records={installed}
            cloudModels={installedCloudModels}
            onOpenCloud={setCloudDetail}
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
        <TabsContent className="tabs__panel" value="downloads" data-onboarding="models-downloads-panel"><DownloadsTab /></TabsContent>
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
    <TabsTrigger data-onboarding={id === 'downloads' ? 'models-downloads-tab' : undefined} value={id} className="nola-body-strong">
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
  cloudModels: readonly CatalogCloudModel[]
  onOpenCloud: (id: CatalogCloudModelId) => void
  records: readonly ResourceRecordWithRate[]
  loading: boolean
  /** The catalog could not be read, so the list it would show is unknown rather than empty. */
  failed: boolean
  onRetry: () => void
  card: (record: ResourceRecord) => ReactNode
  compute: typeof DEFAULT_COMPUTE_SETTINGS
  emptyAction: ReactNode
}

function RecommendedCatalog({ records, loading, failed, onRetry, onOpen, onOpenLocal, emptyAction, cloudModels, onOpenCloud }: Pick<CatalogProps, 'records' | 'loading' | 'failed' | 'onRetry' | 'emptyAction' | 'cloudModels' | 'onOpenCloud'> & {
  onOpen(family: RecommendedFamily): void
  onOpenLocal(kind: LocalModelFamilyKind): void
}) {
  const { t } = useI18n()
  if (!loading && !failed && records.length === 0 && cloudModels.length === 0) return <Empty className="flex flex-col items-start gap-4 py-8"><EmptyTitle>{t('models.notInstalled')}</EmptyTitle>{emptyAction}</Empty>
  const groups = new Map<RecommendedFamily, ResourceRecord[]>()
  for (const record of records) {
    // Keep legacy M2M100 installations available in Installed, but stop recommending it.
    if (record.resourceId === 'm2m100-418m' || (record.kind === 'ocrModel' || record.kind === 'inpaintModel' || record.kind === 'detectModel')) continue
    const family = familyOf(record)
    if (family === 'kokoro' || family === 'piper') continue
    groups.set(family, [...(groups.get(family) ?? []), record])
  }
  const sections: { title: string; hint: string; kind: ResourceRecord['kind'] | 's2sModel'; families: RecommendedFamily[]; language?: boolean; onboardingTarget?: string }[] = [
    { title: t('models.asrModels'), hint: t('models.asrModelsHint'), kind: 'recognitionModel', families: ['qwen', 'sensevoice', 'funasr', 'vibevoice', 'mimo'], onboardingTarget: 'models-recognition-catalog' },
    { title: t('models.mtModels'), hint: t('models.mtModelsHint'), kind: 'translationModel', families: ['hymt2', 'index', 'other'], onboardingTarget: 'models-translation-catalog' },
    { title: t('models.ttsModels'), hint: t('models.ttsModelsHint'), kind: 'ttsModel', families: ['tts', 'kokoro', 'piper', 'cosyvoice3'] },
    { title: t('models.llmModels'), hint: t('models.llmModelsHint'), kind: 'translationModel', families: ['qwen35'], language: true },
    { title: t('models.s2sModels'), hint: t('models.s2sModelsHint'), kind: 's2sModel', families: [] },
    { title: t('screen.ocrTitle'), hint: t('screen.ocrDescription'), kind: 'ocrModel', families: [] },
    { title: t('suite.comicDetector'), hint: t('suite.comicDetectorDescription'), kind: 'detectModel', families: [] },
    { title: t('suite.inpaintModels'), hint: t('suite.inpaintDescription'), kind: 'inpaintModel', families: [] },
  ]
  return <div className="models-catalog-sections">
    {failed ? <FailedCatalog onRetry={onRetry} /> : null}
    {loading ? <div className={GRID}>{[0, 1, 2].map(index => <ModelCardSkeleton key={index} />)}</div> : null}
    {sections.map(section => {
      const { kind } = section
      const localKind = kind === 'ocrModel' || kind === 'inpaintModel' || kind === 'detectModel' ? kind : null
      const localRecords = localKind ? records.filter(record => record.kind === localKind) : []
      const sectionCloudModels = cloudModels.filter(model => model.kind === section.kind && Boolean(model.profile || model.id === 'cloud') === Boolean(section.language))
      if (!loading && !localRecords.length && !sectionCloudModels.length && !section.families.some(family => groups.has(family))) return null
      const indexTranslation = section.kind === 'translationModel' ? sectionCloudModels.find(model => model.id === 'index-translate') : undefined
      const otherCloudModels = indexTranslation ? sectionCloudModels.filter(model => model !== indexTranslation) : sectionCloudModels
      const renderCloudModel = (model: CatalogCloudModel) => <CloudModelCard key={model.id} model={model} onOpen={onOpenCloud} />
      return <section key={section.title} className="models-catalog-section" data-onboarding={section.onboardingTarget}>
        <ModelSectionHeading title={section.title} hint={section.hint} />
        <div className={GRID}>
          {localKind && <LocalModelFamilyCard kind={localKind} records={localRecords} onOpen={() => onOpenLocal(localKind)} />}
          {section.families.map(family => {
            const familyRecords = groups.get(family)
            return <Fragment key={family}>{familyRecords ? <RecommendedFamilyCard family={family} records={familyRecords} onOpen={() => onOpen(family)} /> : null}{family === 'index' && indexTranslation ? renderCloudModel(indexTranslation) : null}</Fragment>
          })}
          {otherCloudModels.map(renderCloudModel)}
        </div>
      </section>
    })}
    </div>
}

/**
 * A catalog that could not be read. The list it would show is unknown rather than empty, so
 * the way out is asking for it again.
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
      <Section title={t('models.asrModels')} hint={t('models.asrModelsHint')} records={recognition} card={card}>{cloudModels.filter(model => model.kind === 'recognitionModel').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.mtModels')} hint={t('models.mtModelsHint')} records={mtModels} card={card}>{cloudModels.filter(model => model.kind === 'translationModel' && !model.profile && model.id !== 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.ttsModels')} hint={t('models.ttsModelsHint')} records={ordered.filter(record => record.kind === 'ttsModel')} card={card}>{cloudModels.filter(model => model.kind === 'ttsModel').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('screen.ocrTitle')} hint={t('screen.ocrDescription')} records={ordered.filter(record => record.kind === 'ocrModel')} card={card} />
      <Section title={t('suite.comicDetector')} hint={t('suite.comicDetectorDescription')} records={ordered.filter(record => record.kind === 'detectModel')} card={card} />
      <Section title={t('suite.inpaintModels')} hint={t('suite.inpaintDescription')} records={ordered.filter(record => record.kind === 'inpaintModel')} card={card} />
      <Section title={t('models.llmModels')} hint={t('models.llmModelsHint')} records={languageModels} card={card}>{cloudModels.filter(model => model.profile || model.id === 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.s2sModels')} hint={t('models.s2sModelsHint')} records={[]} card={card}>{cloudModels.filter(model => model.kind === 's2sModel').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
    </div>
  )
}

function Section({
  title,
  hint,
  records,
  card,
  children,
}: {
  title: string
  hint: string
  records: readonly ResourceRecordWithRate[]
  card: (record: ResourceRecord) => ReactNode
  children?: ReactNode[]
}) {
  if (records.length === 0 && !children?.length) return null
  return (
    <section className="flex flex-col gap-3">
      <ModelSectionHeading title={title} hint={hint} />
      <div className={GRID}>{records.map(card)}{children}</div>
    </section>
  )
}

function ModelSectionHeading({ title, hint }: { title: string; hint: string }) {
  const titleId = useId()
  const { t } = useI18n()
  return (
    <h2 className="models-section-title" aria-labelledby={titleId}>
      <span id={titleId}>{title}</span>
      <Tooltip>
        <TooltipTrigger delay={300} render={<Button variant="tertiary" size="icon-xs" className="border-transparent bg-transparent text-muted hover:bg-surface-secondary" aria-label={t('common.info')}><CircleHelp aria-hidden="true" className="size-3.5" /></Button>} />
        <TooltipContent sideOffset={3} className="settings-row__tooltip z-popup max-w-96 whitespace-normal">{hint}</TooltipContent>
      </Tooltip>
    </h2>
  )
}

/** 在飞 + 失败。失败的留在表里是为了让"重试"有个落点。 */
function countActive(records: readonly ResourceRecordWithRate[]): number {
  return records.filter(
    (item) => item.phase !== 'remove' && (item.state === 'running' || item.state === 'paused' || item.state === 'cancelling' || item.state === 'failed'),
  ).length
}
