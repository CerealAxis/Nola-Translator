import { useModelOptions } from '@/model-options'
import { translationLanguages } from '../../../shared/model-capabilities'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, Label, ListBox, Popover, Select, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { ArrowRight, ArrowRightLeft, ChevronDown, ExternalLink, Languages, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Settings, Square, X } from 'lucide-react'
import { DEFAULT_SETTINGS, LANGUAGE_LABELS, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AppSettingsPatch } from '@/bridge'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { getBridge, sessionStore, stores, updateSettings, useStore } from '@/store'
import { swappedLanguagesOf, targetLanguagePatch } from '@/session-config'
import { PageHeader } from '@/components/primitives'
import { SettingSelect } from '../settings/SettingsPage'

export function OverlayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const modelOptions = useModelOptions()
  const devices = useStore(stores.models, state => state.devices)
  const session = useStore(sessionStore, state => state)
  const sessionActive = !['idle', 'error'].includes(session.status)
  const [opening, setOpening] = useState(false)
  const config = settings.overlay
  const latest = session.interim ?? session.segments.at(-1)
  const sourceText = latest?.sourceText || t('overlay.notStarted')
  const originalOnly = latest?.translations.length === 0
  const translationText = latest?.translations.find(item => item.state === 'complete')?.text || t('overlay.notStartedHint')
  const translationDisabled = settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE
  const display = translationDisabled ? 'source' : config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const label = (code: string) => {
    const entry = LANGUAGE_LABELS[code]
    return entry ? language === 'zh-CN' ? entry.zh : entry.en : code
  }
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch(() => toast.danger(t('errors.storageChangedAction'))) }
  const open = async () => {
    setOpening(true)
    try { await getBridge()?.overlay.show() } catch { toast.danger(t('shellUi.errorOpening')) }
    finally { setOpening(false) }
  }
  const sourceLanguage = settings.recognition.sourceLanguage
  const targetLanguage = settings.translation.targetLanguage
  const swappedLanguages = swappedLanguagesOf(sourceLanguage, targetLanguage, modelOptions.sourceLanguages, modelOptions.translation ? translationLanguages(modelOptions.translation, targetLanguage) : modelOptions.targetLanguages)
  const previewStyle = {
    '--preview-background-color': config.backgroundColor,
    '--preview-background-alpha': `${Math.round(config.backgroundOpacity * 100)}%`,
    '--preview-source-color': config.sourceColor,
    '--preview-translation-color': config.translationColor,
    '--preview-font-size': `${config.fontSize}px`,
    '--preview-font-weight': config.fontWeight,
    '--preview-line-height': config.lineHeight,
    '--preview-translation-font-size': `${config.translationFontSize}px`,
    '--preview-translation-font-weight': config.translationFontWeight,
    '--preview-translation-line-height': config.translationLineHeight,
    fontFamily: config.fontFamily,
  } as CSSProperties
  return (
    <div className="nola-overlay-page">
      <PageHeader className="nola-page-heading" title={t('shellUi.overlay')}
        actions={<Button onPress={() => void open()} isPending={opening}><ExternalLink aria-hidden="true" />{t('shellUi.openOverlay')}</Button>} />
      <Card className="nola-overlay-preview">
        <Card.Header>
          <Card.Title className="text-lg font-semibold">{t('shellUi.captionPreview')}</Card.Title>
        </Card.Header>
        {/*
         * Text area, top and bottom scrims, the seven action glyphs, then the mic
         * and pills below. Entirely `aria-hidden`: this is an appearance preview, and
         * the real controls are in the form underneath. The scrims and both chrome
         * rows reveal on hover, as they do in the caption window.
         */}
        <Card.Content className="nola-overlay-stage">
          <div
            className="nola-caption-preview"
            data-color-scheme={config.colorScheme}
            data-transparent-background={config.backgroundOpacity <= 0}
            style={previewStyle}
            aria-hidden="true"
          >
            <div className="nola-caption-preview__text">
              {translationDisabled || config.showSource || originalOnly ? <p className="nola-caption-preview__source">{sourceText}</p> : null}
              {!translationDisabled && config.showTranslation && !originalOnly ? <p className="nola-caption-preview__translation">{translationText}</p> : null}
            </div>
            <div className="nola-caption-preview__scrim" data-edge="top" />
            <div className="nola-caption-preview__scrim" data-edge="bottom" />
            <div className="nola-caption-preview__actions">
              <Monitor /><Lock /><Pin /><i /><MoreHorizontal /><Minus /><X />
            </div>
            <div className="nola-caption-preview__controls">
              {/*
               * Mirrors the control bar's six items in order: mic, recognition
               * model, source language, target language, display, layout. Only the
               * last two carry a chevron, because only those two open menus in
               * the real window.
               */}
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
              <span className="nola-caption-preview__pill">{modelOptions.recognition?.name ?? settings.recognition.modelId}</span>
              <span className="nola-caption-preview__pill">{label(settings.recognition.sourceLanguage)}</span>
              <span className="nola-caption-preview__pill">{label(settings.translation.targetLanguage)}</span>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
              {!translationDisabled && <span className="nola-caption-preview__pill">{t(config.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>}
            </div>
          </div>
        </Card.Content>
      </Card>
      <Card className="nola-section-card p-5">
        <Card.Header className="mb-5"><Card.Title>{t('shellUi.overlaySettings')}</Card.Title></Card.Header>
        <Card.Content className="nola-overlay-fields">
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.audioSource')}</span>
            <SettingSelect value={settings.recognition.audioSource} ariaLabel={t('shellUi.audioSource')} isDisabled={sessionActive}
              options={[{ value: 'defaultOutput', label: t('shellUi.audioSystem') }, ...devices.map(device => ({ value: device.deviceId, label: device.name }))]}
              onChange={audioSource => patch({ recognition: { audioSource } })} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.languageDirection')}</span>
            <Popover>
              <Button variant="tertiary" className="nola-overlay-language-trigger" isDisabled={sessionActive}
                aria-label={`${t('shellUi.languageDirection')}: ${label(sourceLanguage)} → ${label(targetLanguage)}`}>
                <Languages aria-hidden="true" />
                <span>{label(sourceLanguage)} → {label(targetLanguage)}</span>
                <ChevronDown aria-hidden="true" />
              </Button>
              <Popover.Content placement="top end">
                <Popover.Dialog aria-label={t('shellUi.languageDirection')} className="nola-overlay-languages">
                  <Button variant="tertiary" className="self-start" isDisabled={sessionActive || !swappedLanguages}
                    onPress={() => {
                      if (swappedLanguages) patch({ recognition: { sourceLanguage: swappedLanguages.sourceLanguage }, translation: { targetLanguage: swappedLanguages.targetLanguage } })
                    }}>
                    <ArrowRightLeft aria-hidden="true" />{t('session.swapLanguages')}
                  </Button>
                  <Select value={sourceLanguage} isDisabled={sessionActive} onChange={key => {
                    if (typeof key === 'string') patch({ recognition: { sourceLanguage: key } })
                  }}>
                    <Label>{t('session.sourceLanguage')}</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox className="nola-language-options">
                      {modelOptions.sourceLanguages.map(code => <ListBox.Item key={code} id={code} textValue={label(code)}>{label(code)}<ListBox.ItemIndicator /></ListBox.Item>)}
                    </ListBox></Select.Popover>
                  </Select>
                  <Select value={targetLanguage} isDisabled={sessionActive} onChange={key => {
                    if (typeof key === 'string') patch(targetLanguagePatch(key, targetLanguage))
                  }}>
                    <Label>{t('session.targetLanguage')}</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox className="nola-language-options">
                      {modelOptions.targetLanguages.map(code => <ListBox.Item key={code} id={code} textValue={label(code)}>{label(code)}<ListBox.ItemIndicator /></ListBox.Item>)}
                    </ListBox></Select.Popover>
                  </Select>
                </Popover.Dialog>
              </Popover.Content>
            </Popover>
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.showContent')}</span>
            <ToggleButtonGroup className="nola-segmented" selectionMode="single" selectedKeys={new Set([display])} aria-label={t('shellUi.showContent')} onSelectionChange={keys => {
              const next = [...keys][0]; if (next) patch({ overlay: { showSource: next !== 'translation', showTranslation: next !== 'source' } })
            }}>
              {!translationDisabled && <ToggleButton id="both">{t('workspace.modeBoth')}</ToggleButton>}
              <ToggleButton id="source">{t('workspace.modeSource')}</ToggleButton>
              {!translationDisabled && <ToggleButton id="translation">{t('workspace.modeTranslation')}</ToggleButton>}
            </ToggleButtonGroup>
          </div>
          {!translationDisabled && <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.layout')}</span>
            <ToggleButtonGroup className="nola-segmented" selectionMode="single" selectedKeys={new Set([config.layout])} aria-label={t('shellUi.layout')} onSelectionChange={keys => {
              const next = [...keys][0]; if (next === 'rolling' || next === 'sentence') patch({ overlay: { layout: next } })
            }}>
              <ToggleButton id="rolling">{t('workspace.layoutSplit')}</ToggleButton>
              <ToggleButton id="sentence">{t('workspace.layoutSentence')}</ToggleButton>
            </ToggleButtonGroup>
          </div>}
        </Card.Content>
        <Card.Footer className="nola-overlay-footer">
          <Button variant="ghost" onPress={() => navigate('#/settings/appearance')}><Settings aria-hidden="true" />{t('shellUi.appearance')}<ArrowRight aria-hidden="true" /></Button>
        </Card.Footer>
      </Card>
    </div>
  )
}
