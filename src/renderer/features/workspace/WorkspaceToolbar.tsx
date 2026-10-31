import { ModelAvailabilityLabel } from '@/features/workspace/ModelAvailabilityLabel'
import { useModelOptions } from '@/model-options'
import { Select, SelectContent, SelectFieldLabel, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover } from '@base-ui/react/popover'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'

import { Switch, SwitchThumb } from '@/components/ui/switch'
import { translationLanguages } from '../../../shared/model-capabilities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Captions, ChevronDown, Languages, Minus, Plus, SlidersHorizontal, StickyNote, Volume2 } from 'lucide-react'

import { DEFAULT_SETTINGS, languageName, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AudioDevice } from '@/bridge'
import { useI18n } from '@/i18n'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { swappedLanguagesOf, targetLanguagePatch } from '@/session-config'
import type { UiLanguage } from '@/i18n'
import { stores, updateSettings, useStore } from '@/store'
import { notifyInfo } from '@/components/primitives/notify'
import { useAvailableModels, useModelSelection, type AvailableModel } from '@/available-models'

export interface WorkspaceToolbarProps {
  readerOnly?: boolean
  audioSource: string
  devices: readonly AudioDevice[]
  onAudioSourceChange: (value: string) => void
  overlayVisible: boolean
  onOverlayVisibleChange: (visible: boolean) => void
  sourceLanguage: string
  targetLanguage: string
  onSourceLanguageChange: (code: string) => void
  onTargetLanguageChange: (code: string) => void
  onLanguagePairChange: (sourceLanguage: string, targetLanguage: string) => void
  displayMode: CaptionDisplayMode
  onDisplayModeChange: (mode: CaptionDisplayMode) => void
  layout: CaptionLayout
  onLayoutChange: (layout: CaptionLayout) => void
  fontSize: number
  onFontSizeChange: (fontSize: number) => void
  notesOpen: boolean
  onToggleNotes: () => void
  sessionLocked: boolean
  language: UiLanguage
}

export function WorkspaceToolbar(props: WorkspaceToolbarProps) {
  const { t } = useI18n()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const browserActive = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionServiceBusy)
  const locked = props.sessionLocked || browserActive
  const catalog = useAvailableModels()
  // The gateway may have loaded another model since the last session, and a cloud profile can lose
  // its key; the picker follows what is callable and says so rather than failing at start.
  const reportSwitch = (model: AvailableModel) => notifyInfo(t('gateway.modelSwitched', { name: model.name }),
    { description: t(model.origin === 'gateway' ? 'gateway.modelSwitchedLoaded' : 'gateway.modelSwitchedCloud') })
  const asr = useModelSelection('asr', catalog.asr, settings, reportSwitch)
  const translationOff = props.targetLanguage === NO_TRANSLATION_LANGUAGE
  // A session that shows source text only has nothing to repair: replacing its model would turn
  // translation back on by itself.
  const mt = useModelSelection('mt', catalog.mt, settings, reportSwitch, translationOff)
  const { sourceLanguages, targetLanguages, translation } = useModelOptions(
    asr.binding.startsWith('resource:') ? asr.binding.slice(9) : undefined,
    mt.binding.startsWith('resource:') ? mt.binding.slice(9) : undefined,
    props.sourceLanguage, props.targetLanguage)
  const translationChoices: AvailableModel[] = [{ binding: NO_TRANSLATION_LANGUAGE, name: t('workspaceUi.translationOff'), kind: 'mt', origin: 'cloud', free: true }, ...catalog.mt]
  const translationValue = translationOff ? NO_TRANSLATION_LANGUAGE : mt.binding
  const swappedLanguages = swappedLanguagesOf(props.sourceLanguage, props.targetLanguage, sourceLanguages, translation ? translationLanguages(translation, props.targetLanguage) : targetLanguages)
  const languageLabel = (code: string): string => languageName(code, props.language)
  const audioOptions = [{ value: 'defaultOutput', label: t('workspaceUi.systemAudio') }, ...props.devices.filter((device) => device.deviceId !== 'defaultOutput').map((device) => ({ value: device.deviceId, label: device.name }))]
  const modes = [{ id: 'both', label: t('workspace.modeBoth') }, { id: 'source', label: t('workspace.modeSource') }, { id: 'translation', label: t('workspace.modeTranslation') }] as const
  const pickTranslation = (value: string) => {
    if (value === NO_TRANSLATION_LANGUAGE) { void updateSettings(targetLanguagePatch(NO_TRANSLATION_LANGUAGE, props.targetLanguage)).catch(() => undefined); return }
    mt.select(value)
  }
  return (
    <Card data-slot="workspace-toolbar" className="nola-workspace-toolbar">
      <CardContent className="nola-workspace-toolbar-content">
        {!props.readerOnly && <div className="nola-workspace-config">
          <Select value={props.audioSource} onValueChange={value => { if (typeof value === 'string') props.onAudioSourceChange(value) }}>
            <div className="nola-workspace-audio">
              <SelectFieldLabel className="label">{t('workspaceUi.input')}</SelectFieldLabel>
              <SelectTrigger disabled={locked} className="select__trigger">
                <Volume2 aria-hidden="true" /><SelectValue className="select__value" />

              </SelectTrigger>
            </div>
            <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
              {audioOptions.map(option => <SelectItem key={option.value} value={option.value} label={option.label} className="list-box-item">{option.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          <div className="nola-workspace-field">
            <span><ModelAvailabilityLabel label={t('session.recognitionModel')} hint={t('gateway.modelNoneHint')} /></span>
            <Select value={asr.binding || null} onValueChange={value => { if (typeof value === 'string') asr.select(value) }}>
              <SelectTrigger disabled={locked} className="nola-workspace-picker"><SlidersHorizontal aria-hidden="true" /><SelectValue>{value => asr.unavailable ? t('gateway.modelNoneShort') : catalog.asr.find(model => model.binding === value)?.name ?? String(value ?? '')}</SelectValue></SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
                {asr.unavailable ? <SelectItem value="none" disabled>{t('gateway.modelNoneShort')}</SelectItem> : null}
                {catalog.asr.map(model => <SelectItem key={model.binding} value={model.binding} label={model.name} className="list-box-item">{model.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="nola-workspace-field">
            <span><ModelAvailabilityLabel label={t('session.translationModel')} hint={t('gateway.modelNoneHint')} /></span>
            <Select value={translationValue || null} onValueChange={value => { if (typeof value === 'string') pickTranslation(value) }}>
              <SelectTrigger disabled={locked} aria-label={t('session.translationModel')} className="nola-workspace-picker"><Languages aria-hidden="true" /><SelectValue>{value => translationChoices.find(option => option.binding === value)?.name ?? t('gateway.modelNoneShort')}</SelectValue></SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
                {translationChoices.map(option => <SelectItem key={option.binding} value={option.binding} label={option.name} className="list-box-item">{option.name}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="nola-workspace-field">
            <span>{t('workspaceUi.languages')}</span>
            <Popover.Root>
              <Popover.Trigger disabled={locked} aria-label={`${t('session.sourceLanguage')} / ${t('session.targetLanguage')}`} className="nola-workspace-picker"><Languages aria-hidden="true" /><span>{languageLabel(props.sourceLanguage)} → {languageLabel(props.targetLanguage)}</span><ChevronDown aria-hidden="true" /></Popover.Trigger>
              <Popover.Portal><Popover.Positioner className="z-dropdown"><Popover.Popup className="nola-workspace-languages" aria-label={t('workspaceUi.languages')}>
                <Button variant="tertiary" disabled={locked || !swappedLanguages} onClick={() => {
                  if (swappedLanguages) props.onLanguagePairChange(swappedLanguages.sourceLanguage, swappedLanguages.targetLanguage)
                }}>{t('session.swapLanguages')}</Button>
                <Select value={props.sourceLanguage} disabled={locked} onValueChange={value => { if (typeof value === 'string') props.onSourceLanguageChange(value) }}>
                  <SelectFieldLabel className="label">{t('session.sourceLanguage')}</SelectFieldLabel><SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => languageLabel(String(value ?? ''))}</SelectValue></SelectTrigger>
                  <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options">{sourceLanguages.map(code => <SelectItem key={code} value={code} label={languageLabel(code)} className="list-box-item">{languageLabel(code)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Select value={props.targetLanguage} disabled={locked} onValueChange={value => { if (typeof value === 'string') props.onTargetLanguageChange(value) }}>
                  <SelectFieldLabel className="label">{t('session.targetLanguage')}</SelectFieldLabel><SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => languageLabel(String(value ?? ''))}</SelectValue></SelectTrigger>
                  <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options">{targetLanguages.map(code => <SelectItem key={code} value={code} label={languageLabel(code)} className="list-box-item">{languageLabel(code)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Popover.Popup></Popover.Positioner></Popover.Portal>
            </Popover.Root>
          </div>
        </div>}
        <div className="nola-workspace-view-controls">
          <TabsRoot value={props.displayMode} onValueChange={value => { if (value) props.onDisplayModeChange(value as CaptionDisplayMode) }}>
            <TabsList className="nola-segmented" aria-label={t('workspace.displayMode')}>
              {modes.filter(mode => props.targetLanguage !== NO_TRANSLATION_LANGUAGE || mode.id === 'source').map(mode => <TabsTrigger key={mode.id} value={mode.id} aria-label={mode.label}>{mode.label}</TabsTrigger>)}
            </TabsList>
          </TabsRoot>
          {props.targetLanguage !== NO_TRANSLATION_LANGUAGE && <TabsRoot value={props.layout} onValueChange={value => { if (value) props.onLayoutChange(value as CaptionLayout) }}>
            <TabsList className="nola-segmented" aria-label={t('workspace.layout')}>
              <TabsTrigger value="split" aria-label={t('workspace.layoutSplit')}>{t('workspace.layoutSplit')}</TabsTrigger>
              <TabsTrigger value="sentence" aria-label={t('workspace.layoutSentence')}>{t('workspace.layoutSentence')}</TabsTrigger>
            </TabsList>
          </TabsRoot>}
          <div className="nola-workspace-font-control"><span>{t('workspaceUi.fontSize')}</span>
            <TabsRoot value={String(props.fontSize)} onValueChange={value => { if (value) props.onFontSizeChange(Number(value)) }}>
              <TabsList className="nola-segmented" aria-label={t('workspaceUi.fontSize')}>
                <TabsTrigger value="14" aria-label={t('workspace.fontSmaller')}><Minus aria-hidden="true" />A</TabsTrigger>
                <TabsTrigger value="16" aria-label={t('overlay.size')}>A</TabsTrigger>
                <TabsTrigger value="18" aria-label={t('workspace.fontLarger')}>A<Plus aria-hidden="true" /></TabsTrigger>
              </TabsList>
            </TabsRoot>
          </div>
          <Switch checked={props.overlayVisible} onCheckedChange={props.onOverlayVisibleChange} className="nola-workspace-notes-switch nola-workspace-overlay-switch">
            <Captions aria-hidden="true" />
            <span className="nola-workspace-notes-switch__label">{t('workspaceUi.openOverlay')}</span>
            <span className="switch__control"><SwitchThumb className="switch__thumb" /></span>
          </Switch>
          <Switch checked={props.notesOpen} onCheckedChange={props.onToggleNotes} className="nola-workspace-notes-switch">
            <StickyNote aria-hidden="true" />
            <span className="nola-workspace-notes-switch__label">{t('workspace.notes')}</span>
            <span className="switch__control"><SwitchThumb className="switch__thumb" /></span>
          </Switch>
        </div>
      </CardContent>
    </Card>
  )
}
