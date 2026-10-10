/**
 * Live caption area for an in-progress session. Not the record detail's
 * `DualColumnView`: that screen scrolls each column independently so the reader can
 * revisit history, while this one follows the newest line. `split` pairs the
 * languages on a shared baseline grid so the divider lands between matching lines;
 * `sentence` stacks each pair at a 34em measure. Auto-scroll follows only while the
 * reader is at the bottom, and never while paused.
 */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import type { CaptionSegment } from '@/bridge'
import { useI18n } from '@/i18n'
import { translationErrorSummary } from '@/translation-status'

import { CaptionLine } from './CaptionLine'

export type CaptionLayout = 'split' | 'sentence'
export type CaptionDisplayMode = 'both' | 'source' | 'translation'

export interface CaptionStageProps {
  segments: readonly CaptionSegment[]
  /** Unconfirmed segment. The engine always revises the last one, so there is at most one. */
  interim: CaptionSegment | null
  layout?: CaptionLayout
  displayMode?: CaptionDisplayMode
  fontSize?: number
  /** Paused: the whole block dims and stops following the scroll. */
  paused?: boolean
  /** Empty-state content; the workspace and the overlay pass different copy. */
  emptyState?: ReactNode
  className?: string
  /** The workspace shows timestamps; the floating window keeps the compact caption. */
  showTimestamps?: boolean
}

/** Pixels from the bottom that still count as "at the bottom", about one line of body text. */
export const STICK_SLACK_PX = 32

/**
 * Whether the view is still at the bottom. Pure, and therefore directly testable: jsdom
 * does no layout and reports all three values as 0, which makes this the only scroll
 * decision a test can assert deterministically.
 */
export function isStuckToBottom(scrollTop: number, scrollHeight: number, clientHeight: number, slack = STICK_SLACK_PX): boolean {
  const distance = scrollHeight - clientHeight - scrollTop
  return distance <= slack
}

/** Streamed text is usable before completion; failed requests never expose partial output. */
export function translationOf(segment: CaptionSegment): string {
  return segment.translations.find((item) => item.state !== 'failed' && item.text)?.text ?? ''
}

/**
 * The translation column: a real translation when there is one, the failure reason
 * otherwise.
 *
 * Pure and i18n-free: the caller's `translate` decides the language.
 */
export function translationTextOf(
  segment: CaptionSegment,
  translate: (segment: CaptionSegment) => string,
): string {
  return translationOf(segment) || translate(segment)
}

export function CaptionStage({
  segments,
  interim,
  layout = 'split',
  displayMode = 'both',
  fontSize = 14,
  paused = false,
  emptyState,
  className,
  showTimestamps = false,
}: CaptionStageProps) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  /** Last segment to have played its entrance; a ref so StrictMode's double run cannot replay it. */
  const enteredRef = useRef<string | null>(null)
  const [enteringId, setEnteringId] = useState<string | null>(null)

  const showSource = displayMode !== 'translation'
  const showTranslation = displayMode !== 'source'

  const lastId = segments.length > 0 ? segments[segments.length - 1].segmentId : null
  useEffect(() => {
    if (lastId === null || lastId === enteredRef.current) return
    enteredRef.current = lastId
    setEnteringId(lastId)
  }, [lastId])

  // Follow the newest line. Paused means the table stopped, so the eye should not be dragged along.
  useEffect(() => {
    if (paused) return
    const element = scrollRef.current
    if (!element || !stickRef.current) return
    element.scrollTop = element.scrollHeight
  }, [segments, interim, paused])

  const handleScroll = (): void => {
    const element = scrollRef.current
    if (!element) return
    stickRef.current = isStuckToBottom(element.scrollTop, element.scrollHeight, element.clientHeight)
  }

  // These rows are where the eye belongs: the segments plus the interim one. Interim sits
  // last, so its distance is 0, but it renders statically and gets no indicator bar.
  const rows: Array<{ segment: CaptionSegment; distance: number; interim: boolean }> = []
  segments.forEach((segment, index) => {
    rows.push({ segment, distance: segments.length - 1 - index + (interim ? 1 : 0), interim: false })
  })
  if (interim) rows.push({ segment: interim, distance: 0, interim: true })

  const hasRows = rows.length > 0
  // The shared baseline must follow the type size, or the grid desyncs from the line height above A+.
  const baselineStyle = { '--nola-baseline': `${(fontSize * 1.65).toFixed(2)}px` } as CSSProperties
  /** Failure reasons joined with ";"; empty when there are none, which leaves the column blank. */
  const failureText = (segment: CaptionSegment): string => translationErrorSummary(t, segment)

  return (
    <div data-paused={paused} className={['relative flex min-h-0 min-w-0 flex-1 flex-col', className ?? ''].filter(Boolean).join(' ')}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-slot="caption-scroll"
        data-layout={layout}
        className="nola-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-6 py-5"
      >
        {hasRows ? (
          <div className="mx-auto flex w-full max-w-[68em] flex-col pb-5">
            {rows.map((row) => (
              <Block
                key={`${row.segment.segmentId}-${row.interim ? 'interim' : 'final'}`}
                segment={row.segment}
                distance={row.distance}
                interim={row.interim}
                layout={layout}
                showSource={showSource}
                showTranslation={showTranslation}
                fontSize={fontSize}
                paused={paused}
                entering={enteringId === row.segment.segmentId}
                baselineStyle={baselineStyle}
                showTimestamps={showTimestamps}
                translate={failureText}
              />
            ))}
          </div>
        ) : (
          emptyState ?? null
        )}
      </div>
    </div>
  )
}

/**
 * One segment under the current layout: the baseline pair itself in `split`, and a
 * stacked block in `sentence`, where source and translation share a distance so the
 * sentence dims as a unit.
 */
function Block({
  segment,
  distance,
  interim,
  layout,
  showSource,
  showTranslation,
  fontSize,
  paused,
  entering,
  baselineStyle,
  showTimestamps,
  translate,
}: {
  segment: CaptionSegment
  distance: number
  interim: boolean
  layout: CaptionLayout
  showSource: boolean
  showTranslation: boolean
  fontSize: number
  paused: boolean
  entering: boolean
  baselineStyle: CSSProperties
  showTimestamps: boolean
  translate: (segment: CaptionSegment) => string
}) {
  const translation = translationTextOf(segment, translate)
  const untranslated = segment.translations.length === 0
  if (untranslated && showTranslation) { showSource = true; showTranslation = false }

  if (layout === 'split') {
    return (
      <div className="nola-baseline-pair nola-baseline-row py-1" data-bilingual={showSource && showTranslation} data-latest={distance === 0} style={baselineStyle}>
        {showTimestamps ? <time className="nola-caption-timestamp">{captionTime(segment.startedAtMs)}</time> : null}
        {showSource ? (
          <CaptionLine
            kind="source"
            text={segment.sourceText}
            distance={distance}
            interim={interim}
            fontSize={fontSize}
            paused={paused}
            entering={entering}
            data-testid={`caption-source-${segment.segmentId}`}
          />
        ) : null}
        {showTranslation ? (
          <CaptionLine
            kind="translation"
            text={translation}
            distance={distance}
            interim={interim}
            fontSize={fontSize}
            paused={paused}
            entering={entering}
            data-testid={`caption-target-${segment.segmentId}`}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="nola-caption-sentence flex flex-col gap-1 py-2" data-latest={distance === 0}>
      {showTimestamps ? <time className="nola-caption-timestamp">{captionTime(segment.startedAtMs)}</time> : null}
      {showSource ? (
        <CaptionLine
          kind="source"
          text={segment.sourceText}
          distance={distance}
          interim={interim}
          fontSize={fontSize}
          paused={paused}
          entering={entering}
          className="nola-measure"
          data-testid={`caption-source-${segment.segmentId}`}
        />
      ) : null}
      {showTranslation ? (
        <CaptionLine
          kind="translation"
          text={translation}
          distance={distance}
          interim={interim}
          fontSize={fontSize}
          paused={paused}
          entering={entering}
          className="nola-measure"
          data-testid={`caption-target-${segment.segmentId}`}
        />
      ) : null}
    </div>
  )
}

function captionTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}
