import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Link, Modal, toast } from '@heroui/react'
import { ArrowUpRight } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import type { AppUpdateCheckResult } from '@/bridge'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import './AppUpdateNotice.css'

export interface AppUpdateDialogProps {
  /** An update the caller has already checked for a version and a release page. */
  result: AppUpdateCheckResult
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the release URL; the wrapper owns opening it. */
  onOpenRelease: (releaseUrl: string) => void
  /** Whether the release page call is still in flight. */
  isOpening: boolean
  isCurrentVersion?: boolean
}

function displayVersion(value: string): string {
  return value.trim().replace(/^v(?=\d)/i, '')
}

function displayReleaseName(value: string | null): string | null {
  if (!value) return value
  return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/i.test(value.trim())
    ? displayVersion(value)
    : value
}

export function AppUpdateDialog({ result, isOpen, onOpenChange, onOpenRelease, isOpening, isCurrentVersion = false }: AppUpdateDialogProps): ReactNode {
  const { t } = useI18n()
  // A result without these renders nothing in the wrapper, so the fallbacks never show.
  const latestVersion = displayVersion(result.latestVersion ?? '')
  const releaseUrl = result.releaseUrl ?? ''
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop className="z-overlay">
        <Modal.Container size="lg" placement="center">
          <Modal.Dialog className="app-update-dialog rounded-2xl border border-border">
            <Modal.Header>
              <Modal.Heading className="nola-title text-foreground">{t(isCurrentVersion ? 'appUpdate.currentReleaseTitle' : 'appUpdate.title')}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="app-update-dialog-body flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              <div className="nola-body-strong">{displayReleaseName(result.releaseName)}</div>
              <div className="nola-caption text-muted">{t('appUpdate.version', { version: latestVersion })}</div>
              <div className="nola-caption text-muted">{t('appUpdate.currentVersion', { version: displayVersion(result.currentVersion) })}</div>
              <h3 className="nola-body-strong mt-2">{t('appUpdate.notes')}</h3>
              {result.releaseNotes.trim()
                ? (
                  <div className="app-update-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ href, children }) => href
                          ? <Link href={href} target="_blank" rel="noreferrer" className="app-update-markdown__link">{children}</Link>
                          : <>{children}</>,
                      }}
                    >
                      {result.releaseNotes}
                    </ReactMarkdown>
                  </div>
                )
                : <div className="nola-caption text-muted">{t('appUpdate.notesUnavailable')}</div>}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => onOpenChange(false)}>{t(isCurrentVersion ? 'common.close' : 'appUpdate.later')}</Button>
              <Button onPress={() => void onOpenRelease(releaseUrl)} isPending={isOpening}>
                <ArrowUpRight aria-hidden="true" />{t(isCurrentVersion ? 'appUpdate.viewAnnouncement' : 'appUpdate.openRelease')}
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
  const deferForTour = useStore(stores.settings, state => state.onboardingActive || (!!state.settings && !state.settings.onboardingSeen && !state.onboardingAutoAttempted))
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
      isOpen={isOpen && !deferForTour}
      onOpenChange={setIsOpen}
      onOpenRelease={url => { void openRelease(url) }}
      isOpening={opening}
    />
  )
}
