/**
 * One caption line, source or translation. `CaptionStage` assembles the pairs, the
 * grid and the scrolling; this layer carries the focus ramp, the current-line marker
 * and the interim styling.
 *
 * The ramp is a continuous function, `max(0.42, 1 - 0.11 * distance)`, not a
 * three-step table: a step shows between rows 3 and 4 and readers notice the step.
 */

import type { CSSProperties } from 'react'

/** Floor for the ramp: earlier lines stop fading here rather than becoming unreadable. */
export const FOCUS_FLOOR = 0.42
/** Opacity lost per step away from the current line; 0.11 stays readable at body size. */
export const FOCUS_DECAY = 0.11
/** Extra dimming for interim, beyond the ramp. With the muted colour it marks "unconfirmed". */
export const INTERIM_FADE = 0.72
/**
 * Dimming applied to the whole block while paused. It sits beside the per-line
 * constants so the two multipliers can be read together: the worst case is
 * 0.42 × 0.72 × 0.8.
 */
export const PAUSED_DIM = 0.8

/** Translation sits one step below source in colour, not size: a size gap inflates row heights side by side. */
const TRANSLATION_COLOR = 'color-mix(in oklab, var(--foreground) 88%, var(--muted))'

export type CaptionLineKind = 'source' | 'translation'

export interface CaptionLineProps {
  /** Rows away from the current line; 0 is the line being spoken. Negative and non-finite read as 0. */
  distance: number
  /** Unconfirmed segment: muted colour plus extra dimming, and no entrance motion. */
  interim?: boolean
  kind?: CaptionLineKind
  text: string
  /** Type size in px, default 14 (the reading-first body step). */
  fontSize?: number
  /** Line height as a ratio, held at 1.65 so rows stay even as the type size changes. */
  lineHeight?: number
  /** Entrance motion. The most frequently played animation here, so callers pass true only on the row just appended. */
  entering?: boolean
  /** Paused: multiplies by `PAUSED_DIM`, declared at the top of this file. */
  paused?: boolean
  className?: string
  'data-testid'?: string
}

/**
 * Focus ramp. Pure and therefore testable on its own. `distance <= 0` returns 1:
 * callers pass 0 for the current line, and a negative value is a bug better absorbed
 * here than turned into an opacity above 1.
 */
export function lineOpacity(distance: number): number {
  const steps = Number.isFinite(distance) && distance > 0 ? distance : 0
  return Math.max(FOCUS_FLOOR, 1 - FOCUS_DECAY * steps)
}

export function CaptionLine({
  distance,
  interim = false,
  kind = 'source',
  text,
  fontSize = 14,
  lineHeight = 1.65,
  entering = false,
  paused = false,
  className,
  'data-testid': testId,
}: CaptionLineProps) {
  const current = distance <= 0 && !interim
  const opacity = lineOpacity(distance) * (interim ? INTERIM_FADE : 1)

  const style: CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight,
    opacity: paused ? opacity * PAUSED_DIM : opacity,
    // Interim is the only state that switches text colour; the two final levels ride the ramp.
    color: interim ? 'var(--muted)' : kind === 'translation' ? TRANSLATION_COLOR : 'var(--foreground)',
  }

  return (
    <p
      data-slot="caption-line"
      data-kind={kind}
      data-current={current ? 'true' : 'false'}
      data-interim={interim ? 'true' : 'false'}
      data-testid={testId}
      // The 12px left slot holds the marker bar, which sits in the slot rather than over
      // the first stroke. `entering && !interim` is a hard condition: the engine revises
      // interim every 100-200ms, and replaying a 120ms animation at that rate is flicker.
      className={[
        'relative my-0 min-w-0 flex-1 pl-3',
        entering && !interim ? 'nola-caption-enter' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
    >
      {current ? <span className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-accent" aria-hidden="true" /> : null}
      {text}
    </p>
  )
}
