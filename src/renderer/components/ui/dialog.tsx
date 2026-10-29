import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { X } from 'lucide-react'
import type { ComponentProps, HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'

export const Dialog = BaseDialog.Root
export const DialogTrigger = BaseDialog.Trigger
export const DialogPortal = BaseDialog.Portal
export const DialogClose = BaseDialog.Close

export interface DialogCloseButtonProps extends Omit<ComponentProps<typeof BaseDialog.Close>, 'render' | 'children' | 'className'> {
  className?: string
}

export function DialogCloseButton({ className, ...props }: DialogCloseButtonProps) {
  const { t } = useI18n()
  const label = props['aria-label'] ?? t('common.close')

  return (
    <BaseDialog.Close
      {...props}
      aria-label={label}
      render={<Button variant="tertiary" size="icon" className={cn('nola-dialog-close border-transparent bg-transparent hover:bg-transparent aria-expanded:bg-transparent', className)} />}
    >
      <X aria-hidden="true" />
    </BaseDialog.Close>
  )
}

export interface DialogTitleProps extends ComponentProps<typeof BaseDialog.Title> {}
export function DialogTitle(props: DialogTitleProps) {
  return <BaseDialog.Title data-slot="dialog-title" {...props} />
}
export interface DialogDescriptionProps extends ComponentProps<typeof BaseDialog.Description> {}
export function DialogDescription(props: DialogDescriptionProps) {
  return <BaseDialog.Description data-slot="dialog-description" {...props} />
}

export interface DialogContentProps extends ComponentProps<typeof BaseDialog.Popup> {}

export function DialogContent({ className, ...props }: DialogContentProps) {
  return <BaseDialog.Portal><BaseDialog.Backdrop data-slot="dialog-backdrop" className="fixed inset-0 z-overlay bg-nola-ui-backdrop" /><BaseDialog.Popup data-slot="dialog-content" className={cn('nola-dialog-content', className)} {...props} /></BaseDialog.Portal>
}

export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogHeader({ className, ...props }: DialogHeaderProps) {
  return <div data-slot="dialog-header" className={cn('nola-dialog-header', className)} {...props} />
}

export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {}

export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return <div data-slot="dialog-footer" className={cn('nola-dialog-footer', className)} {...props} />
}
