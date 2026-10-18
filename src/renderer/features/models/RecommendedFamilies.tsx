import { useState } from 'react'
import { Button, Card, Chip, Label, ListBox, Modal, Select, Tooltip } from '@heroui/react'
import HuggingFace from '@lobehub/icons/es/HuggingFace/components/Color'
import ModelScope from '@lobehub/icons/es/ModelScope/components/Color'
import QwenAvatar from '@lobehub/icons/es/Qwen/components/Avatar'
import AlibabaAvatar from '@lobehub/icons/es/Alibaba/components/Avatar'
import HunyuanAvatar from '@lobehub/icons/es/Hunyuan/components/Avatar'
import UnslothAvatar from '@lobehub/icons/es/Unsloth/components/Avatar'
import BilibiliAvatar from '@lobehub/icons/es/Bilibili/components/Avatar'
import MetaAvatar from '@lobehub/icons/es/Meta/components/Avatar'
import { Check, Download, X } from 'lucide-react'

import { resourceStateOf } from '@/bridge'
import type { ModelDownloadSource, ResourceRecord } from '@/bridge'
import { useI18n } from '@/i18n'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import { downloadSourcesFor } from '../../../shared/model-download-sources'
import { modelEngines } from '../../../shared/model-engines'
import type { ComputeSettings, ComputeSnapshot, RuntimeSnapshot } from '../../../shared/compute'
import { BUILTIN_DESCRIPTION_KEYS, factsOf, formatBytes, paramsOf } from './ModelCard'
import { isEngineAvailable } from './engine-availability'
import { modelFit, type ModelFit } from './model-fit'
import { ModelMark } from './modelBrand'

export type RecommendedFamily = 'qwen' | 'sensevoice' | 'funasr' | 'vibevoice' | 'mimo' | 'hymt2' | 'index' | 'other'

export function familyOf(record: ResourceRecord): RecommendedFamily {
  const id = record.resourceId
  if (id.startsWith('qwen3-asr-')) return 'qwen'
  if (id.startsWith('sensevoice-')) return 'sensevoice'
  if (id.startsWith('fun-asr-')) return 'funasr'
  if (id.startsWith('vibevoice-asr-')) return 'vibevoice'
  if (id.startsWith('mimo-v2.5-asr-')) return 'mimo'
  if (id.startsWith('hy-mt2-')) return 'hymt2'
  if (id.startsWith('index-translate-')) return 'index'
  return 'other'
}

const FAMILY_NAMES: Record<RecommendedFamily, string> = {
  qwen: 'Qwen3-ASR',
  sensevoice: 'SenseVoiceSmall',
  funasr: 'Fun-ASR',
  vibevoice: 'VibeVoice-ASR',
  mimo: 'MiMo-V2.5-ASR',
  hymt2: 'Hy-MT2',
  index: 'Index-Translate',
  other: 'M2M100',
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
    <Card.Header>
      <span className={`models-card__icon models-card__icon--${first.kind === 'recognitionModel' ? 'recognition' : 'translation'}`}>
        <ModelMark record={first} kind={first.kind} />
      </span>
      <div className="models-card__identity">
        <Card.Title>{FAMILY_NAMES[family]}</Card.Title>
        <Card.Description>{t(`models.familyDescriptions.${family}`)}</Card.Description>
      </div>
    </Card.Header>
    <Card.Content><div className="models-card__status">
      {engines.map(engine => <Chip key={engine} size="sm" variant="soft">{engine === 'llama' ? 'llama.cpp' : engine === 'crisp' ? 'CrispASR' : 'PyTorch'}</Chip>)}
      {records.some(record => record.installed) ? <Chip size="sm" variant="soft" color="success">{t('models.installed')}</Chip> : null}
    </div></Card.Content>
    <Card.Footer><Button variant="secondary" onPress={onOpen}>{t('models.openDetails')}</Button></Card.Footer>
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
  return <Chip size="sm" color={FIT_COLORS[fit]} variant="soft" aria-label={t(`models.${fit}`)}>{t(`models.${fit}`)}</Chip>
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
  const selectedDescription = t(BUILTIN_DESCRIPTION_KEYS[selected.resourceId] ?? 'models.noDescription')

  return <Modal.Backdrop isOpen onOpenChange={open => { if (!open) onClose() }} className="z-overlay">
    <Modal.Container size="lg" scroll="inside" placement="center">
      <Modal.Dialog className="models-family-dialog">
        <Modal.CloseTrigger aria-label={t('common.close')} className="models-source-dialog__close"><X aria-hidden="true" /></Modal.CloseTrigger>
        <Modal.Header>
          <Modal.Heading>{FAMILY_NAMES[family]}</Modal.Heading>
          <p className="models-family-dialog__intro">{familyDescription}</p>
        </Modal.Header>
        <Modal.Body className="models-family-dialog__body">
          <div className="models-family-dialog__filters">
            <section aria-label={t('modelConfig.engine')}>
              <Label className="models-family-dialog__label">{t('modelConfig.engine')}</Label>
              <div className="models-family-dialog__choices">{engines.map(option => {
                const available = isEngineAvailable(option, runtimes?.local ?? null)
                const button = <Button key={option} variant="secondary" isDisabled={!available} aria-pressed={option === engine} onPress={() => {
                  const first = records.find(record => modelEngines(record).includes(option))
                  if (first) { setEngine(option); setParameters(paramsOf(first) ?? ''); setSelectedId(first.resourceId); setSource('huggingface') }
                }}>{option === 'llama' ? 'llama.cpp' : option === 'crisp' ? 'CrispASR' : 'PyTorch'}</Button>
                return available ? button : <Tooltip key={option} delay={250}>
                  <Tooltip.Trigger className="inline-flex">{button}</Tooltip.Trigger>
                  <Tooltip.Content className="settings-row__tooltip z-overlay whitespace-normal">{t('models.engineUnavailable')}</Tooltip.Content>
                </Tooltip>
              })}</div>
            </section>
            <section aria-label={t('models.parameterScale')}>
              <Label className="models-family-dialog__label">{t('models.parameterScale')}</Label>
              <div className="models-family-dialog__choices">{parameterOptions.map(option => <Button key={option} variant="secondary" aria-pressed={option === parameters} onPress={() => {
                const first = engineRecords.find(record => (paramsOf(record) ?? '') === option)
                if (first) { setParameters(option); setSelectedId(first.resourceId); setSource('huggingface') }
              }}>{option || selected.name}</Button>)}</div>
            </section>
          </div>
          <Select fullWidth value={selected.resourceId} onChange={key => { if (typeof key === 'string') { setSelectedId(key); setSource('huggingface') } }} aria-label={t('offline.modelChoice')} className="models-family-dialog__model-select">
            <Label>{t('offline.modelChoice')}</Label>
            <Select.Trigger><Select.Value><span className="models-family-dialog__selected-model"><PublisherAvatar record={selected} /><span>{modelDisplayName(selected)}</span><small>{formatBytes(selected.downloadBytes ?? selected.installedBytes)}</small><span className="models-family-dialog__selected-model-badges">{selected.installed ? <Chip size="sm" color="success" variant="soft">{t('models.installed')}</Chip> : null}<FitChip record={selected} engine={engine} compute={compute} computeSnapshot={computeSnapshot} /></span></span></Select.Value><Select.Indicator /></Select.Trigger>
            <Select.Popover><ListBox className="models-family-dialog__model-list">{filtered.map(record => <ListBox.Item key={record.resourceId} id={record.resourceId} isDisabled={record.installed} textValue={modelDisplayName(record)}>
              <PublisherAvatar record={record} />
              <span className="models-family-dialog__model-text"><span>{modelDisplayName(record)}</span><small>{formatBytes(record.downloadBytes ?? record.installedBytes)}</small></span>
              <span className="models-family-dialog__model-badges">{record.installed ? <Chip size="sm" color="success" variant="soft">{t('models.installed')}</Chip> : null}<FitChip record={record} engine={engine} compute={compute} computeSnapshot={computeSnapshot} /></span>
              <ListBox.ItemIndicator />
            </ListBox.Item>)}</ListBox></Select.Popover>
          </Select>
          <section className="models-family-dialog__selection" aria-label={t('models.details')}>
            <Label className="models-family-dialog__label">{t('models.details')}</Label>
            <p>{selected.name} · {factsOf(selected).join(' · ')}</p>
            {(family === 'hymt2' || family === 'index') && selectedDescription !== familyDescription ? <p>{selectedDescription}</p> : null}
          </section>
          <section aria-label={t('models.downloadSources.title')}>
            <Label className="models-family-dialog__label">{t('models.downloadSources.title')}</Label>
            <div className="models-family-dialog__sources">
              {sources.map(option => <Button key={option.source} variant="secondary" aria-pressed={selectedSource === option.source} onPress={() => setSource(option.source)}>
                {option.source === 'modelscope' ? <ModelScope aria-hidden="true" /> : <HuggingFace aria-hidden="true" />}{t(option.labelKey)}
              </Button>)}
            </div>
          </section>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onPress={() => onManualDownload(selected)}>{t('offline.manualDownload')}</Button>
          {inFlight ? <Button variant="outline" isDisabled={!selected.cancellable} onPress={() => onCancel(selected)}>{t('models.cancel')}</Button>
            : selected.installed ? <Button variant="secondary" isDisabled><Check aria-hidden="true" className="size-4" />{t('models.installed')}</Button>
              : <Button isDisabled={sources.length === 0} isPending={busyIds.includes(selected.resourceId)} onPress={() => onInstall(selected, selectedSource)}><Download aria-hidden="true" className="size-4" />{t(state === 'failed' ? 'models.retry' : 'models.install')}</Button>}
        </Modal.Footer>
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>
}
