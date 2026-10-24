import { Button } from '@/components/ui/button'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from '@/components/ui'
import { Empty, EmptyTitle } from '@/components/ui/empty'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LocalModelImport } from '../offline'
import { offlineActions } from '@/store/offlineStore'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import { configurationOf, isModelReady, recognitionLanguages } from '../../../shared/model-capabilities'
import { ModelConfigurationDialog } from './ModelConfigurationDialog'
import { modelEngines, supportsSelectedEngine } from '../../../shared/model-engines'
import { DEFAULT_COMPUTE_SETTINGS } from '../../../shared/compute'
/** Model catalog and download manager. The router owns the page padding. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box } from 'lucide-react'

import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import type { ModelDownloadSource, ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { DownloadsTab } from './DownloadsTab'
import { HubSearchTab } from './HubSearchTab'
import { ModelCard, ModelCardSkeleton, defaultTargetOf, isDefaultOf } from './ModelCard'
import { DownloadSourceDialog } from './DownloadSourceDialog'
import { ModelMark } from './modelBrand'
import { RecommendedFamilyCard, RecommendedFamilyDialog } from './RecommendedFamilies'
import { familyOf, type RecommendedFamily } from './modelFamily'
import { isEngineAvailable } from './engine-availability'
import { notifyModelDownloadFailure } from './ModelDownloadNotice'
import { recognitionLabel } from '../../../shared/cloud-config'
import { ALIYUN_LANGUAGES } from '../../../shared/cloud-config'
import { targetLanguagePatch } from '../../session-config'
import { CloudModelCard, CloudModelDialog, cloudModelsOf, type CloudModel, type CloudModelId } from './CloudModels'
import './models.css'

export type ModelsTab = 'recommended' | 'installed' | 'search' | 'downloads'

/** Three catalog columns collapse to two and one as the application narrows. */
const GRID = 'models-grid'

export function ModelsPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<ModelsTab>('recommended')
  const [configuring, setConfiguring] = useState<{ record: ResourceRecord; readOnly: boolean } | null>(null)
  const [downloadTarget, setDownloadTarget] = useState<ResourceRecord | null>(null)
  const [openFamily, setOpenFamily] = useState<RecommendedFamily | null>(null)
  const [cloudDetail, setCloudDetail] = useState<CloudModelId | null>(null)

  const resources = useStore(stores.models, (state) => state.resources)
  const loaded = useStore(stores.models, (state) => state.loaded)
  const loading = useStore(stores.models, (state) => state.loading)
  const busyIds = useStore(stores.models, (state) => state.busyIds)
  const error = useStore(stores.models, (state) => state.error)
  const settings = useStore(stores.settings, (state) => state.settings)
  const computeSnapshot = useStore(stores.settings, (state) => state.computeSnapshot)
  const runtimes = useStore(stores.settings, (state) => state.runtimes)

  const credentials = useStore(stores.models, state => state.credentials)
  const cloudModels = cloudModelsOf(settings, credentials)
  const installedCloudModels = cloudModels.filter(model => model.ready || model.profile)
  const openCloudModel = (id: CloudModelId) => {
    if (id !== 'recognition') { setCloudDetail(id); return }
    const current = stores.settings.getState().settings
    const ready = cloudModelsOf(current, stores.models.getState().credentials).some(model => model.id === 'recognition' && model.ready)
    if (!current || !ready) { setCloudDetail('aliyun'); return }
    const previousTarget = current.translation.targetLanguage
    const requestedTarget = previousTarget === 'none' ? 'zh' : previousTarget
    const targetLanguage = ALIYUN_LANGUAGES.includes(requestedTarget as typeof ALIYUN_LANGUAGES[number]) ? requestedTarget : 'zh'
    const visibility = targetLanguagePatch(targetLanguage, previousTarget)
    void updateSettings({ ...visibility,
      recognition: { provider: 'aliyun', sourceLanguage: 'auto' },
      translation: { ...visibility.translation, provider: 'recognition' },
    }).then(() => notifySuccess(t('modelsSettingsUi.cloudProviderEnabled', { name: t('settings.providerRecognitionTranslation') })))
      .catch((cause: unknown) => notifyError(t('modelsSettingsUi.saveError'), { cause }))
  }

  const installed = useMemo(() => resources.filter((item) => item.installed), [resources])
  const activeCount = useMemo(() => countActive(resources), [resources])
  const recognition = resources.find((item) => item.resourceId === settings?.recognition.modelId)
  const translation = resources.find((item) => item.resourceId === settings?.translation.localModelId)
  const localTranslation = settings?.translation.provider === 'local'
  const remoteRecognition = !!settings?.recognition.provider && settings.recognition.provider !== 'local'
  /*
   * The catalog always carries every model the engine knows about, installed or not, so finding a
   * record by id says nothing about whether it can run. Both overview cards ask `installed`
   * instead: an uninstalled model would otherwise be announced as the one in use, right above the
   * list that marks it as uninstalled. Cloud recognition names its remote model instead, chosen
   * independently of the local id.
   */
  const currentRecognition = remoteRecognition && settings
    ? recognitionLabel(settings.recognition)
    : recognition?.installed ? recognition.name : t('modelsSettingsUi.noModelSelected')
  /*
   * 服务商显示名跟着界面语言走：「本地模型 / 云端模型」是界面概念而非产品名
   * （Hy-MT2 与 M2M100 合并成前者，OpenAI 与 Ollama 合并成后者）。
   * 只有 Microsoft Translator 是产品名。
   */
  const providerNames = {
    local: t('settings.providerLocal'),
    cloud: t('settings.providerCloud'),
    microsoft: t('settings.providerMicrosoft'),
    mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'),
    'index-translate': t('settings.providerIndexTranslate'),
    recognition: t('settings.providerRecognitionTranslation'),
  }
  /*
   * 云端那一栏显示**模型 ID**，不是服务商名。服务商名在这一栏是废话：三家云端服务商
   * 都只是"把请求发给某个 OpenAI 兼容 endpoint"，真正决定用的是哪个模型的是
   * `cloudModel`。只显示 "OpenAI" 会让人以为选服务商就等于选好了模型 —— 实际配置的是
   * 另一个服务商、模型却还是 OpenAI 的，那一栏就整个说错了。模型 id 为空（还没填）
   * 才退回服务商名，总得显示点什么。
   */
  const cloudModel = settings?.translation.cloudModel?.trim() ?? ''
  const currentTranslation = localTranslation
    ? translation?.installed ? translation.name : t('modelsSettingsUi.noModelSelected')
    : settings?.translation.provider === 'cloud'
      ? cloudModel || providerNames.cloud
      : providerNames[settings?.translation.provider ?? 'microsoft']

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

  /*
   * `defaultTargetOf` 已经把 `provider: 'local'` 一起写进 patch 了，所以这里不再补写。
   * 以前这里硬按 `hymt2`：那会儿 m2m100 在设置里没有槽位，从模型页设默认只能强行把
   * provider 改回 hymt2，于是"给 M2M100 设默认"这件事根本无法表达。
   */
  const setDefault = (record: ResourceRecord) => {
    const patch = defaultTargetOf(record)
    if (!isModelReady(record) || !patch || !supportsSelectedEngine(record, settings?.compute ?? DEFAULT_COMPUTE_SETTINGS, record.resourceId)) return
    const supportedLanguages = record.kind === 'recognitionModel' ? recognitionLanguages(record) : []
    const currentSourceLanguage = settings?.recognition.sourceLanguage
    const sourceLanguage = currentSourceLanguage && supportedLanguages.includes(currentSourceLanguage)
      ? currentSourceLanguage
      : supportedLanguages.includes('auto') ? 'auto' : supportedLanguages[0]
    void updateSettings({ ...patch,
      ...(record.kind === 'recognitionModel' && sourceLanguage ? { recognition: { ...patch.recognition, sourceLanguage } } : {}),
      ...(record.kind === 'recognitionModel' && settings?.translation.provider === 'recognition' ? { translation: { provider: 'mymemory' } } : {}),
    }).catch(() => undefined)
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
    const ready = isModelReady(record) && defaultTargetOf(record) !== null
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
          <div><h1>{t('models.title')}</h1><p>{t('modelsSettingsUi.modelsSubtitle')}</p></div><LocalModelImport />
        </header>
        <div className="models-overview__summaries">
          <CurrentModel label={t('modelsSettingsUi.currentRecognition')} name={currentRecognition} record={remoteRecognition ? null : recognition ?? null} installed={remoteRecognition ? null : recognition?.installed ?? false} kind="recognitionModel" />
          <CurrentModel label={t('modelsSettingsUi.currentTranslation')} name={currentTranslation} record={localTranslation ? translation ?? null : null} installed={localTranslation ? translation?.installed ?? false : null} kind="translationModel" />
        </div>
      </section>

      <TabsRoot

        value={tab}
        onValueChange={(key) => setTab(String(key) as ModelsTab)}
        className="models-tabs"
      >
        <div className="tabs__list-container">
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
    { title: t('localCall.llm'), kind: 'translationModel', families: [], language: true },
    { title: t('models.mtModels'), kind: 'translationModel', families: ['hymt2', 'index', 'other'] },
    { title: t('models.ttsModels'), kind: 'ttsModel', families: ['tts'] },
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

  return (
    <div className="flex flex-col gap-6">
      {loading ? <div className={GRID}>{[0, 1, 2].map(index => <ModelCardSkeleton key={index} />)}</div> : null}
      {failed ? <FailedCatalog onRetry={onRetry} /> : null}
      <Section title={t('models.asrModels')} records={recognition} card={card}>{cloudModels.filter(model => model.kind === 'recognitionModel').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('localCall.llm')} records={[]} card={card}>{cloudModels.filter(model => model.profile || model.id === 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
      <Section title={t('models.mtModels')} records={translation} card={card}>{cloudModels.filter(model => model.kind === 'translationModel' && !model.profile && model.id !== 'cloud').map(model => <CloudModelCard key={model.id} model={model} installed onOpen={onOpenCloud} />)}</Section>
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

function CurrentModel({ label, name, record, installed, kind }: { label:string; name:string; record:ResourceRecord | null; installed:boolean | null; kind:'recognitionModel' | 'translationModel' }) {
  const { t } = useI18n()
  const pending = installed && record && !configurationOf(record)
  return <Card size="sm" className="models-current">
    <CardHeader>
    <CardAction>
    <span aria-hidden="true" className={`models-card__icon models-card__icon--${kind === 'recognitionModel' ? 'recognition' : 'translation'}`}><ModelMark record={record} kind={kind} /></span>
    </CardAction>
    <CardTitle>{name}</CardTitle><CardDescription>{label}</CardDescription>
    {installed === null ? null : <Badge variant={installed && !pending ? 'success' : 'warning'}  >{pending ? t('modelConfig.pending') : installed ? t('modelsSettingsUi.active') : t('modelsSettingsUi.unavailable')}</Badge>}
    </CardHeader>
  </Card>
}

/** 在飞 + 失败。失败的留在表里是为了让"重试"有个落点。 */
function countActive(records: readonly ResourceRecordWithRate[]): number {
  return records.filter(
    (item) => item.phase !== 'remove' && (item.state === 'running' || item.state === 'cancelling' || item.state === 'failed'),
  ).length
}
