import { useModelOptions } from '@/model-options'
import { cloudModelsOf, cloudModelSettingsPatch } from '../models/CloudModels'
import { translationLanguages } from '../../../shared/model-capabilities'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Popover } from '@base-ui/react/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { Spinner } from '@/components/ui/spinner'
import { ArrowRight, ArrowRightLeft, ChevronDown, ExternalLink, Languages, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Settings, Square, X } from 'lucide-react'
import { DEFAULT_SETTINGS, languageName, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AppSettingsPatch } from '@/bridge'
import { useI18n } from '@/i18n'
import { useRoute } from '@/routes'
import { actions, sessionStore, stores, updateSettings, useStore } from '@/store'
import { swappedLanguagesOf, targetLanguagePatch, translationModelPatch } from '@/session-config'
import { PageHeader } from '@/components/primitives'
import { notifyError } from '@/components/primitives/notify'
import { SettingSelect } from '../settings/SettingsPage'
import { captionScrimColor } from './scrimColor'

export function OverlayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const modelOptions = useModelOptions()
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const cloudModels = cloudModelsOf(settings, credentials).filter(model => model.ready)
  const cloudNames = {
    cloud: t('modelsSettingsUi.cloudService'), microsoft: t('settings.providerMicrosoft'), mymemory: t('settings.providerMyMemory'),
    google: t('settings.providerGoogle'), 'index-translate': t('settings.providerIndexTranslate'),
    aliyun: t('modelsSettingsUi.aliyunAsr'), minimax: t('settings.providerMiniMax'), recognition: t('settings.providerRecognitionTranslation'),
  }
  const cloudChoice = (model: typeof cloudModels[number]) => ({ value: model.id, label: model.profile?.name ?? cloudNames[model.id as keyof typeof cloudNames] })
  const recognitionChoices = [...modelOptions.localRecognitionModels, ...cloudModels.filter(model => model.kind === 'recognitionModel').map(cloudChoice)]
  const recognitionValue = (settings.recognition.provider ?? 'local') === 'local' ? settings.recognition.modelId : settings.recognition.provider ?? 'local'
  const translationValue = settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE ? NO_TRANSLATION_LANGUAGE
    : settings.translation.provider === 'local' ? settings.translation.localModelId
      : settings.translation.provider === 'cloud' ? `custom:${settings.translation.customModelId || 'legacy'}` : settings.translation.provider
  const translationChoices = [{ value: NO_TRANSLATION_LANGUAGE, label: t('workspaceUi.translationOff') },
    ...modelOptions.translationModels, ...cloudModels.filter(model => model.kind === 'translationModel').map(cloudChoice)]
  if (!translationChoices.some(model => model.value === translationValue)) translationChoices.push({ value: translationValue, label: modelOptions.translation?.name ?? translationValue, isDisabled: true })
  const devices = useStore(stores.models, state => state.devices)
  const session = useStore(sessionStore, state => state)
  const sessionActive = !['idle', 'error'].includes(session.status)
  const [opening, setOpening] = useState(false)
  const config = settings.overlay
  const translationDisabled = settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE
  const display = translationDisabled ? 'source' : config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const label = (code: string) => languageName(code, language)
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch(() => undefined) }
  const open = async () => {
    setOpening(true)
    try {
      const opened = await actions.settings.showOverlay()
      if (opened === false) {
        notifyError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
      }
    } catch (error) {
      notifyError(t('workspaceUi.overlayFailed'), { cause: error })
    }
    finally { setOpening(false) }
  }
  const sourceLanguage = settings.recognition.sourceLanguage
  const targetLanguage = settings.translation.targetLanguage
  const swappedLanguages = swappedLanguagesOf(sourceLanguage, targetLanguage, modelOptions.sourceLanguages, modelOptions.translation ? translationLanguages(modelOptions.translation, targetLanguage) : modelOptions.targetLanguages)
  const previewStyle = {
    '--preview-background-color': config.backgroundColor,
    '--preview-background-alpha': `${Math.round(config.backgroundOpacity * 100)}%`,
    '--preview-scrim-color': captionScrimColor(config.backgroundColor, config.backgroundOpacity, config.colorScheme === 'light' ? 'light' : 'dark'),
    '--preview-source-color': config.sourceColor,
    '--preview-translation-color': config.translationColor,
    '--preview-font-size': `${config.fontSize}px`,
    '--preview-font-weight': config.fontWeight,
    '--preview-line-height': config.lineHeight,
    '--preview-translation-font-size': `${config.translationFontSize}px`,
    '--preview-translation-font-weight': config.translationFontWeight,
    '--preview-translation-line-height': config.translationLineHeight,
    fontFamily: `${config.fontFamily}, var(--font-cjk-fallback), var(--font-ui), sans-serif`,
  } as CSSProperties
  return (
    <div className="nola-overlay-page">
      <PageHeader className="nola-page-heading" title={t('home.quickStart')}
        actions={<div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => {
            void actions.settings.showWorkspace().catch(error => notifyError(t('workspaceUi.windowFailed'), { cause: error }))
          }}><ExternalLink aria-hidden="true" />{t('home.quickStart')}</Button>
          <Button data-onboarding="open-overlay" onClick={() => void open()} disabled={opening} aria-busy={opening}>{opening ? <Spinner /> : <ExternalLink aria-hidden="true" />}{t('shellUi.openOverlay')}</Button>
        </div>} />
      <Card className="nola-overlay-preview" data-onboarding="caption-preview">
        <CardHeader>
          <CardTitle>{t('shellUi.captionPreview')}</CardTitle>
        </CardHeader>
        {/*
         * Text area, top and bottom scrims, the seven action glyphs, then the mic
         * and pills below. Entirely `aria-hidden`: this is an appearance preview, and
         * the real controls are in the form underneath. The scrims and both chrome
         * rows reveal on hover, as they do in the caption window.
         */}
        <CardContent className="nola-overlay-stage">
          <div
            className="nola-caption-preview"
            data-color-scheme={config.colorScheme}
            data-transparent-background={config.backgroundOpacity <= 0}
            style={previewStyle}
            aria-hidden="true"
          >
            <div className="nola-caption-preview__text">
              {config.showSource ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewSource')}</p> : null}
              {config.showTranslation ? <p className="nola-caption-preview__translation">{t('modelsSettingsUi.previewTranslation')}</p> : null}
              {!config.showSource && !config.showTranslation ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewHidden')}</p> : null}
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
              <span className="nola-caption-preview__pill">{modelOptions.recognitionModels.find(model => model.value === settings.recognition.modelId)?.label ?? settings.recognition.modelId}</span>
              <span className="nola-caption-preview__pill">{label(settings.recognition.sourceLanguage)}</span>
              <span className="nola-caption-preview__pill">{label(settings.translation.targetLanguage)}</span>
              <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
              {!translationDisabled && <span className="nola-caption-preview__pill">{t(config.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="nola-section-card" data-onboarding="quick-settings">
        <CardHeader><CardTitle>{t('settings.title')}</CardTitle></CardHeader>
        <CardContent className="nola-overlay-fields">
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('session.recognitionModel')}</span>
            <SettingSelect value={recognitionValue} ariaLabel={t('session.recognitionModel')} isDisabled={sessionActive}
              options={recognitionChoices.length ? recognitionChoices : [{ value: recognitionValue, label: recognitionValue, isDisabled: true }]} onChange={value => {
                const cloud = cloudModels.find(model => model.kind === 'recognitionModel' && model.id === value)
                const next = cloud ? cloudModelSettingsPatch(settings, cloud) : { recognition: { provider: 'local' as const, modelId: value } }
                if (next) patch(next)
              }} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('session.translationModel')}</span>
            <SettingSelect value={translationValue} ariaLabel={t('session.translationModel')} isDisabled={sessionActive}
              options={translationChoices} onChange={value => {
                if (value === NO_TRANSLATION_LANGUAGE) patch(targetLanguagePatch(value, targetLanguage))
                else {
                  const cloud = cloudModels.find(model => model.kind === 'translationModel' && model.id === value)
                  const model = resources.find(item => item.resourceId === value)
                  const next = cloud ? cloudModelSettingsPatch(settings, cloud) : model ? translationModelPatch(settings, model) : null
                  if (next) patch(next)
                }
              }} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.audioSource')}</span>
            <SettingSelect value={settings.recognition.audioSource} ariaLabel={t('shellUi.audioSource')} isDisabled={sessionActive}
              options={[{ value: 'defaultOutput', label: t('shellUi.audioSystem') }, ...devices.map(device => ({ value: device.deviceId, label: device.name }))]}
              onChange={audioSource => patch({ recognition: { audioSource } })} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.languageDirection')}</span>
            <Popover.Root>
              <Popover.Trigger render={<Button variant="tertiary" />} className="nola-overlay-language-trigger" disabled={sessionActive}
                aria-label={`${t('shellUi.languageDirection')}: ${label(sourceLanguage)} → ${label(targetLanguage)}`}>
                <Languages aria-hidden="true" />
                <span>{label(sourceLanguage)} → {label(targetLanguage)}</span>
                <ChevronDown aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal><Popover.Positioner side="top" align="end" className="z-dropdown">
                <Popover.Popup aria-label={t('shellUi.languageDirection')} className="nola-overlay-languages">
                  <Button variant="tertiary" className="self-start" disabled={sessionActive || !swappedLanguages}
                    onClick={() => {
                      if (swappedLanguages) patch({ recognition: { sourceLanguage: swappedLanguages.sourceLanguage }, translation: { targetLanguage: swappedLanguages.targetLanguage } })
                    }}>
                    <ArrowRightLeft aria-hidden="true" />{t('session.swapLanguages')}
                  </Button>
                  <div className="flex flex-col gap-2"><span className="label">{t('session.sourceLanguage')}</span>
                    <SettingSelect value={sourceLanguage} isDisabled={sessionActive} ariaLabel={t('session.sourceLanguage')} options={modelOptions.sourceLanguages.map(code => ({ value: code, label: label(code) }))} onChange={sourceLanguage => patch({ recognition: { sourceLanguage } })} />
                  </div>
                  <div className="flex flex-col gap-2"><span className="label">{t('session.targetLanguage')}</span>
                    <SettingSelect value={targetLanguage} isDisabled={sessionActive} ariaLabel={t('session.targetLanguage')} options={modelOptions.targetLanguages.map(code => ({ value: code, label: label(code) }))} onChange={value => patch(targetLanguagePatch(value, targetLanguage))} />
                  </div>
                </Popover.Popup>
              </Popover.Positioner></Popover.Portal>
            </Popover.Root>
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.showContent')}</span>
            <ToggleGroup aria-label={t('shellUi.showContent')} value={[display]} onValueChange={([next]) => { if (next) patch({ overlay: { showSource: next !== 'translation', showTranslation: next !== 'source' } }) }}>
                {!translationDisabled && <ToggleGroupItem value="both">{t('workspace.modeBoth')}</ToggleGroupItem>}
                <ToggleGroupItem value="source">{t('workspace.modeSource')}</ToggleGroupItem>
                {!translationDisabled && <ToggleGroupItem value="translation">{t('workspace.modeTranslation')}</ToggleGroupItem>}
            </ToggleGroup>
          </div>
          {!translationDisabled && <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.layout')}</span>
            <ToggleGroup aria-label={t('shellUi.layout')} value={[config.layout]} onValueChange={([next]) => { if (next === 'rolling' || next === 'sentence') patch({ overlay: { layout: next } }) }}>
                <ToggleGroupItem value="rolling">{t('workspace.layoutSplit')}</ToggleGroupItem>
                <ToggleGroupItem value="sentence">{t('workspace.layoutSentence')}</ToggleGroupItem>
            </ToggleGroup>
          </div>}
        </CardContent>
        <CardFooter className="nola-overlay-footer">
          <Button variant="secondary" onClick={() => navigate('#/settings/appearance')}><Settings aria-hidden="true" />{t('shellUi.appearance')}<ArrowRight aria-hidden="true" /></Button>
        </CardFooter>
      </Card>
    </div>
  )
}
