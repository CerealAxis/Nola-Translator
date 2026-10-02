import { DismissRegular } from '@fluentui/react-icons'
import { useEffect, useRef } from 'react'

type ConfirmDialogProps = {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  variant?: 'default' | 'danger'
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'default',
}: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleEscape)
    cancelButtonRef.current?.focus()
    return () => document.removeEventListener('keydown', handleEscape)
  }, [onCancel])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onCancel()
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <div className="modal-card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" ref={dialogRef}>
        <h2 id="dialog-title" className="modal-title">{title}</h2>
        <p className="modal-message">{message}</p>
        <div className="modal-actions">
          <button
            type="button"
            className="button secondary-button"
            onClick={onCancel}
            ref={cancelButtonRef}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={variant === 'danger' ? 'button danger-button' : 'button primary-button'}
            onClick={onConfirm}
          >
            {variant === 'danger' && <DismissRegular aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
