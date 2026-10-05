/**
 * Brand mark, inline SVG so it needs neither an image asset nor an icon library.
 *
 * The gradient is a brand anchor rather than a UI colour, and mint `#97F0DA` is
 * brand-locked, never an interface colour. The splash mark in `index.html`
 * carries its own copy of the same values.
 */

import { useId } from 'react'
import type { CSSProperties } from 'react'

export interface NolaLogoProps {
  /** Side length in px, default 24 (the title bar spec). Clamped to 8…96. */
  size?: number
  className?: string
  /**
   * Drop the gradient and fill with `currentColor`, for one-colour placements such
   * as a mark sitting on dark glass.
   */
  monochrome?: boolean
  /** Accessible name. Pass null when adjacent text already names the mark. */
  title?: string | null
}

const MIN_SIZE = 8
const MAX_SIZE = 96

export function NolaLogo({ size = 24, className, monochrome = false, title = null }: NolaLogoProps) {
  // Gradient ids must be unique per instance, or the second mark steals the first's fill.
  const gradientId = useId()
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size))

  // The viewBox stays 32; only the frame size changes, so the shape never distorts.
  const style: CSSProperties = { width: clamped, height: clamped }

  return (
    <svg
      viewBox="0 0 32 32"
      style={style}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title ?? undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#168BD9" />
          <stop offset="1" stopColor="#2255C7" />
        </linearGradient>
      </defs>
      <rect
        width="32"
        height="32"
        rx="8"
        fill={monochrome ? 'currentColor' : `url(#${gradientId})`}
      />
      {/* White N: stroked rather than filled, so it does not clog at small sizes. */}
      <path
        d="M9 23V9l7 14V9"
        fill="none"
        stroke={monochrome ? 'var(--nola-logo-knockout, #ffffff)' : '#FFFFFF'}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mint accent bar, brand-locked to this file. */}
      <path
        d="M23 9.5V17"
        fill="none"
        stroke={monochrome ? 'var(--nola-logo-knockout, #ffffff)' : '#97F0DA'}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
