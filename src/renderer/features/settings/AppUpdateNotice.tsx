import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal, toast } from '@heroui/react'
import { ArrowUpRight } from 'lucide-react'

import type { AppUpdateCheckResult } from '@/bridge'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'

export interface AppUpdateDialogProps {
  /** An update the caller has already checked for a version and a release page. */
  result: AppUpdateCheckResult
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the release URL; the wrapper owns opening it. */
  onOpenRelease: (releaseUrl: string) => void
  /** Whether the release page call is still in flight. */
  isOpening: boolean
}

export function AppUpdateDialog({ result, isOpen, onOpenChange, onOpenRelease, isOpening }: AppUpdateDialogProps): ReactNode {
  const { t } = useI18n()
  // A result without these renders nothing in the wrapper, so the fallbacks never show.
  const latestVersion = result.latestVersion ?? ''
  const releaseUrl = result.releaseUrl ?? ''
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="md" placement="center">
          <Modal.Dialog className="rounded-2xl border border-border">
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">{t('appUpdate.title')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              <div className="nola-body-strong">{result.releaseName}</div>
              <div className="nola-caption text-muted">{t('appUpdate.version', { version: latestVersion })}</div>
              <div className="nola-caption text-muted">{t('appUpdate.currentVersion', { version: result.currentVersion })}</div>
              <h3 className="nola-body-strong mt-2">{t('appUpdate.notes')}</h3>
              {result.releaseNotes.trim()
                ? <div className="nola-body whitespace-pre-wrap break-words">{result.releaseNotes}</div>
                : <div className="nola-caption text-muted">{t('appUpdate.notesUnavailable')}</div>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => onOpenChange(false)}>{t('appUpdate.later')}</Button>
              <Button onPress={() => void onOpenRelease(releaseUrl)} isPending={isOpening}>
                <ArrowUpRight aria-hidden="true" />{t('appUpdate.openRelease')}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  )
}

export function AppUpdateNotice(): React.JSX.Element | null {
  const { t } = useI18n()
  const result = useStore(stores.settings, (state) => state.appUpdate)
  const [isOpen, setIsOpen] = useState(false)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    void actions.settings.checkForAppUpdate()
  }, [])

  useEffect(() => {
    if (result?.updateAvailable) setIsOpen(true)
  }, [result])

  const openRelease = async (releaseUrl: string): Promise<void> => {
    setOpening(true)
    try {
      await actions.settings.openAppReleasePage(releaseUrl)
      setIsOpen(false)
    } catch {
      toast.danger(t('appUpdate.openFailed'))
    } finally {
      setOpening(false)
    }
  }

  const releaseUrl = result?.releaseUrl
  if (!result?.updateAvailable || !releaseUrl || !result.latestVersion) return null

  return (
    <AppUpdateDialog
      result={result}
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      onOpenRelease={url => { void openRelease(url) }}
      isOpening={opening}
    />
  )
}
