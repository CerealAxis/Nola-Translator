import type { ReactNode } from 'react'
import { Card } from '@heroui/react'

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
export function SectionCard({ children, padding = 'normal', tone = 'default', className = '', divider = 'none' }: SectionCardProps) {
  return (
    <Card variant={tone === 'secondary' ? 'secondary' : 'default'}
      className={`nola-section-card ${PADDING[padding]} ${divider === 'divider' ? 'overflow-hidden' : ''} ${className}`}>
      {children}
    </Card>
  )
}
