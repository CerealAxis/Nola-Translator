import { Progress } from '@base-ui/react/progress'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { resourceStateOf } from '@/bridge'
import type { ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import { notifyError, notifyRetryableFailure } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
          <EmptyTitle className="nola-title">{t('models.downloadsEmpty')}</EmptyTitle>
          <EmptyDescription className="nola-caption">{t('models.downloadsEmptyHint')}</EmptyDescription>
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
            t('models.downloadError', { name: target.name }),
            t('errors.downloadFailed'),
            t('errors.downloadFailedAction'),
            // The retry reports its own failure: a task that stays failed is not announced
            // again, so a silent retry would leave the user with nothing.
            () => { void actions.models.manageResource(target.resourceId, 'install', source).catch((cause: unknown) => {
              notifyRetryableFailure(t('models.installFailed'), { cause })
            }) },
          )
        })
      }} />

      <Card className="models-downloads"><CardContent>
        {/* The table hooks carry the geometry: the column widths and the wrapping rules live in models.css. */}
        <div className="table-root table-root--primary">
          <div className="table__scroll-container">
            <table className="table__content" aria-label={t('models.tabDownloads')}>
              <thead className="table__header">
                <tr>
                  <th scope="col" className="table__column">{t('nav.models')}</th>
                  <th scope="col" className="table__column">{t('models.size')}</th>
                  <th scope="col" className="table__column">{t('models.stateLabel')}</th>
                  <th scope="col" className="table__column">{t('records.columnActions')}</th>
                </tr>
              </thead>
              <tbody className="table__body">
                {rows.map((record) => (
                  <Row
                    key={record.resourceId}
                    record={record}
                    busy={busyIds.includes(record.resourceId)}
                    onRetry={() => setDownloadTarget(record)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent></Card>
    </div>
  )
}

function Row({ record, busy, onRetry }: { record: ResourceRecordWithRate; busy: boolean; onRetry: () => void }) {
  const { t } = useI18n()
  const state = resourceStateOf(record)
  const failed = state === 'failed'
  const cancelling = record.state === 'cancelling'
  const total = record.downloadBytes ?? record.installedBytes
  const raw = record.progress ?? 0
  const value = Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw))
  const done = Math.round(total * value)
  /*
   * A failed download is reported by the notice that says what went wrong, so the row
   * says what is true about the model instead of repeating the failure in a pill.
   */
  const label = failed ? t('models.notInstalled')
    : cancelling ? t('models.cancelling')
    : state === 'verifying' ? t('models.verifying')
    : state === 'queued' ? t('models.queued') : t('status.downloading')
  const tone = failed ? 'neutral' : cancelling ? 'warning' : 'accent'

  return (
    <tr className="table__row">
      <td role="rowheader" className="table__cell">
        <span className="nola-body-strong text-foreground">{record.name}</span>
      </td>
      <td className="table__cell"><span className="nola-caption tabular whitespace-nowrap">{formatBytes(total)}</span></td>
      <td className="table__cell">
        <div className="flex min-w-0 flex-col items-start gap-[var(--space-1)]">
          <StatusPill label={label} tone={tone} live={!failed && !cancelling} />
          {!failed && !cancelling ? <div className="flex w-full min-w-0 flex-col gap-[var(--space-1)]">
            <Progress.Root className="w-full" value={value} min={0} max={1} aria-label={t('models.stateLabel')}>
              <Progress.Track className="relative h-2 w-full overflow-hidden rounded-sm bg-default">
                <Progress.Indicator className="h-full rounded-sm bg-accent transition-[width] duration-[var(--dur-enter)]" />
              </Progress.Track>
            </Progress.Root>
            <span className="nola-micro text-muted tabular">
              {t('models.progress', { percent: Math.round(value * 100) })}
              {' · '}
              {formatBytes(done)}
              {record.bytesPerSecond !== undefined ? <> · {t('models.downloadRate', { speed: formatBytes(record.bytesPerSecond) })}</> : null}
            </span>
          </div> : null}
        </div>
      </td>
      <td className="table__cell">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          {failed ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onRetry}
            >
              {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {t('models.retry')}
            </Button>
          ) : null}
            <Button
              variant="tertiary"
              size="sm"
              disabled={busy || cancelling || (!failed && !record.cancellable)}
              onClick={() => {
                void actions.models.manageResource(record.resourceId, 'cancel').catch((cause: unknown) => {
                  notifyError(t('errors.engineOperationFailed'), { cause })
                })
              }}
            >
              {cancelling ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {t('models.cancelTask')}
            </Button>
        </div>
      </td>
    </tr>
  )
}
