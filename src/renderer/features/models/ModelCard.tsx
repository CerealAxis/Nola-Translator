import { modelEngines, type InferenceEngine } from '../../../shared/model-engines'
/** Shared catalog card. Visuals follow DESIGN v3; state and actions follow the bridge record. */

import type { ReactNode } from 'react'
import { Button, Card, Chip, ProgressBar, Skeleton } from '@heroui/react'
import { Check, Download, Trash2, X } from 'lucide-react'
import './models.css'

import { RECOGNITION_MODEL_IDS, resourceStateOf } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ResourceRecord, ResourceState } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import { useI18n } from '@/i18n'
import { ModelMark } from './modelBrand'

// -- 纯函数：事实格式化 --------------------------------------------------------

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * 字节数给人读。数字带单位是 copy 纪律第 7 条：`43 秒` 不是 `43s`，`1.13 GB` 不写 `1.13GB`。
 * 这串是数据不是文案，所以不经过 i18n（i18n 层存的是带中文的句子）。
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${BYTE_UNITS[0]}`
  const exponent = Math.min(
    BYTE_UNITS.length - 1,
    Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))),
  )
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 ? 0 : value >= 100 ? 0 : 1
  return `${value.toFixed(digits)} ${BYTE_UNITS[exponent]}`
}

/**
 * 参数量，从模型标识里读。不是所有模型都有（SenseVoice 这种就没有），读不到就返回 null。
 *
 * 数字前面必须是非字母边界，否则 "M2M100" 会在 "2M" 上就匹配上，报出 2M 而不是 418M。
 */
export function paramsOf(record: ResourceRecord): string | null {
  const match = /(?:^|[^0-9A-Za-z])(\d+(?:\.\d+)?)\s?([BM])(?![A-Za-z])/i.exec(record.name) ?? /(\d+(?:\.\d+)?)([bm])/.exec(record.resourceId)
  if (!match) return record.name.toLowerCase().includes('sensevoice') ? 'Small' : null
  return `${match[1]}${match[2].toUpperCase()}`
}

/** 量化档，从模型标识里读。Hy-MT2 三档与 Qwen 的 NF4 都有，m2m100 没有。 */
export function quantizationOf(record: ResourceRecord): string | null {
  const id = record.resourceId.toLowerCase()
  if (id.includes('q4-k-m')) return 'Q4_K_M'
  if (id.includes('q3-k-m')) return 'Q3_K_M'
  if (id.includes('iq2-m')) return 'UD-IQ2_M'
  if (id.includes('nf4')) return 'NF4'
  if (id.includes('qwen3-asr')) return 'NF4'
  return null
}

/** 详情抽屉里用的全部事实。抽成纯函数是为了能单独测。 */
export function factsOf(record: ResourceRecord): string[] {
  const facts: string[] = [formatBytes(record.downloadBytes ?? record.installedBytes)]
  const params = paramsOf(record)
  if (params) facts.push(params)
  const quant = quantizationOf(record)
  if (quant) facts.push(quant)
  return facts
}

// -- 默认模型 -----------------------------------------------------------------

/**
 * 这条记录能不能被设成默认，返回对应的 patch；不能就返回 null。
 *
 * **翻译模型不再挑档位，任何已装的翻译模型都有槽位。** 以前这里拿
 * `HYMT2_MODEL_IDS` 过滤，于是 M2M100 能装能跑却没有槽位，「设为默认」只能返回
 * null（给一个按下去会静默失败的按钮比不给按钮更糟）。现在 `translation.localModelId`
 * 是「已安装的本地翻译模型」的裸字符串指针，引擎按 id 路由到对应 loader，
 * 三档 Hy-MT2、M2M100、从 Hub 装的 GGUF 走的是同一条路。
 *
 * 识别模型那边没有这个问题：`recognition.modelId` 的取值由引擎的资源表决定，
 * 目录里认不出来的 id 设下去也加载不了，所以仍按 `RECOGNITION_MODEL_IDS` 过滤。
 */
export function defaultTargetOf(record: ResourceRecord): AppSettingsPatch | null {
  const id = record.resourceId
  if (record.kind === 'recognitionModel') {
    if (!isOneOf(id, RECOGNITION_MODEL_IDS)) return null
    return { recognition: { modelId: id as (typeof RECOGNITION_MODEL_IDS)[number] } }
  }
  // 顺带把 provider 拨到 local：设默认的含义就是"这条就是本地在跑的那一个"。
  return { translation: { localModelId: id, provider: 'local' } }
}

export function isDefaultOf(record: ResourceRecord, settings: AppSettings | null): boolean {
  if (!settings) return false
  return (
    settings.recognition.modelId === record.resourceId ||
    (settings.translation.provider === 'local' && settings.translation.localModelId === record.resourceId)
  )
}

function isOneOf(value: string, allowed: readonly string[]): boolean {
  return allowed.some((item) => item === value)
}

// -- 组件 ---------------------------------------------------------------------

/** Hub 搜索的结果没有"能不能装"这个字段，所以由上层算好后传进来。 */
export interface ModelCardProps {
  record: ResourceRecord
  /** 引擎正在 install / remove / cancel 这条记录。 */
  busy: boolean
  /** 当前是否是识别或翻译的默认模型。是了就不给"设为默认"。 */
  isDefault: boolean
  /** 这条记录能不能被设成默认。不能（例如识别模型认不出的 id）就不给那个按钮。 */
  canBeDefault: boolean;
  /** Hub 结果：能不能安装。false 时禁用安装按钮，并把记录自带的理由显示出来。 */
  installable?: boolean
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
  onSetDefault: () => void
  /** 卡片整体的次级动作（HF 搜索的"查看详情"）。 */
  footer?: ReactNode
  className?: string
  metadata?: ReactNode
  descriptionLoading?: boolean
  descriptionFallback?: string
  supportedEngines?: InferenceEngine[]
}

export function ModelCard({
  record,
  busy,
  isDefault,
  canBeDefault,
  installable = true,
  onInstall,
  onCancel,
  onRemove,
  onSetDefault,
  footer,
  className = '',
  metadata,
  descriptionLoading = false,
  descriptionFallback = '',
  supportedEngines,
}: ModelCardProps) {
  const { t } = useI18n()
  const state: ResourceState = resourceStateOf(record)
  const inFlight = state === 'queued' || state === 'downloading' || state === 'verifying'

  return (
    <Card className={`models-card h-full ${className}`}>
      {/*
       * 状态胶囊单独占一行，不跟标题抢宽度。
       * 之前它们并排，标题被压到只剩 "Qwen3-ASR 1.7B · ..." 这种没法辨认的长度 ——
       * 卡片上最先要读的就是"这是哪个模型"，状态反而是次要信息。
       */}
      <Card.Header>
        <span className={`models-card__icon models-card__icon--${record.kind === 'recognitionModel' ? 'recognition' : 'translation'}`}>
          <ModelMark record={record} kind={record.kind} />
        </span>
        <div className="models-card__identity">
          <Card.Title>{record.name}</Card.Title>
          {descriptionLoading ? <div className="models-card__description-loading" aria-hidden="true">
            <Skeleton className="h-3 w-full rounded-[6px]" />
            <Skeleton className="h-3 w-3/4 rounded-[6px]" />
          </div> : <Card.Description>{record.description || descriptionFallback}</Card.Description>}
          <span className="models-card__meta tabular">{metadata ?? factsOf(record).join(' · ')}</span>
        </div>
      </Card.Header>
      <Card.Content>
      <div className="models-card__status">
        {isDefault && record.installed ? <Chip size="sm" variant="soft" color="accent">{t('modelsSettingsUi.default')}</Chip> : null}
        <StatePill state={state} />
        {(supportedEngines ?? modelEngines(record)).map(engine => <Chip key={engine} size="sm" variant="soft">{engine === 'pytorch' ? 'PyTorch' : 'llama.cpp'}</Chip>)}
      </div>

      {inFlight ? <ProgressLine record={record} state={state} /> : null}
      </Card.Content>

      <Card.Footer>
        <Actions
          state={state}
          busy={busy}
          installable={installable}
          cancellable={record.cancellable}
          isDefault={isDefault}
          canBeDefault={canBeDefault}
          onInstall={onInstall}
          onCancel={onCancel}
          onRemove={onRemove}
          onSetDefault={onSetDefault}
        />
        {footer ? <div className="models-card__details">{footer}</div> : null}
      </Card.Footer>
    </Card>
  )
}

function StatePill({ state }: { state: ResourceState }) {
  const { t } = useI18n()
  if (state === 'installed') return <StatusPill label={t('models.installed')} tone="success" />
  if (state === 'failed') return <StatusPill label={t('models.downloadFailed')} tone="danger" />
  if (state === 'verifying') return <StatusPill label={t('models.verifying')} tone="accent" live />
  if (state === 'queued') return <StatusPill label={t('models.queued')} tone="warning" />
  if (state === 'downloading') return <StatusPill label={t('status.downloading')} tone="accent" live />
  return <StatusPill label={t('models.notInstalled')} />
}

/**
 * 进度条 + 百分比。`phase` 决定百分比按什么算：
 * 排队时引擎还没有进度可言，按 0 呈现；其余按 `progress`。
 */
function ProgressLine({ record, state }: { record: ResourceRecord; state: ResourceState }) {
  const { t } = useI18n()
  const raw = record.progress ?? 0
  const value = state === 'queued' ? 0 : Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw))

  return (
    <div className="flex flex-col gap-1">
      <ProgressBar
        value={value}
        maxValue={1}
        className="w-full"
        aria-label={t('models.stateLabel')}
      >
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>
      <span className="nola-micro text-muted tabular">
        {t('models.progress', { percent: Math.round(value * 100) })}
      </span>
    </div>
  )
}

interface ActionsProps {
  state: ResourceState
  busy: boolean
  installable: boolean
  cancellable: boolean
  isDefault: boolean
  canBeDefault: boolean
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
  onSetDefault: () => void
}

function Actions({
  state,
  busy,
  installable,
  cancellable,
  isDefault,
  canBeDefault,
  onInstall,
  onCancel,
  onRemove,
  onSetDefault,
}: ActionsProps) {
  const { t } = useI18n()

  if (state === 'failed') {
    return (
      <Button
        variant="primary"
        size="sm"
        className="rounded-[6px]"
        isPending={busy}
        onPress={onInstall}
      >
        {t('models.retry')}
      </Button>
    )
  }

  if (state === 'queued' || state === 'downloading' || state === 'verifying') {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-[6px]"
        isDisabled={!cancellable}
        onPress={onCancel}
      >
        <X aria-hidden="true" className="size-4" />
        {t('models.cancel')}
      </Button>
    )
  }

  if (state === 'installed') {
    return (
      <>
        {isDefault ? <Button variant="secondary" isDisabled><Check aria-hidden="true" className="size-4" />{t('modelsSettingsUi.current')}</Button> : null}
        {canBeDefault && !isDefault ? (
          <Button
            variant="outline"
            size="sm"
            className="rounded-[6px]"
            isPending={busy}
            onPress={onSetDefault}
          >
            {t('models.setDefault')}
          </Button>
        ) : null}
        {/*
          移除是 ghost + hover 才浮现 danger 色。整屏红会让"看一眼列表"变成一件紧张的事，
          而不可逆的那一下用户已经知道是哪一下了（DESIGN 第 8 节 danger 按钮）。
        */}
        <Button
          variant="ghost"
          isIconOnly
          aria-label={t('models.remove')}
          size="sm"
          className="models-card__remove text-muted hover:bg-danger-soft hover:text-danger-soft-foreground"
          isPending={busy}
          onPress={onRemove}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </>
    )
  }

  return (
    <Button
      variant="primary"
      size="sm"
      className="rounded-full"
      isDisabled={!installable}
      isPending={busy}
      onPress={onInstall}
    >
      <Download aria-hidden="true" className="size-4" />
      {t('models.install')}
    </Button>
  )
}

/**
 * 骨架。形状必须与真实卡片一致（DESIGN 第 10.3 节），否则加载完成时布局会跳：
 * 图标方块 40px + 两行文字 + 一条按钮。
 */
export function ModelCardSkeleton({ withDetails = false }: { withDetails?: boolean }) {
  return (
    <Card className={`models-card h-full ${withDetails ? 'models-card--hub' : ''}`}>
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 shrink-0 rounded-[12px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-4 w-3/4 rounded-[6px]" />
          <Skeleton className="h-3 w-1/2 rounded-[6px]" />
          <Skeleton className="h-3 w-full rounded-[6px]" />
          <Skeleton className="h-3 w-3/4 rounded-[6px]" />
        </div>
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
      <div className="mt-auto flex flex-col gap-2">
        <Skeleton className="h-10 w-full rounded-[10px]" />
        {withDetails ? <Skeleton className="h-8 w-full rounded-[6px]" /> : null}
      </div>
    </Card>
  )
}
