import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'
import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { StyleSliderRow } from './BrowserTab'
import { CheckSquare, ChevronDown, CircleAlert, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Square, X } from 'lucide-react'

import { useModelOptions } from '@/model-options'
import { DEFAULT_SETTINGS, LANGUAGE_LABELS, languageName } from '@/bridge'
import { CAPTION_SCHEMES } from '@/features/overlay'
import { useI18n } from '@/i18n'
import { sessionStore, stores, updateSettings, useStore } from '@/store'
import { reportSettingsFailure } from '../settingsErrorChannel'
import { SettingsRow } from '../SettingsRow'
import { SettingGroup, SettingSelect, SettingSwitch } from '../SettingsPage'
import type { PickerOption, SettingsPanelProps } from '../SettingsPage'

const FONT_FAMILIES = ['Segoe UI Variable', 'Noto Sans SC', 'Noto Sans TC', 'Noto Sans HK', 'Noto Sans JP', 'Noto Sans KR', 'Microsoft YaHei UI', 'PingFang SC', 'Cascadia Mono', 'Source Han Sans SC']
const PRESET_COLORS = ['#F7F7F7', '#D7DEE8', '#87D5FF', '#0D0E10', '#FFFFFF', '#4C9AFF']

export function AppearanceTab({ settings }: SettingsPanelProps) {
  const { t, language } = useI18n()
  const overlay = settings.overlay
  const modelOptions = useModelOptions()
  const session = useStore(sessionStore, (state) => state)
  const sessionActive = !['idle', 'error'].includes(session.status)
  const pending = useStore(stores.settings, (state) => state.pending)
  /*
   * The store keeps one error field for every command it runs, so a failure from another
   * page (a storage read, a caption session) would light this tab's save indicator even
   * though nothing written here failed. The indicator follows this tab's own writes.
   */
  const [saveError, setSaveError] = useState(false)
  const fontOptions = useMemo<PickerOption[]>(() => FONT_FAMILIES.map((family) => ({ value: family, label: family })), [])
  const write = (patch: Partial<typeof overlay>) => {
    void updateSettings({ overlay: patch })
      .then(() => setSaveError(false))
      .catch(() => setSaveError(true))
  }
  const label = (code: string) => {
    const entry = LANGUAGE_LABELS[code]
    return entry ? languageName(code, language) : code
  }
  const display = overlay.showSource && overlay.showTranslation ? 'both' : overlay.showSource ? 'source' : 'translation'

  const restore = () => {
    // Only appearance preferences are reset; the window pin is an independent control.
    const { alwaysOnTop, ...appearance } = DEFAULT_SETTINGS.overlay
    void alwaysOnTop
    void updateSettings({ overlay: appearance })
      .then(() => setSaveError(false))
      .catch((error: unknown) => {
        setSaveError(true)
        reportSettingsFailure(t('settings.resetAppearanceFailed'), error)
      })
  }

  return (
    <div className="settings-panel">
      <SettingGroup legend={t('modelsSettingsUi.preview')}>
        <div className="nola-overlay-stage">
          <div
            className="nola-caption-preview"
            data-color-scheme={overlay.colorScheme}
            data-transparent-background={overlay.backgroundOpacity <= 0}
            style={{
              '--preview-background-color': overlay.backgroundColor,
              '--preview-background-alpha': `${Math.round(overlay.backgroundOpacity * 100)}%`,
              '--preview-source-color': overlay.sourceColor,
              '--preview-translation-color': overlay.translationColor,
              '--preview-font-size': `${overlay.fontSize}px`,
              '--preview-font-weight': overlay.fontWeight,
              '--preview-line-height': overlay.lineHeight,
              '--preview-translation-font-size': `${overlay.translationFontSize}px`,
              '--preview-translation-font-weight': overlay.translationFontWeight,
              '--preview-translation-line-height': overlay.translationLineHeight,
              fontFamily: `${overlay.fontFamily}, var(--font-cjk-fallback), var(--font-ui), sans-serif`,
            } as CSSProperties}
            aria-hidden="true"
          >
            <div className="nola-caption-preview__text">
              {overlay.showSource ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewSource')}</p> : null}
              {overlay.showTranslation ? <p className="nola-caption-preview__translation">{t('modelsSettingsUi.previewTranslation')}</p> : null}
              {!overlay.showSource && !overlay.showTranslation ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewHidden')}</p> : null}
            </div>
            <div className="nola-caption-preview__scrim" data-edge="top" />
            <div className="nola-caption-preview__scrim" data-edge="bottom" />
            <div className="nola-caption-preview__actions">
              <Monitor /><Lock /><Pin /><i /><MoreHorizontal /><Minus /><X />
            </div>
            <div className="nola-caption-preview__controls">
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
              <span className="nola-caption-preview__pill">{modelOptions.recognitionModels.find(model => model.value === settings.recognition.modelId)?.label ?? settings.recognition.modelId}</span>
              <span className="nola-caption-preview__pill">{label(settings.recognition.sourceLanguage)}</span>
              <span className="nola-caption-preview__pill">{label(settings.translation.targetLanguage)}</span>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
              <span className="nola-caption-preview__pill">{t(overlay.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>
            </div>
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
        <span className="settings-save__state" role="status" data-error={saveError}>
          {saveError ? <CircleAlert aria-hidden="true" /> : <CheckSquare aria-hidden="true" />}
          {saveError ? t('modelsSettingsUi.saveError') : pending ? t('modelsSettingsUi.saving') : t('modelsSettingsUi.automaticSave')}
        </span>
        <Button variant="outline" disabled={pending} onClick={restore}>{t('modelsSettingsUi.resetAppearance')}</Button>
      </div>
    </div>
  )
}

export interface ChoiceProps { label: string; value: string; options: PickerOption[]; onChange: (value: string) => void }

function Choice({ label, value, options, onChange }: ChoiceProps) {
  return <TabsRoot value={value} onValueChange={next => { if (next) onChange(next) }}><TabsList className="nola-segmented" aria-label={label}>
    {options.map(option => <TabsTrigger key={option.value} value={option.value}>{option.label}</TabsTrigger>)}
  </TabsList></TabsRoot>
}

export interface SliderRowProps { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (value: number) => void }

function SliderRow({ label, ...props }: SliderRowProps) {
  return <SettingsRow label={label}><StyleSliderRow label={label} {...props} /></SettingsRow>
}

export interface ColorControlProps { label: string; value: string; onChange: (value: string) => void }

function ColorControl({ label, value, onChange }: ColorControlProps) {
  return <div className="settings-color"><span>{label}</span><ColorPicker label={label} value={value} presets={PRESET_COLORS} onChange={onChange} /></div>
}
