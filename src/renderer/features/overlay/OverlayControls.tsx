import { ALIYUN_S2S_SPEECH_LANGUAGES, recognitionFieldsOf, remoteSourceLanguages } from '../../../shared/cloud-config'

import { useModelSelection, useAvailableModels, savedBindingOf, type AvailableModel } from '@/available-models'
/**
 * Control bar at the bottom of the caption window.
 *
 * Absolutely positioned over the caption block rather than laid out as a flex
 * sibling, so the caption line positions do not shift while the pointer passes.
 * Geometry and the hover reveal live in `caption-card.css`
 * (`.nola-caption-controls`); this file owns the contents.
 *
 * The mic is the only entry point that starts recognition, and the engine takes
 * seconds to load weights, so `starting` shows a spinner rather than the mic
 * icon — an unchanged icon reads as "the press did not register".
 *
 * Preflight refusals and engine errors use the independent notification window,
 * keeping transient messages out of the caption track and control bar.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Mic, Pause, Play } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
  NO_TRANSLATION_LANGUAGE,
} from '@/bridge'
import type { AppSettings, AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { audioSourceFrom } from '@/features/workspace/SessionSetupDialog'
import { defaultRealtimeS2s } from '../../../shared/settings'
import { vbCablePair } from '../../../shared/virtual-audio'
import { errorCopyOf } from '@/features/workspace/WorkspacePage'
import { actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { unsupportedRecognitionLanguageOf } from '@/store/sessionStore'
import { checkCredential } from '@/store/modelStore'
import { audioDeviceNameOf, translationFieldsOf } from '@/session-config'
import { useI18n } from '@/i18n'
import { aliyunConnectionReady } from '../../../shared/cloud-models'
import { notifyError, notifyInfo, notifyGatewayStartIssue, sessionConflictMessage } from '@/components/primitives/notify'

import { OverlayDisplayMenu, OverlayLayoutMenu } from './OverlayDisplayMenu'
import { LANGUAGE_MENU_MAX_HEIGHT, LANGUAGE_MENU_SCREEN_FRACTION } from '../../../shared/overlay-menu'
import { isSessionAlreadyRunningError } from '../../../shared/ipc-error'

/**
 * Measured room above and below the trigger, minus one row.
 *
 * react-aria writes its own collision-detected `max-height` as an inline style,
 * which no stylesheet can override. A `maxHeight` prop is merged as a cap that
 * can only lower that value, never raise it, so the cap has to be measured here
 * rather than fixed. The floor keeps one row visible: a sliver too short to
 * scroll is worse than a short menu. See `useMenuMaxHeight`.
 */
const MENU_ROW_MIN = 30
/** Popover corner radius plus the gap to the trigger, deducted from the measured room. */
const MENU_CHROME = 12

export interface OverlayControlsProps {
  /*
   * Locked removes the whole bar rather than greying its pills out. The bar floats over the last
   * line of caption text and takes its pointer events with it, so a locked window that still
   * showed it would swallow the drag-select that locking is for.
   *
   * The mic goes with the bar: a product decision, accepted so that nothing floats over the text
   * in a locked window, which also means a session cannot be started until the user unlocks.
   */
  active: boolean
  locked: boolean
}

/** Cap both the positioning surface and its scrolling list, using the shared language-menu limit. */
export function useMenuMaxHeight(): number {
  const nativeLimit = useStore(stores.settings, state => state.overlayMenu?.maxHeight)
  const [maxHeight, setMaxHeight] = useState<number>(fallbackMaxHeight)
  useLayoutEffect(() => {
    const measure = (): void => setMaxHeight(fallbackMaxHeight())
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return nativeLimit ?? maxHeight
}

/**
 * The `SessionConfig` for one session. Only two places in the app build one:
 * `SessionSetupDialog` in the workspace, and this overlay.
 *
 * Both must resolve to the same user settings, or starting from here would run a
 * configuration the user never picked and has no way to notice. So nothing is
 * assembled by hand: the audio source goes through `audioSourceFrom` and the
 * translation fields through `translationFieldsOf`, which own the rules.
 */
function startConfigOf(settings: AppSettings, devices: readonly AudioDevice[], outputMode: 'source' | 'translation' | 'speech', speechModelId: string, targetLanguage: string): SessionConfig {
  const s2sModel = outputMode === 'source' ? null : settings.realtime?.quickS2sModel === undefined ? defaultRealtimeS2s(settings) : settings.realtime.quickS2sModel
  const recognition = s2sModel ? { ...settings.recognition, provider: 'aliyun' as const, aliyunModel: s2sModel } : settings.recognition
  const virtualInputDeviceId = settings.realtime?.virtualInputDeviceId
  return {
    audioSource: virtualInputDeviceId ? { kind: 'virtualInput', deviceId: virtualInputDeviceId } : audioSourceFrom(optionOf(settings.recognition.audioSource, devices), settings.recognition.audioSource),
    // Kept for protocol compatibility; realtime is the only mode the app runs.
    recognitionMode: 'realtime',
    recognitionModelId: settings.recognition.modelId,
    ...recognitionFieldsOf(recognition),
    sourceLanguage: s2sModel && !remoteSourceLanguages(recognition).includes(recognition.sourceLanguage) ? 'auto' : recognition.sourceLanguage,
    // No target language: the setting's `translation.targetLanguage` applies,
    // and the pill is what edits it.
    ...(s2sModel ? { targetLanguages: [targetLanguage], translationProvider: 'recognition' as const } : translationFieldsOf(settings.translation, { enabled: outputMode !== 'source', targetLanguage })),
    outputMode,
    s2sModel: s2sModel ?? null,
    ...(outputMode === 'speech' ? { speechOutputDeviceId: settings.realtime?.speechOutputDeviceId } : {}),
    ...(outputMode === 'speech' && !s2sModel ? {
      speechModelId: speechModelId.startsWith('resource:') ? speechModelId.slice(9) : speechModelId,
      ...(settings.synthesis.voice ? { speechVoice: settings.synthesis.voice } : {}),
    } : {}),
  }
}

/**
 * Device id -> the matching selector entry. Lookup only; the rules live in
 * `audioSourceFrom`.
 *
 * Returns `undefined` when the setting holds the protocol sentinel
 * `'defaultOutput'` (not a device, so never in a device list) or a device that
 * has since been unplugged. Both fall back to the system default output, the
 * same result the workspace gives for an entry missing from its list.
 */
function optionOf(value: string, devices: readonly AudioDevice[]): AudioSourceOption | undefined {
  const device = devices.find((item) => item.deviceId === value)
  if (!device) return undefined
  return {
    value: device.deviceId,
    kind: device.kind,
    deviceId: device.deviceId,
    name: device.name,
    isDefault: device.isDefault,
  }
}

/**
 * Usable height near the trigger.
 *
 * With no trigger to measure (SSR, jsdom), fall back to half the viewport, which
 * tracks window height instead of overflowing a short caption window.
 */
function fallbackMaxHeight(): number {
  if (typeof document === 'undefined') return MENU_ROW_MIN
  const trigger = document.querySelector<HTMLElement>('.nola-caption-pill')
  const viewportHeight = window.innerHeight
  if (!trigger) {
    return Math.min(LANGUAGE_MENU_MAX_HEIGHT, Math.max(MENU_ROW_MIN, Math.floor(viewportHeight / 2) - MENU_CHROME))
  }
  const box = trigger.getBoundingClientRect()
  const roomUp = box.bottom
  const roomDown = viewportHeight - box.top
  // The larger side: react-aria flips to whichever side has room.
  const room = Math.max(roomUp, roomDown)
  return Math.max(MENU_ROW_MIN, Math.min(LANGUAGE_MENU_MAX_HEIGHT, Math.floor(viewportHeight * LANGUAGE_MENU_SCREEN_FRACTION), Math.floor(room) - MENU_CHROME))
}

export function OverlayControls({ active, locked }: OverlayControlsProps) {
  const controlsRow = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = controlsRow.current
    // The native menu document uses an invisible anchor, not the caption's visible toolbar.
    if (!row?.closest('.nola-caption-card')) return
    const measure = (): void => {
      const width = row.clientWidth
      if (width <= 0) return
      const mic = row.querySelector<HTMLElement>(':scope > .nola-caption-mic')
      const menus = Array.from(row.querySelectorAll<HTMLElement>(':scope > .nola-caption-menu-trigger'))
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0
      let used = mic?.offsetWidth ?? 0
      let fits = true
      for (const menu of menus) {
        const next = used + (used > 0 ? gap : 0) + menu.getBoundingClientRect().width
        fits = fits && next <= width
        menu.toggleAttribute('data-overflow-hidden', !fits)
        if (fits) used = next
      }
    }
    // Hidden pills retain their intrinsic width so widening can restore them without a visible measuring pass.
    const resize = new ResizeObserver(measure)
    const observe = (): void => {
      resize.disconnect()
      resize.observe(row)
      for (const child of row.children) resize.observe(child)
      measure()
    }
    const children = new MutationObserver(observe)
    children.observe(row, { childList: true })
    observe()
    return () => { resize.disconnect(); children.disconnect() }
  }, [locked])
  const { t } = useI18n()
  /**
   * The whole settings object rather than one subscription per field.
   *
   * `settings` is a stable reference, so this selector does not trip the
   * `createStore` rule that a selector returning a fresh object loops React,
   * and `startConfigOf` needs the whole object anyway.
   *
   * `DEFAULT_SETTINGS` before settings load matches `SessionSetupDialog`:
   * better a default than a session that cannot start.
   */
  const settings = useStore(stores.settings, (state) => state.settings) ?? DEFAULT_SETTINGS
  const target = settings.translation.targetLanguage
  const translationDisabled = target === NO_TRANSLATION_LANGUAGE
  const outputMode = translationDisabled ? 'source' : settings.realtime?.outputMode === 'speech' ? 'speech' : 'translation'
  const devices = useStore(stores.models, (state) => state.devices)
  const status = useStore(sessionStore, (state) => state.status)
  const pausePending = useStore(sessionStore, state => state.pausePending)
  const playbackJob = useStore(sessionStore, state => state.playbackJob)
  const errorCode = useStore(sessionStore, (state) => state.errorCode)
  const runtimeComponent = errorCode === 'RUNTIME_TORCH' ? 'engine' : errorCode === 'RUNTIME_LLAMA' ? 'llama' : null
  const missing = useStore(sessionStore, (state) => state.missing)

  const catalog = useAvailableModels()
  const reportSwitch = (model: AvailableModel) => notifyInfo(t('gateway.modelSwitched', { name: model.name }),
    { description: t('gateway.modelSwitchedLoaded') })
  const s2sModel = translationDisabled ? null
    : settings.realtime?.quickS2sModel === undefined ? defaultRealtimeS2s(settings) : settings.realtime.quickS2sModel
  const asr = useModelSelection('asr', catalog.asr, settings, reportSwitch, !!s2sModel)
  const mt = useModelSelection('mt', catalog.mt, settings, reportSwitch, translationDisabled || !!s2sModel)
  const tts = useModelSelection('tts', catalog.tts, settings, reportSwitch, outputMode !== 'speech' || !!s2sModel)
  const needsMt = !translationDisabled && !s2sModel
  const asrUnavailable = asr.unavailable
  const mtUnavailable = mt.unavailable
  const ttsUnavailable = tts.unavailable

  /* `lastIntent` lets a late engine error keep the right start/stop wording. */
  const [lastIntent, setLastIntent] = useState<'start' | 'stop'>('start')

  const failureSignature = errorCode === null ? null : `${errorCode}|${missing?.resourceId ?? ''}`
  const reportedFailure = useRef<string | null>(failureSignature)
  const failureMessage =
    failureSignature === null
      ? null
      : missing
        ? t('preflight.modelMissing', { name: missing.name })
        : t(errorCopyOf(errorCode, lastIntent).message)

  useEffect(() => {
    if (failureSignature === null) {
      reportedFailure.current = null
      return
    }
    if (reportedFailure.current === failureSignature || !failureMessage) return
    reportedFailure.current = failureSignature
    if (runtimeComponent) {
      const label = t(runtimeComponent === 'engine' ? 'runtime.goTorch' : 'runtime.goLlama')
      notifyError(failureMessage, { action: {
        label,
        actionId: runtimeComponent === 'engine' ? 'runtime-engine' : 'runtime-llama',
        onPress: () => { void actions.settings.openRuntimeSettings(runtimeComponent).catch(error => console.error('[overlay.runtime-settings]', error)) },
      } })
    } else notifyError(failureMessage)
  }, [failureMessage, failureSignature, runtimeComponent, t])

  /**
   * The mic starts an idle session; while a session is active it toggles
   * recognition and translation between running and paused.
   *
   * Presses are ignored while `starting` / `stopping`: the engine is loading or
   * unloading weights, so another press could neither stop nor switch anything
   * and would only suggest the button is broken.
   *
   * Store errors are announced by the effect above. The catch reports only
   * failures that happened before the session store could record them.
   */
  const toggleMic = async (): Promise<void> => {
    if (status === 'running') {
      await actions.session.pauseSession().catch(error => notifyError(t('session.pauseFailed'), { cause: error }))
      return
    }
    if (status === 'paused') {
      await actions.session.resumeSession().catch(error => notifyError(t('session.pauseFailed'), { cause: error }))
      return
    }
    if (status === 'idle' || status === 'error') {
      if (s2sModel && !aliyunConnectionReady(settings, await checkCredential('aliyun-asr').catch(() => false))) {
        notifyError(t('session.s2sSetupHint'))
        return
      }
      if (s2sModel && outputMode === 'speech' && !ALIYUN_S2S_SPEECH_LANGUAGES.includes(target)) {
        notifyError(t('session.speechLanguageUnavailable'))
        return
      }
      const virtualInput = settings.realtime?.virtualInputDeviceId || devices.some(device => device.deviceId === settings.recognition.audioSource && device.kind === 'microphone' && vbCablePair(device.name, 'Output'))
      if (outputMode === 'speech' && virtualInput &&
        (!settings.realtime?.speechOutputDeviceId || settings.realtime.speechOutputDeviceId === 'default')) {
        notifyError(t('session.explicitSpeechOutput'))
        return
      }
      const needsTts = outputMode === 'speech' && !s2sModel
      const missing = !s2sModel && asrUnavailable ? 'asr'
        : needsMt && mtUnavailable ? 'mt' : needsTts && ttsUnavailable ? 'tts' : undefined
      if (missing) {
        await notifyGatewayStartIssue(t, missing, savedBindingOf(missing, settings))
        return
      }
      setLastIntent('start')
      const config = { ...startConfigOf(settings, devices, outputMode, tts.binding, target), ...(!s2sModel ? { recognitionBinding: asr.binding } : {}), ...(needsMt ? { translationBinding: mt.binding } : {}) }
      void actions.session.startSession(config).catch((error: unknown) => {
        if (isSessionAlreadyRunningError(error)) {
          notifyError(sessionConflictMessage(t, error))
        } else if (unsupportedRecognitionLanguageOf(error)) {
          notifyError(t('errors.unsupportedRecognitionLanguage', { language: unsupportedRecognitionLanguageOf(error) ?? '' }))
        } else if (sessionStore.getState().errorCode === 'AUDIODEVICEUNAVAILABLE') {
          notifyError(t('overlay.audioDeviceOpenFailed', { device: audioDeviceNameOf(config.audioSource, devices, t('overlay.selectedAudioDevice')) }))
        } else if (sessionStore.getState().errorCode === null) {
          /*
           * This failure happens before the session store records it, so report
           * it directly and let the user retry from the notification.
           */
          notifyError(t('errors.startFailedTitle'), {
            cause: error,
            description: t('errors.startFailedDescription'),
            action: { label: t('errors.startFailedAction'), onPress: toggleMic, actionId: 'retry-session' },
          })
        } else console.warn('[overlay] startSession failed', error)
      })
    }
  }

  useEffect(() => getBridge()?.events.onOverlayToastAction?.(actionId => {
    if (actionId === 'retry-session') toggleMic()
  }), [toggleMic])

  /*
   * Three looks, one button, with colour left to the `[data-*]` CSS:
   *   starting → spinner (engine loading)
   *   running  → pause control
   *   paused   → resume control
   *   other    → plain mic (press to start)
   */
  const starting = status === 'starting' || status === 'stopping'
  const running = status === 'running'
  const micLabel = starting
    ? t('overlay.micLoading')
    : running ? t('overlay.micPause') : status === 'paused' ? t('overlay.micResume') : t('overlay.micStart')

  return (
    <>
      {locked ? null : (
        <div data-slot="overlay-controls" className="nola-caption-controls">
          <div ref={controlsRow} className="nola-caption-controls-row nola-no-drag">
            {/*
             * A spinner marks `starting` rather than greying the button out: greyed
             * and unresponsive reads as broken, a spinner reads as waiting on the
             * engine. Same for `stopping`, where unloading weights also takes a
             * moment worth showing.
             */}
            <Button
              variant="secondary"
              size="icon"
              onClick={toggleMic}
              disabled={pausePending || status === 'starting' || status === 'stopping'}
              aria-label={micLabel}
              aria-busy={starting || undefined}
              // `.nola-caption-mic` in `caption-card.css` paints the recording
              // state; this only supplies it.
              className="nola-caption-mic"
              data-active={running ? 'true' : 'false'}
              data-loading={starting ? 'true' : 'false'}
            >
              {starting ? <Spinner /> : running ? <Pause aria-hidden="true" /> : status === 'paused' ? <Play aria-hidden="true" /> : <Mic aria-hidden="true" />}
            </Button>

            {active && playbackJob ? <>
              {playbackJob.state === 'failed' ? <Button variant="secondary" size="sm" className="rounded-xl" aria-label={t('session.retryPlayback')} onClick={() => { void actions.session.resolvePlayback(playbackJob.jobId, 'retry').catch(error => notifyError(t('session.playbackActionFailed'), { cause: error })) }}>{t('session.retryPlayback')}</Button> : null}
              <Button variant="outline" size="sm" className="rounded-xl" aria-label={t('session.skipPlayback')} onClick={() => { void actions.session.resolvePlayback(playbackJob.jobId, 'skip').catch(error => notifyError(t('session.playbackActionFailed'), { cause: error })) }}>{t('session.skipPlayback')}</Button>
            </> : null}

            {!translationDisabled ? <>
              <OverlayDisplayMenu />
              <OverlayLayoutMenu />
            </> : null}
          </div>
        </div>
      )}

    </>
  )
}
