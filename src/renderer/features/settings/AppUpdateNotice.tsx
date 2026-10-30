import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowUpRight, ImageOff } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { rehypeGithubAlerts } from 'rehype-github-alerts'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema, type Options as Schema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import type { AppUpdateCheckResult } from '@/bridge'
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui'
import { notifyError } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions, stores, useStore } from '@/store'
import './AppUpdateNotice.css'

const releaseNotesSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', /^markdown-alert(?:-(?:note|tip|important|warning|caution))?$/],
    ],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      'alt',
      'width',
      'height',
    ],
    p: [
      ...(defaultSchema.attributes?.p ?? []),
      ['className', 'markdown-alert-title'],
    ],
  },
}

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

function normalizeReleaseNotesCallouts(markdown: string): string {
  return markdown.replace(
    /^([ \t]*>[ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])[ \t]+(?=\S)/gim,
    '$1\n> ',
  )
}

function ReleaseImage({ alt, src, width, height }: React.ImgHTMLAttributes<HTMLImageElement>): ReactNode {
  const { t } = useI18n()
  const [failed, setFailed] = useState(false)
  if (!src) return null
  return failed
    ? <span className="app-update-image-fallback"><ImageOff aria-hidden="true" />{alt || t('appUpdate.notesUnavailable')}</span>
    : <img src={src} alt={alt ?? ''} width={width} height={height} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
}

export function AppUpdateDialog({ result, isOpen, onOpenChange, onOpenRelease, isOpening, isCurrentVersion = false }: AppUpdateDialogProps): ReactNode {
  const { t } = useI18n()
  // A result without these renders nothing in the wrapper, so the fallbacks never show.
  const latestVersion = displayVersion(result.latestVersion ?? '')
  const releaseUrl = result.releaseUrl ?? ''
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="app-update-dialog modal__dialog--lg rounded-2xl border border-border">
        <DialogHeader className="app-update-dialog-header mb-0">
          <DialogTitle data-slot="dialog-title" className="nola-title">{t(isCurrentVersion ? 'appUpdate.currentReleaseTitle' : 'appUpdate.title')}</DialogTitle>
          <div className="app-update-dialog-meta">
            <span>{t('appUpdate.version', { version: latestVersion })}</span>
            {!isCurrentVersion && <span>{t('appUpdate.currentVersion', { version: displayVersion(result.currentVersion) })}</span>}
          </div>
        </DialogHeader>
        <div className="app-update-dialog-body nola-scrollbar flex-1">
          {result.releaseNotes.trim()
            ? (
              <div className="app-update-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeGithubAlerts, [rehypeSanitize, releaseNotesSchema]]}
                  components={{
                    a: ({ href, children }) => href
                      ? <a href={href} target="_blank" rel="noreferrer" className="app-update-markdown__link">{children}</a>
                      : <>{children}</>,
                    img: ReleaseImage,
                  }}
                >
                  {normalizeReleaseNotesCallouts(result.releaseNotes)}
                </ReactMarkdown>
              </div>
            )
            : <div className="nola-caption text-muted">{displayReleaseName(result.releaseName)}<p>{t('appUpdate.notesUnavailable')}</p></div>}
        </div>
        <DialogFooter className="app-update-dialog-footer">
          <Button variant="tertiary" size="sm" onClick={() => onOpenChange(false)}>{t(isCurrentVersion ? 'common.close' : 'appUpdate.later')}</Button>
          <Button size="sm" disabled={isOpening} onClick={() => void onOpenRelease(releaseUrl)}>
            <ArrowUpRight aria-hidden="true" />{t(isCurrentVersion ? 'appUpdate.viewAnnouncement' : 'appUpdate.openRelease')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface AppUpdateNoticeProps {
  isAppReady: boolean
}

export function AppUpdateNotice({ isAppReady }: AppUpdateNoticeProps): React.JSX.Element | null {
  const { t } = useI18n()
  const result = useStore(stores.settings, (state) => state.appUpdate)
  const deferForTour = useStore(stores.settings, state => state.onboardingActive || (!!state.settings && !state.settings.onboardingSeen && !state.onboardingAutoAttempted))
  const [isOpen, setIsOpen] = useState(false)
  const [opening, setOpening] = useState(false)
  const [startupSettled, setStartupSettled] = useState(false)

  useEffect(() => {
    void actions.settings.checkForAppUpdate()
  }, [])

  useEffect(() => {
    if (!isAppReady) return
    const timer = window.setTimeout(() => setStartupSettled(true), 150)
    return () => window.clearTimeout(timer)
  }, [isAppReady])

  useEffect(() => {
    if (result?.updateAvailable) setIsOpen(true)
  }, [result])

  const openRelease = async (releaseUrl: string): Promise<void> => {
    setOpening(true)
    try {
      await actions.settings.openAppReleasePage(releaseUrl)
      setIsOpen(false)
    } catch (error) {
      notifyError(t('appUpdate.openFailed'), { cause: error })
    } finally {
      setOpening(false)
    }
  }

  const releaseUrl = result?.releaseUrl
  if (!result?.updateAvailable || !releaseUrl || !result.latestVersion) return null

  return (
    <AppUpdateDialog
      result={result}
      isOpen={isOpen && startupSettled && !deferForTour}
      onOpenChange={setIsOpen}
      onOpenRelease={url => { void openRelease(url) }}
      isOpening={opening}
    />
  )
}
