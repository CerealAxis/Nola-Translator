import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Card, Label, Link, ListBox, Popover, Select, ToggleButton, ToggleButtonGroup, toast } from '@heroui/react'
import { AppWindow, ArrowRight, ArrowRightLeft, ChevronDown, Languages, Settings } from 'lucide-react'
import { DEFAULT_SETTINGS, LANGUAGE_LABELS, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AppSettingsPatch, PrewarmErrorCode } from '@/bridge'
import { useModelOptions } from '@/model-options'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { settingsPath, useRoute } from '@/routes'
import { actions, enableCaptionService, stores, updateSettings, useStore } from '@/store'
import { browserConnectionAction, setCaptionServiceActive, stopCaptionSession } from '@/store/settingsStore'
import { swappedLanguagesOf, targetLanguagePatch } from '@/session-config'
import { translationLanguages } from '../../../shared/model-capabilities'
import type { BrowserConnectionStatus } from '../../../shared/browser'
import { PageHeader } from '@/components/primitives'
import { SettingSelect } from '../settings/SettingsPage'
import { SETTINGS_WRITE_FAILURE_KEYS, settingsWriteFailure } from '../settings/settingsWriteError'
import { openDefaultBrowser } from './openDefaultBrowser'
import './video-captions.css'

/**
 * The engine's refusal reasons, keyed by the closed set in
 * `PREWARM_ERROR_CODES`. Written as a total map rather than an interpolated key so a
 * code added on the engine side fails to compile here until it has copy.
 */
const PREWARM_ERROR_KEYS: Record<PrewarmErrorCode, TranslationKey> = {
  modelUnavailable: 'errors.prewarm.modelUnavailable',
  resourceUnavailable: 'errors.prewarm.resourceUnavailable',
  invalidConfiguration: 'errors.prewarm.invalidConfiguration',
  resourceBusy: 'errors.prewarm.resourceBusy',
  sessionAlreadyRunning: 'errors.prewarm.sessionAlreadyRunning',
}

/**
 * The pseudo-entry for the system default output, the same sentinel `RecognitionSettings.audioSource`
 * uses. It is a source kind rather than a device, which is why it never appears in the device list.
 */
const SYSTEM_DEFAULT_OUTPUT = 'defaultOutput'

/** The tab capture is a kind rather than a device, so it needs an entry of its own in the picker. */
const TAB_AUDIO_VALUE = 'tab'

/** How often the gate is re-read. The extension starts and stops captions on its own, from a web page. */
const GATE_POLL_MS = 2000

/**
 * The main process `setWindowOpenHandler` hands `https:` targets to the shell and denies the
 * window, so the notice's action renders as an anchor instead of navigating the renderer.
 */
const ISSUES_URL = 'https://github.com/CerealAxis/Nola-Translator/issues'

export function VideoCaptionsPage() {
  const { t, language } = useI18n()
  const { navigate } = useRoute()
  const settings = useStore(stores.settings, state => state.settings) ?? DEFAULT_SETTINGS
  const modelOptions = useModelOptions()
  const captionService = useStore(stores.settings, state => state.captionService)
  const captionServiceBusy = useStore(stores.settings, state => state.captionServiceBusy)
  const browserStatus = useStore(stores.settings, state => state.browser)
  const devices = useStore(stores.models, state => state.devices)
  const [opening, setOpening] = useState(false)
  /*
   * The gate is the desktop's answer to a toggle the extension pulls from inside a web page,
   * so this page reads it on a poll the way the browser settings tab does, rather than
   * expecting a push it is not subscribed to.
   */
  useEffect(() => {
    void browserConnectionAction('status')
    const timer = setInterval(() => { void browserConnectionAction('status') }, GATE_POLL_MS)
    return () => clearInterval(timer)
  }, [])
  const config = settings.videoCaptions
  const sourceLanguage = settings.recognition.sourceLanguage
  const targetLanguage = settings.translation.targetLanguage
  const translationDisabled = targetLanguage === NO_TRANSLATION_LANGUAGE
  const display = translationDisabled ? 'source' : config.showSource && config.showTranslation ? 'both' : config.showSource ? 'source' : 'translation'
  const label = (code: string) => {
    const entry = LANGUAGE_LABELS[code]
    return entry ? language === 'zh-CN' ? entry.zh : entry.en : code
  }
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch((error: unknown) => toast.danger(t(SETTINGS_WRITE_FAILURE_KEYS[settingsWriteFailure(error)]))) }
  /*
   * The picker is one flat list of strings while the setting is a source kind plus a device, so the
   * two are translated here rather than storing a sentinel inside the device id. Choosing a device
   * switches the kind to `system`; picking the tab entry drops the device, which no longer applies.
   * Only an explicit `system` counts as one: the field is optional on the extension's config, and an
   * absent value must read as the `tab` default rather than silently becoming a system capture.
   */
  const audioSourceValue = config.audioSource === 'system' ? config.audioDeviceId ?? SYSTEM_DEFAULT_OUTPUT : TAB_AUDIO_VALUE
  const audioSourcePatch = (value: string): AppSettingsPatch => value === TAB_AUDIO_VALUE
    ? { videoCaptions: { audioSource: 'tab' } }
    : { videoCaptions: { audioSource: 'system', audioDeviceId: value } }
  const openBrowser = async () => {
    setOpening(true)
    try { await openDefaultBrowser() } catch { toast.danger(t('videoCaptions.errorOpeningBrowser')) }
    finally { setOpening(false) }
  }
  const prewarmFailure = (code?: PrewarmErrorCode) =>
    code ? `${t('videoCaptions.serviceFailed')} · ${t(PREWARM_ERROR_KEYS[code])}` : t('videoCaptions.serviceFailed')
  /*
   * Opening the gate is prewarm first and the toggle second, so a refusal from the engine
   * leaves the extension shut out rather than let in by a service with no weights in memory.
   */
  const open = async () => {
    try {
      const result = await enableCaptionService()
      if (result.state === 'failed') { toast.danger(prewarmFailure(result.code)); return }
    } catch (error) {
      const message = String(error)
      if (/RUNTIME_(TORCH|LLAMA)/.test(message)) {
        toast.danger(message)
        await actions.settings.openRuntimeSettings(message.includes('RUNTIME_TORCH') ? 'engine' : 'llama')
      } else toast.danger(t('videoCaptions.serviceFailed'))
      return
    }
    try { await setCaptionServiceActive(true) } catch { toast.danger(t('errors.captionServiceToggleFailed')) }
  }
  /*
   * Closing is the toggle first and the stop second, and a failed stop does not put the
   * gate back: the gate only decides whether a session may *start*, so closing it is what
   * cuts the extension off. A session that outlives a failed stop is the engine's to
   * report, not a reason to leave the service reachable.
   */
  const close = async () => {
    let status: BrowserConnectionStatus
    try { status = await setCaptionServiceActive(false) }
    catch { toast.danger(t('errors.captionServiceToggleFailed')); return }
    if (!status.sessionActive || !status.sessionId) return
    try { await stopCaptionSession(status.sessionId) } catch { toast.danger(t('errors.captionServiceStopFailed')) }
  }
  const swappedLanguages = swappedLanguagesOf(sourceLanguage, targetLanguage, modelOptions.sourceLanguages, modelOptions.translation ? translationLanguages(modelOptions.translation, targetLanguage) : modelOptions.targetLanguages)
  /*
   * The line the caption block's bottom edge rests on, as a percentage of the stage height. CSS
   * `top` places the block's *top* edge there, so the stylesheet pairs it with
   * `translateY(-100%)` to hang the block by that edge the way the extension does.
   */
  const frameStyle = {
    '--video-caption-font-size': `${config.fontSize}px`,
    '--video-caption-top': `${config.position}%`,
  } as CSSProperties
  const prewarming = captionService === 'loading'
  const gateActive = browserStatus?.captionServiceActive === true
  const serviceRunning = browserStatus?.sessionActive === true
  const serviceIndicator = prewarming ? null
    : gateActive && serviceRunning
      ? <span className="nola-caption text-muted" role="status">{t('videoCaptions.serviceRunning')}</span>
      : gateActive
        ? <span className="nola-caption text-muted" role="status">{t('videoCaptions.serviceReady')}</span>
        : null
  const showSource = config.showSource || translationDisabled
  const showTranslation = config.showTranslation && !translationDisabled

  return (
    <div className="nola-overlay-page">
      <PageHeader className="nola-page-heading" title={t('videoCaptions.title')}
        actions={<Button onPress={() => void openBrowser()} isPending={opening}><AppWindow aria-hidden="true" />{t('videoCaptions.openBrowser')}</Button>} />
      <Alert status="warning" className="mb-5">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title className="nola-body-strong">{t('videoCaptions.experimentalTitle')}</Alert.Title>
          <Alert.Description className="nola-caption">
            {t('videoCaptions.experimentalBody')}
            <Link href={ISSUES_URL} target="_blank" rel="noreferrer" className="button button--sm button--tertiary rounded-[6px]">
              {t('videoCaptions.experimentalAction')}
              <Link.Icon />
            </Link>
          </Alert.Description>
        </Alert.Content>
      </Alert>
      <Card className="nola-overlay-preview">
        <Card.Header>
          <Card.Title className="text-lg font-semibold">{t('videoCaptions.captionPreview')}</Card.Title>
        </Card.Header>
        {/*
         * A video frame rather than a caption window: dark ground, the block sitting
         * near the bottom edge the way an in-player overlay does, and the font size the
         * extension would actually paint. Sample text stands in for a live segment
         * because this page never holds a session.
         */}
        <Card.Content className="nola-video-stage">
          <div className="nola-video-frame" style={frameStyle} aria-hidden="true">
            {showSource ? <p className="nola-video-caption-line">{t('videoCaptions.previewSource')}</p> : null}
            {showTranslation ? <p className="nola-video-caption-line" data-role="translation">{t('videoCaptions.previewTranslation')}</p> : null}
          </div>
        </Card.Content>
      </Card>
      <Card className="nola-section-card p-5">
        <Card.Header className="mb-5"><Card.Title>{t('videoCaptions.settings')}</Card.Title></Card.Header>
        <Card.Content className="nola-overlay-fields">
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('videoCaptions.audioSource')}</span>
            {/*
             * The tab entry is the default and sits first; the system sources below it are the same
             * set the floating-caption page offers, so one device list serves both pages.
             * A tab capture is taken inside the page and needs the extension's own confirmation,
             * while a system capture is taken by the desktop and starts without one.
             */}
            <SettingSelect value={audioSourceValue} ariaLabel={t('videoCaptions.audioSource')}
              options={[
                { value: TAB_AUDIO_VALUE, label: t('videoCaptions.tabAudio') },
                { value: SYSTEM_DEFAULT_OUTPUT, label: t('shellUi.audioSystem') },
                ...devices.filter(device => device.deviceId !== SYSTEM_DEFAULT_OUTPUT).map(device => ({ value: device.deviceId, label: device.name })),
              ]}
              onChange={next => patch(audioSourcePatch(next))} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.languageDirection')}</span>
            <Popover>
              <Button variant="tertiary" className="nola-overlay-language-trigger"
                aria-label={`${t('shellUi.languageDirection')}: ${label(sourceLanguage)} → ${label(targetLanguage)}`}>
                <Languages aria-hidden="true" />
                <span>{label(sourceLanguage)} → {label(targetLanguage)}</span>
                <ChevronDown aria-hidden="true" />
              </Button>
              <Popover.Content placement="top end">
                <Popover.Dialog aria-label={t('shellUi.languageDirection')} className="nola-overlay-languages">
                  <Button variant="tertiary" className="self-start" isDisabled={!swappedLanguages}
                    onPress={() => {
                      if (swappedLanguages) patch({ recognition: { sourceLanguage: swappedLanguages.sourceLanguage }, translation: { targetLanguage: swappedLanguages.targetLanguage } })
                    }}>
                    <ArrowRightLeft aria-hidden="true" />{t('session.swapLanguages')}
                  </Button>
                  <Select value={sourceLanguage} onChange={key => {
                    if (typeof key === 'string') patch({ recognition: { sourceLanguage: key } })
                  }}>
                    <Label>{t('session.sourceLanguage')}</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover><ListBox className="nola-language-options">
                      {modelOptions.sourceLanguages.map(code => <ListBox.Item key={code} id={code} textValue={label(code)}>{label(code)}<ListBox.ItemIndicator /></ListBox.Item>)}
                    </ListBox></Select.Popover>
                  </Select>
                  <Select value={targetLanguage} onChange={key => {
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
              const next = [...keys][0]; if (next) patch({ videoCaptions: { showSource: next !== 'translation', showTranslation: next !== 'source' } })
            }}>
              {!translationDisabled && <ToggleButton id="both">{t('workspace.modeBoth')}</ToggleButton>}
              <ToggleButton id="source">{t('workspace.modeSource')}</ToggleButton>
              {!translationDisabled && <ToggleButton id="translation">{t('workspace.modeTranslation')}</ToggleButton>}
            </ToggleButtonGroup>
          </div>
          {/*
           * `layout` is a single-member union: the video overlay always pairs each
           * segment with its translation, so the group shows the one arrangement
           * rather than offering a choice that cannot be made.
           */}
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.layout')}</span>
            <ToggleButtonGroup className="nola-segmented" selectionMode="single" selectedKeys={new Set([config.layout])} aria-label={t('shellUi.layout')} onSelectionChange={keys => {
              const next = [...keys][0]; if (next === 'sentence') patch({ videoCaptions: { layout: next } })
            }}>
              <ToggleButton id="sentence">{t('workspace.layoutSentence')}</ToggleButton>
            </ToggleButtonGroup>
          </div>
        </Card.Content>
        <Card.Footer className="nola-overlay-footer">
          <Button variant="ghost" onPress={() => navigate(settingsPath('browser'))}><Settings aria-hidden="true" />{t('videoCaptions.browserAppearance')}<ArrowRight aria-hidden="true" /></Button>
        </Card.Footer>
      </Card>
      <div className="nola-video-service">
        <Button variant={gateActive ? 'danger' : 'primary'} isPending={captionServiceBusy} isDisabled={prewarming}
          onPress={() => void (gateActive ? close() : open())}>
          {prewarming ? t('videoCaptions.serviceLoading') : gateActive ? t('videoCaptions.disableService') : t('videoCaptions.enableService')}
        </Button>
        {serviceIndicator}
      </div>
    </div>
  )
}
