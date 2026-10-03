/** Model catalog and download manager. The router owns the page padding. */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Card, Chip, EmptyState, Tabs, toast } from '@heroui/react'
import { Box } from 'lucide-react'

import { useI18n } from '@/i18n'
import { actions, stores, updateSettings, useStore } from '@/store'
import type { ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { DownloadsTab } from './DownloadsTab'
import { HubSearchTab } from './HubSearchTab'
import { ModelCard, ModelCardSkeleton, defaultTargetOf, isDefaultOf } from './ModelCard'
import { ModelMark } from './modelBrand'
import './models.css'

export type ModelsTab = 'recommended' | 'installed' | 'search' | 'downloads'

/** Three catalog columns collapse to two and one as the application narrows. */
const GRID = 'models-grid'

export function ModelsPage() {
  const { t } = useI18n()
  const [tab, setTab] = useState<ModelsTab>('recommended')

  const resources = useStore(stores.models, (state) => state.resources)
  const loaded = useStore(stores.models, (state) => state.loaded)
  const loading = useStore(stores.models, (state) => state.loading)
  const busyIds = useStore(stores.models, (state) => state.busyIds)
  const error = useStore(stores.models, (state) => state.error)
  const settings = useStore(stores.settings, (state) => state.settings)

  const installed = useMemo(() => resources.filter((item) => item.installed), [resources])
  const activeCount = useMemo(() => countActive(resources), [resources])
  const recognition = resources.find((item) => item.resourceId === settings?.recognition.modelId)
  const translation = resources.find((item) => item.resourceId === (settings?.translation.provider === 'm2m100' ? 'm2m100-418m' : settings?.translation.hymt2ModelId))
  const localTranslation = settings?.translation.provider === 'hymt2' || settings?.translation.provider === 'm2m100'
  const providerNames = { hymt2: 'Hy-MT2', m2m100: 'M2M100', microsoft: 'Microsoft Translator', openai: 'OpenAI', ollama: 'Ollama' }

  // error 是诊断串，不进界面（store 约定）：只送 console，界面走 errors.* 的错误码文案。
  useEffect(() => {
    if (error) console.error('[models]', error)
  }, [error])

  const run = (id: string, action: 'install' | 'remove' | 'cancel') => () => {
    void actions.models.manageResource(id, action).catch(() => {
      // 失败已经写进 store.error，界面上由下面的 Alert 呈现。
    })
  }

  const setDefault = (record: ResourceRecord) => {
    const patch = defaultTargetOf(record)
    if (!patch) return
    const activePatch = record.kind === 'translationModel'
      ? { ...patch, translation: { ...patch.translation, provider:'hymt2' as const } }
      : patch
    void updateSettings(activePatch).catch(() => toast.danger(t('modelsSettingsUi.defaultSaveFailed')))
  }

  const card = (record: ResourceRecord, installable = true) => (
    <ModelCard
      key={record.resourceId}
      record={record}
      busy={busyIds.includes(record.resourceId)}
      isDefault={isDefaultOf(record, settings)}
      canBeDefault={defaultTargetOf(record) !== null}
      installable={installable}
      onInstall={run(record.resourceId, 'install')}
      onCancel={run(record.resourceId, 'cancel')}
      onRemove={run(record.resourceId, 'remove')}
      onSetDefault={() => setDefault(record)}
    />
  )

  return (
    <div className="models-page">
      <section className="models-overview">
        <header className="models-overview__heading">
          <span className="models-overview__icon"><Box aria-hidden="true" /></span>
          <div><h1>{t('models.title')}</h1><p>{t('modelsSettingsUi.modelsSubtitle')}</p></div>
        </header>
        <div className="models-overview__summaries">
          <CurrentModel label={t('modelsSettingsUi.currentRecognition')} name={recognition?.name ?? settings?.recognition.modelId ?? '—'} record={recognition ?? null} installed={recognition?.installed ?? false} kind="recognitionModel" />
          <CurrentModel label={t('modelsSettingsUi.currentTranslation')} name={localTranslation ? translation?.name ?? settings?.translation.hymt2ModelId ?? '—' : providerNames[settings?.translation.provider ?? 'hymt2']} record={localTranslation ? translation ?? null : null} installed={localTranslation ? translation?.installed ?? false : null} kind="translationModel" />
        </div>
      </section>

      {error ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title className="nola-body-strong">{t('errors.downloadFailed')}</Alert.Title>
            <Alert.Description className="nola-caption">
              {t('errors.downloadFailedAction')}
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Tabs
        variant="secondary"
        selectedKey={tab}
        onSelectionChange={(key) => setTab(String(key) as ModelsTab)}
        className="models-tabs"
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={t('modelsSettingsUi.catalogTabs')}>
            <CountTab id="recommended" label={t('models.tabRecommended')} count={null} />
            <CountTab id="installed" label={t('models.tabInstalled')} count={installed.length} />
            <CountTab id="search" label={t('models.tabSearch')} count={null} />
            <CountTab id="downloads" label={t('models.tabDownloads')} count={activeCount} />
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="recommended">
          <Catalog
            records={resources}
            loading={loading && !loaded}
            card={card}
            emptyAction={
              <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setTab('search')}>
                {t('models.tabSearch')}
              </Button>
            }
          />
        </Tabs.Panel>

        <Tabs.Panel id="installed">
          <Catalog
            records={installed}
            loading={loading && !loaded}
            card={card}
            emptyAction={
              <Button variant="tertiary" size="sm" className="rounded-[6px]" onPress={() => setTab('recommended')}>
                {t('models.tabRecommended')}
              </Button>
            }
          />
        </Tabs.Panel>

        <Tabs.Panel id="search">
          <HubSearchTab />
        </Tabs.Panel>

        <Tabs.Panel id="downloads">
          <DownloadsTab />
        </Tabs.Panel>
      </Tabs>
      {/*
        原来这里挂着一张「模型保存在本机 / 存储设置 →」的卡片。它渲染在 `<Tabs>` **外面**，
        所以四个 tab 下面都跟着它一次。它说的是「模型存在本地」，而这句话在设置 → 存储里
        已经讲过一遍，还带真正能改路径的入口；在一张全是模型的列表页底部再放一个跳去别处的
        按钮，只是把出口从列表里挪到了列表外。按要求整块移除（`.models-storage` 的样式
        一并删掉，见 models.css）。
      */}
    </div>
  )
}

// -- 片段 ---------------------------------------------------------------------

interface CountTabProps {
  id: ModelsTab
  label: string
  /** 传 null 表示这一屏的数量没有意义（例如搜索 tab 的数量会随输入抖动），不画胶囊。 */
  count: number | null
}

function CountTab({ id, label, count }: CountTabProps) {
  return (
    <Tabs.Tab id={id} className="nola-body-strong">
      <span className="flex items-center gap-2">
        {label}
        {count === null ? null : (
          <Chip
            color="default"
            variant="soft"
            // `.nola-micro` 在 base 层，压不过 components 层的 `.chip`，所以字阶用任意值工具类。
            className="rounded-full text-[11px] leading-[1.45] font-normal tabular"
          >
            {count}
          </Chip>
        )}
      </span>
      <Tabs.Indicator />
    </Tabs.Tab>
  )
}

interface CatalogProps {
  records: readonly ResourceRecordWithRate[]
  loading: boolean
  card: (record: ResourceRecord) => ReactNode
  emptyAction: ReactNode
}

function Catalog({ records, loading, card, emptyAction }: CatalogProps) {
  const { t } = useI18n()

  if (loading) {
    return (
      <div className={GRID}>
        {[0, 1, 2, 3].map((index) => (
          <ModelCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <EmptyState className="flex flex-col items-start gap-4 py-8">
        <p className="nola-title text-foreground">{t('models.notInstalled')}</p>
        {emptyAction}
      </EmptyState>
    )
  }

  const recognition = records.filter((item) => item.kind === 'recognitionModel')
  const translation = records.filter((item) => item.kind === 'translationModel')

  return (
    <div className="flex flex-col gap-6">
      <Section title={t('models.asrModels')} records={recognition} card={card} />
      <Section title={t('models.mtModels')} records={translation} card={card} />
    </div>
  )
}

function Section({
  title,
  records,
  card,
}: {
  title: string
  records: readonly ResourceRecordWithRate[]
  card: (record: ResourceRecord) => ReactNode
}) {
  if (records.length === 0) return null
  return (
    <section className="flex flex-col gap-3">
      <h2 className="models-section-title">{title}</h2>
      <div className={GRID}>{records.map(card)}</div>
    </section>
  )
}

function CurrentModel({ label, name, record, installed, kind }: { label:string; name:string; record:ResourceRecord | null; installed:boolean | null; kind:'recognitionModel' | 'translationModel' }) {
  const { t } = useI18n()
  return <Card className="models-current">
    <span className={`models-card__icon models-card__icon--${kind === 'recognitionModel' ? 'recognition' : 'translation'}`}><ModelMark record={record} kind={kind} /></span>
    <Card.Header><Card.Description>{label}</Card.Description><Card.Title>{name}</Card.Title></Card.Header>
    {installed === null ? null : <Chip color={installed ? 'success' : 'warning'} variant="soft" size="sm">{installed ? t('modelsSettingsUi.active') : t('modelsSettingsUi.unavailable')}</Chip>}
  </Card>
}

/** 在飞 + 失败。失败的留在表里是为了让"重试"有个落点。 */
function countActive(records: readonly ResourceRecordWithRate[]): number {
  return records.filter(
    (item) => item.state === 'running' || item.state === 'cancelling' || item.state === 'failed',
  ).length
}
