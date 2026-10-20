import { useEffect } from 'react'
import { offlineActions, offlineStore } from '@/store/offlineStore'
import { useI18n } from '@/i18n'
import { dismissNotice, notifyError } from '@/components/primitives/notify'

/**
 * The failure that was announced, and the notice that announced it.
 *
 * They live outside the component: the failure stays in the store until it is dealt with,
 * so a component that mounts later would announce the same failure a second time.
 */
let announcedFailure: unknown = null
let announcedNotice: string | null = null

/**
 * Report an offline failure wherever the user is.
 *
 * The offline work runs in the background, so a failure that happens while the user is on
 * another page has to reach them anyway. The notice carries the way out, because the
 * dialog that could offer one belongs to a page the user may have left.
 */
export function OfflineFailureNotice() {
  const { t } = useI18n()
  useEffect(() => {
    const report = (): void => {
      const state = offlineStore.getState()
      const preview = state.preview
      const task = state.task
      const failure = preview && !preview.compatible ? preview : task?.state === 'failed' ? task : state.failed ? 'failed' : null
      if (!failure) {
        announcedFailure = null
        /*
         * An error notice never leaves on its own, so a failure that is dealt with would
         * keep crying on the screen. The retry that cleared it takes the notice down.
         */
        if (announcedNotice) { dismissNotice(announcedNotice); announcedNotice = null }
        return
      }
      if (announcedFailure === failure) return
      announcedFailure = failure
      const retry = {
        label: t('offline.retry'),
        onPress: () => {
          offlineActions.reset()
          if (announcedNotice) { dismissNotice(announcedNotice); announcedNotice = null }
        },
      }
      // One failure at a time: the notice that is on screen is replaced, not stacked on.
      if (announcedNotice) dismissNotice(announcedNotice)
      if (failure === 'failed') { announcedNotice = notifyError(t('offline.failed'), { action: retry }); return }
      const issue = preview && failure === preview ? preview.issues[0] : task?.issue
      announcedNotice = notifyError(t(`offline.${issue ?? 'failed'}`), {
        description: task?.reason ?? preview?.items.find(item => item.reason)?.reason,
        action: retry,
      })
    }
    report()
    return offlineStore.subscribe(report)
  }, [t])
  return null
}
