import { ModelAvailabilityLabel } from '@/features/workspace/ModelAvailabilityLabel'
import { useModelOptions } from '@/model-options'
import { translationLanguages } from '../../../shared/model-capabilities'
import { useEffect, useState } from 'react'
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
import { actions, getBridge, sessionStore, stores, updateSettings, useStore } from '@/store'
import { swappedLanguagesOf, targetLanguagePatch, translationModelPatch } from '@/session-config'
import { PageHeader } from '@/components/primitives'
import { notifyGatewayModelUnavailable, notifyOverlayError, notifyOverlayInfo } from '@/components/primitives/notify'
import { useAvailableModels, useModelSelection, type AvailableModel } from '@/available-models'
import { SettingSelect } from '../settings/SettingsPage'
import { captionScrimColor } from './scrimColor'

export function OverlayPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const modelOptions = useModelOptions()
  const resources = useStore(stores.models, state => state.resources)
  const credentials = useStore(stores.models, state => state.credentials)
  // The overlay follows what is callable now: the model the gateway loaded, plus configured cloud
  // interfaces. A stale local selection moves on its own instead of failing when captions start.
  const catalog = useAvailableModels()
  const reportSwitch = (model: AvailableModel) => notifyOverlayInfo(t('gateway.modelSwitched', { name: model.name }),
    { description: t(model.origin === 'gateway' ? 'gateway.modelSwitchedLoaded' : 'gateway.modelSwitchedCloud') })
  const asr = useModelSelection('asr', catalog.asr, settings, reportSwitch)
  const translationDisabled = settings.translation.targetLanguage === NO_TRANSLATION_LANGUAGE
  // With translation switched off there is nothing to repair: replacing its model would re-enable it.
  const mt = useModelSelection('mt', catalog.mt, settings, reportSwitch, translationDisabled)
  const asrOptions: { value: string; label: string; isDisabled?: boolean }[] = catalog.asr.length
    ? catalog.asr.map(model => ({ value: model.binding, label: model.name }))
    : [{ value: '', label: t('gateway.modelNoneShort'), isDisabled: true }]
  const translationValue = translationDisabled ? NO_TRANSLATION_LANGUAGE : mt.binding
  const translationChoices: { value: string; label: string; isDisabled?: boolean }[] = [{ value: NO_TRANSLATION_LANGUAGE, label: t('workspaceUi.translationOff') },
    ...catalog.mt.map(model => ({ value: model.binding, label: model.name }))]
  if (!translationChoices.some(model => model.value === translationValue)) translationChoices.push({ value: translationValue, label: t('gateway.modelNoneShort'), isDisabled: true })
  const devices = useStore(stores.models, state => state.devices)
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
      if (gateway?.state !== 'running') {
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
          <Button data-onboarding="open-workspace" variant="secondary" onClick={() => {
            void actions.settings.showWorkspace().catch(error => notifyOverlayError(t('workspaceUi.windowFailed'), { cause: error }))
          }}><ExternalLink aria-hidden="true" />{t('home.quickStart')}</Button>
          <Button data-onboarding="open-overlay" onClick={() => void open()} disabled={opening} aria-busy={opening}>{opening ? <Spinner /> : <ExternalLink aria-hidden="true" />}{t(overlayVisible ? 'overlay.close' : 'shellUi.openOverlay')}</Button>
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
               * Mirrors the control bar's five items in order: mic, source
               * language, target language, display, layout. Only the
               * last two carry a chevron, because only those two open menus in
               * the real window.
               */}
              <span className="nola-caption-preview__mic">{sessionActive ? <Square /> : <Mic />}</span>
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
          <div className="nola-overlay-field" data-onboarding="quick-asr">
            <span className="text-sm text-muted"><ModelAvailabilityLabel label={t('session.recognitionModel')} hint={t('gateway.modelNoneHint')} /></span>
            <SettingSelect value={asr.binding} ariaLabel={t('session.recognitionModel')} isDisabled={sessionActive}
              options={asrOptions} onChange={value => asr.select(value)} />
          </div>
          <div className="nola-overlay-field" data-onboarding="quick-mt">
            <span className="text-sm text-muted"><ModelAvailabilityLabel label={t('session.translationModel')} hint={t('gateway.modelNoneHint')} /></span>
            <SettingSelect value={translationValue} ariaLabel={t('session.translationModel')} isDisabled={sessionActive}
              options={translationChoices} onChange={value => {
                if (value === NO_TRANSLATION_LANGUAGE) patch(targetLanguagePatch(value, targetLanguage))
                else mt.select(value)
              }} />
          </div>
          <div className="nola-overlay-field" data-onboarding="quick-audio">
            <span className="text-sm text-muted">{t('shellUi.audioSource')}</span>
            <SettingSelect value={settings.recognition.audioSource} ariaLabel={t('shellUi.audioSource')} isDisabled={sessionActive}
              options={[{ value: 'defaultOutput', label: t('shellUi.audioSystem') }, ...devices.map(device => ({ value: device.deviceId, label: device.name }))]}
              onChange={audioSource => patch({ recognition: { audioSource } })} />
          </div>
          <div className="nola-overlay-field" data-onboarding="quick-language">
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
