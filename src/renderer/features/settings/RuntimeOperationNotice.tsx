import { useEffect } from 'react'
import { toast } from '@heroui/react'
import { useI18n } from '@/i18n'
import { stores } from '@/store'

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
        toast(t('runtime.operationStarted', { action }), { description: t('runtime.operationProgress') })
        return
      }
      if (wasBusy && !current.runtimeBusy) {
        if (current.runtimeError) toast.danger(t('runtime.operationFailed', { action }), { description: current.runtimeError })
        else toast.success(t('runtime.operationComplete', { action }))
        return
      }
      if (!current.runtimeBusy && current.runtimeError && current.runtimeError !== previousError) {
        toast.danger(t('runtime.operationFailed', { action: t('runtime.recheck') }), { description: current.runtimeError })
      }
    })
  }, [t])
  return null
}
