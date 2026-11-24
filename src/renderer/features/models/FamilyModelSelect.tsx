import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import QwenAvatar from '@lobehub/icons/es/Qwen/components/Avatar'
import AlibabaAvatar from '@lobehub/icons/es/Alibaba/components/Avatar'
import HunyuanAvatar from '@lobehub/icons/es/Hunyuan/components/Avatar'
import UnslothAvatar from '@lobehub/icons/es/Unsloth/components/Avatar'
import BilibiliAvatar from '@lobehub/icons/es/Bilibili/components/Avatar'
import MetaAvatar from '@lobehub/icons/es/Meta/components/Avatar'

import type { ResourceRecord } from '@/bridge'
import { useI18n } from '@/i18n'
import { modelImportEntry } from '../../../shared/model-import-catalog'
import type { InferenceEngine } from '../../../shared/model-engines'
import type { ComputeSettings, ComputeSnapshot } from '../../../shared/compute'
import { formatBytes } from './ModelCard'
import { modelFit, type ModelFit } from './model-fit'
import { visualModelName, visualSeriesOf } from './visual-model-display'
import { hasModelMark, ModelMark } from './modelBrand'

const FIT_COLORS: Record<ModelFit, 'success' | 'warning' | 'danger'> = {
  recommended: 'success', tryable: 'warning', notRecommended: 'danger',
}

function FitChip({ record, engine, compute, computeSnapshot }: { record: ResourceRecord; engine: InferenceEngine; compute: ComputeSettings; computeSnapshot?: ComputeSnapshot | null }) {
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
  if (visualSeriesOf(record)) return visualModelName(record)
  const files = modelImportEntry(record.resourceId)?.sources.huggingface?.files ?? []
  const gguf = files.find(file => file.path.toLowerCase().endsWith('.gguf') && !file.path.toLowerCase().includes('mmproj'))
  return gguf ? `${repositoryName(record)}/${gguf.path.split('/').at(-1)}` : repositoryName(record)
}

function PublisherAvatar({ record }: { record: ResourceRecord }) {
  if (!hasModelMark(record)) return null
  const publisher = repositoryName(record).split('/')[0]?.toLowerCase()
  const AvatarIcon = publisher === 'qwen' ? QwenAvatar
    : publisher === 'funaudiollm' ? AlibabaAvatar
      : publisher === 'tencent' ? HunyuanAvatar
        : publisher === 'unsloth' || publisher === 'unslothai' ? UnslothAvatar
          : publisher === 'indexteam' ? BilibiliAvatar
            : publisher === 'facebook' ? MetaAvatar : null
  return <span className="models-family-dialog__publisher" aria-hidden="true">{AvatarIcon ? <AvatarIcon size={26} /> : <ModelMark record={record} kind={record.kind} size={22} brandColors />}</span>
}

export function FamilyModelSelect({ selected, records, installedIds, engine, compute, computeSnapshot, onChange }: {
  selected: ResourceRecord
  records: readonly ResourceRecord[]
  installedIds?: ReadonlySet<string>
  engine?: InferenceEngine
  compute: ComputeSettings
  computeSnapshot?: ComputeSnapshot | null
  onChange: (resourceId: string) => void
}) {
  const { t } = useI18n()
  const label = t('offline.modelChoice')
  const isInstalled = (record: ResourceRecord) => installedIds?.has(record.resourceId) ?? record.installed
  const badges = (record: ResourceRecord) => <>
    {isInstalled(record) && <Badge variant="success">{t('models.installed')}</Badge>}
    {engine && <FitChip record={record} engine={engine} compute={compute} computeSnapshot={computeSnapshot} />}
  </>
  return <div className="select models-family-dialog__model-select">
    <Select value={selected.resourceId} aria-label={label} onValueChange={key => { if (typeof key === 'string') onChange(key) }}>
      <Label>{label}</Label>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue>
          <span className="models-family-dialog__selected-model">
            <PublisherAvatar record={selected} />
            <span>{modelDisplayName(selected)}</span>
            <small>{formatBytes(selected.downloadBytes ?? selected.installedBytes)}</small>
            <span className="models-family-dialog__selected-model-badges">{badges(selected)}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        <SelectGroup className="models-family-dialog__model-list">
          {records.map(record => <SelectItem key={record.resourceId} value={record.resourceId} disabled={isInstalled(record)} label={modelDisplayName(record)}>
            <PublisherAvatar record={record} />
            <span className="models-family-dialog__model-text">
              <span>{modelDisplayName(record)}</span>
              <small>{formatBytes(record.downloadBytes ?? record.installedBytes)}</small>
            </span>
            <span className="models-family-dialog__model-badges">{badges(record)}</span>
          </SelectItem>)}
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
}
