import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'

import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogCloseButton, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardAction, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { useState } from 'react'
import QwenAvatar from '@lobehub/icons/es/Qwen/components/Avatar'
import AlibabaAvatar from '@lobehub/icons/es/Alibaba/components/Avatar'
import HunyuanAvatar from '@lobehub/icons/es/Hunyuan/components/Avatar'
import UnslothAvatar from '@lobehub/icons/es/Unsloth/components/Avatar'
import BilibiliAvatar from '@lobehub/icons/es/Bilibili/components/Avatar'
import MetaAvatar from '@lobehub/icons/es/Meta/components/Avatar'
import { Check, Download } from 'lucide-react'

import { resourceStateOf } from '@/bridge'
import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { useI18n } from '@/i18n'
import { notifyError, notifyWarning } from '@/components/primitives/notify'
import { actions } from '@/store'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import { modelEngines } from '../../../shared/model-engines'
import type { InferenceEngine } from '../../../shared/model-engines'
import type { ComputeSettings, ComputeSnapshot, RuntimeSnapshot } from '../../../shared/compute'
import { descriptionKeyOf, factsOf, formatBytes, paramsOf, quantizationOf } from './ModelCard'
import { isEngineAvailable } from './engine-availability'
import { estimatedVramMb, modelFit, type ModelFit } from './model-fit'
import { type RecommendedFamily } from './modelFamily'
import { ModelMark } from './modelBrand'
import { DownloadSourceTabs } from './DownloadSourceTabs'

const FAMILY_NAMES: Record<RecommendedFamily, string> = {
  qwen: 'Qwen3-ASR',
  qwen35: 'Qwen3.5',
  sensevoice: 'SenseVoiceSmall',
  funasr: 'Fun-ASR',
  vibevoice: 'VibeVoice-ASR',
  mimo: 'MiMo-V2.5-ASR',
  tts: 'Qwen3-TTS',
  kokoro: 'Kokoro-82M',
  piper: 'Piper',
  cosyvoice3: 'CosyVoice3',
  hymt2: 'Hy-MT2',
  index: 'Index-Translate',
  other: 'M2M100',
}

function engineLabel(engine: InferenceEngine): string {
  return engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch'
}

export interface RecommendedFamilyCardProps {
  family: RecommendedFamily
  records: readonly ResourceRecord[]
  onOpen: () => void
}

export function RecommendedFamilyCard({ family, records, onOpen }: RecommendedFamilyCardProps) {
  const { t } = useI18n()
  const first = records[0]
  const engines = [...new Set(records.flatMap(modelEngines))]
  return <Card className="models-card models-family-card h-full">
    <CardHeader>
      <CardAction><span aria-hidden="true" className={`models-card__icon models-card__icon--${first.kind === 'translationModel' ? 'translation' : 'recognition'}`}>
        <ModelMark record={first} kind={first.kind} />
      </span></CardAction>
        <CardTitle className="card__title">{FAMILY_NAMES[family]}</CardTitle>
        <CardDescription className="card__description">{t(`models.familyDescriptions.${family}`)}</CardDescription>
    </CardHeader>
    <CardContent className="card__content"><div className="models-card__status">
      <Badge>{t('modelsSettingsUi.localModels')}</Badge>
      {engines.map(engine => <Badge key={engine} >{engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch'}</Badge>)}
      {records.some(record => record.installed) ? <Badge  variant="success">{t('models.installed')}</Badge> : null}
    </div></CardContent>
    <CardFooter className="card__footer"><Button data-onboarding={`model-family-${first.kind}`} onClick={onOpen}>{t('modelsSettingsUi.startConfiguration')}</Button></CardFooter>
  </Card>
}

export interface RecommendedFamilyDialogProps {
  family: RecommendedFamily
  records: readonly ResourceRecord[]
  compute: ComputeSettings
  computeSnapshot?: ComputeSnapshot | null
  runtimes: RuntimeSnapshot | null
  busyIds: readonly string[]
  onClose: () => void
  onInstall: (record: ResourceRecord, source: ModelDownloadSource) => void
  onCancel: (record: ResourceRecord) => void
  onManualDownload: (record: ResourceRecord) => void
}

const FIT_COLORS: Record<ModelFit, 'success' | 'warning' | 'danger'> = {
  recommended: 'success', tryable: 'warning', notRecommended: 'danger',
}

function FitChip({ record, engine, compute, computeSnapshot }: { record: ResourceRecord; engine: Parameters<typeof modelFit>[1]; compute: ComputeSettings; computeSnapshot?: ComputeSnapshot | null }) {
  const { t } = useI18n()
  const fit = modelFit(record, engine, compute, computeSnapshot)
  return <Badge variant={FIT_COLORS[fit]}  aria-label={t(`models.${fit}`)}>{t(`models.${fit}`)}</Badge>
}

function repositoryName(record: ResourceRecord): string {
  const url = modelImportEntry(record.resourceId)?.sources.huggingface?.repositoryUrl
  if (!url) return record.name
  const path = new URL(url).pathname.split('/').filter(Boolean)
  return path.length >= 2 ? `${path[0]}/${path[1]}` : record.name
}

function modelDisplayName(record: ResourceRecord): string {
  const files = modelImportEntry(record.resourceId)?.sources.huggingface?.files ?? []
  const gguf = files.find(file => file.path.toLowerCase().endsWith('.gguf') && !file.path.toLowerCase().includes('mmproj'))
  return gguf ? `${repositoryName(record)}/${gguf.path.split('/').at(-1)}` : repositoryName(record)
}

function PublisherAvatar({ record }: { record: ResourceRecord }) {
  const publisher = repositoryName(record).split('/')[0]?.toLowerCase()
  const AvatarIcon = publisher === 'qwen' ? QwenAvatar
    : publisher === 'funaudiollm' ? AlibabaAvatar
      : publisher === 'tencent' ? HunyuanAvatar
        : publisher === 'unsloth' || publisher === 'unslothai' ? UnslothAvatar
          : publisher === 'indexteam' ? BilibiliAvatar
            : publisher === 'facebook' ? MetaAvatar : null
  return <span className="models-family-dialog__publisher" aria-hidden="true">{AvatarIcon ? <AvatarIcon size={26} /> : <ModelMark record={record} kind={record.kind} size={22} />}</span>
}

export function RecommendedFamilyDialog({ family, records, compute, computeSnapshot, runtimes, busyIds, onClose, onInstall, onCancel, onManualDownload }: RecommendedFamilyDialogProps) {
  const { t } = useI18n()
  const [engine, setEngine] = useState(modelEngines(records[0])[0])
  const [parameters, setParameters] = useState(paramsOf(records[0]) ?? '')
  const [selectedId, setSelectedId] = useState(records[0]?.resourceId ?? '')
  const [source, setSource] = useState<ModelDownloadSource>('huggingface')
  const engines = [...new Set(records.flatMap(modelEngines))]
  const engineRecords = records.filter(record => modelEngines(record).includes(engine))
  const parameterOptions = [...new Set(engineRecords.map(record => paramsOf(record) ?? ''))]
  const filtered = engineRecords.filter(record => (paramsOf(record) ?? '') === parameters)
  const selected = filtered.find(record => record.resourceId === selectedId) ?? filtered[0]
  const state = resourceStateOf(selected)
  const entry = modelImportEntry(selected.resourceId)
  const sources = downloadSourcesFor(selected.resourceId).filter(option => Boolean(entry?.sources[option.source]))
  const selectedSource = sources.some(option => option.source === source) ? source : sources[0]?.source ?? 'huggingface'
  const inFlight = state === 'queued' || state === 'downloading' || state === 'verifying'
  const familyDescription = t(`models.familyDescriptions.${family}`)
  const selectedDescription = t(descriptionKeyOf(selected) ?? 'models.noDescription')
  const estimatedVram = estimatedVramMb(selected, engine, compute)
  const estimatedVramGb = estimatedVram === null ? null : estimatedVram / 1024
  const quantization = quantizationOf(selected)
    ?? (selected.provider === 'qwen3-asr' && engine === 'pytorch'
      ? compute.quantization === 'none' ? 'BF16' : compute.quantization === '8bit' ? 'INT8' : 'NF4'
      : engine === 'pytorch' ? 'BF16' : null)
  const deviceTier = estimatedVramGb === null ? 'unknown'
    : estimatedVramGb <= 2 ? 'integrated'
      : estimatedVramGb <= 8 ? 'discrete' : 'flagship'

  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>

      <DialogContent className="models-family-dialog modal__dialog" data-onboarding="model-detail" data-model-kind={records[0].kind}>
        <DialogCloseButton data-onboarding="model-detail-close" aria-label={t('common.close')} />
        <DialogHeader>
          <DialogTitle>{FAMILY_NAMES[family]}</DialogTitle>
          <p className="models-family-dialog__intro">{familyDescription}</p>
        </DialogHeader>
        <div className="models-family-dialog__body">
          <div className="models-family-dialog__filters">
            <section data-onboarding="model-engine" aria-label={t('modelConfig.engine')}>
              <Label className="models-family-dialog__label">{t('modelConfig.engine')}</Label>
              <TabsRoot value={engine} onValueChange={value => {
                const first = records.find(record => modelEngines(record).includes(value))
                if (first) { setEngine(value); setParameters(paramsOf(first) ?? ''); setSelectedId(first.resourceId); setSource('huggingface') }
              }}><TabsList className="models-family-dialog__choices">
                {engines.map(option => {
                  const available = isEngineAvailable(option, runtimes?.local ?? null)
                  const button = <TabsTrigger value={option}>{engineLabel(option)}</TabsTrigger>
                  return available ? button : <Tooltip key={option}>
                    <TooltipTrigger delay={250} render={button} />
                    <TooltipContent role="tooltip" className="settings-row__tooltip z-popup whitespace-normal">{t('models.engineUnavailable', { engine: engineLabel(option) })}</TooltipContent>
                  </Tooltip>
                })}
              </TabsList></TabsRoot>
            </section>
            <section data-onboarding="model-scale" aria-label={t('models.parameterScale')}>
              <Label className="models-family-dialog__label">{t('models.parameterScale')}</Label>
              <TabsRoot value={parameters} onValueChange={value => {
                const first = engineRecords.find(record => (paramsOf(record) ?? '') === value)
                if (first) { setParameters(value); setSelectedId(first.resourceId); setSource('huggingface') }
              }}><TabsList className="models-family-dialog__choices">
                {parameterOptions.map(option => <TabsTrigger key={option} value={option}>{option || selected.name}</TabsTrigger>)}
              </TabsList></TabsRoot>
            </section>
          </div>
          <div className="select models-family-dialog__model-select" data-onboarding="model-version"><Select value={selected.resourceId} onValueChange={key => { if (typeof key === 'string') { setSelectedId(key); setSource('huggingface') } }} aria-label={t('offline.modelChoice')}>
            <Label>{t('offline.modelChoice')}</Label>
            <SelectTrigger className="w-full" aria-label={t('offline.modelChoice')}><SelectValue><span className="models-family-dialog__selected-model"><PublisherAvatar record={selected} /><span>{modelDisplayName(selected)}</span><small>{formatBytes(selected.downloadBytes ?? selected.installedBytes)}</small><span className="models-family-dialog__selected-model-badges">{selected.installed ? <Badge variant="success" >{t('models.installed')}</Badge> : null}{family === 'tts' ? null : <FitChip record={selected} engine={engine} compute={compute} computeSnapshot={computeSnapshot} />}</span></span></SelectValue></SelectTrigger>
            <SelectContent alignItemWithTrigger={false} align="start"><SelectGroup className="models-family-dialog__model-list">{filtered.map(record => <SelectItem key={record.resourceId} value={record.resourceId} disabled={record.installed} label={modelDisplayName(record)}>
              <PublisherAvatar record={record} />
              <span className="models-family-dialog__model-text"><span>{modelDisplayName(record)}</span><small>{formatBytes(record.downloadBytes ?? record.installedBytes)}</small></span>
              <span className="models-family-dialog__model-badges">{record.installed ? <Badge variant="success" >{t('models.installed')}</Badge> : null}{family === 'tts' ? null : <FitChip record={record} engine={engine} compute={compute} computeSnapshot={computeSnapshot} />}</span>

            </SelectItem>)}</SelectGroup></SelectContent>
          </Select></div>
          <section className="models-family-dialog__selection" aria-label={t('models.details')}>
            <Label className="models-family-dialog__label">{t('models.details')}</Label>
            <p>{selected.name} · {factsOf(selected).join(' · ')}</p>
            <p>{t('models.variantOverview', {
              loader: engineLabel(engine),
              quantization: quantization ?? t('models.quantizationUnknown'),
              vram: estimatedVramGb === null ? t('models.vramUnknown') : `${estimatedVramGb.toFixed(estimatedVramGb >= 10 ? 0 : 1)} GB`,
              device: t(`models.deviceTier.${deviceTier}`),
            })}</p>
            {(family === 'hymt2' || family === 'index' || family === 'tts' || family === 'kokoro'
              || family === 'piper' || family === 'cosyvoice3' || family === 'qwen35') && selectedDescription !== familyDescription
              ? <p>{selectedDescription}</p> : null}
          </section>
          <section data-onboarding="model-sources" aria-label={t('models.downloadSources.title')}>
            <Label className="models-family-dialog__label">{t('models.downloadSources.title')}</Label>
            <DownloadSourceTabs
              options={sources}
              value={selectedSource}
              onValueChange={setSource}
              ariaLabel={t('models.downloadSources.title')}
              getLabel={option => t(option.labelKey)}
              dataOnboarding="model-download-source"
            />
          </section>
        </div>
        <DialogFooter data-onboarding="model-download-actions">
          <Button variant="secondary" onClick={() => onManualDownload(selected)}>{t('offline.manualDownload')}</Button>
          {inFlight ? <Button variant="outline" disabled={!selected.cancellable} onClick={() => onCancel(selected)}>{t('models.cancel')}</Button>
            : selected.installed ? <Button variant="secondary" disabled><Check aria-hidden="true" className="size-4" />{t('models.installed')}</Button>
              : <Button disabled={(sources.length === 0) || (busyIds.includes(selected.resourceId))} aria-busy={busyIds.includes(selected.resourceId)}  onClick={() => {
                if (!isEngineAvailable(engine, runtimes?.local ?? null)) {
                  // The loader is missing, so the download would only end in a second failure.
                  notifyWarning(t('models.runtimeMissingTitle'), {
                    description: t('models.engineUnavailable', { engine: engineLabel(engine) }),
                    action: { label: t('runtime.install'), onPress: () => {
                      void actions.settings.openRuntimeSettings(engine === 'pytorch' ? 'engine' : engine).catch((error: unknown) => {
                        notifyError(t('errors.runtimeSettingsFailed'), { cause: error })
                      })
                    } },
                  })
                  return
                }
                onClose()
                onInstall(selected, selectedSource)
              }}>{busyIds.includes(selected.resourceId) ? <Spinner /> : null}<Download aria-hidden="true" className="size-4" />{t(state === 'failed' ? 'models.retry' : 'models.install')}</Button>}
        </DialogFooter>
      </DialogContent>

  </Dialog>
}
