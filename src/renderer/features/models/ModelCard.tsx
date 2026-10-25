import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@base-ui/react/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { configurationOf } from '../../../shared/model-capabilities'
import { modelEngines, type InferenceEngine } from '../../../shared/model-engines'

import type { ReactNode } from 'react'
import { Check, Download, Trash2, X } from 'lucide-react'
import './models.css'

import { resourceStateOf } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ResourceRecord, ResourceState } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { ModelMark } from './modelBrand'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export const BUILTIN_DESCRIPTION_KEYS: Readonly<Record<string, TranslationKey>> = {
  'qwen3-asr-1.7b-hf': 'models.descriptions.qwenAsr17',
  'qwen3-asr-0.6b-hf': 'models.descriptions.qwenAsr06',
  'sensevoice-small': 'models.descriptions.senseVoice',
  'hy-mt2-1.8b-q4-k-m': 'models.descriptions.hyMt2Q4',
  'hy-mt2-1.8b-q3-k-m': 'models.descriptions.hyMt2Q3',
  'hy-mt2-1.8b-iq2-m': 'models.descriptions.hyMt2Iq2',
  'hy-mt2-7b-q4-k-m': 'models.descriptions.hyMt2SevenB',
  'm2m100-418m': 'models.descriptions.m2m100',
  'index-translate-2b-q4-k-m': 'models.descriptions.indexTranslate2b',
  'index-translate-2b-bf16': 'models.descriptions.indexTranslate2bBf16',
  'index-translate-2b-fp8': 'models.descriptions.indexTranslate2bFp8',
  'index-translate-2b-fp4': 'models.descriptions.indexTranslate2bFp4',
  'index-translate-9b-q4-k-m': 'models.descriptions.indexTranslate9b',
  'index-translate-35b-a3b-q4-k-m': 'models.descriptions.indexTranslate35b',
  'qwen35-0.8b-q4-k-m': 'models.descriptions.qwen35Small',
  'qwen35-2b-q4-k-m': 'models.descriptions.qwen35Small',
  'qwen35-4b-q4-k-m': 'models.descriptions.qwen35Small',
  'tts-kokoro-crisp-q8-0': 'models.descriptions.kokoroTts',
  'tts-piper-crisp-en-gb-cori-medium': 'models.descriptions.piperTts',
  'tts-cosyvoice3-crisp-0.5b-q4-k': 'models.descriptions.cosyvoice3Tts',
}

export function descriptionKeyOf(record: ResourceRecord): TranslationKey | undefined {
  const builtIn = BUILTIN_DESCRIPTION_KEYS[record.resourceId]
  if (builtIn) return builtIn
  if (record.kind !== 'ttsModel') return undefined
  if (record.resourceId.includes('customvoice')) return 'models.descriptions.qwenTtsCustomVoice'
  if (record.resourceId.includes('voicedesign')) return 'models.descriptions.qwenTtsVoiceDesign'
  return 'models.descriptions.qwenTtsBase'
}

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
  if (id.includes('q4-k')) return 'Q4_K'
  if (id.includes('q3-k-m')) return 'Q3_K_M'
  if (id.includes('iq2-m')) return 'UD-IQ2_M'
  if (id.includes('q8-0')) return 'Q8_0'
  if (id.includes('nf4')) return 'NF4'
  if (id.includes('bf16')) return 'BF16'
  if (id.includes('f16')) return 'F16'
  if (id.includes('fp8')) return 'FP8'
  if (id.includes('fp4')) return 'FP4'
  if (id.includes('qwen3-asr') && record.provider === 'qwen3-asr') return 'NF4'
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
 * Both tasks require saved capabilities. Installation and engine compatibility are checked
 * by the caller before offering the default action.
 */
export function defaultTargetOf(record: ResourceRecord): AppSettingsPatch | null {
  const id = record.resourceId
  if (record.kind === 'ttsModel') return { synthesis: { modelId: id, voice: '' } }
  if (record.kind === 'recognitionModel') {
    if (!configurationOf(record)) return null
    return { recognition: { modelId: id, provider: 'local' } }
  }
  if (!configurationOf(record)) return null
  // Also pin provider to 'local': becoming the default means this is the one running locally.
  return { translation: { localModelId: id, provider: 'local' } }
}

export function isDefaultOf(record: ResourceRecord, settings: AppSettings | null): boolean {
  if (!settings) return false
  if (record.kind === 'ttsModel') return settings.synthesis?.modelId === record.resourceId
  if (!configurationOf(record)) return false
  return (
    (settings.recognition.provider === 'local' && settings.recognition.modelId === record.resourceId) ||
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
  /** Whether the selected inference engine can use this ready model as the default. */
  canBeDefault: boolean;
  /** Shown beside a disabled default action when the selected loader cannot load this model. */
  defaultDisabledReason?: string;
  /** A confirmed missing loader prevents this installed model from being enabled. */
  loaderUnavailableReason?: string;
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
  defaultDisabledReason,
  loaderUnavailableReason,
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
  const removal = record.phase === 'remove' && (state === 'removing' || state === 'failed')
  const inFlight = state === 'queued' || state === 'downloading' || state === 'verifying'
  const descriptionKey = descriptionKeyOf(record)
  const description = descriptionKey ? t(descriptionKey) : record.description || descriptionFallback

  const card = <Card data-loader-unavailable={loaderUnavailableReason ? 'true' : undefined} className={`models-card h-full ${className}`}>
      {/*
       * The status pills get a row of their own rather than sharing the title's width: the model
       * name is the first thing on the card to be read, and state is the secondary fact.
       */}
      <CardHeader>
        <CardAction><span aria-hidden="true" className={`models-card__icon models-card__icon--${record.kind === 'translationModel' ? 'translation' : 'recognition'}`}>
          <ModelMark record={record} kind={record.kind} />
        </span></CardAction>
          <CardTitle className="card__title">{record.name}</CardTitle>
          {descriptionLoading ? <div className="models-card__description-loading" aria-hidden="true">
            <Skeleton className="h-3 w-full rounded-[6px]" />
            <Skeleton className="h-3 w-3/4 rounded-[6px]" />
          </div> : <CardDescription className="card__description">{description}</CardDescription>}
          <span className="models-card__meta tabular">{metadata ?? factsOf(record).join(' · ')}</span>
    </CardHeader>
      <CardContent className="card__content">
      <div className="models-card__status">
        <Badge>{t('modelsSettingsUi.localModels')}</Badge>
        {isDefault && record.installed ? <Badge  variant="accent">{t('modelsSettingsUi.default')}</Badge> : null}
        {removal && state === 'removing' ? <StatusPill label={t('modelsSettingsUi.removing')} tone="accent" /> : record.kind !== 'ttsModel' && record.installed && !configurationOf(record) ? <StatusPill label={t('modelConfig.pending')} tone="warning" /> : <StatePill state={state} installed={record.installed} />}
        {(supportedEngines ?? modelEngines(record)).map(engine => <Badge key={engine} >{engine === 'pytorch' ? 'PyTorch' : engine === 'crisp' ? 'CrispASR' : 'llama.cpp'}</Badge>)}
        {record.resourceId.startsWith('hub:local/') ? <Badge >{t('modelsSettingsUi.localImport')}</Badge> : null}
      </div>

      {inFlight ? <ProgressLine record={record} state={state} /> : null}
      </CardContent>

      <CardFooter className="card__footer">
        <Actions
          state={state}
          removal={removal}
          busy={busy}
          installable={installable}
          cancellable={record.cancellable}
          isDefault={isDefault}
          canBeDefault={canBeDefault}
          defaultDisabledReason={defaultDisabledReason}
          onInstall={onInstall}
          onCancel={onCancel}
          onRemove={onRemove}
          onSetDefault={onSetDefault}
        />
        {footer && !removal ? <div className="models-card__details">{footer}</div> : null}
      </CardFooter>
    </Card>

  if (!loaderUnavailableReason) return card
  return <Tooltip>
    <TooltipTrigger delay={250} render={<div />} role="group" tabIndex={0} aria-label={record.name} className="h-full min-w-0">
      {card}
    </TooltipTrigger>
    <TooltipContent  role="tooltip" className="settings-row__tooltip z-popup max-w-96 whitespace-normal">
      {loaderUnavailableReason}
    </TooltipContent>
  </Tooltip>
}

/**
 * The state the card shows. A failure is not one of them: the notice tells the user what
 * went wrong, and the card keeps saying what is true about the model. A removal that
 * failed leaves the model in place, so it still counts as installed.
 */
function StatePill({ state, installed }: { state: ResourceState; installed: boolean }) {
  const { t } = useI18n()
  if (state === 'installed') return <Badge variant="success">{t('models.installed')}</Badge>
  if (state === 'failed') return installed
    ? <Badge variant="success">{t('models.installed')}</Badge>
    : <StatusPill label={t('models.notInstalled')} />
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
      <Progress.Root
        value={value}
        max={1}
        className="w-full"
        aria-label={t('models.stateLabel')}
      >
        <Progress.Track className="relative h-2 w-full overflow-hidden rounded-sm bg-default">
          <Progress.Indicator className="h-full rounded-sm bg-accent transition-[width] duration-[var(--dur-enter)]" />
        </Progress.Track>
      </Progress.Root>
      <span className="nola-micro text-muted tabular">
        {t('models.progress', { percent: Math.round(value * 100) })}
      </span>
    </div>
  )
}

interface ActionsProps {
  state: ResourceState
  removal: boolean
  busy: boolean
  installable: boolean
  cancellable: boolean
  isDefault: boolean
  canBeDefault: boolean
  defaultDisabledReason?: string
  onInstall: () => void
  onCancel: () => void
  onRemove: () => void
  onSetDefault: () => void
}

function Actions({
  state,
  removal,
  busy,
  installable,
  cancellable,
  isDefault,
  canBeDefault,
  defaultDisabledReason,
  onInstall,
  onCancel,
  onRemove,
  onSetDefault,
}: ActionsProps) {
  const { t } = useI18n()

  if (removal) {
    return <Button variant="danger" disabled={busy || state === 'removing'} aria-busy={busy || state === 'removing'}  onClick={onRemove}>{busy || state === 'removing' ? <Spinner /> : null}
      {t(state === 'removing' ? 'modelsSettingsUi.removing' : 'models.remove')}
    </Button>
  }

  if (state === 'failed') {
    return (
      <Button disabled={busy} aria-busy={busy}
        variant="default"
        size="sm"

        onClick={onInstall}
      >{busy ? <Spinner /> : null}
        {t('models.retry')}
      </Button>
    )
  }

  if (state === 'queued' || state === 'downloading' || state === 'verifying') {
    return (
      <Button
        variant="secondary"
        size="sm"

        disabled={!cancellable}
        onClick={onCancel}
      >
        <X aria-hidden="true" className="size-4" />
        {t('models.cancel')}
      </Button>
    )
  }

  if (state === 'installed') {
    return (
      <>
        {isDefault ? <Button variant="secondary" disabled><Check aria-hidden="true" className="size-4" />{t('modelsSettingsUi.current')}</Button> : null}
        {canBeDefault && !isDefault ? (
          <Button disabled={busy} aria-busy={busy}
            variant="default"
            size="sm"

            onClick={onSetDefault}
          >{busy ? <Spinner /> : null}
            {t('models.setDefault')}
          </Button>
        ) : null}
        {!canBeDefault && !isDefault && defaultDisabledReason ? (
          <Tooltip>
            <TooltipTrigger delay={250} render={<div />} className="block min-w-0 flex-1" tabIndex={0}>
              <Button variant="secondary" size="sm" className="h-10 w-full rounded-xl" disabled>
                {t('models.setDefault')}
              </Button>
            </TooltipTrigger>
            <TooltipContent  role="tooltip" className="settings-row__tooltip z-popup max-w-96 whitespace-normal">
              {defaultDisabledReason}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {/* Destructive removal stays visibly identifiable through its soft-danger fill. */}
        <Button disabled={busy} aria-busy={busy}
          variant="danger"

          aria-label={t('models.remove')}
          size="icon"
          className="models-card__remove"

          onClick={onRemove}
        >{busy ? <Spinner /> : null}
          <Trash2 aria-hidden="true" className="size-4" />
        </Button>
      </>
    )
  }

  return (
    <Button
      variant="default"
      size="sm"
      data-onboarding="download-model"

      disabled={(!installable) || (busy)} aria-busy={busy}

      onClick={onInstall}
    >{busy ? <Spinner /> : null}
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
      <CardHeader>
        <CardAction><Skeleton className="size-10 rounded-lg" /></CardAction>
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-4 w-3/4 rounded-[6px]" />
          <Skeleton className="h-3 w-1/2 rounded-[6px]" />
          <Skeleton className="h-3 w-full rounded-[6px]" />
          <Skeleton className="h-3 w-3/4 rounded-[6px]" />
        </div>
      </CardHeader>
      <CardContent><Skeleton className="h-5 w-16 rounded-md" /></CardContent>
      <CardFooter className="mt-auto flex-col">
        <Skeleton className="h-10 w-full rounded-xl" />
        {withDetails ? <Skeleton className="h-8 w-full rounded-[6px]" /> : null}
      </CardFooter>
    </Card>
  )
}
