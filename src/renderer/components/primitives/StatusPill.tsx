/**
 * Status pill: pill radius plus the micro type step.
 *
 * HeroUI `Chip` keeps its colour-token mechanism but ships the wrong geometry —
 * `rounded-2xl` (24px) and `text-xs font-medium` — so the utilities-layer
 * arbitrary values in `className` pin radius and type to the spec.
 */

import type { ReactNode } from 'react'
import { Chip } from '@heroui/react'

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

const CHIP_COLOR: Record<StatusPillTone, 'default' | 'accent' | 'success' | 'warning' | 'danger'> = {
  neutral: 'default',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const CHIP_VARIANT: Record<StatusPillTone, 'tertiary' | 'soft'> = {
  neutral: 'tertiary',
  accent: 'soft',
  success: 'soft',
  warning: 'soft',
  danger: 'soft',
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
    <Chip
      color={CHIP_COLOR[tone]}
      variant={CHIP_VARIANT[tone]}
      // `rounded-full` and the arbitrary type values below override Chip's own
      // `rounded-2xl` and `text-xs font-medium`, which live in @layer components.
      className={[
        'shrink-0 items-center gap-1 rounded-full',
        SIZE_CLASS[size],
        'text-[11px] leading-[1.45] font-normal',
        tone === 'neutral' ? 'border border-border' : '',
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
    </Chip>
  )
}
