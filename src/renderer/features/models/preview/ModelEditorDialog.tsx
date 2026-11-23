import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogCloseButton, DialogContent, DialogFooter, DialogHeader, DialogTitle, type DialogContentProps } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { useI18n } from '@/i18n'
import { llmPreviewCopy } from './llm-preview-copy'

export function ModelEditorDialog({ editing, title, saveLabel, canSave, initialFocus, onSave, onCancel, onReset, children }: {
  editing?: boolean
  title?: string
  saveLabel?: string
  canSave?: boolean
  initialFocus?: DialogContentProps['initialFocus']
  onSave?: () => void
  onCancel: () => void
  onReset?: () => void
  children: ReactNode
}) {
  const { language, t } = useI18n()
  const copy = llmPreviewCopy[language]
  const formId = useId()

  return <Dialog open onOpenChange={open => { if (!open) onCancel() }}>
    <DialogContent className="model-editor" initialFocus={initialFocus}>
      <DialogHeader><DialogTitle>{title ?? (editing ? copy.edit : copy.add)}</DialogTitle></DialogHeader>
      <DialogCloseButton />
      <form id={formId} className="model-editor__body" onSubmit={event => {
        event.preventDefault()
        if (canSave) onSave?.()
      }}>
        <FieldGroup className="gap-[var(--field-gap)]">{children}</FieldGroup>
      </form>
      <DialogFooter>
        {onReset && <Button type="button" variant="secondary" className="me-auto" onClick={onReset}>{copy.reset}</Button>}
        <Button type="button" variant="secondary" onClick={onCancel}>{t(onSave ? 'common.cancel' : 'common.close')}</Button>
        {onSave && <Button type="submit" form={formId} disabled={!canSave}>{saveLabel ?? t('suite.save')}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
