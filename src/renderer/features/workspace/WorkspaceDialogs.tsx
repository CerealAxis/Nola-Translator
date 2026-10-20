/** Session dialogs owned by the workspace page. */

import { useMemo } from 'react'

import { AlertDialog, Button } from '@heroui/react'

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
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop className="z-overlay">
        <AlertDialog.Container>
          <AlertDialog.Dialog className="rounded-2xl border border-border">
            <AlertDialog.Header>
              <AlertDialog.Heading className="nola-title text-foreground">
                {t('workspace.endConfirmTitle')}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <p className="nola-body text-muted">{t('workspace.endConfirmBody')}</p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => onOpenChange(false)}>
                {t('workspace.keepGoing')}
              </Button>
              <Button variant="danger" size="sm" className="rounded-xl" onPress={onEnd}>
                {t('workspace.end')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
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
    <AlertDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        // Reached by ESC and by a backdrop click. This failure has no "later"
        // option, and without a reset it would keep covering the transcript, so
        // closing resets.
        if (!open) onReset()
      }}
    >
      <AlertDialog.Backdrop className="z-overlay">
        <AlertDialog.Container>
          <AlertDialog.Dialog className="rounded-2xl border border-border">
            <AlertDialog.Header>
              <AlertDialog.Heading className="nola-title text-foreground">
                {t(handle.message)}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            {handle.detail ? (
              <AlertDialog.Body>
                <p className="nola-body text-muted">{t(handle.detail)}</p>
              </AlertDialog.Body>
            ) : null}
            <AlertDialog.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={() => onCopyDiagnostics({
                supportCode,
                correlationId: state.errorRequestId ?? undefined,
              })}>
                {t('errors.copyDiagnosticsAction')}
              </Button>
              <Button
                variant={alive ? 'danger' : 'primary'}
                size="sm"
                className="rounded-xl"
                onPress={() => {
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
                  } else if (target.kind === 'stop') void actions.session.stopSession().catch(() => onReset())
                  else onReset()
                }}
              >
                {t(handle.action)}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
