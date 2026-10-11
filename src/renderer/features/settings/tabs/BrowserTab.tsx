import { useEffect, useState } from 'react'
import { Alert, Button, Card, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, NumberField, Slider, Switch, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowLeft, CheckSquare, CircleAlert, ExternalLink } from 'lucide-react'
import type { CSSProperties } from 'react'
import { DEFAULT_SETTINGS } from '@/bridge'
import { BROWSER_EXTENSION_VERSION, type BrowserIntegrationInfo, type BrowserKind } from '../../../../shared/browser'
import chromeIcon from '@/assets/browsers/chrome.png'
import edgeIcon from '@/assets/browsers/edge.png'
import { useI18n } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { browserConnectionAction } from '@/store/settingsStore'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import '../../video-captions/video-captions.css'
import './browserSettings.css'

const BROWSERS: readonly BrowserKind[] = ['chrome', 'edge']
const BROWSER_ICONS: Record<BrowserKind, string> = { chrome: chromeIcon, edge: edgeIcon }
const FONT_FAMILIES = ['Segoe UI Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', 'Cascadia Mono', 'Source Han Sans SC']
const PRESET_COLORS = ['#F7F7F7', '#D7DEE8', '#87D5FF', '#0D0E10', '#FFFFFF', '#4C9AFF']

export function BrowserTab() {
  const { t } = useI18n()
  const { browser, browserBusy, browserError, settings: savedSettings, pending, error: settingsError } = useStore(stores.settings, state => state)
  const settings = savedSettings ?? DEFAULT_SETTINGS
  const appearance = settings.browserCaptions
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserKind | null>(null)
  useEffect(() => {
    void browserConnectionAction('inspect')
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
    if (info.extensionCompatible === false) return t('browser.extensionVersionMismatch')
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
  const patchAppearance = (patch: Partial<typeof appearance>) => { void updateSettings({ browserCaptions: patch }).catch(() => undefined) }
  const restoreAppearance = () => {
    void updateSettings({ browserCaptions: DEFAULT_SETTINGS.browserCaptions })
      .catch(() => toast.danger(t('modelsSettingsUi.restoreFailed')))
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
          <Button variant="secondary" className="browser-settings__back" onPress={() => setSelectedBrowser(null)}>
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
                      {hasExtension(info) ? <Button variant="secondary" isDisabled={browserBusy || !info.available}
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
      <Card className="nola-overlay-preview">
        <Card.Header><Card.Title className="text-lg font-semibold">{t('browser.preview')}</Card.Title></Card.Header>
        <Card.Content className="nola-overlay-stage nola-video-stage">
          <div className="nola-video-frame" style={previewFrameStyle} aria-hidden="true">
            {appearance.showSource ? <p className="nola-video-caption-line" style={previewSourceStyle}>{t('videoCaptions.previewSource')}</p> : null}
            {appearance.showTranslation ? <p className="nola-video-caption-line" data-role="translation" style={previewTranslationStyle}>{t('videoCaptions.previewTranslation')}</p> : null}
          </div>
        </Card.Content>
      </Card>
      <SettingGroup legend={t('modelsSettingsUi.layoutDisplay')}>
        <SettingsRow label={t('browser.colorScheme')}>
          <ToggleButtonGroup className="nola-segmented" selectionMode="single" disallowEmptySelection selectedKeys={new Set([appearance.colorScheme])} aria-label={t('browser.colorScheme')} onSelectionChange={keys => {
            const next = [...keys][0]
            if (next === 'dark' || next === 'light') {
              const palette = next === 'dark'
                ? { backgroundColor: '#0D0E10', sourceColor: '#F7F7F7', translationColor: '#D7DEE8' }
                : { backgroundColor: '#F7F7F7', sourceColor: '#1A1C22', translationColor: '#4A5160' }
              patchAppearance({ colorScheme: next, ...palette })
            }
          }}><ToggleButton id="dark">{t('settings.schemeDark')}</ToggleButton><ToggleButton id="light">{t('settings.schemeLight')}</ToggleButton></ToggleButtonGroup>
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
        <span className="settings-save__state" role="status" data-error={Boolean(settingsError)}>
          {settingsError ? <CircleAlert aria-hidden="true" /> : <CheckSquare aria-hidden="true" />}
          {settingsError ? t('modelsSettingsUi.saveError') : pending ? t('modelsSettingsUi.saving') : t('modelsSettingsUi.automaticSave')}
        </span>
        <Button variant="outline" isPending={pending} onPress={restoreAppearance}>{t('modelsSettingsUi.resetAppearance')}</Button>
      </div>
      {browserError ? <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{browserError}</Alert.Description></Alert.Content></Alert> : null}
    </div>
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
  const scalar = (next: number | number[]) => {
    const number = Array.isArray(next) ? next[0] : next
    if (number !== undefined && Number.isFinite(number)) onChange(number)
  }
  return <div className="settings-slider">
    <Slider value={value} minValue={min} maxValue={max} step={step} onChange={scalar} aria-label={label}><Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track></Slider>
    <NumberField value={value} minValue={min} maxValue={max} step={step} onChange={scalar} aria-label={label}><NumberField.Group><NumberField.Input className="tabular" /></NumberField.Group></NumberField>
    <span className="settings-slider__unit">{unit}</span>
  </div>
}

function toHex(value: unknown): string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && 'toString' in value) return (value as { toString: (format?: string) => string }).toString('hex')
  return '#000000'
}

export interface StyleColorControlProps {
  label: string
  value: string
  onChange: (value: string) => void
}

export function StyleColorControl({ label, value, onChange }: StyleColorControlProps) {
  const changed = (next: unknown) => onChange(toHex(next))
  return <div className="settings-color"><span>{label}</span>
    <ColorPicker value={value} onChange={changed}>
      <ColorPicker.Trigger aria-label={label}><ColorSwatch color={value} className="size-7 rounded-md" /></ColorPicker.Trigger>
      <ColorPicker.Popover aria-label={label}><div className="flex w-60 max-w-full flex-col gap-3 p-3">
        <ColorArea value={value} onChange={changed} colorSpace="hsb" xChannel="saturation" yChannel="brightness" aria-label={label} className="h-32"><ColorArea.Thumb /></ColorArea>
        <ColorSlider value={value} onChange={changed} channel="hue" colorSpace="hsb" aria-label={label}><ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track></ColorSlider>
        <ColorSwatchPicker value={value} onChange={changed} aria-label={label}>{PRESET_COLORS.map(color => <ColorSwatchPicker.Item key={color} color={color}><ColorSwatch /><ColorSwatchPicker.Indicator /></ColorSwatchPicker.Item>)}</ColorSwatchPicker>
        <ColorField value={value} onChange={changed} aria-label={label}><ColorField.Input /></ColorField>
      </div></ColorPicker.Popover>
    </ColorPicker>
  </div>
}
