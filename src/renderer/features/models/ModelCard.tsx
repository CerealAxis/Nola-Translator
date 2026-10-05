import { modelEngines, type InferenceEngine } from '../../../shared/model-engines'

import type { ReactNode } from 'react'
import { Button, Card, Chip, ProgressBar, Skeleton } from '@heroui/react'
import { Check, Download, Trash2, X } from 'lucide-react'
import './models.css'

import { RECOGNITION_MODEL_IDS, resourceStateOf } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ResourceRecord, ResourceState } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import { useI18n } from '@/i18n'
import { ModelMark } from './modelBrand'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/**
 * Byte counts for humans. A space between number and unit keeps the two readable as
 * separate tokens.
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
 * Parameter count read off the model identifier, `null` when the name states none. SenseVoice
 * states no count, so it is answered with `Small` rather than left blank.
 *
 * The digits need a non-alphanumeric boundary before them: without it `M2M100` matches at `2M`
 * and reports 2M instead of 418M.
 */
export function paramsOf(record: ResourceRecord): string | null {
  const match = /(?:^|[^0-9A-Za-z])(\d+(?:\.\d+)?)\s?([BM])(?![A-Za-z])/i.exec(record.name) ?? /(\d+(?:\.\d+)?)([bm])/.exec(record.resourceId)
  if (!match) return record.name.toLowerCase().includes('sensevoice') ? 'Small' : null
  return `${match[1]}${match[2].toUpperCase()}`
}

/** Quantisation tier read off the model identifier: the three Hy-MT2 tiers, Qwen's NF4. */
export function quantizationOf(record: ResourceRecord): string | null {
  const id = record.resourceId.toLowerCase()
  if (id.includes('q4-k-m')) return 'Q4_K_M'
  if (id.includes('q3-k-m')) return 'Q3_K_M'
  if (id.includes('iq2-m')) return 'UD-IQ2_M'
  if (id.includes('nf4')) return 'NF4'
  if (id.includes('qwen3-asr')) return 'NF4'
  return null
}

/** The card's meta line: size first, then parameters and quantisation when the id states them. */
export function factsOf(record: ResourceRecord): string[] {
  const facts: string[] = [formatBytes(record.downloadBytes ?? record.installedBytes)]
  const params = paramsOf(record)
  if (params) facts.push(params)
  const quant = quantizationOf(record)
  if (quant) facts.push(quant)
  return facts
}

/**
 * The settings patch that makes this record the default, or `null` when it cannot be one.
 *
 * Any installed translation model qualifies: `translation.localModelId` is a free-form id the
 * engine routes by id, so the Hy-MT2 tiers, M2M100 and a hub GGUF share one path. Recognition
 * ids come from the engine's resource table, so one it cannot resolve is rejected here.
 */
export function defaultTargetOf(record: ResourceRecord): AppSettingsPatch | null {
  const id = record.resourceId
  if (record.kind === 'recognitionModel') {
    if (!isOneOf(id, RECOGNITION_MODEL_IDS)) return null
    return { recognition: { modelId: id as (typeof RECOGNITION_MODEL_IDS)[number] } }
  }
  // Also pin provider to 'local': becoming the default means this is the one running locally.
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

/** Shared catalog card. A `ResourceRecord` carries no verdict field, so installability is the caller's call. */
export interface ModelCardProps {
  record: ResourceRecord
  /** The engine is installing, removing or cancelling this record. */
  busy: boolean
  /** Already the default for recognition or translation, which is why no "set default" is offered. */
  isDefault: boolean
  /** Whether this record can become the default; when not, that button is left out entirely. */
  canBeDefault: boolean;
  /** Hub result: whether it can be installed. False disables the install button. */
  installable?: boolean
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
  onSetDefault: () => void
  /** Secondary action for the whole card (the hub result's "view details"). */
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
       * The status pills get a row of their own rather than sharing the title's width: the model
       * name is the first thing on the card to be read, and state is the secondary fact.
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
 * Progress bar plus percentage. A queued task has no progress to report yet and renders as 0;
 * everything else uses `progress`, which may arrive as a fraction or already as a percentage.
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
          Removal stays ghost and only turns danger-coloured on hover: a screen of red buttons
          makes scanning the list tense, and the irreversible click is already unambiguous.
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
 * Skeleton. Its geometry has to match the real card or the layout jumps when data lands: a 56px
 * icon block, four text lines, then a full-width button.
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
