import { Button, Modal } from '@heroui/react'
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
  return <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
    <Modal.Backdrop className="z-overlay">
      <Modal.Container size="md" placement="center">
        <Modal.Dialog>
          <Modal.Header><Modal.Heading>{t('startup.failedTitle')}</Modal.Heading></Modal.Header>
          <Modal.Body className="startup-failure__body">
            <p className="startup-failure__message">{t(timedOut ? 'startup.timedOut' : 'startup.engineFailed')}</p>
            <p className="startup-failure__hint">{t('startup.settingsHint')}</p>
          </Modal.Body>
          <Modal.Footer className="flex justify-end gap-2">
            <Button variant="secondary" onPress={() => { void openLogs().catch(() => undefined) }}>{t('settings.openLogs')}</Button>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>{t('startup.continue')}</Button>
            <Button variant="primary" onPress={() => window.location.reload()}>{t('errors.pageCrashedAction')}</Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </Modal>
}
