import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Slider } from '@heroui/react'
import '@/features/home/home-records.css'

const MIN_SPLIT = 15
const MAX_SPLIT = 85

export function lineOpacity(distance: number): number {
  return Math.max(0.42, 1 - 0.11 * Math.abs(distance))
}
export interface DualColumnSegment {
  id: string
  source: string
  target: string
  interim?: boolean
}
export interface DualColumnViewProps {
  segments: readonly DualColumnSegment[]
  sourceLabel: string
  targetLabel: string
  fontScale?: number
  baseFontSize?: number
  currentIndex?: number
  className?: string
  onSplitChange?: (percent: number) => void
  empty?: ReactNode
}
export function DualColumnView({ segments, sourceLabel, targetLabel, fontScale = 1, baseFontSize = 16, currentIndex, className = '', empty, onSplitChange }: DualColumnViewProps): ReactNode {
  const [split, setSplit] = useState(50)
  useEffect(() => { onSplitChange?.(split) }, [split, onSplitChange])
  if (segments.length === 0 && empty) return <div className={className}>{empty}</div>
  const fontSize = baseFontSize * fontScale
  const lineBox = Number((fontSize * 1.65).toFixed(2))
  return (
    <div data-split={split} style={{ '--dual-split': split + '%' } as React.CSSProperties} className={'nola-dual ' + className}>
      <div className="nola-dual__headers"><div>{sourceLabel}</div><div>{targetLabel}</div></div>
      <Slider aria-label={sourceLabel + ' / ' + targetLabel} className="nola-dual__split" minValue={MIN_SPLIT} maxValue={MAX_SPLIT} step={5} value={split} onChange={(value) => setSplit(Array.isArray(value) ? value[0] : value)}>
        <Slider.Track><Slider.Fill /><Slider.Thumb /></Slider.Track>
      </Slider>
      <div className="nola-dual__scroll nola-scrollbar" style={{ lineHeight: lineBox + 'px', fontSize: fontSize + 'px' }}>
        {segments.map((segment, index) => (
          <div className="nola-dual__pair" key={segment.id}>
            {(['source', 'target'] as const).map((variant) => {
              const isCurrent = currentIndex !== undefined && index === currentIndex
              const opacity = lineOpacity(currentIndex === undefined ? 0 : index - currentIndex) * (segment.interim ? .72 : 1)
              return <div key={variant} data-current={isCurrent ? 'true' : undefined} data-interim={segment.interim ? 'true' : undefined} className={'nola-dual__cell ' + (variant === 'source' ? 'text-foreground' : 'text-muted')} style={{ opacity, minHeight: lineBox, lineHeight: lineBox + 'px' }}>
                {isCurrent ? <span aria-hidden="true" className="absolute top-1 bottom-1 left-0 w-[2px] rounded-full bg-accent" /> : null}
                {variant === 'source' ? segment.source : segment.target}
              </div>
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

