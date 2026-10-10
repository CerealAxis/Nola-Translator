import { Modal, Button } from '@heroui/react'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'

export function RuntimeNotice() {
  const { t } = useI18n()
  const { runtimes, runtimeNoticeDismissed } = useStore(stores.settings, state => state)
  const issues = runtimes ? (['engine', 'llama'] as const).filter(kind => runtimes.local[kind].status !== 'ready') : []
  return <Modal isOpen={issues.length > 0 && !runtimeNoticeDismissed} onOpenChange={open => { if (!open) actions.settings.dismissRuntimeNotice() }}>
    <Modal.Backdrop className="z-overlay"><Modal.Container size="sm"><Modal.Dialog>
      <Modal.Header><Modal.Heading>{t('runtime.noticeTitle')}</Modal.Heading></Modal.Header>
      <Modal.Body>
        {issues.map(kind => <p key={kind}>{runtimes?.local[kind].reason || t(kind === 'engine' ? 'runtime.torchMissing' : 'runtime.llamaMissing')}</p>)}
        <p>{t('runtime.noticeBody')}</p>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap gap-2">
        {issues.map(kind => <Button key={kind} variant="primary" onPress={() => void actions.settings.openRuntimeSettings(kind)}>{t(kind === 'engine' ? 'runtime.goTorch' : 'runtime.goLlama')}</Button>)}
        <Button variant="tertiary" onPress={() => actions.settings.dismissRuntimeNotice()}>{t('runtime.later')}</Button>
      </Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </Modal>
}
