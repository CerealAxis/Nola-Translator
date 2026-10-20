import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Avatar, AvatarGroup, Button, Link, Surface, Tooltip, Typography } from '@heroui/react'
import { Check, ExternalLink, Github, Heart, RefreshCw, UserRound } from 'lucide-react'

import type { AppUpdateCheckResult } from '@/bridge'
import { notifyError, notifySuccess } from '@/components/primitives/notify'
import { useI18n } from '@/i18n'
import { actions } from '@/store'
import { stores, useStore } from '@/store'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingGroup } from '../SettingsPage'
import { SettingsRow } from '../SettingsRow'
import { ThirdPartyNotices } from '../ThirdPartyNotices'
import { AppUpdateDialog } from '../AppUpdateNotice'
import packageInfo from '../../../../../package.json'
import nolaLogoUrl from '../../../../../assets/brand/nola-logo.svg'
import authorAvatarUrl from '../../../../../assets/brand/cerealaxis.png'
import heroAvatarUrl from '../../../../../assets/brand/heroui.png'
import './more.css'

const AUTHOR_URL = 'https://github.com/CerealAxis'
const SPONSORS_URL = 'https://github.com/sponsors/CerealAxis'
const REPOSITORY_URL = 'https://github.com/CerealAxis/Nola-Translator'
const HEROUI_URL = 'https://heroui.com/'
const COPIED_HOLD_MS = 1500

export function MoreTab() {
  const { t } = useI18n()
  const updateChecking = useStore(stores.settings, state => state.appUpdateChecking)
  const sessionBusy = useStore(stores.session, state => ['starting', 'running', 'paused', 'stopping'].includes(state.status))
  const runtimeBusy = useStore(stores.settings, state => state.runtimeBusy)
  const browserBusy = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionService === 'loading' || state.captionService === 'ready')
  const [announcement, setAnnouncement] = useState<AppUpdateCheckResult | null>(null)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [announcementOpening, setAnnouncementOpening] = useState(false)

  async function checkUpdates() {
    const result = await actions.settings.checkForAppUpdate(true)
    if (!result || result.latestVersion === null) {
      notifyError(t('appUpdate.checkFailed'))
      return
    }
    if (result.updateAvailable) {
      notifySuccess(t('appUpdate.availableStatus', { version: result.latestVersion }))
      return
    }
    notifySuccess(t('appUpdate.upToDateStatus', { version: result.latestVersion }))
    if (!result.releaseUrl) {
      notifyError(t('appUpdate.checkFailed'))
      return
    }
    setAnnouncement(result)
    setAnnouncementOpen(true)
  }

  async function openAnnouncement(url: string) {
    setAnnouncementOpening(true)
    try {
      await actions.settings.openAppReleasePage(url)
      setAnnouncementOpen(false)
    } catch (error) {
      notifyError(t('appUpdate.openFailed'), { cause: error })
    } finally {
      setAnnouncementOpening(false)
    }
  }

  /**
   * The store records a failed command in its error field instead of rejecting, so the
   * field is cleared first and read afterwards: whatever it holds then is this failure.
   */
  async function openLogsDirectory() {
    actions.settings.clearSettingsError()
    await actions.settings.openLogs()
    const failure = stores.settings.getState().error
    if (failure === null) return
    reportSettingsFailure(t('settings.openLogsFailed'), failure)
  }

  return (
    <div className="settings-panel settings-more">
      <SettingGroup legend={t('onboarding.title')}>
        <SettingsRow label={t('onboarding.title')} desc={t('onboarding.replayHint')}>
          <Button variant="secondary" size="sm" data-onboarding="replay" isDisabled={sessionBusy || runtimeBusy || browserBusy}
            onPress={() => { actions.settings.startOnboarding('welcome') }}>{t('onboarding.replay')}</Button>
        </SettingsRow>
      </SettingGroup>
      <SettingGroup legend={t('settings.groupAbout')}>
        <IdentityRow name={packageInfo.author} description={t('more.authorDescription')} image={authorAvatarUrl}
          action={<div className="settings-more__identity-actions">
            <ExternalAction href={AUTHOR_URL} label={t('more.githubProfile')} icon={<Github aria-hidden="true" />} />
            <ExternalAction href={SPONSORS_URL} label={t('more.sponsor')} icon={<Heart aria-hidden="true" />} />
          </div>} />
        <IdentityRow name={packageInfo.productName} description={t('more.appVersion', { version: packageInfo.version })} image={nolaLogoUrl} isLogo
          action={<div className="settings-more__identity-actions">
            <ExternalAction href={REPOSITORY_URL} label={t('more.sourceCode')} icon={<Github aria-hidden="true" />} />
            <Button variant="tertiary" size="sm" isPending={updateChecking} onPress={() => void checkUpdates()}>
              <RefreshCw aria-hidden="true" />{t('appUpdate.checkNow')}
            </Button>
          </div>} />
        <SettingsRow label={t('settings.thirdPartyNotices')} desc={t('settings.thirdPartyNoticesHint')} descriptionTooltip>
          <ThirdPartyNotices />
        </SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('more.specialThanks')}>
        <IdentityRow name="HeroUI" description={t('more.heroThanks')} image={heroAvatarUrl}
          action={<ExternalAction href={HEROUI_URL} label={t('more.heroWebsite')} />} />
      </SettingGroup>

      <SettingGroup legend={t('more.sponsors')}>
        <div className="settings-more__sponsors">
          <Tooltip delay={300}>
            <Tooltip.Trigger className="settings-more__sponsor-trigger" aria-label={t('more.sponsorVacancies')}>
              <AvatarGroup size="lg" variant="soft" color="accent" isGrid role="group" aria-label={t('more.sponsorVacancies')}>
                {[0, 1, 2, 3, 4].map(slot => (
                  <Avatar key={slot} className="settings-more__vacancy" aria-hidden="true">
                    <Avatar.Fallback><UserRound aria-hidden="true" /></Avatar.Fallback>
                  </Avatar>
                ))}
              </AvatarGroup>
            </Tooltip.Trigger>
            <Tooltip.Content>{t('more.sponsorInfo')}</Tooltip.Content>
          </Tooltip>
          <Heart className="settings-more__heart" aria-hidden="true" />
        </div>
      </SettingGroup>

      <SettingGroup legend={t('settings.groupReport')}>
        <SettingsRow label={t('settings.copyDiagnostics')}><CopyDiagnostics /></SettingsRow>
        <SettingsRow label={t('settings.openLogs')} desc={t('settings.openLogsHint')} descriptionTooltip>
          <Button variant="tertiary" size="sm" onPress={() => { void openLogsDirectory() }}>{t('settings.openLogs')}</Button>
        </SettingsRow>
        <SettingsRow label={t('settings.githubIssue')} desc={t('settings.githubIssueHint')} descriptionTooltip>
          <ExternalAction href={`${REPOSITORY_URL}/issues`} label={t('settings.openInBrowser')} />
        </SettingsRow>
        <SettingsRow label={t('settings.qqGroup')}>
          <Surface className="settings-more__code"><Typography.Code>701699932</Typography.Code></Surface>
        </SettingsRow>
      </SettingGroup>
      {announcement ? <AppUpdateDialog result={announcement} isOpen={announcementOpen} isCurrentVersion
        onOpenChange={setAnnouncementOpen} onOpenRelease={url => { void openAnnouncement(url) }} isOpening={announcementOpening} /> : null}
    </div>
  )
}

export interface IdentityRowProps {
  name: string
  description: string
  image: string
  isLogo?: boolean
  action: ReactNode
}

function IdentityRow({ name, description, image, isLogo, action }: IdentityRowProps) {
  return (
    <div className="settings-more__identity">
      <Avatar size="lg" className={['settings-more__avatar', isLogo && 'settings-more__avatar--logo'].filter(Boolean).join(' ')}>
        <Avatar.Image src={image} alt={name} />
        <Avatar.Fallback>{name.slice(0, 1)}</Avatar.Fallback>
      </Avatar>
      <div className="settings-more__identity-copy">
        <p className="settings-more__name">{name}</p>
        <p className="settings-more__description">{description}</p>
      </div>
      {action}
    </div>
  )
}

export interface ExternalActionProps { href: string; label: string; icon?: ReactNode }

function ExternalAction({ href, label, icon }: ExternalActionProps) {
  // Electron opens HTTPS links in the default browser through setWindowOpenHandler.
  return (
    <Link className="settings-more__link button button--sm button--tertiary h-9 gap-2 md:h-8 text-foreground no-underline"
      href={href} target="_blank" rel="noreferrer">
      {icon}{label}<ExternalLink aria-hidden="true" />
    </Link>
  )
}

function CopyDiagnostics() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_HOLD_MS)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    setPending(true)
    try {
      await actions.settings.copyDiagnostics()
      setCopied(true)
    } catch (error) {
      console.error('[diagnostics]', error)
      notifyError(t('errors.copyDiagnosticsFailed'), { cause: error })
    } finally { setPending(false) }
  }

  return (
    <Button variant="tertiary" size="sm" isPending={pending} onPress={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : null}
      {copied ? t('common.copied') : t('settings.copyDiagnostics')}
    </Button>
  )
}
