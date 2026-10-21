import { useEffect } from 'react'
import { notifyError, notifyInfo, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { stores } from '@/store'
import { isRuntimeFailureClaimed, isSessionConflictFailure } from './settingsErrorChannel'

/** Keep runtime operation feedback visible even when the user navigates away from settings. */
export function RuntimeOperationNotice() {
  const { t } = useI18n()
  useEffect(() => {
    let previous = stores.settings.getState()
    return stores.settings.subscribe(() => {
      const current = stores.settings.getState()
      if (current === previous) return
      const wasBusy = previous.runtimeBusy
      const previousError = previous.runtimeError
      previous = current
      const action = current.runtimeAction === 'uninstall' ? t('runtime.uninstall') : t('runtime.install')
      // The session mutex refuses a runtime change while a session is running. That refusal
      // carries a code rather than a sentence, so the notice names what the user has to close
      // instead of reading the code back.
      const conflict = current.runtimeError !== null && isSessionConflictFailure(current.runtimeError)
      if (!wasBusy && current.runtimeBusy) {
        notifyInfo(t('runtime.operationStarted', { action }), { description: t('runtime.operationProgress') })
        return
      }
      if (wasBusy && !current.runtimeBusy) {
        if (conflict) notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
        else if (current.runtimeError) notifyError(t('runtime.operationFailed', { action }), { cause: current.runtimeError })
        else notifySuccess(t('runtime.operationComplete', { action }))
        return
      }
      if (!current.runtimeBusy && current.runtimeError && current.runtimeError !== previousError) {
        // A page that reported this failure in its own words claimed it before the call
        // that caused it, so the message here would be a second one for the same failure.
        if (isRuntimeFailureClaimed()) return
        if (conflict) notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
        else notifyError(t('runtime.operationFailed', { action: t('runtime.recheck') }), { cause: current.runtimeError })
      }
    })
  }, [t])
  return null
}
