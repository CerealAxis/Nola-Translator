/**
 * Delete confirmation, shared by the single-record and bulk gestures on the
 * records list. Both are destructive and irreversible, so they ask first.
 */

import type { ReactNode } from 'react'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogFooter, DialogHeader } from '@/components/ui/dialog'
import { useI18n } from '@/i18n'

export interface RecordDeleteDialogProps {
  isOpen: boolean
  /** Closing is refused while the delete is in flight, which is what keeps the dialog up during a pending delete. */
  onOpenChange: (open: boolean) => void
  /** Bulk delete shows a different title, body and confirm label. */
  bulk: boolean
  selectedCount: number
  isPending: boolean
  onConfirm: () => void
}

export function RecordDeleteDialog({
  isOpen,
  onOpenChange,
  bulk,
  selectedCount,
  isPending,
  onConfirm,
}: RecordDeleteDialogProps): ReactNode {
  const { t } = useI18n()

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-overlay bg-nola-ui-backdrop" />
        <AlertDialog.Popup className="nola-dialog-content max-w-sm">
          <DialogHeader>
            <AlertDialog.Title data-slot="dialog-title">
              {bulk ? t('records.deleteManyTitle', { count: selectedCount }) : t('records.deleteTitle')}
            </AlertDialog.Title>
            <AlertDialog.Description data-slot="dialog-description">
              {bulk ? t('records.deleteManyBody') : t('records.deleteBody')}
            </AlertDialog.Description>
          </DialogHeader>
          <DialogFooter>
            <AlertDialog.Close render={<Button variant="tertiary" size="sm" />} disabled={isPending}>
              {t('common.cancel')}
            </AlertDialog.Close>
            <Button variant="danger" size="sm" disabled={isPending} onClick={onConfirm}>
              {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              {bulk ? t('records.deleteSelected', { count: selectedCount }) : t('records.delete')}
            </Button>
          </DialogFooter>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
