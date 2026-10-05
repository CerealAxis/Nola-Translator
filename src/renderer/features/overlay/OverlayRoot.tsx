/**
 * Root of the caption window. `main.tsx` renders it for `?overlay=1`, outside
 * `AppShell`: this window is glass over someone else's screen, not a page of
 * the app.
 *
 * This file supplies semantics and state (`data-scheme`, `data-locked`,
 * `data-hover`, `data-transparent`); all geometry is in `caption-card.css`.
 *
 * Four rules that cannot be traded away:
 * 1. **Colour does not follow the app theme.** This window sits over video and
 *    meeting software, so it has to prove its own contrast. Switching the
 *    workspace to dark must not move it.
 * 2. **Scroll containers are always native `overflow-y: auto`.** A scroll
 *    container with `mask-image` becomes the containing block for
 *    `position: fixed` descendants, which displaces the popovers and menus.
 *    The fade scrims are absolutely positioned siblings instead of a mask.
 * 3. **Hover is tested with raw pointer coordinates**, not enter/leave: an
 *    unlocked card is a drag region, and its rounded corners let the pointer
 *    land on the wrapper, so both drop the synthetic events.
 * 4. **Captions are one continuous text stream, not a node per sentence.** The
 *    engine revises the same sentence repeatedly, so per-sentence nodes make the
 *    caption repeat itself, and enough of them overflow a fixed-height track.
 *    `CaptionTrack` owns collapsing and scrollback.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { Button } from '@heroui/react'
import { Lock, Minus, Monitor, Pin, PinOff, SlidersHorizontal, Unlock, X } from 'lucide-react'

import { DEFAULT_SETTINGS } from '@/bridge'
import { actions, getBridge, sessionStore, stores, useStore } from '@/store'
import { useI18n } from '@/i18n'
import { translationErrorSummary } from '@/translation-status'

import { CaptionTrack } from './CaptionTrack'
import type { TrackLine } from './CaptionTrack'
import { OverlayControls } from './OverlayControls'
import { allocateCaptionLines } from './lineBudget'

export const CAPTION_SCHEMES = {
  dark: { bg: '#0d0e10', source: '#f7f7f7', target: '#d7dee8', border: 'rgba(255,255,255,0.10)', chrome: '#d7dee8' },
  light: { bg: '#f7f7f7', source: '#1a1c22', target: '#4a5160', border: 'rgba(0,0,0,0.08)', chrome: '#4a5160' },
} as const

export type CaptionScheme = keyof typeof CAPTION_SCHEMES

export function OverlayRoot() {
  const { t } = useI18n()
  const overlay = useStore(stores.settings, (state) => state.settings?.overlay)
  const session = useStore(sessionStore, (state) => state)
  const [hovered, setHovered] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closePending, setClosePending] = useState(false)
  const [closeFailed, setCloseFailed] = useState(false)
  const closeRequest = useRef(false)

  /*
   * 「−」 really minimizes to the taskbar, 「✕」 closes and ends the session.
   *
   * Real minimizing has a hard prerequisite: the caption window must be
   * `skipTaskbar: false`, or a minimized window has no taskbar entry to bring
   * it back.
   *
   * Closing ends recognition. `hideOverlay` is a pure hide for a caller that
   * only wants the window out of the way; here the user means the session is
   * over, and leaving the engine running would have them believe it is still
   * recording.
   */
  // The main process owns stop + hide. Sending stopSession as well races two teardown requests.
  const closeOverlay = async (): Promise<void> => {
    if (closeRequest.current) return
    closeRequest.current = true
    setClosePending(true)
    setCloseFailed(false)
    try {
      const bridge = getBridge()
      if (!bridge) throw new Error('Overlay bridge unavailable')
      await bridge.overlay.close()
      setClosing(false)
    } catch (error) {
      console.error('[overlay] close failed', error)
      setCloseFailed(true)
    } finally {
      closeRequest.current = false
      setClosePending(false)
    }
  }

  const config = overlay ?? DEFAULT_SETTINGS.overlay
  const scheme: CaptionScheme = config.colorScheme === 'light' ? 'light' : 'dark'
  const palette = { ...CAPTION_SCHEMES[scheme], bg: config.backgroundColor, source: config.sourceColor, target: config.translationColor }
  const opacity = clamp(config.backgroundOpacity, 0, 1)

  /*
   * Appearance is a request to the main window, not a local navigation: this
   * window owns no settings page, so the main window's route listener receives
   * the push and changes its own hash.
   */
  const openAppearanceSettings = (): void => {
    void window.nolaTranslator?.openAppearance('appearance').catch(() => undefined)
  }

  const active = session.status === 'running' || session.status === 'paused' || session.status === 'starting'
  const hasCaption = session.segments.length > 0 || session.interim !== null

  /*
   * Tracks render only the current sentence; `CaptionTrack` folds earlier ones
   * into a running stream.
   *
   * The unconfirmed segment wins, being the engine's latest revision. When it
   * has no translation the translation track keeps its last line rather than
   * clearing: translation lags by a step, and clearing would make a sentence
   * that just finished translating vanish.
   */
  const current = session.interim ?? session.segments[session.segments.length - 1] ?? null
  const sourceLine: TrackLine | null = current?.sourceText
    ? { key: current.segmentId, text: current.sourceText }
    : null
  const translated = current?.translations.find((entry) => entry.state === 'complete' && entry.text)
  const translationLine: TrackLine | null = current && translated?.text
    ? { key: current.segmentId, text: translated.text }
    : null

  /*
   * A translation failure must show its reason. Drawing only `complete`
   * translations makes "offline / expired key / model not ready" look exactly
   * like "still translating", and the user can act on neither.
   *
   * Shown only when there is genuinely no usable translation: a `pending`
   * segment gets no failure copy, because translation lagging is normal and a
   * flashing error is noisier than an empty line.
   */
  const failureLine: TrackLine | null = current && !translated?.text
    ? (() => {
        const reason = translationErrorSummary(t, current)
        return reason ? { key: `${current.segmentId}-error`, text: reason } : null
      })()
    : null
  const effectiveTranslationLine = translationLine ?? failureLine

  /*
   * Hover from raw coordinates rather than onMouseEnter/onMouseLeave: an
   * unlocked card is a `-webkit-app-region: drag`, and its rounded corners let
   * the pointer land on the wrapper, so both drop the synthetic events.
   */
  const cardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const card = cardRef.current
    if (!card) return
    const inside = (event: MouseEvent): boolean => {
      const rect = card.getBoundingClientRect()
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
    }
    const onMove = (event: MouseEvent): void => setHovered(inside(event))
    const onLeave = (): void => setHovered(false)
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  /*
   * How many lines each track may show depends on the measured stage height.
   */
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageBox, setStageBox] = useState({ height: 0, gap: 0 })
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () => {
      const style = window.getComputedStyle(stage)
      const padding = Number.parseFloat(style.paddingTop || '0') + Number.parseFloat(style.paddingBottom || '0')
      const height = Math.max(0, stage.clientHeight - padding)
      /*
       * The real gap, read from computed style instead of hardcoding `6`: the
       * value lives on `.nola-caption-stage` in `caption-card.css`, and an even
       * split is `share = (height - gap * (tracks - 1)) / tracks`, so a stale gap
       * miscounts a line and pushes a track out of view without any error.
       * Unparseable `rowGap` (`normal`, empty) falls back to 0 rather than NaN.
       */
      const gap = Number.parseFloat(style.rowGap || '0') || 0
      setStageBox(previous => previous.height === height && previous.gap === gap ? previous : { height, gap })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    window.addEventListener('resize', measure)
    return () => { observer.disconnect(); window.removeEventListener('resize', measure) }
  }, [hasCaption, config.showSource, config.showTranslation, config.fontSize, config.translationFontSize, config.lineHeight, config.translationLineHeight])

  /*
   * Bilingual splits the stage in half; monolingual gives the one track all of
   * it.
   *
   * `visible` is the setting, not whether text happens to exist right now. That
   * is what reserves the translation half up front: with translation on, the
   * track claims its half before the first word arrives. Splitting on the text
   * instead would make both tracks jump on every segment, and the source track
   * would grow abruptly when a translation times out or fails.
   */
  const [sourceLines, translationLines] = allocateCaptionLines(
    stageBox.height,
    [
      { visible: config.showSource, fontSize: config.fontSize, lineHeight: config.lineHeight },
      { visible: config.showTranslation, fontSize: config.translationFontSize, lineHeight: config.translationLineHeight },
    ],
    stageBox.gap,
  )

  const patchOverlay = useCallback((patch: Partial<typeof DEFAULT_SETTINGS.overlay>) => {
    void actions.settings.updateSettings({ overlay: patch }).catch(() => undefined)
  }, [])

  /**
   * CSS custom properties. The glass's whole palette and typography enters
   * `caption-card.css` from here.
   */
  const cardStyle = {
    '--overlay-background-color': palette.bg,
    '--overlay-background-alpha': `${Math.round(opacity * 100)}%`,
    '--overlay-source-color': palette.source,
    '--overlay-translation-color': palette.target,
    '--overlay-font-size': `${config.fontSize}px`,
    '--overlay-font-weight': config.fontWeight,
    '--overlay-line-height': config.lineHeight,
    '--overlay-translation-font-size': `${config.translationFontSize}px`,
    '--overlay-translation-font-weight': config.translationFontWeight,
    '--overlay-translation-line-height': config.translationLineHeight,
  } as CSSProperties

  return (
    <main data-slot="overlay-root" className="nola-overlay-window">
      <section
        ref={cardRef}
        data-slot="caption-surface"
        data-scheme={scheme}
        data-locked={config.locked ? 'true' : 'false'}
        data-confirm-open={closing ? 'true' : 'false'}
        data-hover={hovered ? 'true' : 'false'}
        data-layout={config.layout}
        data-bilingual={config.showSource && config.showTranslation ? 'true' : 'false'}
        data-transparent={opacity <= 0 ? 'true' : 'false'}
        className="nola-caption-card"
        style={cardStyle}
      >
        <div ref={stageRef} className="nola-caption-stage">
          {hasCaption ? (
            <>
              {/*
               * Keyed on sessionId: a new session mounts a fresh track, so the
               * previous session's folded stream cannot bleed into it.
               */}
              {config.showSource ? (
                <CaptionTrack
                  key={`source-${session.sessionId ?? 'idle'}`}
                  kind="source"
                  line={sourceLine}
                  maxLines={sourceLines}
                  layout={config.layout}
                />
              ) : null}

              {config.showTranslation ? (
                <div className="nola-caption-translations">
                  <CaptionTrack
                    key={`translation-${session.sessionId ?? 'idle'}`}
                    kind="translation"
                    line={effectiveTranslationLine}
                    maxLines={translationLines}
                    layout={config.layout}
                  />
                </div>
              ) : null}
            </>
          ) : (
            /* The idle state is two real tracks, not an absolutely positioned
             * layer, so it occupies the same place captions do and the display
             * settings split the stage the same way. Typography comes entirely
             * from `data-kind` plus the `--overlay-*` variables, so a font size
             * chosen in appearance settings applies here too.
     *
     * The second line sits in the translation track, so it is English — Chinese
             * prompt copy there reads as a translation failure. No `aria-live`:
             * the live region belongs to the real tracks, and this is not a
             * caption event. */
            <>
              {config.showSource ? (
                <div className="nola-caption-track pointer-events-none" data-kind="source" data-layout={config.layout}>
                  <div className="nola-caption-track-flow">
                    <p className="nola-caption-entry">{t('overlay.notStarted')}</p>
                  </div>
                </div>
              ) : null}

              {config.showTranslation ? (
                <div className="nola-caption-translations">
                  <div className="nola-caption-track pointer-events-none" data-kind="translation" data-layout={config.layout}>
                    <div className="nola-caption-track-flow">
                      <p className="nola-caption-entry">{t('overlay.notStartedHint')}</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Fade scrims: siblings of the stage, not a mask on the scroll container. */}
        <div className="nola-caption-scrim" data-edge="top" aria-hidden="true" />
        <div className="nola-caption-scrim" data-edge="bottom" aria-hidden="true" />

        {/*
         * Position · lock · pin │ appearance · minimize · close. The divider
         * splits changing how the window sits from changing whether it is
         * there at all.
         */}
        <div className="nola-caption-actions" aria-label={t('overlay.title')}>
          <GhostButton
            label={t('overlay.position')}
            active={config.mode === 'top'}
            onPress={() => patchOverlay({ mode: config.mode === 'top' ? 'bottom' : 'top' })}
            color={palette.chrome}
          >
            <Monitor aria-hidden="true" />
          </GhostButton>
          <GhostButton
            label={config.locked ? t('overlay.unlock') : t('overlay.lock')}
            active={config.locked}
            onPress={() => patchOverlay({ locked: !config.locked })}
            color={palette.chrome}
          >
            {config.locked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
          </GhostButton>
          <GhostButton
            label={config.alwaysOnTop ? t('overlay.unpin') : t('overlay.pin')}
            active={config.alwaysOnTop}
            onPress={() => patchOverlay({ alwaysOnTop: !config.alwaysOnTop })}
            color={palette.chrome}
          >
            {config.alwaysOnTop ? <Pin aria-hidden="true" /> : <PinOff aria-hidden="true" />}
          </GhostButton>

          <span className="nola-caption-divider" aria-hidden="true" />

          <GhostButton
            label={t('overlay.style')}
            onPress={openAppearanceSettings}
            color={palette.chrome}
          >
            <SlidersHorizontal aria-hidden="true" />
          </GhostButton>
          <GhostButton
            label={t('overlay.minimize')}
            onPress={() => void getBridge()?.overlay.minimize()}
            color={palette.chrome}
          >
            <Minus aria-hidden="true" />
          </GhostButton>
          {/*
           * Closing confirms first: it also stops recognition and is not
           * reversible, since restarting reloads several GB of weights.
           */}
          <GhostButton label={t('overlay.close')} onPress={() => { setCloseFailed(false); setClosing(true) }} color={palette.chrome}>
            <X aria-hidden="true" />
          </GhostButton>
        </div>

        <OverlayControls active={active} locked={config.locked} />

        {/*
         * Not `AlertDialog`: its backdrop is `position: fixed; inset: 0`, which
         * covers the whole viewport of this short transparent window and buries
         * the confirm button under itself. Drawn in-window instead.
         *
         * Inside `<section>` on purpose, so `position: absolute; inset: 0` resolves
         * against the card (`position: relative`) and covers the glass without
         * spilling past it. The outer `main` fills the window, so covering that
         * would cover the viewport.
         */}
        {closing ? (
          <div className="nola-confirm-layer" role="dialog" aria-modal="true" aria-label={t('overlay.closeTitle')}>
            <div className="nola-confirm-dialog">
              <p className="nola-confirm-title">{t('overlay.closeTitle')}</p>
              <p className="nola-confirm-text">{t('overlay.closeBody')}</p>
              {closeFailed ? <p className="nola-confirm-text" role="alert">{t('overlay.closeFailed')}</p> : null}
              <div className="nola-confirm-actions">
                <Button variant="secondary" size="sm" isDisabled={closePending} onPress={() => setClosing(false)}>
                  {t('common.cancel')}
                </Button>
                {/* HeroUI v3 styles the danger button with a `variant`,
                    There is no `color` prop on this button. */}
                <Button variant="danger" size="sm" isPending={closePending} onPress={() => void closeOverlay()}>
                  {t(closePending ? 'overlay.closing' : 'overlay.closeConfirm')}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max
  return Math.min(max, Math.max(min, value))
}

/**
 * Fixed palette plus opacity -> `rgba()`.
 *
 * `rgba()` rather than `color-mix`: they look the same, but jsdom reserialises
 * `color-mix` as an `rgb()` that drops the percentage, so a test cannot assert
 * the opacity. No blending is needed here anyway — only an alpha channel is
 * missing from a colour that is already fixed.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`
}

/**
 * Icon button in the overlay action row. Geometry lives in `caption-card.css`.
 *
 * The colour is the window's own palette rather than `--foreground`: this
 * window does not follow the app theme, and a theme colour would give black on
 * black against the dark glass.
 */
function GhostButton({
  label,
  onPress,
  color,
  children,
  className,
  active,
}: {
  label: string
  onPress: () => void
  color: string
  /** No children makes this a text-only action. */
  children?: ReactNode
  className?: string
  /** An active action lights up in the accent colour; see `[data-active]` in `caption-card.css`. */
  active?: boolean
}) {
  /*
   * No inline colour when active: an inline style outranks any stylesheet rule
   * and would override the accent colour from `[data-active]`.
   */
  return (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly={children === undefined}
      onPress={onPress}
      aria-label={label}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      className={['nola-caption-action', className ?? ''].filter(Boolean).join(' ')}
      style={active ? undefined : { color }}
    >
      {children ?? label}
    </Button>
  )
}
