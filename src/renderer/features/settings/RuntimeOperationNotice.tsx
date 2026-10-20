import { useEffect } from 'react'
import { notifyError, notifyInfo, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { stores } from '@/store'
import { isRuntimeFailureClaimed } from './settingsErrorChannel'

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
      if (!wasBusy && current.runtimeBusy) {
        notifyInfo(t('runtime.operationStarted', { action }), { description: t('runtime.operationProgress') })
        return
      }
      if (wasBusy && !current.runtimeBusy) {
        if (current.runtimeError) notifyError(t('runtime.operationFailed', { action }), { cause: current.runtimeError })
        else notifySuccess(t('runtime.operationComplete', { action }))
        return
      }
      if (!current.runtimeBusy && current.runtimeError && current.runtimeError !== previousError) {
        // A page that reported this failure in its own words claimed it before the call
        // that caused it, so the message here would be a second one for the same failure.
        if (isRuntimeFailureClaimed()) return
        notifyError(t('runtime.operationFailed', { action: t('runtime.recheck') }), { cause: current.runtimeError })
      }
    })
  }, [t])
  return null
}
