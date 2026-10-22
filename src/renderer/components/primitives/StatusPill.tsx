/**
 * Status pill: pill radius plus the micro type step.
 *
 * A plain inline-flex span carries the geometry — `rounded-full`, a 20/24px
 * height and the 12px type step — while the tone supplies the fill and the
 * text colour.
 */

import type { ReactNode } from 'react'

/**
 * `neutral` is "no state" (not started, engine not connected): a transparent fill
 * and a 1px hairline set it apart from the four coloured pills.
 */
export type StatusPillTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export type StatusPillSize = 'sm' | 'md'

export interface StatusPillProps {
  /** Visible text. Callers pass the result of `t(...)`; this file holds no literals. */
  label: ReactNode
  tone?: StatusPillTone
  size?: StatusPillSize
  /** Leading status dot, on by default. */
  dot?: boolean
  /**
   * Animate the dot. Pass false for a settled state — a still state should not move.
   * `.nola-live-dot` plus `data-paused` stops it, and CSS honours reduced motion.
   */
  live?: boolean
  className?: string
}

const TONE_CLASS: Record<StatusPillTone, string> = {
  neutral: 'border border-border text-foreground',
  accent: 'bg-accent-soft text-accent-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
}

const DOT_COLOR: Record<StatusPillTone, string> = {
  neutral: 'bg-muted',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

const SIZE_CLASS: Record<StatusPillSize, string> = {
  sm: 'h-5 px-2',
  md: 'h-6 px-3',
}

export function StatusPill({
  label,
  tone = 'neutral',
  size = 'sm',
  dot = true,
  live = false,
  className,
}: StatusPillProps) {
  return (
    <span
      className={[
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-full',
        SIZE_CLASS[size],
        'text-[12px] leading-[1.45] font-normal',
        TONE_CLASS[tone],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {dot ? (
        <span
          data-paused={live ? undefined : 'true'}
          className={['size-1.5 shrink-0 rounded-full', DOT_COLOR[tone], live ? 'nola-live-dot' : '']
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
      <span className="whitespace-nowrap">{label}</span>
    </span>
  )
}
