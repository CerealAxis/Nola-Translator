import { useEffect } from 'react'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { useI18n } from '@/i18n'
import { notifyError, notifyInfo, notifySuccess, notifyWarning } from '@/components/primitives/notify'

/**
 * A download that stopped. The notice stays until it is dealt with: it carries the
 * way out, and a retry button that vanishes before the user reads it is no way out.
 */
export function notifyModelDownloadFailure(title: string, description: string, actionLabel: string, retry: () => void) {
  notifyError(title, {
    description,
    action: { label: actionLabel, onPress: retry },
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
        const startedNow = prior?.state !== 'running' && prior?.state !== 'cancelling' &&
          record.state === 'running' && (record.phase === 'resolve' || record.phase === 'download')
        if (startedNow) {
          notifyInfo(t('models.downloadStarted', { name: record.name }))
          continue
        }
        /*
         * A removal is not an installation: the engine answers the request right away and
         * reports the failure later as a resource that is still there. The card carries no
         * mark of its own, so this notice is the only report of that failure.
         */
        const wasRemoving = prior?.state === 'running' && prior.phase === 'remove'
        if (wasRemoving) {
          if (record.state === 'failed') {
            notifyError(t('modelsSettingsUi.removeFailed'), { description: record.errorCode ?? undefined })
          }
          continue
        }
        const wasInstalling = (prior?.state === 'running' &&
          (prior.phase === 'download' || prior.phase === 'verify' || prior.phase === 'install')) || prior?.state === 'cancelling'
        if (!wasInstalling) continue
        if (record.state === 'failed') notifyFailure(record, t)
        if (record.state === 'idle' && record.installed) notifySuccess(t('models.downloadComplete', { name: record.name }))
        if (record.state === 'idle' && !record.installed) notifyWarning(t('models.downloadCancelled', { name: record.name }))
      }
    })
  }, [t])
  return null
}

function notifyFailure(record: Pick<ResourceRecord, 'resourceId' | 'name' | 'errorCode'>, t: ReturnType<typeof useI18n>['t']) {
  const reasonKey = record.errorCode === 'networkUnavailable' ? 'models.downloadReasonNetwork'
    : record.errorCode === 'resourceNotFound' ? 'models.downloadReasonNotFound'
      : record.errorCode === 'resourceUnavailable' ? 'models.downloadReasonUnavailable'
        : record.errorCode === 'integrityCheckFailed' ? 'models.downloadReasonIntegrity'
          : record.errorCode === 'installFailed' ? 'models.downloadReasonInstall' : null
  notifyModelDownloadFailure(
    t('models.downloadError', { name: record.name }),
    reasonKey ? t(reasonKey) : t('models.downloadReasonWithCode', { code: record.errorCode ?? 'unknown' }),
    t('errors.downloadFailedAction'),
    () => {
      // The retry reports its own failure: a record that stays in the failed state is
      // not announced again, so a silent retry would leave the user with nothing.
      void actions.models.manageResource(record.resourceId, 'install').catch((cause: unknown) => {
        notifyError(t('models.installFailed'), { cause })
      })
    },
  )
}
