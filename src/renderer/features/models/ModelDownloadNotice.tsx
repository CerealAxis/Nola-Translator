import { useEffect } from 'react'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { useI18n } from '@/i18n'
import { notifyInfo, notifyRetryableFailure, notifySuccess, notifyWarning, type NotifyOptions } from '@/components/primitives/notify'
import { modelManagementPath, settingsPath } from '@/routes'
import { supportErrorCodeForCause } from '../../../shared/error-catalog'

const suppressedStartNotices = new Set<string>()
const reportedRemoveFailures = new Set<string>()

export function suppressNextDownloadStartNotice(resourceId: string) {
  suppressedStartNotices.add(resourceId)
  return () => { suppressedStartNotices.delete(resourceId) }
}

/**
 * A download that stopped. The user can start it again from the page, so the notice only has
 * to say what went wrong and leaves on its own.
 */
export function notifyModelDownloadFailure(t: ReturnType<typeof useI18n>['t'], retry: () => void, options: Pick<NotifyOptions, 'description' | 'cause' | 'supportCode'> = {}) {
  notifyRetryableFailure(t('models.downloadFailed'), {
    ...options,
    action: { label: t('errors.downloadFailedAction'), onPress: retry },
  })
}

export function notifyModelRemoveFailure(record: Pick<ResourceRecord, 'resourceId' | 'name'>, t: ReturnType<typeof useI18n>['t'], cause?: unknown): void {
  if (reportedRemoveFailures.has(record.resourceId)) return
  reportedRemoveFailures.add(record.resourceId)
  notifyRetryableFailure(t('modelsSettingsUi.removeFailed'), {
    cause,
    action: {
      label: t('modelsSettingsUi.retryRemove'),
      onPress: () => {
        reportedRemoveFailures.delete(record.resourceId)
        void actions.models.manageResource(record.resourceId, 'remove').catch(error => {
          notifyModelRemoveFailure(record, t, error)
        })
      },
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
      const after = new Map(current.map(record => [record.resourceId, record]))
      for (const prior of before.values()) {
        if (prior.state === 'running' && prior.phase === 'remove' && !after.has(prior.resourceId)) {
          reportedRemoveFailures.delete(prior.resourceId)
          notifySuccess(t('modelsSettingsUi.removeComplete', { name: prior.name }))
        }
      }
      for (const record of current) {
        const prior = before.get(record.resourceId)
        const startedNow = prior?.state !== 'running' && prior?.state !== 'paused' && prior?.state !== 'cancelling' &&
          record.state === 'running' && (record.phase === 'resolve' || record.phase === 'download')
        if (startedNow) {
          if (suppressedStartNotices.delete(record.resourceId)) continue
          notifyInfo(t('models.downloadStarted'), {
            description: t('models.downloadStartedDescription', { name: record.name }),
            action: { label: t('models.viewProgress'), onPress: () => { window.location.hash = modelManagementPath('downloads') } },
            duration: 12000,
          })
          continue
        }
        /*
         * A removal is not an installation: the engine answers the request right away and
         * reports the failure later as a resource that is still there. The card carries no
         * mark of its own, so this notice is the only report of that failure.
         */
        const wasRemoving = prior?.state === 'running' && prior.phase === 'remove'
        if (!wasRemoving && record.state === 'running' && record.phase === 'remove') reportedRemoveFailures.delete(record.resourceId)
        if (wasRemoving) {
          if (record.state === 'failed') {
            notifyModelRemoveFailure(record, t, record.errorCode)
          } else if (record.state === 'idle' && !record.installed) {
            reportedRemoveFailures.delete(record.resourceId)
            notifySuccess(t('modelsSettingsUi.removeComplete', { name: record.name }))
          }
          continue
        }
        const wasInstalling = (prior?.state === 'running' &&
          (prior.phase === 'resolve' || prior.phase === 'download' || prior.phase === 'verify' || prior.phase === 'install')) || prior?.state === 'cancelling'
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
  if (record.errorCode === 'diskSpaceInsufficient' || record.errorCode === 'resourceDiskSpaceInsufficient') {
    notifyRetryableFailure(t('models.downloadDiskSpaceTitle'), {
      description: t('models.downloadDiskSpaceDescription'),
      supportCode: 'STO-022',
      action: { label: t('models.openStorageSettings'), onPress: () => { window.location.hash = settingsPath('storage') } },
    })
    return
  }
  const reasonKey = record.errorCode === 'networkUnavailable' ? 'models.downloadReasonNetwork'
    : record.errorCode === 'resourceNotFound' ? 'models.downloadReasonNotFound'
      : record.errorCode === 'resourceUnavailable' ? 'models.downloadReasonUnavailable'
        : record.errorCode === 'integrityCheckFailed' ? 'models.downloadReasonIntegrity'
          : record.errorCode === 'installFailed' ? 'models.downloadReasonInstall' : null
  const retry = () => {
    void actions.models.manageResource(record.resourceId, 'install').catch((cause: unknown) => {
      notifyModelDownloadFailure(t, retry, { cause })
    })
  }
  notifyModelDownloadFailure(t, retry, {
    description: reasonKey ? t(reasonKey) : undefined,
    cause: record.errorCode,
    supportCode: record.errorCode ? supportErrorCodeForCause(record.errorCode) : undefined,
  })
}
