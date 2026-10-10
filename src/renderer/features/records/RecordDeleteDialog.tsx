/**
 * Delete confirmation, shared by the single-record and bulk gestures on the
 * records list. Both are destructive and irreversible, so they ask first.
 */

import type { ReactNode } from 'react'
import { AlertDialog, Button } from '@heroui/react'

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
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop><AlertDialog.Container><AlertDialog.Dialog>
        <AlertDialog.Header><AlertDialog.Icon /><AlertDialog.Heading>{bulk ? t('records.deleteManyTitle', { count: selectedCount }) : t('records.deleteTitle')}</AlertDialog.Heading></AlertDialog.Header>
        <AlertDialog.Body><p>{bulk ? t('records.deleteManyBody') : t('records.deleteBody')}</p></AlertDialog.Body>
        <AlertDialog.Footer><Button variant="tertiary" isDisabled={isPending} onPress={() => onOpenChange(false)}>{t('common.cancel')}</Button><Button variant="danger" isPending={isPending} onPress={onConfirm}>{bulk ? t('records.deleteSelected', { count: selectedCount }) : t('records.delete')}</Button></AlertDialog.Footer>
      </AlertDialog.Dialog></AlertDialog.Container></AlertDialog.Backdrop>
    </AlertDialog>
  )
}