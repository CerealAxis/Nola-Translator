import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui'
import { useI18n } from '@/i18n'
import { openLogs } from '@/store'
import './StartupFailureDialog.css'

export interface StartupFailureDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  timedOut: boolean
}

export function StartupFailureDialog({ isOpen, onOpenChange, timedOut }: StartupFailureDialogProps) {
  const { t } = useI18n()
  return <Dialog open={isOpen} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle data-slot="dialog-title">{t('startup.failedTitle')}</DialogTitle>
      </DialogHeader>
      <div className="startup-failure__body flex flex-col">
        <p className="startup-failure__message">{t(timedOut ? 'startup.timedOut' : 'startup.engineFailed')}</p>
        <p className="startup-failure__hint">{t('startup.settingsHint')}</p>
      </div>
      <DialogFooter>
        <Button variant="secondary" onClick={() => { void openLogs().catch(() => undefined) }}>{t('settings.openLogs')}</Button>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>{t('startup.continue')}</Button>
        <Button onClick={() => window.location.reload()}>{t('errors.pageCrashedAction')}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
