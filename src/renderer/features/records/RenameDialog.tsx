/**
 * Rename dialog, shared by the records list and the record detail.
 */

import { useCallback, useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'

import { useI18n } from '@/i18n'
import { actions } from '@/store'
import { notifyError } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { AlertDialogContent, DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'

/** Meeting name cap. The main process truncates to the same length on write. */
export const TITLE_MAX_LENGTH = 120

export interface RenameDialogProps {
  /** null closes the dialog. */
  meetingId: string | null
  /** Value to seed the field with when the dialog opens. */
  initialTitle?: string
  onClose: () => void
}

export function RenameDialog({ meetingId, initialTitle = '', onClose }: RenameDialogProps): ReactNode {
  const { t } = useI18n()
  const [title, setTitle] = useState(initialTitle)
  const [pending, setPending] = useState(false)
  const titleId = useId()

  // Reset on every open, so one meeting's name cannot leak into the next.
  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle, meetingId])

  const empty = title.trim().length === 0

  const submit = useCallback(() => {
    if (meetingId === null || pending) return
    if (empty) return
    setPending(true)
    void actions.meetings
      .renameMeeting(meetingId, title)
      .then(() => {
        onClose()
      })
      .catch((cause: unknown) => {
        // The dialog stays open on a failure, so the name the user typed is still there to retry with.
        notifyError(t('records.renameFailed'), { cause })
      })
      .finally(() => {
        setPending(false)
      })
  }, [meetingId, title, empty, pending, onClose, t])

  return (
    <AlertDialog.Root
      open={meetingId !== null}
      onOpenChange={(open: boolean) => {
        if (!open && !pending) onClose()
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
        <AlertDialogContent className="max-w-md">
          <DialogHeader>
            <AlertDialog.Title className="nola-title text-foreground">
              {t('records.renameTitle')}
            </AlertDialog.Title>
          </DialogHeader>

          <Field data-disabled={pending || undefined}>
          <FieldLabel htmlFor={titleId}>{t('records.renameLabel')}</FieldLabel>
          <Input
            id={titleId}
            value={title}
            disabled={pending}
            maxLength={TITLE_MAX_LENGTH}
            onValueChange={(value: string) => setTitle(value)}
            onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') submit()
            }}
          />
          </Field>

          <DialogFooter>
            <Button variant="tertiary" size="sm" disabled={pending} onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" disabled={pending || empty} aria-busy={pending} onClick={submit}>
              {pending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </AlertDialogContent>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

