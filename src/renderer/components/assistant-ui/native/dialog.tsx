import { DialogContent as NolaDialogContent, DialogCloseButton, type DialogContentProps as NolaDialogContentProps } from '@/components/ui/dialog'

export { Dialog, DialogTrigger, DialogTitle, DialogDescription, DialogHeader, DialogFooter, DialogClose, DialogPortal } from '@/components/ui/dialog'

export interface DialogContentProps extends NolaDialogContentProps {
  showCloseButton?: boolean
}

/** Preserve the registry dialog contract with the existing Nola dialog primitive. */
export function DialogContent({ children, showCloseButton = true, ...props }: DialogContentProps) {
  return <NolaDialogContent {...props}>{children}{showCloseButton && <DialogCloseButton />}</NolaDialogContent>
}
