/**
 * Page header: title, optional subtitle, optional action slot. The subtitle has no
 * default and renders no `<p>` unless passed — a line that restates the title is the
 * easiest copy mistake to make here.
 */

import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Page title. `.nola-display` is the only step carrying negative tracking. */
  title: ReactNode
  /** Subtitle, not rendered unless passed. Only worth text the user cannot infer. */
  subtitle?: ReactNode
  /** Action slot. At most one `variant="primary"` per screen. */
  actions?: ReactNode
  className?: string
  /**
   * Gap in px. The union is the guard rail: the design uses these three steps and
   * the scale has no 6px slot to fall back on.
   */
  gap?: 4 | 8 | 12
}

const GAP_CLASS: Record<4 | 8 | 12, string> = {
  4: 'gap-1',
  8: 'gap-2',
  12: 'gap-3',
}

export function PageHeader({ title, subtitle, actions, className, gap = 4 }: PageHeaderProps) {
  const hasSubtitle = subtitle !== undefined && subtitle !== null && subtitle !== ''

  return (
    <header className={['flex min-w-0 flex-col', GAP_CLASS[gap], className ?? ''].filter(Boolean).join(' ')}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="nola-display min-w-0 text-foreground">{title}</h1>
          {hasSubtitle ? <p className="nola-body min-w-0 text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}
