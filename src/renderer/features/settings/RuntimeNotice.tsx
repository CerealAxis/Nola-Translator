import type { ReactNode } from 'react'
import { Modal, Button } from '@heroui/react'
import { actions, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'

/** A runtime component that is not ready. */
export interface RuntimeIssue {
  kind: 'engine' | 'llama'
  /** Why the probe failed, when it reported one. The dialog falls back to its own copy. */
  reason?: string
}

export interface RuntimeNoticeDialogProps {
  issues: readonly RuntimeIssue[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the settings page for one component. Called once per issue, in the order of `issues`. */
  onOpenSettings: (component: RuntimeIssue['kind']) => void
  onDismiss: () => void
}

export function RuntimeNoticeDialog({ issues, isOpen, onOpenChange, onOpenSettings, onDismiss }: RuntimeNoticeDialogProps): ReactNode {
  const { t } = useI18n()
  return <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
    <Modal.Backdrop className="z-overlay"><Modal.Container size="sm"><Modal.Dialog>
      <Modal.Header><Modal.Heading>{t('runtime.noticeTitle')}</Modal.Heading></Modal.Header>
      <Modal.Body>
        {issues.map(issue => <p key={issue.kind}>{issue.reason || t(issue.kind === 'engine' ? 'runtime.torchMissing' : 'runtime.llamaMissing')}</p>)}
        <p>{t('runtime.noticeBody')}</p>
      </Modal.Body>
      <Modal.Footer className="flex flex-wrap gap-2">
        {issues.map(issue => <Button key={issue.kind} variant="primary" onPress={() => onOpenSettings(issue.kind)}>{t(issue.kind === 'engine' ? 'runtime.goTorch' : 'runtime.goLlama')}</Button>)}
        <Button variant="tertiary" onPress={onDismiss}>{t('runtime.later')}</Button>
      </Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop>
  </Modal>
}

export function RuntimeNotice() {
  const { runtimes, runtimeNoticeDismissed } = useStore(stores.settings, state => state)
  const issues: RuntimeIssue[] = runtimes
    ? (['engine', 'llama'] as const)
      .filter(kind => runtimes.local[kind].status !== 'ready')
      .map(kind => ({ kind, reason: runtimes.local[kind].reason }))
    : []
  return <RuntimeNoticeDialog
    issues={issues}
    isOpen={issues.length > 0 && !runtimeNoticeDismissed}
    onOpenChange={open => { if (!open) actions.settings.dismissRuntimeNotice() }}
    onOpenSettings={component => { void actions.settings.openRuntimeSettings(component) }}
    onDismiss={() => actions.settings.dismissRuntimeNotice()}
  />
}
