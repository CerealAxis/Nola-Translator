import { useEffect } from 'react'
import { toast } from '@heroui/react'
import { stores } from '@/store'
import { useI18n } from '@/i18n'

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
        if (record.state === 'failed') toast.danger(t('models.downloadError', { name: record.name }))
        if (record.state === 'idle' && record.installed) toast.success(t('models.downloadComplete', { name: record.name }))
      }
    })
  }, [t])
  return null
}
