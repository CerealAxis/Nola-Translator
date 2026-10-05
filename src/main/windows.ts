import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

import { DEFAULT_SETTINGS, type OverlaySettings } from '../shared/settings'

export type OverlayMode = 'free' | 'top' | 'bottom'

type OverlaySize = { width: number; height: number; x?: number; y?: number }

/** Shared with `applyOverlay`. */
export const OVERLAY_MIN_WIDTH = 420

/**
 * `.nola-caption-stage` vertical padding, from `padding: 8px 22px` in
 * `src/renderer/theme/caption-card.css`.
 */
const STAGE_VERTICAL_PADDING = 8 + 8

/** `.nola-caption-stage` row gap, from the same rule (`gap: 6px`). */
const STAGE_TRACK_GAP = 6

/**
 * Height reserved on top of the formula, in DIP: `minHeight` constrains the
 * **window rectangle** while `allocateCaptionLines` is fed the renderer's
 * **content box**, and the gap between the two is not readable from here.
 * `.nola-caption-stage`'s `clientHeight` is an integer while the computed
 * minimum is fractional, so the content box can land a pixel under the target.
 * Without slack the formula is exactly tight, which loses the last line.
 */
const OVERLAY_MIN_HEIGHT_SLACK = 2

/**
 * `.nola-overlay-window` inset, from `padding: 6px` in the same stylesheet.
 *
 * The minimum height pays for it: the card sits 6px in on every side, so its
 * height is `window height - 12` while `minHeight` pins the window rectangle.
 * Ignoring the inset would leave the last track's line budget short by 12 DIP.
 */
const OVERLAY_CARD_INSET = 6

/**
 * Smallest window height that still shows one line in every visible caption track.
 *
 * `allocateCaptionLines` (renderer) gives every visible track the *same* share of the stage, so
 * with `n` visible tracks the share is `(content - gap * (n - 1)) / n` and the smallest content
 * that still yields a line to each is `n * max(line heights) + gap * (n - 1)`.
 *
 * Tracks with a non-positive or non-finite line height are dropped before the max, because
 * `allocateCaptionLines` can never hand those a line either. `settings.load()` spreads a
 * hand-edited `settings.json` without numeric validation, so a missing/NaN/negative font size
 * reaches the main process; without that filter it would propagate a `NaN` into `setMinimumSize`.
 *
 * `workAreaHeight` clamps the result: on a screen shorter than the minimum we would rather lose a
 * line than the window.
 */
export function overlayMinimumHeight(overlay: OverlaySettings, workAreaHeight?: number): number {
  const lineHeights = [
    overlay.showSource ? overlay.fontSize * overlay.lineHeight : 0,
    overlay.showTranslation ? overlay.translationFontSize * overlay.translationLineHeight : 0,
  ].filter((lineHeight) => Number.isFinite(lineHeight) && lineHeight > 0)
  const visibleCount = lineHeights.length
  const tallest = visibleCount === 0 ? 0 : Math.max(...lineHeights)
  const required = tallest * visibleCount
    + STAGE_TRACK_GAP * Math.max(0, visibleCount - 1)
    + STAGE_VERTICAL_PADDING
    + OVERLAY_CARD_INSET * 2
    + OVERLAY_MIN_HEIGHT_SLACK
  const minimum = Math.ceil(required)
  return typeof workAreaHeight === 'number' && workAreaHeight > 0 ? Math.min(minimum, workAreaHeight) : minimum
}

export function getOverlayInteractionPolicy(locked: boolean): {
  focusable: boolean
  ignoreMouseEvents: boolean
  movable: boolean
  resizable: boolean
} {
  return {
    focusable: true,
    ignoreMouseEvents: false,
    movable: !locked,
    resizable: !locked,
  }
}

export function computeOverlayBounds(
  mode: OverlayMode,
  workArea: Rectangle,
  current: OverlaySize
): Rectangle {
  const width = Math.min(current.width, workArea.width)
  const height = Math.min(current.height, workArea.height)
  const centeredX = Math.round(workArea.x + (workArea.width - width) / 2)
  const margin = 24
  if (mode === 'top') {
    return { x: centeredX, y: workArea.y + margin, width, height }
  }
  if (mode === 'bottom') {
    return {
      x: centeredX,
      y: workArea.y + workArea.height - height - margin,
      width,
      height,
    }
  }
  const x = Math.max(workArea.x, Math.min(current.x ?? centeredX, workArea.x + workArea.width - width))
  const y = Math.max(workArea.y, Math.min(current.y ?? workArea.y + margin, workArea.y + workArea.height - height))
  return { x, y, width, height }
}

export function createOverlayWindowOptions(
  preload: string,
  workAreaWidth?: number,
  overlay: OverlaySettings = DEFAULT_SETTINGS.overlay,
  workAreaHeight?: number,
): BrowserWindowConstructorOptions {
  // The reference console is a compact bar near the lower center of the display. At this height
  // the card leaves 190 of stage content, split evenly between the two tracks: four lines each.
  const width = workAreaWidth
    ? Math.min(940, Math.max(560, Math.round(workAreaWidth * 0.46)))
    : 820
  return {
    width,
    height: 218,
    minWidth: OVERLAY_MIN_WIDTH,
    // Derived from the current font sizes, so the bar always stays tall enough for one line
    // per visible track.
    minHeight: overlayMinimumHeight(overlay, workAreaHeight),
    resizable: true,
    movable: true,
    // The invisible Windows resize frame is the only way to resize the overlay while it is
    // unlocked: `overlay.resize` is still exposed on the bridge but no UI calls it, and the
    // settings have no overlay size fields. The opaque corners come from the page itself — see
    // `html.is-overlay body` in `caption-card.css`.
    thickFrame: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    // Window-level Acrylic is unusable here: even at 0% content background Windows still
    // renders the whole window as a frosted block, so translucency belongs to the caption card.
    backgroundMaterial: 'none',
    hasShadow: false,
    alwaysOnTop: true,
    // The caption window offers a real "minimize" action, and a skipped taskbar would leave a
    // minimized window with no way back — a ghost that still owns the microphone.
    skipTaskbar: false,
    // applyOverlay() sets the interaction policy at runtime.
    focusable: false,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  }
}
