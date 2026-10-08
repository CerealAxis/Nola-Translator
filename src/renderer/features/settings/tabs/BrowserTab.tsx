import { useEffect, useState } from 'react'
import { Alert, Button, Card, Switch } from '@heroui/react'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { BrowserIntegrationInfo, BrowserKind } from '../../../../shared/browser'
import chromeIcon from '@/assets/browsers/chrome.png'
import edgeIcon from '@/assets/browsers/edge.png'
import { useI18n } from '@/i18n'
import { stores, useStore } from '@/store'
import { browserConnectionAction } from '@/store/settingsStore'
import './browserSettings.css'

const BROWSERS: readonly BrowserKind[] = ['chrome', 'edge']
const BROWSER_ICONS: Record<BrowserKind, string> = { chrome: chromeIcon, edge: edgeIcon }

export function BrowserTab() {
  const { t } = useI18n()
  const { browser, browserBusy, browserError } = useStore(stores.settings, state => state)
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserKind | null>(null)
  useEffect(() => {
    void browserConnectionAction('status')
    const timer = setInterval(() => { void browserConnectionAction('status') }, 2000)
    return () => clearInterval(timer)
  }, [])
  const browserName = (kind: BrowserKind) => t(kind === 'chrome' ? 'browser.chrome' : 'browser.edge')
  const getBrowser = (kind: BrowserKind): BrowserIntegrationInfo => browser?.browsers?.find(info => info.browser === kind)
    ?? { browser: kind, available: true, extensionStatus: 'unknown', connected: false, enabled: false }
  const hasExtension = (info: BrowserIntegrationInfo) => info.extensionStatus === 'installed' || info.extensionStatus === 'disabled'
  const extensionStatus = (info: BrowserIntegrationInfo) => {
    if (!info.available) return t('browser.browserUnavailable')
    if (info.extensionStatus === 'unknown') return t(browser ? 'browser.extensionUnknown' : 'browser.extensionDetecting')
    if (info.extensionStatus === 'notInstalled') return t('browser.extensionNotInstalled')
    if (info.extensionStatus === 'disabled') return t('browser.extensionDisabled')
    return t('browser.extensionInstalled')
  }
  const enableLabel = (kind: BrowserKind) => t('browser.allowBrowserConnection', { browser: browserName(kind) })
  const extensionSwitch = (info: BrowserIntegrationInfo) => (
    <Switch isSelected={info.enabled} isDisabled={browserBusy || !info.available || !hasExtension(info)}
      onChange={enabled => { void browserConnectionAction('browserEnable', enabled, info.browser) }} aria-label={enableLabel(info.browser)}>
      <Switch.Content aria-label={enableLabel(info.browser)}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
    </Switch>
  )
  const selected = selectedBrowser ? getBrowser(selectedBrowser) : null

  return (
    <div className="settings-panel browser-settings">
      {selected ? (
        <>
          <Button variant="ghost" className="browser-settings__back" onPress={() => setSelectedBrowser(null)}>
            <ArrowLeft aria-hidden="true" />{t('browser.backToBrowsers')}
          </Button>
          <Card className="browser-settings__card">
            <Card.Content>
              <header className="browser-settings__detail-heading">
                <img className="browser-settings__icon" src={BROWSER_ICONS[selected.browser]} alt="" aria-hidden="true" />
                <div className="browser-settings__identity">
                  <h2>{browserName(selected.browser)}</h2>
                  <p className="browser-settings__status" data-status={selected.extensionStatus} role="status">{extensionStatus(selected)}</p>
                </div>
              </header>
              <div className="browser-settings__detail-actions">
                <Button variant="secondary" isDisabled={browserBusy}
                  onPress={() => { void browserConnectionAction('download', undefined, selected.browser) }}>{t('browser.downloadExtension')}</Button>
                <Button variant="secondary" isDisabled={browserBusy || !selected.available}
                  onPress={() => { void browserConnectionAction('manage', undefined, selected.browser) }}>
                  {t('browser.manageExtension')}<ExternalLink aria-hidden="true" />
                </Button>
              </div>
              <div className="browser-settings__detail-row">
                <span>{t('browser.allowConnection')}</span>{extensionSwitch(selected)}
              </div>
              <div className="browser-settings__detail-row">
                <span>{t('browser.connectionStatus')}</span>
                <span className="browser-settings__connection" data-connected={selected.connected}>
                  <span className="browser-settings__connection-dot" aria-hidden="true" />
                  {selected.connected ? t('browser.connected') : t('browser.connectionWaiting')}
                </span>
              </div>
            </Card.Content>
          </Card>
        </>
      ) : (
        <Card className="browser-settings__card">
          <Card.Header className="browser-settings__heading">
            <div className="browser-settings__identity"><Card.Title>{t('browser.title')}</Card.Title><p>{t('browser.settingsDescription')}</p></div>
            <Switch isSelected={browser?.enabled ?? false} isDisabled={browserBusy || !browser}
              onChange={enabled => { void browserConnectionAction('enable', enabled) }} aria-label={t('browser.enable')}>
              <Switch.Content aria-label={t('browser.enable')}><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content>
            </Switch>
          </Card.Header>
          <Card.Content>
            <ul className="browser-settings__list" aria-label={t('browser.browserList')}>
              {BROWSERS.map(kind => {
                const info = getBrowser(kind)
                return (
                  <li key={kind} className="browser-settings__browser" aria-label={browserName(kind)}>
                    <img className="browser-settings__icon" src={BROWSER_ICONS[kind]} alt="" aria-hidden="true" />
                    <div className="browser-settings__identity">
                      <h3>{browserName(kind)}</h3>
                      <p className="browser-settings__status" data-status={info.extensionStatus} role="status">{extensionStatus(info)}</p>
                    </div>
                    <div className="browser-settings__row-actions">
                      <Button variant="secondary" isDisabled={browserBusy}
                        aria-label={t('browser.downloadBrowserExtension', { browser: browserName(kind) })}
                        onPress={() => { void browserConnectionAction('download', undefined, kind) }}>{t('browser.downloadExtension')}</Button>
                      {hasExtension(info) ? <Button variant="ghost" isDisabled={browserBusy || !info.available}
                        aria-label={t('browser.manageBrowserExtension', { browser: browserName(kind) })}
                        onPress={() => setSelectedBrowser(kind)}>{t('browser.manage')}</Button> : null}
                      {hasExtension(info) ? extensionSwitch(info) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card.Content>
        </Card>
      )}
      {browserError ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{browserError}</Alert.Description></Alert.Content></Alert> : null}
    </div>
  )
}
