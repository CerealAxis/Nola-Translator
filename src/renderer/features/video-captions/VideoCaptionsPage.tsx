import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Select, SelectContent, SelectFieldLabel, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AppWindow, ArrowRight, ArrowRightLeft, ChevronDown, Languages, LoaderCircle, Settings } from 'lucide-react'
import { DEFAULT_SETTINGS, languageName, NO_TRANSLATION_LANGUAGE } from '@/bridge'
import type { AppSettingsPatch, PrewarmErrorCode } from '@/bridge'
import { useModelOptions } from '@/model-options'
import { useI18n } from '@/i18n'
import type { TranslationKey } from '@/i18n'
import { settingsPath, useRoute } from '@/routes'
import { actions, enableCaptionService, isEngineConnected, sessionStore, stores, updateSettings, useStore } from '@/store'
import { browserConnectionAction, setCaptionServiceActive, stopCaptionSession } from '@/store/settingsStore'
import { swappedLanguagesOf, targetLanguagePatch } from '@/session-config'
import { translationLanguages } from '../../../shared/model-capabilities'
import type { BrowserConnectionStatus } from '../../../shared/browser'
import { PageHeader } from '@/components/primitives'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { notifyError, notifyWarning } from '@/components/primitives/notify'
import { reportSettingsFailure } from '@/features/settings/settingsErrorChannel'
import { SettingSelect } from '../settings/SettingsPage'
import { openDefaultBrowser } from './openDefaultBrowser'
import { isSessionAlreadyRunningError } from '../../../shared/ipc-error'
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
  modelLoadFailed: 'errors.modelLoadFailed',
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
  const label = (code: string) => languageName(code, language)
  const patch = (value: AppSettingsPatch) => { void updateSettings(value).catch(() => undefined) }
  /*
   * The picker is one flat list of strings while the setting is a source kind plus a device, so the
   * two are translated here rather than storing a sentinel inside the device id. Choosing a device
   * switches the kind to `system`; picking the tab entry drops the device, which no longer applies.
   */
  const audioSourceValue = config.audioSource === 'system' ? config.audioDeviceId ?? SYSTEM_DEFAULT_OUTPUT : TAB_AUDIO_VALUE
  const audioSourcePatch = (value: string): AppSettingsPatch => value === TAB_AUDIO_VALUE
    ? { videoCaptions: { audioSource: 'tab', audioDeviceId: undefined } }
    : value === SYSTEM_DEFAULT_OUTPUT
      ? { videoCaptions: { audioSource: 'system', audioDeviceId: undefined } }
      : { videoCaptions: { audioSource: 'system', audioDeviceId: value } }
  const openBrowser = async () => {
    setOpening(true)
    try { await openDefaultBrowser() } catch (error) { notifyError(t('videoCaptions.errorOpeningBrowser'), { cause: error }) }
    finally { setOpening(false) }
  }
  const prewarmDetail = (code?: PrewarmErrorCode) =>
    code ? t(PREWARM_ERROR_KEYS[code]) : undefined
  const notifyConflict = (cause?: unknown) => {
    const desktopBusy = ['starting', 'running', 'paused', 'stopping'].includes(sessionStore.getState().status)
    reportSettingsFailure(t('errors.serviceConflict', { running: t(desktopBusy ? 'nav.workspace' : 'shellUi.overlay') }), cause)
  }
  /*
   * The browser connection failure is reported by the store, not by a thrown
   * error: `browserConnectionAction` records the reason in `browserError` and
   * resolves, so a `catch` around it never runs. The page therefore watches
   * the store value, and the same notice covers a failure that happened
   * outside this page.
   */
  const browserError = useStore(stores.settings, state => state.browserError)
  const reportedBrowserError = useRef<string | null>(null)
  const reportBrowserError = useCallback((reason: string | null): void => {
    if (reason === null) { reportedBrowserError.current = null; return }
    if (reportedBrowserError.current === reason) return
    reportedBrowserError.current = reason
    notifyError(t('errors.browserServiceUnavailable'), { description: reason })
  }, [t])
  useEffect(() => {
    /*
     * Without the engine bridge there is no browser service to reach either,
     * and the app already tells the user that the whole connection is missing.
     */
    if (!isEngineConnected()) return
    reportBrowserError(browserError)
  }, [browserError, reportBrowserError])
  /*
   * Opening the gate is prewarm first and the toggle second, so a refusal from the engine
   * leaves the extension shut out rather than let in by a service with no weights in memory.
   */
  const open = async () => {
    let browsers: NonNullable<BrowserConnectionStatus['browsers']> = []
    try {
      await browserConnectionAction('inspect')
      browsers = stores.settings.getState().browser?.browsers ?? []
    } catch (error) {
      notifyError(t('errors.browserServiceUnavailable'), { cause: error })
      return
    }
    const inspectFailure = stores.settings.getState().browserError
    if (inspectFailure) {
      reportBrowserError(inspectFailure)
      return
    }
    const availableBrowsers = browsers.filter(browser => browser.available)
    const detectedExtensions = availableBrowsers.filter(browser => browser.extensionStatus === 'installed' || browser.extensionStatus === 'disabled')
    if (availableBrowsers.length > 0 && detectedExtensions.length === 0 && availableBrowsers.every(browser => browser.extensionStatus === 'notInstalled')) {
      notifyWarning(t('videoCaptions.extensionSetupNotice'), {
        action: { label: t('videoCaptions.browserSettings'), onPress: () => navigate(settingsPath('browser')) },
      })
      return
    }
    if (detectedExtensions.length > 0 && detectedExtensions.every(browser => browser.extensionCompatible === false)) {
      notifyWarning(t('videoCaptions.extensionVersionMismatchNotice'), {
        action: { label: t('videoCaptions.browserSettings'), onPress: () => navigate(settingsPath('browser')) },
      })
      return
    }
    try {
      const result = await enableCaptionService()
      if (result.state === 'failed') {
        if (result.code === 'sessionAlreadyRunning') {
          notifyConflict()
        } else notifyError(t('videoCaptions.serviceFailed'), { description: prewarmDetail(result.code) })
        return
      }
    } catch (error) {
      const message = String(error)
      const torch = /RUNTIME_TORCH/.test(message)
      const llama = /RUNTIME_LLAMA/.test(message)
      const crisp = /RUNTIME_CRISP/.test(message)
      const mismatch = message.includes('_DEVICE_MISMATCH')
      if (torch || llama) {
        const key = torch
          ? mismatch ? 'videoCaptions.torchDeviceMismatch' : 'videoCaptions.torchEnvironmentFailed'
          : mismatch ? 'videoCaptions.llamaDeviceMismatch' : 'videoCaptions.llamaEnvironmentFailed'
        reportSettingsFailure(t(key), error)
        await actions.settings.openRuntimeSettings(torch ? 'engine' : 'llama').catch((openError: unknown) => {
          notifyError(t('errors.runtimeSettingsFailed'), { cause: openError })
        })
      } else if (crisp) {
        reportSettingsFailure(t('errors.crispRuntimeUnavailable'), error)
        await actions.settings.openRuntimeSettings('crisp').catch((openError: unknown) => {
          notifyError(t('errors.runtimeSettingsFailed'), { cause: openError })
        })
      } else reportSettingsFailure(t('videoCaptions.serviceFailed'), error)
      return
    }
    try {
      await setCaptionServiceActive(true)
    } catch (error) {
      if (isSessionAlreadyRunningError(error)) {
        notifyConflict(error)
      } else reportSettingsFailure(t('errors.captionServiceToggleFailed'), error)
    }
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
    catch (error) { reportSettingsFailure(t('errors.captionServiceToggleFailed'), error); return }
    if (!status.sessionActive || !status.sessionId) return
    try { await stopCaptionSession(status.sessionId) } catch (error) { reportSettingsFailure(t('errors.captionServiceStopFailed'), error) }
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
        actions={<Button onClick={() => void openBrowser()} disabled={opening}>
          {opening ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <AppWindow aria-hidden="true" />}
          {t('videoCaptions.openBrowser')}
        </Button>} />
      <Card className="nola-overlay-preview flex flex-col gap-3 p-5">
        <CardHeader className="card__header p-0">
          <CardTitle className="card__title text-lg leading-6 font-semibold">{t('videoCaptions.captionPreview')}</CardTitle>
        </CardHeader>
        {/*
         * A compact, theme-matched stage with the configured caption block anchored
         * at its saved position. Sample text stands in for a live segment because
         * this page never holds a session.
         */}
        <CardContent className="card__content nola-overlay-stage nola-video-stage px-[clamp(16px,3vw,30px)]">
          <div className="nola-video-frame" style={frameStyle} aria-hidden="true">
            {showSource ? <p className="nola-video-caption-line">{t('videoCaptions.previewSource')}</p> : null}
            {showTranslation ? <p className="nola-video-caption-line" data-role="translation">{t('videoCaptions.previewTranslation')}</p> : null}
          </div>
        </CardContent>
      </Card>
      <Card className="nola-section-card p-5 flex flex-col gap-0 has-data-[slot=card-footer]:pb-5">
        <CardHeader className="card__header p-0 mb-5"><CardTitle className="card__title leading-6">{t('videoCaptions.settings')}</CardTitle></CardHeader>
        <CardContent className="card__content p-0 nola-overlay-fields">
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('videoCaptions.audioSource')}</span>
            {/*
             * System output is the default; the tab capture stays last because it requires a browser
             * sharing prompt, while system capture uses the configured desktop output directly.
             * A tab capture is taken inside the page and needs the extension's own confirmation,
             * while a system capture is taken by the desktop and starts without one.
             */}
            <SettingSelect value={audioSourceValue} ariaLabel={t('videoCaptions.audioSource')}
              options={[
                { value: SYSTEM_DEFAULT_OUTPUT, label: t('shellUi.audioSystem') },
                ...devices.filter(device => device.deviceId !== SYSTEM_DEFAULT_OUTPUT).map(device => ({ value: device.deviceId, label: device.name })),
                { value: TAB_AUDIO_VALUE, label: t('videoCaptions.tabAudio') },
              ]}
              onChange={next => patch(audioSourcePatch(next))} />
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.languageDirection')}</span>
            <Popover.Root>
              <Popover.Trigger render={<Button variant="tertiary" className="nola-overlay-language-trigger"
                aria-label={`${t('shellUi.languageDirection')}: ${label(sourceLanguage)} → ${label(targetLanguage)}`}>
                <Languages aria-hidden="true" />
                <span>{label(sourceLanguage)} → {label(targetLanguage)}</span>
                <ChevronDown aria-hidden="true" />
              </Button>} />
              <Popover.Portal>
                <Popover.Positioner side="top" align="end" sideOffset={8} className="z-dropdown">
                  <Popover.Popup aria-label={t('shellUi.languageDirection')} className="nola-overlay-languages rounded-xl border border-border bg-overlay text-overlay-foreground shadow-overlay">
                    <Button variant="tertiary" className="self-start" disabled={!swappedLanguages}
                      onClick={() => {
                        if (swappedLanguages) patch({ recognition: { sourceLanguage: swappedLanguages.sourceLanguage }, translation: { targetLanguage: swappedLanguages.targetLanguage } })
                      }}>
                      <ArrowRightLeft aria-hidden="true" />{t('session.swapLanguages')}
                    </Button>
                    <Select value={sourceLanguage} onValueChange={key => {
                      if (typeof key === 'string') patch({ recognition: { sourceLanguage: key } })
                    }}>
                      <SelectFieldLabel className="label">{t('session.sourceLanguage')}</SelectFieldLabel>
                      <SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => label(String(value ?? ''))}</SelectValue></SelectTrigger>
                      <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options list-box">
                        {modelOptions.sourceLanguages.map(code => <SelectItem key={code} value={code} label={label(code)} className="list-box-item">{label(code)}</SelectItem>)}
                      </SelectGroup></SelectContent>
                    </Select>
                    <Select value={targetLanguage} onValueChange={key => {
                      if (typeof key === 'string') patch(targetLanguagePatch(key, targetLanguage))
                    }}>
                      <SelectFieldLabel className="label">{t('session.targetLanguage')}</SelectFieldLabel>
                      <SelectTrigger className="select__trigger"><SelectValue className="select__value">{value => label(String(value ?? ''))}</SelectValue></SelectTrigger>
                      <SelectContent className="select__popover rounded-xl border border-border bg-overlay p-1 shadow-overlay"><SelectGroup className="nola-language-options list-box">
                        {modelOptions.targetLanguages.map(code => <SelectItem key={code} value={code} label={label(code)} className="list-box-item">{label(code)}</SelectItem>)}
                      </SelectGroup></SelectContent>
                    </Select>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.showContent')}</span>
            <ToggleGroup className="nola-segmented" value={[display]} aria-label={t('shellUi.showContent')} onValueChange={values => {
              const next = values[0]; if (next) patch({ videoCaptions: { showSource: next !== 'translation', showTranslation: next !== 'source' } })
            }}>
              {!translationDisabled && <ToggleGroupItem value="both" className="toggle-button" data-selected={display === 'both' ? 'true' : undefined}>{t('workspace.modeBoth')}</ToggleGroupItem>}
              <ToggleGroupItem value="source" className="toggle-button" data-selected={display === 'source' ? 'true' : undefined}>{t('workspace.modeSource')}</ToggleGroupItem>
              {!translationDisabled && <ToggleGroupItem value="translation" className="toggle-button" data-selected={display === 'translation' ? 'true' : undefined}>{t('workspace.modeTranslation')}</ToggleGroupItem>}
            </ToggleGroup>
          </div>
          {/*
           * `layout` is a single-member union: the video overlay always pairs each
           * segment with its translation, so the group shows the one arrangement
           * rather than offering a choice that cannot be made.
           */}
          <div className="nola-overlay-field">
            <span className="text-sm text-muted">{t('shellUi.layout')}</span>
            <ToggleGroup className="nola-segmented" value={[config.layout]} aria-label={t('shellUi.layout')} onValueChange={values => {
              const next = values[0]; if (next === 'sentence') patch({ videoCaptions: { layout: next } })
            }}>
              <ToggleGroupItem value="sentence" className="toggle-button" data-selected={config.layout === 'sentence' ? 'true' : undefined}>{t('workspace.layoutSentence')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardContent>
        <CardFooter className="card__footer bg-transparent px-0 pb-0 nola-overlay-footer">
          <Button variant="secondary" onClick={() => navigate(settingsPath('browser'))}><Settings aria-hidden="true" />{t('videoCaptions.browserSettings')}<ArrowRight aria-hidden="true" /></Button>
        </CardFooter>
      </Card>
      <div className="nola-video-service">
        <Button variant={gateActive ? 'danger' : 'default'} disabled={captionServiceBusy || prewarming}
          onClick={() => void (gateActive ? close() : open())}>
          {captionServiceBusy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {prewarming ? t('videoCaptions.serviceLoading') : gateActive ? t('videoCaptions.disableService') : t('videoCaptions.enableService')}
        </Button>
        {serviceIndicator}
      </div>
    </div>
  )
}
