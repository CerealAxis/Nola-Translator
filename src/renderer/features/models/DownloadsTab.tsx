import { Progress } from '@base-ui/react/progress'
import { CircleAlert, Download, Pause, Play, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'

import { resourceStateOf } from '@/bridge'
import type { ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { notifyError, notifyRetryableFailure } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { formatBytes } from './ModelCard'
import { DownloadSourceDialog } from './DownloadSourceDialog'
import { notifyModelDownloadFailure } from './ModelDownloadNotice'

export function DownloadsTab() {
  const { t } = useI18n()
  const [downloadTarget, setDownloadTarget] = useState<ResourceRecord | null>(null)
  const resources = useStore(stores.models, (state) => state.resources)
  const busyIds = useStore(stores.models, (state) => state.busyIds)

  const rows = resources.filter(
    (item) => item.phase !== 'remove' && (item.state === 'cancelling' || (resourceStateOf(item) !== 'absent' && resourceStateOf(item) !== 'installed')),
  )

  if (rows.length === 0) {
    return (
      <Empty className="items-start px-2 py-8 text-left">
        <EmptyHeader className="items-start">
          <EmptyTitle>{t('models.downloadsEmpty')}</EmptyTitle>
          <EmptyDescription>{t('models.downloadsEmptyHint')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DownloadSourceDialog record={downloadTarget} onClose={() => setDownloadTarget(null)} onSelect={source => {
        const target = downloadTarget
        setDownloadTarget(null)
        if (target) void actions.models.manageResource(target.resourceId, 'install', source).catch(() => {
          notifyModelDownloadFailure(
            t('models.downloadFailed'),
            t('errors.downloadFailed'),
            t('errors.downloadFailedAction'),
            // The retry reports its own failure: a task that stays failed is not announced
            // again, so a silent retry would leave the user with nothing.
            () => { void actions.models.manageResource(target.resourceId, 'install', source).catch((cause: unknown) => {
              notifyRetryableFailure(t('models.installFailed'), {
                cause,
                description: t('models.downloadReasonInstall'),
              })
            }) },
          )
        })
      }} />

      <div className="models-downloads" role="list" aria-label={t('models.tabDownloads')}>
        {rows.map(record => <DownloadCard
          key={record.resourceId}
          record={record}
          busy={busyIds.includes(record.resourceId)}
          onRetry={() => {
            if (record.kind !== 'ocrModel' && record.kind !== 'inpaintModel' && record.kind !== 'detectModel') { setDownloadTarget(record); return }
            void actions.models.manageResource(record.resourceId, 'install').catch((cause: unknown) => notifyError(t('models.downloadFailed'), { cause }))
          }}
        />)}
      </div>
    </div>
  )
}

function DownloadCard({ record, busy, onRetry }: { record: ResourceRecordWithRate; busy: boolean; onRetry: () => void }) {
  const { t } = useI18n()
  const state = resourceStateOf(record)
  const failed = state === 'failed'
  const cancelling = record.state === 'cancelling'
  const paused = record.state === 'paused'
  const total = record.downloadBytes ?? record.installedBytes
  const raw = record.progress ?? 0
  const value = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw))
  const label = failed ? t('models.notInstalled')
    : paused ? t('models.paused')
    : cancelling ? t('models.cancelling')
    : state === 'verifying' ? t('models.verifying')
    : state === 'queued' ? t('models.queued') : t('status.downloading')
  const canPause = !failed && !cancelling && record.kind !== 'ocrModel' && record.kind !== 'inpaintModel' && record.kind !== 'detectModel'
  return <Card size="sm" className="model-download-card" role="listitem">
    <CardHeader className="model-download-card__header">
      <span className="model-download-card__icon" aria-hidden="true">{busy || cancelling || (!paused && !failed && state !== 'queued') ? <Spinner /> : failed ? <CircleAlert /> : paused ? <Pause /> : <Download />}</span>
      <div className="model-download-card__title">
        <CardTitle>{record.name}</CardTitle>
        <CardDescription>
          {state === 'downloading' && !paused && !cancelling ? <>{formatBytes(Math.round(total * value))} / {formatBytes(total)}{record.bytesPerSecond !== undefined && <> · {t('models.downloadRate', { speed: formatBytes(record.bytesPerSecond) })}</>}</> : label}
        </CardDescription>
      </div>
      <CardAction className="model-download-card__actions">
        {failed && <Tooltip><TooltipTrigger render={<Button variant="bare" size="icon-sm" disabled={busy} aria-label={t('models.retry')} onClick={onRetry} />}><RotateCcw /></TooltipTrigger><TooltipContent>{t('models.retry')}</TooltipContent></Tooltip>}
        {canPause && <Tooltip><TooltipTrigger render={<Button variant="bare" size="icon-sm" disabled={busy} aria-label={t(paused ? 'models.resume' : 'models.pause')} onClick={() => {
          void actions.models.manageResource(record.resourceId, paused ? 'resume' : 'pause').catch((cause: unknown) => notifyError(t('errors.engineOperationFailed'), { cause }))
        }} />}>{paused ? <Play /> : <Pause />}</TooltipTrigger><TooltipContent>{t(paused ? 'models.resume' : 'models.pause')}</TooltipContent></Tooltip>}
        <Tooltip><TooltipTrigger render={<Button variant="bare" size="icon-sm" disabled={busy || cancelling || (!failed && !record.cancellable)} aria-label={t('models.cancelTask')} onClick={() => {
          void actions.models.manageResource(record.resourceId, 'cancel').catch((cause: unknown) => notifyError(t('errors.engineOperationFailed'), { cause }))
        }} />}><X /></TooltipTrigger><TooltipContent>{t('models.cancelTask')}</TooltipContent></Tooltip>
      </CardAction>
    </CardHeader>
    {!failed && !cancelling && <CardContent>
      <Progress.Root value={value} min={0} max={1} aria-label={t('models.progress', { percent: Math.round(value * 100) })}>
        <Progress.Track className="model-download-card__track"><Progress.Indicator className="model-download-card__indicator" /></Progress.Track>
      </Progress.Root>
    </CardContent>}
  </Card>
}
