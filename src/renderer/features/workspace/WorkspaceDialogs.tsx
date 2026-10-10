/** Session dialogs owned by the workspace page. */

import { useMemo } from 'react'

import { AlertDialog, Button } from '@heroui/react'

import { ENGINE_LOST_CODE, actions } from '@/store'
import type { SessionState } from '@/store'
import { useI18n } from '@/i18n'

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
  onCopyDiagnostics: () => void
  onReset: () => void
  onViewRecord: () => void
}

/**
 * Session failure dialog.
 *
 * The three actions follow what is left of the session, because the ways out
 * differ:
 * - `ENGINE_LOST`: the engine process is gone and the session is over
 *   (`abandonSessionOnEngineLoss` cleared the `sessionId`). The way out is the
 *   record: captions are on disk per line and the main process has stamped the
 *   end time, so the user wants "how do I get the half-finished meeting", not a
 *   retry.
 * - `sessionId === null`: the session never started. Retry, or install the model.
 * - `sessionId !== null`: still running, just erroring. End the session, which
 *   saves the captions so far.
 *
 * The first two go through `errorCopyOf(code, 'start')`. Only `ENGINE_LOST`
 * matches a table row, so the primary button becomes "view this record". That
 * is the only behavioural exception, so it tests the code once here rather than
 * changing the `errorCopyOf` signature, which the overlay's `StartFailureNotice`
 * also calls.
 *
 * `state.error` is a diagnostic string for the console and "copy diagnostics",
 * never rendered.
 */
export function SessionErrorDialog({ state, onCopyDiagnostics, onReset, onViewRecord }: SessionErrorDialogProps) {
  const { t } = useI18n()
  const isOpen = state.status === 'error'
  const alive = state.sessionId !== null
  const engineLost = state.errorCode === ENGINE_LOST_CODE
  const runtimeComponent = state.errorCode === 'RUNTIME_TORCH' ? 'engine' : state.errorCode === 'RUNTIME_LLAMA' ? 'llama' : null

  const handle = useMemo(() => errorCopyOf(state.errorCode, alive ? 'stop' : 'start'), [state.errorCode, alive])

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
            {state.error || handle.detail ? (
              <AlertDialog.Body>
                <p className="nola-body text-muted">{state.error || (handle.detail ? t(handle.detail) : null)}</p>
              </AlertDialog.Body>
            ) : null}
            <AlertDialog.Footer>
              <Button variant="tertiary" size="sm" className="rounded-xl" onPress={onCopyDiagnostics}>
                {t('errors.copyDiagnosticsAction')}
              </Button>
              <Button
                variant={alive ? 'danger' : 'primary'}
                size="sm"
                className="rounded-xl"
                onPress={() => {
                  if (runtimeComponent) {
                    onReset()
                    void actions.settings.openRuntimeSettings(runtimeComponent)
                  } else if (engineLost) onViewRecord()
                  else if (alive) void actions.session.stopSession().catch(() => onReset())
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
