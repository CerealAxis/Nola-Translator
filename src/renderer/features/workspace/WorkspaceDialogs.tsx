/** Session dialogs owned by the workspace page. */

import { useMemo } from 'react'

import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { actions } from '@/store'
import type { SessionState } from '@/store'
import type { DiagnosticCopyContext } from '@/bridge'
import { useI18n } from '@/i18n'
import { pathOf, settingsPath, useRoute } from '@/routes'
import { notifyError } from '@/components/primitives/notify'
import { supportErrorCodeForCause, supportErrorCodeForMessage } from '../../../shared/error-catalog'

import { errorCopyOf } from './error-copy'

export interface StopSessionDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Ends the running session; the page owns the session call. */
  onEnd: () => void
}

export function StopSessionDialog({ isOpen, onOpenChange, onEnd }: StopSessionDialogProps) {
  const { t } = useI18n()
  return (
    <AlertDialog.Root open={isOpen} onOpenChange={open => { if (!open) onOpenChange(false) }}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
        <AlertDialog.Popup className="nola-dialog-content max-w-sm">
          <AlertDialog.Title className="nola-title text-foreground">{t('workspace.endConfirmTitle')}</AlertDialog.Title>
          <AlertDialog.Description className="nola-body text-muted">{t('workspace.endConfirmBody')}</AlertDialog.Description>
          <div className="nola-dialog-footer">
            <AlertDialog.Close render={<Button variant="tertiary" size="sm" className="rounded-xl" />}>{t('workspace.keepGoing')}</AlertDialog.Close>
            <Button variant="danger" size="sm" className="rounded-xl" onClick={() => { onEnd(); onOpenChange(false) }}>{t('workspace.end')}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export interface SessionErrorDialogProps {
  /**
   * Visibility follows the session: the dialog opens itself for an `error`
   * state, so a caller outside a live session passes one to show it.
   */
  state: SessionState
  onCopyDiagnostics: (context: DiagnosticCopyContext) => void
  onReset: () => void
  onViewRecord: () => void
}

/**
 * Session failure dialog.
 *
 * The primary button does what its own label says: the copy carries the target
 * next to the label, and this dialog dispatches on the target alone. Deciding
 * the behaviour from the error code instead would let the two drift apart, and
 * a button that says "install the model" and then restarts the session leaves
 * the user believing something happened that did not.
 *
 * Raw error details stay out of the UI because provider errors can contain private request data.
 */
export function SessionErrorDialog({ state, onCopyDiagnostics, onReset, onViewRecord }: SessionErrorDialogProps) {
  const { t } = useI18n()
  const { navigate } = useRoute()
  const isOpen = state.status === 'error'
  const alive = state.sessionId !== null

  const handle = useMemo(() => errorCopyOf(state.errorCode, alive ? 'stop' : 'start'), [state.errorCode, alive])
  // The code the user copies is the code of what happened, not the code of the sentence on
  // screen: the sentence is chosen from the cause anyway, and a cause nobody claims has no
  // message to look up.
  const supportCode = state.errorCode
    ? supportErrorCodeForCause(state.errorCode)
    : supportErrorCodeForMessage(handle.message) ?? 'ERR-999'

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onReset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t(handle.message)}</DialogTitle>
        </DialogHeader>
        {handle.detail ? <p className="nola-body mb-4 text-muted">{t(handle.detail)}</p> : null}
        <DialogFooter>
          <Button variant="tertiary" size="sm" className="rounded-xl" onClick={() => onCopyDiagnostics({
            supportCode,
            correlationId: state.errorRequestId ?? undefined,
          })}>
            {t('errors.copyDiagnosticsAction')}
          </Button>
          <Button
            variant={alive ? 'danger' : 'default'}
            size="sm"
            className="rounded-xl"
            onClick={() => {
              const target = handle.target
              if (target.kind === 'runtime') {
                onReset()
                void actions.settings.openRuntimeSettings(target.component).catch((error: unknown) => {
                  notifyError(t('errors.runtimeSettingsFailed'), { cause: error })
                })
              } else if (target.kind === 'record') onViewRecord()
              else if (target.kind === 'settings') {
                onReset()
                navigate(settingsPath(target.tab))
              } else if (target.kind === 'models') {
                onReset()
                navigate(pathOf('models'))
              } else if (target.kind === 'stop') {
                void actions.session.stopSession().catch((error: unknown) => {
                  onReset()
                  notifyError(t('errors.engineOperationFailed'), { cause: error })
                })
              } else onReset()
            }}
          >
            {t(handle.action)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
