/**
 * Rename dialog, shared by the records list and the record detail.
 */

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertDialog, Button, Input, TextField } from '@heroui/react'

import { useI18n } from '@/i18n'
import { actions } from '@/store'

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

  // Reset on every open, so one meeting's name cannot leak into the next.
  useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle, meetingId])

  const empty = title.trim().length === 0

  const submit = useCallback(() => {
    if (meetingId === null) return
    if (empty) return
    setPending(true)
    void actions.meetings
      .renameMeeting(meetingId, title)
      .catch(() => {
        // The failure lands in store.error; the UI shows it by errorCode, not as a diagnostic dump.
      })
      .finally(() => {
        setPending(false)
        onClose()
      })
  }, [meetingId, title, empty, onClose])

  return (
    <AlertDialog
      isOpen={meetingId !== null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose()
      }}
    >
      <AlertDialog.Backdrop>
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              {/* `.nola-title` is the dialog-title step, as on every other dialog. */}
              <AlertDialog.Heading className="nola-title text-foreground">
                {t('records.renameTitle')}
              </AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body>
              <TextField
                value={title}
                isDisabled={pending}
                onChange={setTitle}
                className="flex flex-col gap-2"
              >
                <Input
                  aria-label={t('records.renameLabel')}
                  maxLength={TITLE_MAX_LENGTH}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Enter') submit()
                  }}
                />
              </TextField>
            </AlertDialog.Body>

            <AlertDialog.Footer>
              <Button
                variant="tertiary"
                size="sm"
                className="rounded-[10px]"
                onPress={onClose}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                isPending={pending}
                isDisabled={empty}
                className="rounded-[10px]"
                onPress={submit}
              >
                {t('common.confirm')}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}

