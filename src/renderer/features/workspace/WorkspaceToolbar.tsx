import { useModelOptions } from '@/model-options'
import { translationLanguages } from '../../../shared/model-capabilities'
import { Button, Card, Dropdown, Label, ListBox, ListBoxItem, Popover, Select, Switch, ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { Captions, ChevronDown, Languages, Minus, Plus, SlidersHorizontal, StickyNote, Volume2 } from 'lucide-react'

import { LANGUAGE_LABELS, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AudioDevice, RecognitionModelId, TranslationProvider } from '@/bridge'
import { useI18n } from '@/i18n'
import type { CaptionDisplayMode, CaptionLayout } from '@/components/caption'
import { swappedLanguagesOf } from '@/session-config'

export interface WorkspaceToolbarProps {
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
  language: 'zh-CN' | 'en'
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
  const languageLabel = (code: string): string => {
    const entry = LANGUAGE_LABELS[code as keyof typeof LANGUAGE_LABELS]
    return entry ? props.language === 'zh-CN' ? entry.zh : entry.en : code
  }
  const audioOptions = [{ value: 'defaultOutput', label: t('workspaceUi.systemAudio') }, ...props.devices.filter((device) => device.deviceId !== 'defaultOutput').map((device) => ({ value: device.deviceId, label: device.name }))]
  const modes = [{ id: 'both', label: t('workspace.modeBoth') }, { id: 'source', label: t('workspace.modeSource') }, { id: 'translation', label: t('workspace.modeTranslation') }] as const
  return (
    <Card data-slot="workspace-toolbar" className="nola-workspace-toolbar">
      <Card.Content className="nola-workspace-toolbar-content">
        <div className="nola-workspace-config">
          <Select className="nola-workspace-audio" value={props.audioSource} isDisabled={props.sessionLocked} aria-label={t('workspaceUi.input')} onChange={(key) => { if (typeof key === 'string') props.onAudioSourceChange(key) }}>
            <Label>{t('workspaceUi.input')}</Label>
            <Select.Trigger><Volume2 aria-hidden="true" /><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover><ListBox>{audioOptions.map((option) => <ListBoxItem key={option.value} id={option.value} textValue={option.label}>{option.label}<ListBoxItem.Indicator /></ListBoxItem>)}</ListBox></Select.Popover>
          </Select>
          <div className="nola-workspace-field">
            <span>{t('session.recognitionModel')}</span>
            <Dropdown>
              <Dropdown.Trigger isDisabled={props.sessionLocked} className="nola-workspace-picker"><SlidersHorizontal aria-hidden="true" /><span>{recognitionModels.find(model => model.value === props.modelId)?.label ?? props.modelId}</span><ChevronDown aria-hidden="true" /></Dropdown.Trigger>
              <Dropdown.Popover><Dropdown.Menu selectionMode="single" selectedKeys={new Set([props.modelId])}>
                {recognitionModels.map(model => <Dropdown.Item key={model.value} id={model.value} textValue={model.label} isDisabled={model.isDisabled} onAction={() => props.onModelChange(model.value)}>{model.label}<Dropdown.ItemIndicator type="checkmark" /></Dropdown.Item>)}
              </Dropdown.Menu></Dropdown.Popover>
            </Dropdown>
          </div>
          <div className="nola-workspace-field">
            <span>{t('session.translationModel')}</span>
            <Dropdown>
              <Dropdown.Trigger isDisabled={props.sessionLocked} aria-label={t('session.translationModel')} className="nola-workspace-picker"><Languages aria-hidden="true" /><span>{translationChoices.find(option => option.value === translationValue)?.label}</span><ChevronDown aria-hidden="true" /></Dropdown.Trigger>
              <Dropdown.Popover><Dropdown.Menu selectionMode="single" selectedKeys={new Set([translationValue])}>
                {translationChoices.map(option => <Dropdown.Item key={option.value} id={option.value} textValue={option.label} isDisabled={option.isDisabled} onAction={() => props.onTranslationModelChange(option.value)}>{option.label}<Dropdown.ItemIndicator type="checkmark" /></Dropdown.Item>)}
              </Dropdown.Menu></Dropdown.Popover>
            </Dropdown>
          </div>
          <div className="nola-workspace-field">
            <span>{t('workspaceUi.languages')}</span>
            <Popover>
              <Button variant="tertiary" isDisabled={props.sessionLocked} aria-label={`${t('session.sourceLanguage')} / ${t('session.targetLanguage')}`} className="nola-workspace-picker"><Languages aria-hidden="true" /><span>{languageLabel(props.sourceLanguage)} → {languageLabel(props.targetLanguage)}</span><ChevronDown aria-hidden="true" /></Button>
              <Popover.Content>
                <Popover.Dialog aria-label={t('workspaceUi.languages')} className="nola-workspace-languages">
                  <Button variant="tertiary" isDisabled={props.sessionLocked || !swappedLanguages} onPress={() => {
                    if (swappedLanguages) props.onLanguagePairChange(swappedLanguages.sourceLanguage, swappedLanguages.targetLanguage)
                  }}>{t('session.swapLanguages')}</Button>
                  <Select value={props.sourceLanguage} isDisabled={props.sessionLocked} onChange={(key) => { if (typeof key === 'string') props.onSourceLanguageChange(key) }}>
                    <Label>{t('session.sourceLanguage')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox className="nola-language-options">{sourceLanguages.map((code) => <ListBoxItem key={code} id={code} textValue={languageLabel(code)}>{languageLabel(code)}<ListBoxItem.Indicator /></ListBoxItem>)}</ListBox></Select.Popover>
                  </Select>
                  <Select value={props.targetLanguage} isDisabled={props.sessionLocked} onChange={(key) => { if (typeof key === 'string') props.onTargetLanguageChange(key) }}>
                    <Label>{t('session.targetLanguage')}</Label><Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox className="nola-language-options">{targetLanguages.map((code) => <ListBoxItem key={code} id={code} textValue={languageLabel(code)}>{languageLabel(code)}<ListBoxItem.Indicator /></ListBoxItem>)}</ListBox></Select.Popover>
                  </Select>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </div>
          <Button variant="outline" className="nola-workspace-overlay" onPress={props.onOpenOverlay}><Captions aria-hidden="true" />{t('workspaceUi.openOverlay')}</Button>
        </div>
        <div className="nola-workspace-view-controls">
          <ToggleButtonGroup className="nola-segmented" size="sm" selectionMode="single" disallowEmptySelection aria-label={t('workspace.displayMode')} selectedKeys={new Set([props.displayMode])} onSelectionChange={(keys) => { const next = [...keys][0]; if (typeof next === 'string') props.onDisplayModeChange(next as CaptionDisplayMode) }}>
            {modes.filter(mode => props.targetLanguage !== NO_TRANSLATION_LANGUAGE || mode.id === 'source').map((mode) => <ToggleButton key={mode.id} id={mode.id} aria-label={mode.label}>{mode.label}</ToggleButton>)}
          </ToggleButtonGroup>
          {props.targetLanguage !== NO_TRANSLATION_LANGUAGE && <ToggleButtonGroup className="nola-segmented" size="sm" selectionMode="single" disallowEmptySelection aria-label={t('workspace.layout')} selectedKeys={new Set([props.layout])} onSelectionChange={(keys) => { const next = [...keys][0]; if (typeof next === 'string') props.onLayoutChange(next as CaptionLayout) }}>
            <ToggleButton id="split" aria-label={t('workspace.layoutSplit')}>{t('workspace.layoutSplit')}</ToggleButton>
            <ToggleButton id="sentence" aria-label={t('workspace.layoutSentence')}>{t('workspace.layoutSentence')}</ToggleButton>
          </ToggleButtonGroup>}
          <div className="nola-workspace-font-control"><span>{t('workspaceUi.fontSize')}</span>
            <ToggleButtonGroup className="nola-segmented" size="sm" selectionMode="single" disallowEmptySelection aria-label={t('workspaceUi.fontSize')} selectedKeys={new Set([String(props.fontSize)])} onSelectionChange={(keys) => { const next = [...keys][0]; if (typeof next === 'string') props.onFontSizeChange(Number(next)) }}>
              <ToggleButton id="14" aria-label={t('workspace.fontSmaller')}><Minus aria-hidden="true" />A</ToggleButton>
              <ToggleButton id="16" aria-label={t('overlay.size')}>A</ToggleButton>
              <ToggleButton id="18" aria-label={t('workspace.fontLarger')}>A<Plus aria-hidden="true" /></ToggleButton>
            </ToggleButtonGroup>
          </div>
          <Switch isSelected={props.notesOpen} onChange={props.onToggleNotes} className="nola-workspace-notes-switch"><Switch.Content aria-label={t('workspace.notes')}><StickyNote aria-hidden="true" /><Label>{t('workspace.notes')}</Label><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>
        </div>
      </Card.Content>
    </Card>
  )
}
