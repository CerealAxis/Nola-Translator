import { useModelOptions } from '@/model-options'
import { Select, SelectContent, SelectFieldLabel, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover } from '@base-ui/react/popover'
import { TabsRoot, TabsList, TabsTrigger } from '@/components/ui'

import { Switch, SwitchThumb } from '@/components/ui/switch'
import { translationLanguages } from '../../../shared/model-capabilities'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Captions, ChevronDown, Languages, Minus, Plus, SlidersHorizontal, StickyNote, Volume2 } from 'lucide-react'

import { languageName, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AudioDevice, RecognitionModelId, TranslationProvider } from '@/bridge'
import { useI18n } from '@/i18n'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { swappedLanguagesOf } from '@/session-config'
import type { UiLanguage } from '@/i18n'

export interface WorkspaceToolbarProps {
  readerOnly?: boolean
  modelId: RecognitionModelId
  onModelChange: (modelId: RecognitionModelId) => void
  translationModelId: string
  translationProvider: TranslationProvider
  translationProviderLabel: string
  onTranslationModelChange: (value: string) => void
  audioSource: string
  devices: readonly AudioDevice[]
  onAudioSourceChange: (value: string) => void
  onOpenOverlay: () => void
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
  const { recognitionModels, translationModels, sourceLanguages, targetLanguages, translation } = useModelOptions(props.modelId, props.translationModelId, props.sourceLanguage, props.targetLanguage)
  const translationChoices = [
    { value: NO_TRANSLATION_LANGUAGE, label: t('workspaceUi.translationOff'), isDisabled: false },
    ...translationModels,
    ...(props.translationProvider !== 'local' ? [{ value: props.translationProvider, label: props.translationProviderLabel, isDisabled: false }] : []),
  ]
  const translationValue = props.targetLanguage === NO_TRANSLATION_LANGUAGE ? NO_TRANSLATION_LANGUAGE : props.translationProvider === 'local' ? props.translationModelId : props.translationProvider
  if (!translationChoices.some(option => option.value === translationValue)) translationChoices.push({ value: translationValue, label: translationValue, isDisabled: true })
  const swappedLanguages = swappedLanguagesOf(props.sourceLanguage, props.targetLanguage, sourceLanguages, translation ? translationLanguages(translation, props.targetLanguage) : targetLanguages)
  const languageLabel = (code: string): string => languageName(code, props.language)
  const audioOptions = [{ value: 'defaultOutput', label: t('workspaceUi.systemAudio') }, ...props.devices.filter((device) => device.deviceId !== 'defaultOutput').map((device) => ({ value: device.deviceId, label: device.name }))]
  const modes = [{ id: 'both', label: t('workspace.modeBoth') }, { id: 'source', label: t('workspace.modeSource') }, { id: 'translation', label: t('workspace.modeTranslation') }] as const
  return (
    <Card data-slot="workspace-toolbar" className="nola-workspace-toolbar">
      <CardContent className="nola-workspace-toolbar-content">
        {!props.readerOnly && <div className="nola-workspace-config">
          <Select value={props.audioSource} onValueChange={value => { if (typeof value === 'string') props.onAudioSourceChange(value) }}>
            <div className="nola-workspace-audio">
              <SelectFieldLabel className="label">{t('workspaceUi.input')}</SelectFieldLabel>
              <SelectTrigger disabled={props.sessionLocked} className="select__trigger">
                <Volume2 aria-hidden="true" /><SelectValue className="select__value" />

              </SelectTrigger>
            </div>
            <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
              {audioOptions.map(option => <SelectItem key={option.value} value={option.value} label={option.label} className="list-box-item">{option.label}</SelectItem>)}
            </SelectGroup></SelectContent>
          </Select>
          <div className="nola-workspace-field">
            <span>{t('session.recognitionModel')}</span>
            <Select value={props.modelId} onValueChange={value => { if (typeof value === 'string') props.onModelChange(value as RecognitionModelId) }}>
              <SelectTrigger disabled={props.sessionLocked} className="nola-workspace-picker"><SlidersHorizontal aria-hidden="true" /><SelectValue>{value => recognitionModels.find(model => model.value === value)?.label ?? String(value ?? '')}</SelectValue></SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
                {recognitionModels.map(model => <SelectItem key={model.value} value={model.value} label={model.label} disabled={model.isDisabled} className="list-box-item">{model.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="nola-workspace-field">
            <span>{t('session.translationModel')}</span>
            <Select value={translationValue} onValueChange={value => { if (typeof value === 'string') props.onTranslationModelChange(value) }}>
              <SelectTrigger disabled={props.sessionLocked} aria-label={t('session.translationModel')} className="nola-workspace-picker"><Languages aria-hidden="true" /><SelectValue>{value => translationChoices.find(option => option.value === value)?.label ?? String(value ?? '')}</SelectValue></SelectTrigger>
              <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup>
                {translationChoices.map(option => <SelectItem key={option.value} value={option.value} label={option.label} disabled={option.isDisabled} className="list-box-item">{option.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </div>
          <div className="nola-workspace-field">
            <span>{t('workspaceUi.languages')}</span>
            <Popover.Root>
              <Popover.Trigger disabled={props.sessionLocked} aria-label={`${t('session.sourceLanguage')} / ${t('session.targetLanguage')}`} className="nola-workspace-picker"><Languages aria-hidden="true" /><span>{languageLabel(props.sourceLanguage)} → {languageLabel(props.targetLanguage)}</span><ChevronDown aria-hidden="true" /></Popover.Trigger>
              <Popover.Portal><Popover.Positioner className="z-dropdown"><Popover.Popup className="nola-workspace-languages" aria-label={t('workspaceUi.languages')}>
                <Button variant="tertiary" disabled={props.sessionLocked || !swappedLanguages} onClick={() => {
                  if (swappedLanguages) props.onLanguagePairChange(swappedLanguages.sourceLanguage, swappedLanguages.targetLanguage)
                }}>{t('session.swapLanguages')}</Button>
                <Select value={props.sourceLanguage} disabled={props.sessionLocked} onValueChange={value => { if (typeof value === 'string') props.onSourceLanguageChange(value) }}>
                  <SelectFieldLabel className="label">{t('session.sourceLanguage')}</SelectFieldLabel><SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => languageLabel(String(value ?? ''))}</SelectValue></SelectTrigger>
                  <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options">{sourceLanguages.map(code => <SelectItem key={code} value={code} label={languageLabel(code)} className="list-box-item">{languageLabel(code)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
                <Select value={props.targetLanguage} disabled={props.sessionLocked} onValueChange={value => { if (typeof value === 'string') props.onTargetLanguageChange(value) }}>
                  <SelectFieldLabel className="label">{t('session.targetLanguage')}</SelectFieldLabel><SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => languageLabel(String(value ?? ''))}</SelectValue></SelectTrigger>
                  <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options">{targetLanguages.map(code => <SelectItem key={code} value={code} label={languageLabel(code)} className="list-box-item">{languageLabel(code)}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Popover.Popup></Popover.Positioner></Popover.Portal>
            </Popover.Root>
          </div>
          <Button variant="outline" className="nola-workspace-overlay" onClick={props.onOpenOverlay}><Captions aria-hidden="true" />{t('workspaceUi.openOverlay')}</Button>
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
          <Switch checked={props.notesOpen} onCheckedChange={props.onToggleNotes} className="nola-workspace-notes-switch switch">
            <StickyNote aria-hidden="true" />
            <Label>{t('workspace.notes')}</Label>
            <SwitchThumb className="switch__thumb" />
          </Switch>
        </div>
      </CardContent>
    </Card>
  )
}
