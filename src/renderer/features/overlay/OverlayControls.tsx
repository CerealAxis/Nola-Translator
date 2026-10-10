import { useModelOptions } from '@/model-options'
/**
 * Control bar at the bottom of the caption window.
 *
 * Absolutely positioned over the caption block rather than laid out as a flex
 * sibling, so the caption line positions do not shift while the pointer passes.
 * Geometry and the hover reveal live in `caption-card.css`
 * (`.nola-caption-controls`); this file owns the contents.
 *
 * Every pill writes the same settings store the workspace writes
 * (`recognition.modelId`, `recognition.sourceLanguage`,
 * `translation.targetLanguage`), so a model picked here is the model the next
 * workspace session runs. Model and language pills are disabled while a session
 * is active: `startSession` has already fixed them, so a mid-session change
 * would only edit settings and look like it did something.
 *
 * The mic is the only entry point that starts recognition, and the engine takes
 * seconds to load weights, so `starting` shows a spinner rather than the mic
 * icon — an unchanged icon reads as "the press did not register".
 *
 * Failures are shown in place: preflight refusals and engine errors both land in
 * `sessionStore` (`missing` / `errorCode`) and render as a notice line here
 * rather than sending the user to the main window.
 */

import { useLayoutEffect, useState } from 'react'

import { Button, Dropdown, Spinner } from '@heroui/react'
import { Mic, Square } from 'lucide-react'

import {
  DEFAULT_SETTINGS,
  LANGUAGE_LABELS,
} from '@/bridge'
import type { AppSettings, AudioDevice, AudioSourceOption, RecognitionModelId, SessionConfig } from '@/bridge'
import { audioSourceFrom } from '@/features/workspace/SessionSetupDialog'
import { errorCopyOf } from '@/features/workspace/WorkspacePage'
import { actions, sessionStore, stores, useStore } from '@/store'
import { targetLanguagePatch, translationFieldsOf } from '@/session-config'
import { useI18n } from '@/i18n'

import { OverlayDisplayMenu, OverlayLayoutMenu } from './OverlayDisplayMenu'

/**
 * Geometry and colour live in `.nola-caption-pill` (`caption-card.css`).
 *
 * The pill sets `white-space: nowrap` and no max-width: a long language name
 * widens the pill instead of truncating.
 */
const CAPSULE = 'nola-caption-pill'

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

/** The notice's id, referenced by the mic's `aria-describedby`. The text changes; the id does not. */
const FAILURE_NOTICE_ID = 'overlay-start-failure'

export interface OverlayControlsProps {
  /*
   * `locked` means neither content nor position may change, so it has to close
   * both: dropping `-webkit-app-region: drag` alone stops the card from moving
   * but leaves every pill on the bar clickable, which is a half-lock.
   *
   * The mic is not locked with the rest. What is locked is "do not change my
   * settings", not "do not let me start a session" — otherwise locking the
   * position would also remove the only way to start recognition.
   */
  active: boolean
  locked: boolean
}

/**
 * Usable height for a menu anchored to a pill, in pixels.
 *
 * Measures the trigger's distance to the top and bottom viewport edges. The
 * viewport is the transparent caption window itself: pixels outside it are never
 * rendered, so only room inside it is usable.
 *
 * The larger of the two is passed because react-aria flips the popover to
 * whichever side has space, and it will not flip unless the overflow is worse
 * than the original side. Handing it the best of both sides leaves that choice
 * to react-aria.
 *
 * Every menu passes this to both its Popover and its Menu. The Popover needs it
 * to choose a side; the Menu is the element that scrolls, and a cap that stops
 * at the Popover leaves the Menu at its full content height — it then spills
 * past the window edge with nothing to scroll. `Dropdown.Menu` has no
 * `maxHeight` prop, so the second copy goes through `style`.
 */
export function useMenuMaxHeight(): number {
  const [maxHeight, setMaxHeight] = useState<number>(fallbackMaxHeight)

  useLayoutEffect(() => {
    const measure = (): void => {
      const next = fallbackMaxHeight()
      setMaxHeight(previous => (previous === next ? previous : next))
    }
    measure()
    // Re-measure on resize: the window is draggable, and the resolution and the
    // taskbar can change under it.
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  return maxHeight
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
function startConfigOf(settings: AppSettings, devices: readonly AudioDevice[]): SessionConfig {
  return {
    audioSource: audioSourceFrom(optionOf(settings.recognition.audioSource, devices), settings.recognition.audioSource),
    // Kept for protocol compatibility; realtime is the only mode the app runs.
    recognitionMode: 'realtime',
    recognitionModelId: settings.recognition.modelId,
    sourceLanguage: settings.recognition.sourceLanguage,
    // No target language: the setting's `translation.targetLanguage` applies,
    // and the pill is what edits it.
    ...translationFieldsOf(settings.translation, { enabled: true }),
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
    return Math.max(MENU_ROW_MIN, Math.floor(viewportHeight / 2) - MENU_CHROME)
  }
  const box = trigger.getBoundingClientRect()
  const roomUp = box.bottom
  const roomDown = viewportHeight - box.top
  // The larger side: react-aria flips to whichever side has room.
  const room = Math.max(roomUp, roomDown)
  return Math.max(MENU_ROW_MIN, Math.floor(room) - MENU_CHROME)
}

export function OverlayControls({ active, locked }: OverlayControlsProps) {
  const { t, language } = useI18n()
  const menuMaxHeight = useMenuMaxHeight()
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
  const devices = useStore(stores.models, (state) => state.devices)
  const status = useStore(sessionStore, (state) => state.status)
  const errorCode = useStore(sessionStore, (state) => state.errorCode)
  const diagnostic = useStore(sessionStore, (state) => state.error)
  const runtimeComponent = errorCode === 'RUNTIME_TORCH' ? 'engine' : errorCode === 'RUNTIME_LLAMA' ? 'llama' : null
  const missing = useStore(sessionStore, (state) => state.missing)

  const modelOptions = useModelOptions()
  const modelId = settings.recognition.modelId
  const source = settings.recognition.sourceLanguage
  const target = settings.translation.targetLanguage

  const label = (code: string): string => {
    const entry = (LANGUAGE_LABELS as Record<string, { zh: string; en: string } | undefined>)[code]
    if (!entry) return code
    return language === 'zh-CN' ? entry.zh : entry.en
  }

  const patch = (next: Parameters<typeof actions.settings.updateSettings>[0]): void => {
    void actions.settings.updateSettings(next).catch(() => undefined)
  }

  /*
   * Two local values behind the failure notice. The error itself is not stored
   * here: `sessionStore` is the single source, and this only records which
   * button was last pressed and which failure the user has already seen.
   *
   * `lastIntent` is the `context` for `errorCopyOf`, so a session that dies
   * mid-run reports "stopped" rather than "could not start". An error pushed
   * asynchronously by the engine has no matching press, so it reuses the last
   * value, which is close enough for a one-line notice.
   *
   * `dismissedFailure` holds a signature (error code plus missing resource id)
   * rather than the code, so the same failure recurring after an intervening
   * success is reported again. It exists because `errorCode` is cleared when the
   * next session starts, and the mic is disabled for the duration of that call,
   * which would leave the notice on screen with no way to clear it. Every press
   * rearms it, so "press again" always works.
   */
  const [lastIntent, setLastIntent] = useState<'start' | 'stop'>('start')
  const [dismissedFailure, setDismissedFailure] = useState<string | null>(null)

  const failureSignature = errorCode === null ? null : `${errorCode}|${missing?.resourceId ?? ''}`
  const failureMessage =
    failureSignature === null || failureSignature === dismissedFailure
      ? null
      : missing
        ? t('preflight.modelMissing', { name: missing.name })
        : runtimeComponent || errorCode === 'SESSION_ERROR' ? diagnostic : t(errorCopyOf(errorCode, lastIntent).message)

  /**
   * The mic is the single on/off control for a session: `idle` / `error` start,
   * `running` / `paused` stop.
   *
   * Presses are ignored while `starting` / `stopping`: the engine is loading or
   * unloading weights, so another press could neither stop nor switch anything
   * and would only suggest the button is broken.
   *
   * The `.catch` only logs. `sessionStore` already holds `error` / `errorCode` /
   * `missing`, and `StartFailureNotice` renders them here.
   */
  const toggleMic = (): void => {
    if (status === 'running' || status === 'paused') {
      setLastIntent('stop')
      // Rearm the notice first: pressing again is a retry.
      setDismissedFailure(null)
      void actions.session.stopSession().catch((error: unknown) => {
        console.warn('[overlay] stopSession failed', error)
      })
      return
    }
    if (status === 'idle' || status === 'error') {
      setLastIntent('start')
      setDismissedFailure(null)
      void actions.session.startSession(startConfigOf(settings, devices)).catch((error: unknown) => {
        console.warn('[overlay] startSession failed', error)
      })
    }
  }

  /*
   * Three looks, one button, with colour left to the `[data-*]` CSS:
   *   starting → spinner (engine loading)
   *   running  → inverted button plus stop square (recording, press to end)
   *   other    → plain mic (press to start)
   */
  const starting = status === 'starting' || status === 'stopping'
  const running = status === 'running'
  const micLabel = starting
    ? t('overlay.micLoading')
    : running || status === 'paused' ? t('overlay.micStop') : t('overlay.micStart')

  return (
    <>
      <div data-slot="overlay-controls" className="nola-caption-controls">
        <div className="nola-no-drag flex min-w-0 flex-1 items-center justify-center gap-2">
          {/*
           * A spinner marks `starting` rather than greying the button out: greyed
           * and unresponsive reads as broken, a spinner reads as waiting on the
           * engine. Same for `stopping`, where unloading weights also takes a
           * moment worth showing.
           */}
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={toggleMic}
            isDisabled={status === 'starting' || status === 'stopping'}
            aria-label={micLabel}
            aria-busy={starting || undefined}
            // Point the button at the notice below so a screen reader announces
            // why the press did nothing, instead of the user having to find the
            // line on screen.
            aria-describedby={failureMessage ? FAILURE_NOTICE_ID : undefined}
            // `.nola-caption-mic` in `caption-card.css` paints the recording
            // state; this only supplies it.
            className="nola-caption-mic"
            data-active={running ? 'true' : 'false'}
            data-loading={starting ? 'true' : 'false'}
          >
            {starting ? <Spinner size="sm" color="current" /> : running ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
          </Button>

          <Dropdown>
            <Dropdown.Trigger isDisabled={active || locked} className={`${CAPSULE} nola-caption-pill--mode`}>
              <span className="nola-caption-mode-dot" aria-hidden="true" />
              <span>{modelOptions.recognition?.name ?? modelId}</span>
            </Dropdown.Trigger>
            {/*
              Selection is computed by the Menu, not set per item: `Dropdown.Item`
              has no `isSelected` prop. The chain is `selectionMode` plus
              `selectedKeys` on the Menu, and `id` on each item.

              `selectedKeys` must be a Set. A string type-checks, but selection
              silently fails and every item reports aria-checked="false".

              The checkmark goes after the label because its slot is already
              absolutely positioned on the inline-start edge.
            */}
            <Dropdown.Popover className="nola-caption-menu" maxHeight={menuMaxHeight}>
              <Dropdown.Menu
                className="nola-caption-menu-list"
                style={{ maxHeight: menuMaxHeight }}
                selectionMode="single"
                selectedKeys={new Set([modelId])}
                onSelectionChange={(key) => {
                  if (typeof key === 'string') patch({ recognition: { modelId: key as RecognitionModelId } })
                }}
              >
                {modelOptions.recognitionModels.map(model => (
                  <Dropdown.Item
                    key={model.value}
                    id={model.value}
                    isDisabled={model.isDisabled}
                    className="nola-menu-item"
                    textValue={model.label}
                    onAction={() => patch({ recognition: { modelId: model.value as RecognitionModelId } })}
                  >
                    {model.label}
                    <Dropdown.ItemIndicator type="checkmark" />
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <LanguagePill
            caption={t('session.sourceLanguage')}
            value={source}
            options={modelOptions.sourceLanguages}
            labelOf={label}
            isDisabled={active || locked}
            maxHeight={menuMaxHeight}
            onChange={next => patch({ recognition: { sourceLanguage: next } })}
          />
          <LanguagePill
            caption={t('session.targetLanguage')}
            value={target}
            options={modelOptions.targetLanguages}
            labelOf={label}
            isDisabled={active || locked}
            maxHeight={menuMaxHeight}
            onChange={next => patch(targetLanguagePatch(next, target))}
          />

          <OverlayDisplayMenu isDisabled={locked} />
          <OverlayLayoutMenu isDisabled={locked} />
        </div>
      </div>

      <StartFailureNotice message={failureMessage} action={runtimeComponent ? t(runtimeComponent === 'engine' ? 'runtime.goTorch' : 'runtime.goLlama') : undefined}
        onAction={runtimeComponent ? () => void actions.settings.openRuntimeSettings(runtimeComponent) : undefined} />
    </>
  )
}

/**
 * The one-line start/stop failure notice, shown in place rather than by
 * sending the user to the main window.
 *
 * A sibling of the control bar rather than a child: the bar is `opacity: 0`
 * with `pointer-events: none` until the card is hovered or focused
 * (`caption-card.css`), and a failure lands exactly when the pointer has
 * just left the mic, so the notice would fade out with it.
 */
function StartFailureNotice({ message, action, onAction }: { message: string | null; action?: string; onAction?: () => void }) {
  if (message === null) return null
  return (
    <div
      id={FAILURE_NOTICE_ID}
      role="status"
      data-slot="overlay-failure"
      className="nola-caption-notice"
    >
      <p className="nola-caption-notice__text">{message}</p>
      {action ? <Button size="sm" variant="secondary" onPress={onAction}>{action}</Button> : null}
    </div>
  )
}

/**
 * One side of a language pair: a pill and a Dropdown.
 *
 * `Dropdown` rather than `Select`, whose trigger and ListBox carry enough
 * padding to weigh heavily on top of the captions, and whose rows do not
 * match the pill's.
 *
 * The list is long enough to need scrolling, with the scrollbar hidden in
 * `.nola-caption-menu-list`. It stays inside the window: the popover is a
 * separate layer over the card, but the window is a fixed-size transparent
 * rectangle, so anything past its bounds is simply not rendered. Direction
 * is left to react-aria, whose `shouldFlip` turns the popover upward when
 * there is no room below.
 */
function LanguagePill({
  caption,
  value,
  options,
  labelOf,
  isDisabled,
  maxHeight,
  onChange,
}: {
  caption: string
  value: string
  options: readonly string[]
  labelOf: (code: string) => string
  isDisabled: boolean
  maxHeight: number
  onChange: (code: string) => void
}) {
  return (
    <Dropdown>
      <Dropdown.Trigger isDisabled={isDisabled} className={CAPSULE} aria-label={caption}>
        <span>{labelOf(value)}</span>
      </Dropdown.Trigger>
      <Dropdown.Popover className="nola-caption-menu" maxHeight={maxHeight}>
        <Dropdown.Menu
          className="nola-caption-menu-list"
          style={{ maxHeight }}
          selectionMode="single"
          selectedKeys={new Set([value])}
          onSelectionChange={key => { if (typeof key === 'string') onChange(key) }}
        >
          {options.map(code => (
            <Dropdown.Item key={code} id={code} className="nola-menu-item" textValue={labelOf(code)} onAction={() => onChange(code)}>
              {labelOf(code)}
              <Dropdown.ItemIndicator type="checkmark" />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
