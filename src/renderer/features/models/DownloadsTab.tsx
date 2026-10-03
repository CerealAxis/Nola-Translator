/**
 * 下载任务。`Table` 一行一个任务，进度列用 `ProgressBar`（有进度值的等待），
 * 空闲时 `EmptyState`。
 *
 * **没有速度列。** `ResourceRecord` 与 `EngineEvent` 都不带速率字段（只有 `progress` 与
 * `downloadBytes`），写一列永远空着的"速度"，或者编一个 MB/s 出来，都是在骗人。
 * 进度列因此给的是真实的两件事：百分比，以及已落盘字节 / 总量。
 * 需要速度的话是 `bridge/types.ts` 的缺口（那是 A2 的文件），见交付报告。
 *
 * 失败的任务**留在表里**而不是弹走：弹走了用户就找不到"重试"在哪。失败行内给 `Alert`
 * 与重试按钮，错误文案走 `errors.*`，`state.error` 那个诊断串只进 console。
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

      {/*
        `Table` 本身只是个带样式的 div，真正的 RAC `Table` 是 `Table.Content`，
        外层还要套 `ScrollContainer`（HeroUI 陷阱 9：这几个包装层不能换成 div）。
      */}
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
