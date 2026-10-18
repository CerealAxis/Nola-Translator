import { useEffect } from 'react'
import { toast } from '@heroui/react'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { useI18n } from '@/i18n'

export function notifyModelDownloadFailure(title: string, description: string, actionLabel: string, retry: () => void) {
  toast.danger(title, {
    description,
    actionProps: {
      children: actionLabel,
      variant: 'tertiary',
      size: 'sm',
      className: 'rounded-[var(--radius-xl)]',
      onPress: retry,
    },
  })
}

/** Observe terminal transitions outside the models page so navigation cannot hide notifications. */
export function ModelDownloadNotice() {
  const { t } = useI18n()
  useEffect(() => {
    let previous = stores.models.getState().resources
    return stores.models.subscribe(() => {
      const current = stores.models.getState().resources
      if (current === previous) return
      const before = new Map(previous.map(record => [record.resourceId, record]))
      previous = current
      for (const record of current) {
        const prior = before.get(record.resourceId)
        const wasInstalling = prior?.state === 'running' &&
          (prior.phase === 'download' || prior.phase === 'verify' || prior.phase === 'install')
        if (!wasInstalling) continue
        if (record.state === 'failed') notifyFailure(record, t)
        if (record.state === 'idle' && record.installed) toast.success(t('models.downloadComplete', { name: record.name }))
      }
    })
  }, [t])
  return null
}

function notifyFailure(record: Pick<ResourceRecord, 'resourceId' | 'name'>, t: ReturnType<typeof useI18n>['t']) {
  notifyModelDownloadFailure(
    t('models.downloadError', { name: record.name }),
    t('errors.downloadFailed'),
    t('errors.downloadFailedAction'),
    () => { void actions.models.manageResource(record.resourceId, 'install').catch(() => undefined) },
  )
}
