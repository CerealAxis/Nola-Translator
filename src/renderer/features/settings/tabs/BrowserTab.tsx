import { useEffect, useRef, useState } from 'react'
import { NumberField } from '@base-ui/react/number-field'
import { Switch, SwitchThumb } from '@/components/ui/switch'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { useI18n } from '@/i18n'
import { browserConnectionAction } from '@/store/settingsStore'
import { stores, useStore } from '@/store'
import { notifyRetryableFailure } from '@/components/primitives/notify'
import { BROWSER_EXTENSION_VERSION, type BrowserKind, type BrowserIntegrationInfo } from '../../../../shared/browser'
import chromeIcon from '@/assets/browsers/chrome.png'
import edgeIcon from '@/assets/browsers/edge.png'
import firefoxIcon from '@/assets/browsers/firefox.svg'

const BROWSERS: readonly BrowserKind[] = ['chrome', 'edge', 'firefox']
const BROWSER_ICONS: Record<BrowserKind, string> = { chrome: chromeIcon, edge: edgeIcon, firefox: firefoxIcon }
const PRESET_COLORS = ['#F7F7F7', '#D7DEE8', '#87D5FF', '#0D0E10', '#FFFFFF', '#4C9AFF']

export function BrowserTab() {
  const { t } = useI18n()
  const { browser, browserBusy, browserError } = useStore(stores.settings, state => state)
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserKind | null>(null)
  const reportedBrowserError = useRef<string | null>(null)
  const downloadTarget = useRef<BrowserKind | null>(null)
  async function downloadExtension(kind: BrowserKind) {
    downloadTarget.current = kind
    await browserConnectionAction('download', undefined, kind)
    if (!stores.settings.getState().browserError) downloadTarget.current = null
  }
  useEffect(() => {
    void browserConnectionAction('inspect')
  }, [])
  useEffect(() => {
    // The effect reads `t`, which changes with the interface language. Without the guard the
    // same failure would be announced a second time, in the language the user just picked.
    if (!browserError) {
      reportedBrowserError.current = null
      return
    }
    if (reportedBrowserError.current === browserError) return
    reportedBrowserError.current = browserError
    const failedDownload = downloadTarget.current
    if (failedDownload) {
      downloadTarget.current = null
      notifyRetryableFailure(t('browser.downloadFailedTitle'), {
        cause: browserError,
        description: t('browser.downloadFailedDescription'),
        action: { label: t('browser.retryDownload'), onPress: () => {
          reportedBrowserError.current = null
          void downloadExtension(failedDownload)
        } },
      })
      return
    }
    notifyRetryableFailure(t('errors.browserReconnectTitle'), {
      cause: browserError,
      description: t('errors.browserReconnectDescription'),
      action: { label: t('errors.browserReconnectAction'), onPress: () => {
        reportedBrowserError.current = null
        void browserConnectionAction('repair')
      } },
    })
  }, [browserError, t])
  const browserName = (kind: BrowserKind) => t(kind === 'firefox' ? 'browser.firefox' : kind === 'chrome' ? 'browser.chrome' : 'browser.edge')
  const getBrowser = (kind: BrowserKind): BrowserIntegrationInfo => browser?.browsers?.find(info => info.browser === kind)
    ?? { browser: kind, available: true, extensionStatus: 'unknown', connected: false, enabled: false }
  const hasExtension = (info: BrowserIntegrationInfo) => info.extensionStatus === 'installed' || info.extensionStatus === 'disabled'
  const extensionStatus = (info: BrowserIntegrationInfo) => {
    if (!info.available) return t('browser.browserUnavailable')
    if (info.extensionStatus === 'unknown') return t(browser ? 'browser.extensionUnknown' : 'browser.extensionDetecting')
    if (info.extensionStatus === 'notInstalled') return t('browser.extensionNotInstalled')
    if (info.extensionStatus === 'disabled') return t('browser.extensionDisabled')
    if (info.extensionCompatible === false) return t('browser.extensionVersionMismatch')
    return t('browser.extensionInstalled')
  }
  const enableLabel = (kind: BrowserKind) => t('browser.allowBrowserConnection', { browser: browserName(kind) })
  const extensionSwitch = (info: BrowserIntegrationInfo) => (
    <BrowserSwitch isSelected={info.enabled} isDisabled={browserBusy || !browser || !info.available || (!hasExtension(info) && info.enabled)}
      onChange={enabled => { void browserConnectionAction('browserEnable', enabled, info.browser) }} ariaLabel={enableLabel(info.browser)} />
  )
  const selected = selectedBrowser ? getBrowser(selectedBrowser) : null
  const reconnect = <Button variant="secondary" size="sm" disabled={browserBusy}
    onClick={() => { void browserConnectionAction('repair') }}>
    <RefreshCw aria-hidden="true" />{t('errors.browserReconnectAction')}
  </Button>
  return (
    <div className="settings-panel browser-settings">
      {selected ? (
        <>
          <Button variant="secondary" size="sm" className="browser-settings__back" onClick={() => setSelectedBrowser(null)}>
            <ArrowLeft aria-hidden="true" />{t('browser.backToBrowsers')}
          </Button>
          <section className="browser-settings__detail">
            <header className="browser-settings__detail-heading">
              <img className="browser-settings__icon" src={BROWSER_ICONS[selected.browser]} alt="" aria-hidden="true" />
              <div className="browser-settings__identity">
                <h2>{browserName(selected.browser)}</h2>
                <p className="browser-settings__status" data-status={selected.extensionStatus} role="status">{extensionStatus(selected)}</p>
              </div>
            </header>
            <div className="browser-settings__detail-actions">
              {reconnect}
              <Button variant="secondary" size="sm" disabled={browserBusy}
                onClick={() => { void downloadExtension(selected.browser) }}>{t('browser.downloadExtension')}</Button>
              <Button variant="secondary" size="sm" disabled={browserBusy || !selected.available}
                onClick={() => { void browserConnectionAction('manage', undefined, selected.browser) }}>
                {t('browser.manageExtension')}<ExternalLink aria-hidden="true" />
              </Button>
            </div>
            <div className="browser-settings__detail-row">
              <span>{t('browser.extensionVersion', { version: selected.extensionVersion ?? '—' })}</span>
              <span>{t('browser.expectedExtensionVersion', { version: BROWSER_EXTENSION_VERSION })}</span>
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
          </section>
        </>
      ) : (
        <section>
          <div className="browser-settings__heading">
            <div className="browser-settings__identity">
              <h2>{t('browser.enable')}</h2>
              <p>{t('browser.settingsDescription')}</p>
            </div>
            <div className="browser-settings__row-actions">
              {reconnect}
              <BrowserSwitch isSelected={browser?.enabled ?? false} isDisabled={browserBusy || !browser}
                onChange={enabled => { void browserConnectionAction('enable', enabled) }} ariaLabel={t('browser.enable')} />
            </div>
          </div>
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
                    <Button variant="secondary" size="sm" disabled={browserBusy}
                      aria-label={t('browser.downloadBrowserExtension', { browser: browserName(kind) })}
                      onClick={() => { void downloadExtension(kind) }}>{t('browser.downloadExtension')}</Button>
                    {hasExtension(info) ? <Button variant="secondary" size="sm" disabled={browserBusy || !info.available}
                      aria-label={t('browser.manageBrowserExtension', { browser: browserName(kind) })}
                      onClick={() => setSelectedBrowser(kind)}>{t('browser.manage')}</Button> : null}
                    {hasExtension(info) || browser && !info.enabled ? extensionSwitch(info) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

export interface BrowserSwitchProps {
  isSelected: boolean
  isDisabled: boolean
  ariaLabel: string
  onChange: (next: boolean) => void
}

/**
 * The connection switches keep the native button they had before: a disabled switch is then
 * out of reach of the pointer and of the keyboard, the way the rows around it expect.
 */
function BrowserSwitch({ isSelected, isDisabled, ariaLabel, onChange }: BrowserSwitchProps) {
  return (
    <Switch nativeButton render={<button type="button" />} className="switch"
      checked={isSelected} onCheckedChange={onChange} disabled={isDisabled} aria-label={ariaLabel} title={ariaLabel}>
      <span className="switch__control"><SwitchThumb className="switch__thumb" /></span>
    </Switch>
  )
}

export interface StyleSliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (value: number) => void
}

export function StyleSliderRow({ label, value, min, max, step, unit, onChange }: StyleSliderRowProps) {
  const scalar = (next: number | null) => {
    if (next !== null && Number.isFinite(next)) onChange(next)
  }
  return <div className="settings-slider">
    <SliderRoot className="slider" min={min} max={max} step={step} value={value} onValueChange={scalar}>
      <SliderControl className="flex w-full touch-none items-center py-2 select-none">
        <SliderTrack className="slider__track relative h-1 w-full rounded-full bg-surface-tertiary">
          <SliderIndicator className="slider__fill rounded-full bg-primary" />
          <SliderThumb className="slider__thumb size-3 rounded-full bg-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus" aria-label={label} />
        </SliderTrack>
      </SliderControl>
    </SliderRoot>
    <NumberField.Root className="number-field" min={min} max={max} step={step} value={value} onValueChange={scalar}>
      <NumberField.Group className="number-field__group">
        <NumberField.Input className="number-field__input tabular" aria-label={label} />
      </NumberField.Group>
    </NumberField.Root>
    <span className="settings-slider__unit">{unit}</span>
  </div>
}

export interface StyleColorControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function StyleColorControl({ label, value, onChange }: StyleColorControlProps) {
  return <div className="settings-color"><span>{label}</span><ColorPicker label={label} value={value} presets={PRESET_COLORS} onChange={onChange} /></div>
}
