import { ModelAvailabilityLabel } from '@/features/workspace/ModelAvailabilityLabel'
import { useModelOptions } from '@/model-options'
import { translationLanguages } from '../../../shared/model-capabilities'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Popover } from '@base-ui/react/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { Spinner } from '@/components/ui/spinner'
import { ArrowRightLeft, ChevronDown, ExternalLink, Languages, Lock, Mic, Minus, Monitor, MoreHorizontal, Pin, Square, X } from 'lucide-react'
import { DEFAULT_SETTINGS, languageName, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AppSettingsPatch } from '@/bridge'
import { useI18n } from '@/i18n'
import { aliyunConnectionReady } from '../../../shared/cloud-models'
import { useRoute } from '@/routes'
import { actions, getBridge, sessionStore, stores, updateSettings, useStore } from '@/store'
import { swappedLanguagesOf, targetLanguagePatch, translationModelPatch } from '@/session-config'
import { PageHeader } from '@/components/primitives'
import { notifyGatewayModelUnavailable, notifyOverlayError, notifyOverlayInfo } from '@/components/primitives/notify'
import { modelBindingPatch, savedBindingOf, useAvailableModels, useModelSelection, type AvailableModel } from '@/available-models'
import { SettingSelect, SettingSwitch } from '../settings/SettingsPage'
import { useSpeechOutputDevices } from '../workspace/SessionSetupDialog'
import { captionScrimColor } from './scrimColor'
import { speechOutputOptions, useAudioSourceOptions } from '@/audio-source-options'
import { RealtimePipelineFields } from '../workspace/RealtimePipelineSelect'
import { defaultRealtimeS2s } from '../../../shared/settings'
import { ALIYUN_LANGUAGES, ALIYUN_S2S_SPEECH_LANGUAGES, remoteSourceLanguages } from '../../../shared/cloud-config'
import { vbCablePair } from '../../../shared/virtual-audio'

export function OverlayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const modelOptions = useModelOptions()
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  const s2sReady = aliyunConnectionReady(settings, credentials['aliyun-asr'])
  // The overlay follows what is callable now: the model the gateway loaded, plus configured cloud
  // interfaces. A stale local selection moves on its own instead of failing when captions start.
  const catalog = useAvailableModels()
  const reportSwitch = (model: AvailableModel) => notifyOverlayInfo(t('gateway.modelSwitched', { name: model.name }),
    { description: t(model.origin === 'gateway' ? 'gateway.modelSwitchedLoaded' : 'gateway.modelSwitchedCloud') })
  const s2sModel = settings.realtime?.quickS2sModel === undefined ? defaultRealtimeS2s(settings) : settings.realtime.quickS2sModel
  const asr = useModelSelection('asr', catalog.asr, settings, reportSwitch, !!s2sModel)
  const translationDisabled = settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE
  // With translation switched off there is nothing to repair: replacing its model would re-enable it.
  const mt = useModelSelection('mt', catalog.mt, settings, reportSwitch, translationDisabled || !!s2sModel)
  const asrOptions: { value: string; label: string; isDisabled?: boolean }[] = catalog.asr.length
    ? catalog.asr.map(model => ({ value: model.binding, label: model.name }))
    : [{ value: '', label: t('gateway.modelNoneShort'), isDisabled: true }]
  const translationValue = translationDisabled ? NO_TRANSLATION_LANGUAGE : mt.binding
  const translationChoices: { value: string; label: string; isDisabled?: boolean }[] = [{ value: NO_TRANSLATION_LANGUAGE, label: t('workspaceUi.translationOff') },
    ...catalog.mt.map(model => ({ value: model.binding, label: model.name }))]
  if (!translationChoices.some(model => model.value === translationValue)) translationChoices.push({ value: translationValue, label: t('gateway.modelNoneShort'), isDisabled: true })
  const devices = useStore(stores.models, state => state.devices)
  const selectedSource = settings.realtime?.virtualInputDeviceId || settings.recognition.audioSource
  const audioSourceOptions = useAudioSourceOptions(devices, selectedSource)
  const speechEnabled = !translationDisabled && settings.realtime?.outputMode === 'speech'
  const tts = useModelSelection('tts', catalog.tts, settings, reportSwitch, !speechEnabled || !!s2sModel)
  const savedSpeechModel = savedBindingOf('tts', settings)
  const speechModel = tts.binding || savedSpeechModel || 'unavailable'
  const speechModels = catalog.tts.map(model => ({ value: model.binding, label: model.name }))
  const speechModelOptions = speechModels.some(model => model.value === speechModel) ? speechModels
    : [...speechModels, { value: speechModel, label: t('gateway.modelNoneShort'), isDisabled: true }]
  const outputDevices = useSpeechOutputDevices()
  const outputDevice = settings.realtime?.speechOutputDeviceId || 'default'
  const needsExplicitOutput = !!settings.realtime?.virtualInputDeviceId
    || devices.some(device => device.deviceId === selectedSource && device.kind === 'microphone' && vbCablePair(device.name, 'Output'))
  const outputOptions = speechOutputOptions(outputDevices, outputDevice, t, needsExplicitOutput)
  const session = useStore(sessionStore, state => state)
  const browserActive = useStore(stores.settings, state => state.browser?.captionServiceActive === true || state.captionServiceBusy)
  const sessionActive = !['idle', 'error'].includes(session.status) || browserActive
  const [opening, setOpening] = useState(false)
  const [overlayVisible, setOverlayVisible] = useState(false)
  const config = settings.overlay
  const display = translationDisabled ? 'source' : config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const label = (code: string) => languageName(code, language)
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch(() => notifyOverlayError(t('errors.settingsSaveFailed'))) }
  useEffect(() => {
    const bridge = getBridge()
    if (!bridge) return
    let changed = false
    const unsubscribe = bridge.events.onOverlayVisibilityChanged(visible => {
      changed = true
      setOverlayVisible(visible)
    })
    void bridge.overlay.getVisibility().then(visible => {
      if (!changed) setOverlayVisible(visible)
    }).catch(() => undefined)
    return () => { changed = true; unsubscribe() }
  }, [])
  const open = async () => {
    setOpening(true)
    try {
      const bridge = getBridge()
      if (!bridge) throw new Error('Overlay bridge unavailable')
      if (overlayVisible) {
        await bridge.overlay.close()
        setOverlayVisible(false)
        return
      }
      const gateway = await getBridge()?.gateway?.snapshot()
      if (gateway?.state !== 'running' && !gateway?.realtime) {
        notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t('gateway.asr') }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
        return
      }
      if (asr.unavailable) {
        notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t('gateway.asr') }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
        return
      }
      if (!translationDisabled && mt.unavailable) {
        notifyGatewayModelUnavailable(t('gateway.modelNone', { name: t('gateway.mt') }), t('gateway.modelGatewayStartHint'), t('gateway.title'))
        return
      }
      const opened = await actions.settings.showOverlay()
      if (opened === false) {
        notifyOverlayError(t('errors.serviceConflict', { running: t('videoCaptions.title') }))
      } else setOverlayVisible(true)
    } catch (error) {
      notifyOverlayError(t('workspaceUi.overlayFailed'), { cause: error })
    }
    finally { setOpening(false) }
  }
  const sourceLanguages = s2sModel ? remoteSourceLanguages({ ...settings.recognition, provider: 'aliyun', aliyunModel: s2sModel }) : modelOptions.sourceLanguages
  const sourceLanguage = s2sModel && !sourceLanguages.includes(settings.recognition.sourceLanguage) ? 'auto' : settings.recognition.sourceLanguage
  const targetLanguage = settings.translation.targetLanguage
  const targetLanguages = s2sModel ? speechEnabled ? ALIYUN_S2S_SPEECH_LANGUAGES : ALIYUN_LANGUAGES : modelOptions.targetLanguages
  const swappedLanguages = swappedLanguagesOf(sourceLanguage, targetLanguage, sourceLanguages, s2sModel ? targetLanguages : modelOptions.translation ? translationLanguages(modelOptions.translation, targetLanguage) : targetLanguages)
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
          <Button variant="secondary" onClick={() => navigate('#/settings/appearance')}>{t('shellUi.appearance')}</Button>
          <Button data-onboarding="open-workspace" variant="secondary" onClick={() => {
            void actions.settings.showWorkspace().catch(error => notifyOverlayError(t('workspaceUi.windowFailed'), { cause: error }))
          }}><ExternalLink aria-hidden="true" />{t('home.quickStart')}</Button>
          <Button data-onboarding="open-overlay" onClick={() => void open()} disabled={opening || (!overlayVisible && !!s2sModel && !translationDisabled && !s2sReady)} aria-busy={opening}>{opening ? <Spinner /> : <ExternalLink aria-hidden="true" />}{t(overlayVisible ? 'overlay.close' : 'shellUi.openOverlay')}</Button>
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
              {translationDisabled || config.showSource ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewSource')}</p> : null}
              {!translationDisabled && config.showTranslation ? <p className="nola-caption-preview__translation">{t('modelsSettingsUi.previewTranslation')}</p> : null}
              {!translationDisabled && !config.showSource && !config.showTranslation ? <p className="nola-caption-preview__source">{t('modelsSettingsUi.previewHidden')}</p> : null}
            </div>
            <div className="nola-caption-preview__scrim" data-edge="top" />
            <div className="nola-caption-preview__scrim" data-edge="bottom" />
            <div className="nola-caption-preview__actions">
              <Monitor /><Lock /><Pin /><i /><MoreHorizontal /><Minus /><X />
            </div>
            <div className="nola-caption-preview__controls">
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
              {!translationDisabled && <>
                <span className="nola-caption-preview__pill">{t(display === 'both' ? 'workspace.modeBoth' : display === 'source' ? 'workspace.modeSource' : 'workspace.modeTranslation')}<ChevronDown /></span>
                <span className="nola-caption-preview__pill">{t(config.layout === 'rolling' ? 'workspace.layoutSplit' : 'workspace.layoutSentence')}<ChevronDown /></span>
              </>}
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="nola-section-card" data-onboarding="quick-settings">
        <CardHeader><CardTitle>{t('settings.title')}</CardTitle></CardHeader>
        <CardContent className="nola-realtime-settings">
          <FieldGroup className="nola-overlay-fields grid">
            <h3 className="nola-realtime-settings__heading">{t('session.processingGroup')}</h3>
            <RealtimePipelineFields hideInheritedModel className="nola-overlay-field" model={settings.realtime?.quickS2sModel} gatewayModel={defaultRealtimeS2s(settings)}
              s2sReady={s2sReady} disabled={sessionActive} onChange={quickS2sModel => patch({ realtime: { quickS2sModel } })} />
            {settings.realtime?.quickS2sModel === null ? <>
            <div className="nola-overlay-field" data-onboarding="quick-asr">
              <span><ModelAvailabilityLabel label={t('session.recognitionModel')} hint={t('gateway.modelNoneHint')} /></span>
              <SettingSelect value={asr.binding} ariaLabel={t('session.recognitionModel')} isDisabled={sessionActive}
                options={asrOptions} onChange={value => asr.select(value)} />
            </div>
            <div className="nola-overlay-field" data-onboarding="quick-mt">
              <span><ModelAvailabilityLabel label={t('session.translationModel')} hint={t('gateway.modelNoneHint')} /></span>
              <SettingSelect value={translationValue} ariaLabel={t('session.translationModel')} isDisabled={sessionActive}
                options={translationChoices} onChange={value => {
                  if (value === NO_TRANSLATION_LANGUAGE) patch(targetLanguagePatch(value, targetLanguage))
                  else mt.select(value)
                }} />
            </div>
            {speechEnabled ? <div className="nola-overlay-field">
              <ModelAvailabilityLabel label={t('session.speechModel')} hint={t('gateway.ttsHint')} />
              <SettingSelect value={speechModel} ariaLabel={t('session.speechModel')} isDisabled={sessionActive}
                options={speechModelOptions} onChange={value => patch(modelBindingPatch('tts', value, settings))} />
            </div> : null}
            </> : null}
          </FieldGroup>
          <FieldGroup className="nola-overlay-fields grid">
            <h3 className="nola-realtime-settings__heading">{t('session.audioLanguageGroup')}</h3>
            <div className="nola-overlay-field" data-onboarding="quick-audio">
              <span>{t('shellUi.audioSource')}</span>
              <SettingSelect value={selectedSource} ariaLabel={t('shellUi.audioSource')} isDisabled={sessionActive}
                options={[{ value: 'defaultOutput', label: t('shellUi.audioSystem') }, ...audioSourceOptions]}
                onChange={audioSource => patch({ recognition: { audioSource }, realtime: { virtualInputDeviceId: '' } })} />
            </div>
            {selectedSource.startsWith('process:') ? <p className="nola-caption text-muted">{t('session.applicationAudioHint')}</p> : null}
            <div className="nola-overlay-field" data-onboarding="quick-language">
              <span>{t('shellUi.languageDirection')}</span>
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
                      <SettingSelect value={sourceLanguage} isDisabled={sessionActive} ariaLabel={t('session.sourceLanguage')} options={sourceLanguages.map(code => ({ value: code, label: label(code) }))} onChange={sourceLanguage => patch({ recognition: { sourceLanguage } })} />
                    </div>
                    <div className="flex flex-col gap-2"><span className="label">{t('session.targetLanguage')}</span>
                      <SettingSelect value={targetLanguage} isDisabled={sessionActive} ariaLabel={t('session.targetLanguage')} options={targetLanguages.map(code => ({ value: code, label: label(code) }))} onChange={value => patch(targetLanguagePatch(value, targetLanguage))} />
                    </div>
                  </Popover.Popup>
                </Popover.Positioner></Popover.Portal>
              </Popover.Root>
            </div>
          </FieldGroup>
          <FieldGroup className="nola-overlay-fields grid">
            <h3 className="nola-realtime-settings__heading">{t('session.captionGroup')}</h3>
            <div className="nola-overlay-field">
              <span>{t('shellUi.showContent')}</span>
              <ToggleGroup aria-label={t('shellUi.showContent')} value={[display]} onValueChange={([next]) => { if (next) patch({ overlay: { showSource: next !== 'translation', showTranslation: next !== 'source' } }) }}>
                  {!translationDisabled && <ToggleGroupItem value="both">{t('workspace.modeBoth')}</ToggleGroupItem>}
                  <ToggleGroupItem value="source">{t('workspace.modeSource')}</ToggleGroupItem>
                  {!translationDisabled && <ToggleGroupItem value="translation">{t('workspace.modeTranslation')}</ToggleGroupItem>}
              </ToggleGroup>
            </div>
            {!translationDisabled && <div className="nola-overlay-field">
              <span>{t('shellUi.layout')}</span>
              <ToggleGroup aria-label={t('shellUi.layout')} value={[config.layout]} onValueChange={([next]) => { if (next === 'rolling' || next === 'sentence') patch({ overlay: { layout: next } }) }}>
                  <ToggleGroupItem value="rolling">{t('workspace.layoutSplit')}</ToggleGroupItem>
                  <ToggleGroupItem value="sentence">{t('workspace.layoutSentence')}</ToggleGroupItem>
              </ToggleGroup>
            </div>}
          </FieldGroup>
          <FieldGroup className="nola-overlay-fields grid">
            <div className="nola-overlay-field">
              <span>{t('session.speakTranslation')}</span>
              <SettingSwitch ariaLabel={t('session.speakTranslation')} isSelected={speechEnabled} isDisabled={sessionActive || translationDisabled || !speechEnabled && !!s2sModel && !ALIYUN_S2S_SPEECH_LANGUAGES.includes(targetLanguage)}
                onChange={enabled => patch({ realtime: { outputMode: enabled ? 'speech' : 'translation' } })} />
            </div>
            {s2sModel && !ALIYUN_S2S_SPEECH_LANGUAGES.includes(targetLanguage)
            ? <p className="nola-realtime-settings__heading nola-caption text-muted">{t('session.speechLanguageUnavailable')}</p> : null}
            {speechEnabled ? <>
              <div className="nola-overlay-field">
                <span>{t('session.speechOutputDevice')}</span>
                <SettingSelect value={outputDevice} ariaLabel={t('session.speechOutputDevice')} isDisabled={sessionActive}
                  options={outputOptions} onChange={value => patch({ realtime: { speechOutputDeviceId: value === 'default' ? '' : value } })} />
              </div>
            </> : null}
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}
