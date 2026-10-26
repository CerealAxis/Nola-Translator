/**
 * One caption track.
 *
 * Two layout modes:
 *   · `rolling` — every sentence folds into one continuous stream that fills
 *     from the top and scrolls upward. A track one line high slides each
 *     revision out; a taller one drops lines off the top once the block exceeds
 *     the visible height.
 *   · `sentence` — each sentence is its own block and pushes the previous one
 *     down; the track does not scroll.
 *
 * Segment IDs own revisions. Different segments keep their entire text, even
 * when their openings or boundary characters match; those can be real speech.
 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { CaptionRevisionText } from './CaptionRevisionText'

export type TrackLine = { key: string; text: string; stableText?: string }

/** Sentences that have scrolled far out of view; dropped in bulk so the DOM cannot grow without bound. */
const MAX_ENTRIES = 40

/** CJK and full-width punctuation do not need Latin word spacing. */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

/** Only Latin text needs a space inserted at the seam. */
function seamNeedsSpace(previous: string, next: string): boolean {
  return !(CJK.test(previous.slice(-1)) && CJK.test(next.slice(0, 1)))
}

export function CaptionTrack({
  lines,
  kind,
  maxLines,
  layout,
}: {
  lines: readonly TrackLine[]
  kind: 'source' | 'translation'
  maxLines: number
  layout: 'rolling' | 'sentence'
}) {
  const [entries, setEntries] = useState<TrackLine[]>([])
  const [offset, setOffset] = useState(0)
  const stream = useRef<TrackLine[]>([])
  const knownLines = useRef(new Map<string, TrackLine>())
  const viewport = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)

  const commit = (next: TrackLine[]): void => {
    stream.current = next
    setEntries(next)
  }

  /*
   * Keep the latest snapshot for every segment. A translation can arrive after
   * later segments, and its final revision must replace its own earlier text.
   * The whole line is kept, because the confirmed prefix of a translation is
   * part of it and the renderer needs it to tell confirmed text from the tail.
   */
  for (const line of lines) {
    if (!knownLines.current.has(line.key) || line.text) knownLines.current.set(line.key, line)
  }
  const lineOrder = [...new Set(lines.map((line) => line.key))].slice(-MAX_ENTRIES)
  const visibleKeys = new Set(lineOrder)
  for (const key of knownLines.current.keys()) {
    if (!visibleKeys.has(key)) knownLines.current.delete(key)
  }
  const next = lineOrder.flatMap<TrackLine>((key) => {
    const line = knownLines.current.get(key)
    return line?.text ? [line] : []
  })
  if (next.length !== stream.current.length || next.some((line, index) =>
    line.key !== stream.current[index]?.key
    || line.text !== stream.current[index]?.text
    || line.stableText !== stream.current[index]?.stableText)) {
    commit(next)
  }

  useLayoutEffect(() => {
    // Measure the untransformed block: a scrolled block's scrollHeight shrinks with it.
    const measure = (): void => {
      const box = viewport.current
      if (!box) return
      if (layout === 'sentence') {
        /*
         * Sentence mode puts one block per sentence in an `overflow: auto` flow, and CSS
         * pins the content's transform to `none`, so scrolling is the only way to reach the
         * newest sentence. The scroll is programmatic, so it works even in a drag region.
         */
        box.scrollTop = box.scrollHeight
        return
      }
      const next = Math.max(0, (content.current?.offsetHeight ?? 0) - box.clientHeight)
      setOffset((current) => Math.abs(current - next) < 0.5 ? current : next)
    }
    measure()
    const block = content.current
    const observer = typeof ResizeObserver === 'undefined' || !block ? null : new ResizeObserver(measure)
    if (observer && block) observer.observe(block)
    if (observer && viewport.current) observer.observe(viewport.current)
    return () => observer?.disconnect()
  }, [entries, maxLines, layout])

  if (layout === 'sentence') {
    return (
      <div
        data-slot="caption-track"
        data-kind={kind}
        data-layout="sentence"
        className="nola-caption-track"
        style={{ '--nola-overlay-visible-lines': maxLines } as CSSProperties}
        aria-live="polite"
      >
        <div className="nola-caption-track-flow nola-caption-track-sentence" ref={viewport}>
          <div className="nola-caption-track-content" ref={content}>
            {entries.map((entry) => <p className="nola-caption-entry" key={entry.key}>
              {kind === 'translation' ? <CaptionRevisionText text={entry.text} stableText={entry.stableText} /> : entry.text}
            </p>)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-slot="caption-track"
      data-kind={kind}
      data-layout="rolling"
      data-rolling={offset > 0}
      className="nola-caption-track"
      style={{ '--nola-overlay-visible-lines': maxLines } as CSSProperties}
    >
      <div className="nola-caption-track-flow" ref={viewport}>
        <div
          className="nola-caption-track-content"
          ref={content}
          style={{ transform: offset > 0 ? `translate3d(0, -${offset}px, 0)` : 'none' }}
        >
          {/*
           * Each sentence stays its own node inside the passage, so the text still wraps
           * and still scrolls as one block. With `aria-atomic` false a screen reader announces
           * only the node that changed, so no mirror node is needed for the captions.
           */}
          <p className="nola-caption-entry" aria-live="polite" aria-atomic="false">
            {entries.flatMap((entry, index) => [
              index > 0 && seamNeedsSpace(entries[index - 1].text, entry.text) ? ' ' : null,
              <span className="nola-caption-segment" key={entry.key}>
                {kind === 'translation' ? <CaptionRevisionText text={entry.text} stableText={entry.stableText} /> : entry.text}
              </span>,
            ])}
          </p>
        </div>
      </div>
    </div>
  )
}
