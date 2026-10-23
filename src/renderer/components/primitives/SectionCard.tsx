import type { ReactNode } from 'react'
import { Card, CardContent } from '../ui/card'

export type SectionCardPadding = 'none' | 'tight' | 'normal' | 'loose'
export type SectionCardTone = 'default' | 'secondary'
export interface SectionCardProps {
  children: ReactNode
  padding?: SectionCardPadding
  tone?: SectionCardTone
  className?: string
  divider?: 'none' | 'divider'
}
const PADDING = { none: '[--card-spacing:0px]', tight: '[--card-spacing:var(--space-2)]', normal: '', loose: '[--card-spacing:var(--space-4)]' }
export function SectionCard({ children, padding = 'normal', tone = 'default', className = '', divider = 'none' }: SectionCardProps) {
  return (
    <Card className={[
      'nola-section-card relative',
      PADDING[padding],
      tone === 'secondary' ? 'bg-surface-secondary' : '',
      divider === 'divider' ? 'overflow-hidden' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
