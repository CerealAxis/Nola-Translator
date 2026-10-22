import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { NumberField } from '@base-ui/react/number-field'
import { SliderRoot, SliderControl, SliderTrack, SliderIndicator, SliderThumb } from '@/components/ui/slider'
import { Switch, SwitchThumb } from '@/components/ui/switch'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ArrowLeft, CheckSquare, CircleAlert, ExternalLink, LoaderCircle } from 'lucide-react'

import { DEFAULT_SETTINGS } from '@/bridge'
import { BROWSER_EXTENSION_VERSION, type BrowserIntegrationInfo, type BrowserKind } from '../../../../shared/browser'
import chromeIcon from '@/assets/browsers/chrome.png'
import edgeIcon from '@/assets/browsers/edge.png'
import firefoxIcon from '@/assets/browsers/firefox.svg'
import { notifyError } from '@/components/primitives/notify'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ColorPicker } from '@/components/ui/color-picker'
import { useI18n } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { browserConnectionAction } from '@/store/settingsStore'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import '../../video-captions/video-captions.css'
import './browserSettings.css'

const BROWSERS: readonly BrowserKind[] = ['chrome', 'edge', 'firefox']
const BROWSER_ICONS: Record<BrowserKind, string> = { chrome: chromeIcon, edge: edgeIcon, firefox: firefoxIcon }
const FONT_FAMILIES = ['Segoe UI Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', 'Cascadia Mono', 'Source Han Sans SC']
const PRESET_COLORS = ['#F7F7F7', '#D7DEE8', '#87D5FF', '#0D0E10', '#FFFFFF', '#4C9AFF']

export function BrowserTab() {
  const { t } = useI18n()
  const { browser, browserBusy, browserError, settings: savedSettings, pending } = useStore(stores.settings, state => state)
  /*
   * The store keeps one error field for every command it runs, so a failure from another
   * page (a storage read, a caption session) would light this tab's save indicator even
   * though nothing written here failed. The indicator follows this tab's own writes.
   */
  const [saveError, setSaveError] = useState(false)
  const settings = savedSettings ?? DEFAULT_SETTINGS
  const appearance = settings.browserCaptions
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserKind | null>(null)
  const reportedBrowserError = useRef<string | null>(null)
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
    notifyError(t('browser.connectionFailed'), {
      cause: browserError,
      action: { label: t('models.retry'), onPress: () => void browserConnectionAction('inspect') },
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
    <BrowserSwitch isSelected={info.enabled} isDisabled={browserBusy || !info.available || !hasExtension(info)}
      onChange={enabled => { void browserConnectionAction('browserEnable', enabled, info.browser) }} ariaLabel={enableLabel(info.browser)} />
  )
  const selected = selectedBrowser ? getBrowser(selectedBrowser) : null
  const patchAppearance = (patch: Partial<typeof appearance>) => {
    void updateSettings({ browserCaptions: patch })
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true))
  }
  const restoreAppearance = () => {
    void updateSettings({ browserCaptions: DEFAULT_SETTINGS.browserCaptions })
      .then(() => setSaveError(false))
      .catch((error: unknown) => {
        setSaveError(true)
        reportSettingsFailure(t('settings.resetAppearanceFailed'), error)
      })
  }
  const previewFrameStyle = {
    '--video-caption-top': `${100 - appearance.bottomOffset}%`,
    fontFamily: appearance.fontFamily,
    lineHeight: appearance.lineHeight,
    background: `color-mix(in oklab, ${appearance.backgroundColor} ${appearance.backgroundOpacity * 100}%, transparent)`,
  } as CSSProperties
  const previewSourceStyle = { color: appearance.sourceColor, fontSize: appearance.sourceFontSize }
  const previewTranslationStyle = { color: appearance.translationColor, fontSize: appearance.translationFontSize }

  return (
    <div className="settings-panel browser-settings">
      {selected ? (
        <>
          <Button variant="secondary" className="browser-settings__back" onClick={() => setSelectedBrowser(null)}>
            <ArrowLeft aria-hidden="true" />{t('browser.backToBrowsers')}
          </Button>
          <Card className="browser-settings__card">
            <CardContent className="card__content">
              <header className="browser-settings__detail-heading">
                <img className="browser-settings__icon" src={BROWSER_ICONS[selected.browser]} alt="" aria-hidden="true" />
                <div className="browser-settings__identity">
                  <h2>{browserName(selected.browser)}</h2>
                  <p className="browser-settings__status" data-status={selected.extensionStatus} role="status">{extensionStatus(selected)}</p>
                </div>
              </header>
              <div className="browser-settings__detail-actions">
                <Button variant="secondary" disabled={browserBusy}
                  onClick={() => { void browserConnectionAction('download', undefined, selected.browser) }}>{t('browser.downloadExtension')}</Button>
                <Button variant="secondary" disabled={browserBusy || !selected.available}
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
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="browser-settings__card">
          <CardHeader className="card__header browser-settings__heading">
            <div className="browser-settings__identity"><CardTitle className="card__title">{t('browser.title')}</CardTitle><p>{t('browser.settingsDescription')}</p></div>
            <BrowserSwitch isSelected={browser?.enabled ?? false} isDisabled={browserBusy || !browser}
              onChange={enabled => { void browserConnectionAction('enable', enabled) }} ariaLabel={t('browser.enable')} />
          </CardHeader>
          <CardContent className="card__content">
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
                      <Button variant="secondary" disabled={browserBusy}
                        aria-label={t('browser.downloadBrowserExtension', { browser: browserName(kind) })}
                        onClick={() => { void browserConnectionAction('download', undefined, kind) }}>{t('browser.downloadExtension')}</Button>
                      {hasExtension(info) ? <Button variant="secondary" disabled={browserBusy || !info.available}
                        aria-label={t('browser.manageBrowserExtension', { browser: browserName(kind) })}
                        onClick={() => setSelectedBrowser(kind)}>{t('browser.manage')}</Button> : null}
                      {hasExtension(info) ? extensionSwitch(info) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card className="nola-overlay-preview">
        <CardHeader><CardTitle className="card__title text-lg font-semibold">{t('browser.preview')}</CardTitle></CardHeader>
        <CardContent className="card__content nola-overlay-stage nola-video-stage">
          <div className="nola-video-frame" style={previewFrameStyle} aria-hidden="true">
            {appearance.showSource ? <p className="nola-video-caption-line" style={previewSourceStyle}>{t('videoCaptions.previewSource')}</p> : null}
            {appearance.showTranslation ? <p className="nola-video-caption-line" data-role="translation" style={previewTranslationStyle}>{t('videoCaptions.previewTranslation')}</p> : null}
          </div>
        </CardContent>
      </Card>
      <SettingGroup legend={t('modelsSettingsUi.layoutDisplay')}>
        <SettingsRow label={t('browser.colorScheme')}>
          <ToggleGroup className="nola-segmented" value={[appearance.colorScheme]} aria-label={t('browser.colorScheme')} onValueChange={values => {
            // A single-select group reports an empty list when the pressed scheme is clicked
            // again, so the scheme is never left with nothing selected.
            const next = values[0]
            if (next === 'dark' || next === 'light') {
              const palette = next === 'dark'
                ? { backgroundColor: '#0D0E10', sourceColor: '#F7F7F7', translationColor: '#D7DEE8' }
                : { backgroundColor: '#F7F7F7', sourceColor: '#1A1C22', translationColor: '#4A5160' }
              patchAppearance({ colorScheme: next, ...palette })
            }
          }}>
            <ToggleGroupItem value="dark" className="toggle-button" data-selected={appearance.colorScheme === 'dark' ? 'true' : undefined}>{t('settings.schemeDark')}</ToggleGroupItem>
            <ToggleGroupItem value="light" className="toggle-button" data-selected={appearance.colorScheme === 'light' ? 'true' : undefined}>{t('settings.schemeLight')}</ToggleGroupItem>
          </ToggleGroup>
        </SettingsRow>
        <SettingsRow label={t('settings.showSource')}><SettingSwitch isSelected={appearance.showSource} ariaLabel={t('settings.showSource')} onChange={showSource => patchAppearance({ showSource })} /></SettingsRow>
        <SettingsRow label={t('settings.showTranslation')}><SettingSwitch isSelected={appearance.showTranslation} ariaLabel={t('settings.showTranslation')} onChange={showTranslation => patchAppearance({ showTranslation })} /></SettingsRow>
        <SettingsRow label={t('browser.bottomOffset')} desc={t('browser.bottomOffsetHint')} descriptionTooltip><StyleSliderRow label={t('browser.bottomOffset')} value={appearance.bottomOffset} min={0} max={30} step={1} unit="%" onChange={bottomOffset => patchAppearance({ bottomOffset })} /></SettingsRow>
      </SettingGroup>
      <SettingGroup legend={t('modelsSettingsUi.fontColors')}>
        <SettingsRow label={t('settings.fontFamily')}><SettingSelect value={appearance.fontFamily} options={FONT_FAMILIES.map(value => ({ value, label: value }))} ariaLabel={t('settings.fontFamily')} onChange={fontFamily => patchAppearance({ fontFamily })} /></SettingsRow>
        <SettingsRow label={t('settings.sourceFontSize')}><StyleSliderRow label={t('settings.sourceFontSize')} value={appearance.sourceFontSize} min={10} max={48} step={1} unit="px" onChange={sourceFontSize => patchAppearance({ sourceFontSize })} /></SettingsRow>
        <SettingsRow label={t('settings.translationFontSize')}><StyleSliderRow label={t('settings.translationFontSize')} value={appearance.translationFontSize} min={10} max={48} step={1} unit="px" onChange={translationFontSize => patchAppearance({ translationFontSize })} /></SettingsRow>
        <SettingsRow label={t('settings.lineHeight')}><StyleSliderRow label={t('settings.lineHeight')} value={appearance.lineHeight} min={1} max={2.5} step={0.05} onChange={lineHeight => patchAppearance({ lineHeight })} /></SettingsRow>
        <SettingsRow label={t('settings.backgroundOpacity')}><StyleSliderRow label={t('settings.backgroundOpacity')} value={Math.round(appearance.backgroundOpacity * 100)} min={0} max={100} step={1} unit="%" onChange={value => patchAppearance({ backgroundOpacity: value / 100 })} /></SettingsRow>
        <div className="settings-colors">
          <StyleColorControl label={t('settings.sourceColor')} value={appearance.sourceColor} onChange={sourceColor => patchAppearance({ sourceColor })} />
          <StyleColorControl label={t('settings.translationColor')} value={appearance.translationColor} onChange={translationColor => patchAppearance({ translationColor })} />
          <StyleColorControl label={t('settings.backgroundColor')} value={appearance.backgroundColor} onChange={backgroundColor => patchAppearance({ backgroundColor })} />
        </div>
      </SettingGroup>
      <div className="settings-save">
        <span className="settings-save__state" role="status" data-error={saveError}>
          {saveError ? <CircleAlert aria-hidden="true" /> : <CheckSquare aria-hidden="true" />}
          {saveError ? t('modelsSettingsUi.saveError') : pending ? t('modelsSettingsUi.saving') : t('modelsSettingsUi.automaticSave')}
        </span>
        <Button variant="outline" disabled={pending} onClick={restoreAppearance}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {t('modelsSettingsUi.resetAppearance')}
        </Button>
      </div>
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
      checked={isSelected} onCheckedChange={onChange} disabled={isDisabled} aria-label={ariaLabel}>
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
          <SliderIndicator className="slider__fill rounded-full bg-accent" />
          <SliderThumb className="slider__thumb size-3 rounded-full bg-accent focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus" aria-label={label} />
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
