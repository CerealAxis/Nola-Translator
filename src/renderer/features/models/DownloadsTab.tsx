import { Button, Card, EmptyState, ProgressBar, Table, toast } from '@heroui/react'
import { useState } from 'react'

import { resourceStateOf } from '@/bridge'
import type { ResourceRecord, ResourceRecordWithRate } from '@/bridge'
import { StatusPill } from '@/components/primitives'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { formatBytes } from './ModelCard'
import { DownloadSourceDialog } from './DownloadSourceDialog'

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
      <EmptyState className="flex flex-col items-start gap-4 py-8">
        <p className="nola-title text-foreground">{t('models.downloadsEmpty')}</p>
        <p className="nola-caption text-muted">{t('models.downloadsEmptyHint')}</p>
      </EmptyState>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <DownloadSourceDialog record={downloadTarget} onClose={() => setDownloadTarget(null)} onSelect={source => {
        const target = downloadTarget
        setDownloadTarget(null)
        if (target) void actions.models.manageResource(target.resourceId, 'install', source).catch(() => {
          toast.danger(t('models.downloadError', { name: target.name }))
        })
      }} />

      {/* `Table` is only the root; the semantic table is `Table.Content`, inside a `ScrollContainer`. */}
      <Card className="models-downloads"><Card.Content><Table>
        <Table.ScrollContainer>
          <Table.Content aria-label={t('models.tabDownloads')}>
            <Table.Header>
              <Table.Column isRowHeader>{t('nav.models')}</Table.Column>
              <Table.Column>{t('models.size')}</Table.Column>
              <Table.Column>{t('models.stateLabel')}</Table.Column>
              <Table.Column>{t('records.columnActions')}</Table.Column>
            </Table.Header>
            <Table.Body>
              {rows.map((record) => (
                <Row
                  key={record.resourceId}
                  record={record}
                  busy={busyIds.includes(record.resourceId)}
                  onRetry={() => setDownloadTarget(record)}
                />
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table></Card.Content></Card>
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
  const label = cancelling ? t('models.cancelling')
    : failed ? t('models.downloadFailed')
    : state === 'verifying' ? t('models.verifying')
    : state === 'queued' ? t('models.queued') : t('status.downloading')

  return (
    <Table.Row>
      <Table.Cell>
        <span className="nola-body-strong text-foreground">{record.name}</span>
      </Table.Cell>
      <Table.Cell><span className="nola-caption tabular whitespace-nowrap">{formatBytes(total)}</span></Table.Cell>
      <Table.Cell>
        <div className="flex min-w-0 flex-col items-start gap-[var(--space-1)]">
          <StatusPill label={label} tone={failed ? 'danger' : cancelling ? 'warning' : 'accent'} live={!failed && !cancelling} />
          {!failed && !cancelling ? <div className="flex w-full min-w-0 flex-col gap-[var(--space-1)]">
            <ProgressBar value={value} maxValue={1} className="w-full" aria-label={t('models.stateLabel')}>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <span className="nola-micro text-muted tabular">
              {t('models.progress', { percent: Math.round(value * 100) })}
              {' · '}
              {formatBytes(done)}
              {record.bytesPerSecond !== undefined ? <> · {t('models.downloadRate', { speed: formatBytes(record.bytesPerSecond) })}</> : null}
            </span>
          </div> : null}
        </div>
      </Table.Cell>
      <Table.Cell>
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          {failed ? (
            <Button
              variant="secondary"
              size="sm"
              className="rounded-[var(--radius-xl)]"
              isPending={busy}
              onPress={onRetry}
            >
              {t('models.retry')}
            </Button>
          ) : null}
            <Button
              variant="tertiary"
              size="sm"
              className="rounded-[var(--radius-xl)]"
              isDisabled={busy || cancelling || (!failed && !record.cancellable)}
              isPending={cancelling}
              onPress={() => {
                void actions.models.manageResource(record.resourceId, 'cancel').catch(() => {
                  toast.danger(t('errors.engineOperationFailed'))
                })
              }}
            >
              {t('models.cancelTask')}
            </Button>
        </div>
      </Table.Cell>
    </Table.Row>
  )
}
