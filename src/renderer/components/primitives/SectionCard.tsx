import type { ReactNode } from 'react'
import { Card } from '../ui/card'

export type SectionCardPadding = 'none' | 'tight' | 'normal' | 'loose'
export type SectionCardTone = 'default' | 'secondary'
export interface SectionCardProps {
  children: ReactNode
  padding?: SectionCardPadding
  tone?: SectionCardTone
  className?: string
  divider?: 'none' | 'divider'
}
const PADDING = { none: 'p-0', tight: 'p-3', normal: 'p-5', loose: 'p-6' }
/**
 * `flex flex-col relative` restate the card geometry in the utilities layer:
 * the base card class only carries a surface, a border and a radius, and a
 * section that stacks its children needs the column box of its own.
 */
export function SectionCard({ children, padding = 'normal', tone = 'default', className = '', divider = 'none' }: SectionCardProps) {
  return (
    <Card className={[
      'nola-section-card relative flex flex-col gap-0',
      PADDING[padding],
      tone === 'secondary' ? 'bg-surface-secondary' : '',
      divider === 'divider' ? 'overflow-hidden' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}>
      {children}
    </Card>
  )
}
