import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { Button, ColorArea, ColorField, ColorPicker, ColorSlider, ColorSwatch, ColorSwatchPicker, NumberField, Slider, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { CheckSquare, ChevronDown, CircleAlert } from 'lucide-react'

import { DEFAULT_SETTINGS } from '@/bridge'
import { CAPTION_SCHEMES } from '@/features/overlay'
import { useI18n } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

const FONT_FAMILIES = ['Segoe UI Variable', 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', 'Cascadia Mono', 'Source Han Sans SC']
const PRESET_COLORS = ['#F7F7F7', '#D7DEE8', '#87D5FF', '#0D0E10', '#FFFFFF', '#4C9AFF']

export function AppearanceTab({ settings }: SettingsPanelProps) {
  const { t } = useI18n()
  const overlay = settings.overlay
  const pending = useStore(stores.settings, (state) => state.pending)
  const error = useStore(stores.settings, (state) => state.error)
  const fontOptions = useMemo<PickerOption[]>(() => FONT_FAMILIES.map((family) => ({ value: family, label: family })), [])
  const write = (patch: Partial<typeof overlay>) => { void updateSettings({ overlay: patch }).catch(() => undefined) }

  const restore = () => {
    // Only appearance preferences are reset; the window lock and pin are independent controls.
    const { locked, alwaysOnTop, ...appearance } = DEFAULT_SETTINGS.overlay
    void locked
    void alwaysOnTop
    void updateSettings({ overlay: appearance }).catch(() => toast.danger(t('modelsSettingsUi.restoreFailed')))
  }

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('modelsSettingsUi.preview')}>
        <div className="settings-preview__stage">
          <div className="settings-preview" data-layout={overlay.layout} data-position={overlay.mode} style={{
            '--preview-color': overlay.backgroundColor, '--preview-opacity': overlay.backgroundOpacity,
            fontFamily: overlay.fontFamily,
          } as CSSProperties}>
            {overlay.showSource ? <p style={{ fontSize: overlay.fontSize, fontWeight: overlay.fontWeight, lineHeight: overlay.lineHeight, color: overlay.sourceColor }}>{t('modelsSettingsUi.previewSource')}</p> : null}
            {overlay.showTranslation ? <p style={{ fontSize: overlay.translationFontSize, fontWeight: overlay.translationFontWeight, lineHeight: overlay.translationLineHeight, color: overlay.translationColor }}>{t('modelsSettingsUi.previewTranslation')}</p> : null}
            {!overlay.showSource && !overlay.showTranslation ? <p style={{ color: overlay.sourceColor }}>{t('modelsSettingsUi.previewHidden')}</p> : null}
          </div>
        </div>
      </SettingGroup>

      <SettingGroup legend={t('modelsSettingsUi.layoutDisplay')}>
        <SettingsRow label={t('settings.overlayPosition')}>
          <Choice label={t('settings.overlayPosition')} value={overlay.mode} options={[
            { value:'free', label:t('settings.positionFree') }, { value:'top', label:t('settings.positionTop') }, { value:'bottom', label:t('settings.positionBottom') },
          ]} onChange={(mode) => write({ mode:mode as typeof overlay.mode })} />
        </SettingsRow>
        <SettingsRow label={t('settings.captionLayout')}>
          <Choice label={t('settings.captionLayout')} value={overlay.layout} options={[
            { value:'rolling', label:t('workspace.layoutSplit') }, { value:'sentence', label:t('workspace.layoutSentence') },
          ]} onChange={(layout) => write({ layout:layout as typeof overlay.layout })} />
        </SettingsRow>
        <SettingsRow label={t('settings.overlayScheme')}>
          <Choice label={t('settings.overlayScheme')} value={overlay.colorScheme} options={[
            { value:'dark', label:t('settings.schemeDark') }, { value:'light', label:t('settings.schemeLight') },
          ]} onChange={(value) => {
            const colorScheme = value as typeof overlay.colorScheme
            const palette = CAPTION_SCHEMES[colorScheme]
            write({ colorScheme, backgroundColor:palette.bg, sourceColor:palette.source, translationColor:palette.target })
          }} />
        </SettingsRow>
        <SettingsRow label={t('settings.showSource')}><SettingSwitch isSelected={overlay.showSource} ariaLabel={t('settings.showSource')} onChange={(showSource) => write({ showSource })} /></SettingsRow>
        <SettingsRow label={t('settings.showTranslation')}><SettingSwitch isSelected={overlay.showTranslation} ariaLabel={t('settings.showTranslation')} onChange={(showTranslation) => write({ showTranslation })} /></SettingsRow>
      </SettingGroup>

      <SettingGroup legend={t('modelsSettingsUi.fontColors')}>
        <SettingsRow label={t('settings.fontFamily')}><SettingSelect value={overlay.fontFamily} options={fontOptions} ariaLabel={t('settings.fontFamily')} onChange={(fontFamily) => write({ fontFamily })} /></SettingsRow>
        <SliderRow label={t('settings.sourceFontSize')} value={overlay.fontSize} min={10} max={48} step={1} unit="px" onChange={(fontSize) => write({ fontSize })} />
        <SliderRow label={t('settings.translationFontSize')} value={overlay.translationFontSize} min={10} max={48} step={1} unit="px" onChange={(translationFontSize) => write({ translationFontSize })} />
        <SliderRow label={t('settings.lineHeight')} value={overlay.lineHeight} min={1} max={2.5} step={0.05} onChange={(lineHeight) => write({ lineHeight, translationLineHeight:lineHeight })} />
        <SliderRow label={t('settings.backgroundOpacity')} value={Math.round(overlay.backgroundOpacity * 100)} min={0} max={100} step={1} unit="%" onChange={(value) => write({ backgroundOpacity:value / 100 })} />
        <div className="settings-colors">
          <ColorControl label={t('settings.sourceColor')} value={overlay.sourceColor} onChange={(sourceColor) => write({ sourceColor })} />
          <ColorControl label={t('settings.translationColor')} value={overlay.translationColor} onChange={(translationColor) => write({ translationColor })} />
          <ColorControl label={t('settings.backgroundColor')} value={overlay.backgroundColor} onChange={(backgroundColor) => write({ backgroundColor })} />
        </div>
      </SettingGroup>

      <div className="settings-save">
        <span className="settings-save__state" role="status" data-error={Boolean(error)}>
          {error ? <CircleAlert aria-hidden="true" /> : <CheckSquare aria-hidden="true" />}
          {error ? t('modelsSettingsUi.saveError') : pending ? t('modelsSettingsUi.saving') : t('modelsSettingsUi.automaticSave')}
        </span>
        <Button variant="outline" isPending={pending} onPress={restore}>{t('modelsSettingsUi.resetAppearance')}</Button>
      </div>
    </div>
  )
}

function Choice({ label, value, options, onChange }: { label:string; value:string; options:PickerOption[]; onChange:(value:string) => void }) {
  return <ToggleButtonGroup className="nola-segmented" selectionMode="single" disallowEmptySelection selectedKeys={new Set([value])} aria-label={label} size="sm" onSelectionChange={(keys) => {
    const next = [...keys][0]
    if (typeof next === 'string') onChange(next)
  }}>{options.map((option) => <ToggleButton key={option.value} id={option.value}>{option.label}</ToggleButton>)}</ToggleButtonGroup>
}

function SliderRow({ label, value, min, max, step, unit, onChange }: { label:string; value:number; min:number; max:number; step:number; unit?:string; onChange:(value:number) => void }) {
  const scalar = (next:number | number[]) => {
    const number = Array.isArray(next) ? next[0] : next
    if (number !== undefined && Number.isFinite(number)) onChange(number)
  }
  return <SettingsRow label={label}><div className="settings-slider">
    <Slider value={value} minValue={min} maxValue={max} step={step} onChange={scalar} aria-label={label}><Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track></Slider>
    <NumberField value={value} minValue={min} maxValue={max} step={step} onChange={scalar} aria-label={label}><NumberField.Group><NumberField.Input className="tabular" /></NumberField.Group></NumberField>
    {unit ? <span className="settings-slider__unit">{unit}</span> : null}
  </div></SettingsRow>
}

function toHex(value:unknown):string {
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && 'toString' in value) return (value as { toString:(format?:string) => string }).toString('hex')
  return '#000000'
}

function ColorControl({ label, value, onChange }: { label:string; value:string; onChange:(value:string) => void }) {
  const changed = (next:unknown) => onChange(toHex(next))
  return <div className="settings-color"><span>{label}</span>
    <ColorPicker value={value} onChange={changed}>
      <ColorPicker.Trigger aria-label={label}><ColorSwatch color={value} className="size-7 rounded-md" /><ChevronDown className="size-4" aria-hidden="true" /></ColorPicker.Trigger>
      <ColorPicker.Popover aria-label={label}><div className="flex w-60 max-w-full flex-col gap-3 p-3">
        <ColorArea value={value} onChange={changed} colorSpace="hsb" xChannel="saturation" yChannel="brightness" aria-label={label} className="h-32"><ColorArea.Thumb /></ColorArea>
        <ColorSlider value={value} onChange={changed} channel="hue" colorSpace="hsb" aria-label={label}><ColorSlider.Track><ColorSlider.Thumb /></ColorSlider.Track></ColorSlider>
        <ColorSwatchPicker value={value} onChange={changed} aria-label={label}>{PRESET_COLORS.map((color) => <ColorSwatchPicker.Item key={color} color={color}><ColorSwatch /><ColorSwatchPicker.Indicator /></ColorSwatchPicker.Item>)}</ColorSwatchPicker>
        <ColorField value={value} onChange={changed} aria-label={label}><ColorField.Input /></ColorField>
      </div></ColorPicker.Popover>
    </ColorPicker>
  </div>
}
