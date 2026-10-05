/**
 * Download tasks: one `Table` row each, a `ProgressBar` where a task is in flight, and an
 * `EmptyState` when idle.
 *
 * There is no speed column because no rate field exists to fill one — `ResourceRecord` carries
 * only `progress` and `downloadBytes`. The progress column therefore reports the two facts it
 * actually has: the percentage, and written bytes over total.
 *
 * The row carries an `Alert` and a retry button, the message comes from `errors.*`, and
 * the `state.error` diagnostic string stays in the console.
 */

import { Alert, Button, Card, EmptyState, ProgressBar, Table } from '@heroui/react'

import { resourceStateOf } from '@/bridge'
import type { ResourceRecord } from '@/bridge'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { formatBytes } from './ModelCard'

export function DownloadsTab() {
  const { t } = useI18n()
  const resources = useStore(stores.models, (state) => state.resources)
  const busyIds = useStore(stores.models, (state) => state.busyIds)
  const error = useStore(stores.models, (state) => state.error)

  const rows = resources.filter(
    (item) => resourceStateOf(item) !== 'absent' && resourceStateOf(item) !== 'installed',
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
                />
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table></Card.Content></Card>
    </div>
  )
}

function Row({ record, busy }: { record: ResourceRecord; busy: boolean }) {
  const { t } = useI18n()
  const state = resourceStateOf(record)
  const failed = state === 'failed'
  const total = record.downloadBytes ?? record.installedBytes
  const raw = record.progress ?? 0
  const value = failed ? 0 : Math.min(1, Math.max(0, raw > 1 ? raw / 100 : raw))
  const done = Math.round(total * value)

  return (
    <Table.Row>
      <Table.Cell>
        <span className="nola-body-strong text-foreground">{record.name}</span>
      </Table.Cell>
      <Table.Cell>
        {failed ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title className="nola-caption">
                {t('models.downloadFailed')}
              </Alert.Title>
              <Alert.Description className="nola-micro">
                {t('errors.downloadFailedAction')}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <ProgressBar value={value} maxValue={1} className="w-full" aria-label={t('models.stateLabel')}>
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <span className="nola-micro text-muted tabular">
              {t('models.progress', { percent: Math.round(value * 100) })}
              {' · '}
              {formatBytes(done)}
              {' / '}
              {formatBytes(total)}
            </span>
          </div>
        )}
      </Table.Cell>
      <Table.Cell>
        <span className="nola-caption text-muted">
          {state === 'failed'
            ? t('models.downloadFailed')
            : state === 'verifying'
              ? t('models.verifying')
              : state === 'queued'
                ? t('models.queued')
                : t('status.downloading')}
        </span>
      </Table.Cell>
      <Table.Cell>
        <div className="flex items-center gap-2">
          {failed ? (
            <Button
              variant="tertiary"
              size="sm"
              className="rounded-[6px]"
              isPending={busy}
              onPress={() => {
                void actions.models.manageResource(record.resourceId, 'install').catch(() => undefined)
              }}
            >
              {t('models.retry')}
            </Button>
          ) : (
            <Button
              variant="tertiary"
              size="sm"
              className="rounded-[6px]"
              isDisabled={!record.cancellable}
              onPress={() => {
                void actions.models.manageResource(record.resourceId, 'cancel').catch(() => undefined)
              }}
            >
              {t('models.cancel')}
            </Button>
          )}
        </div>
      </Table.Cell>
    </Table.Row>
  )
}
