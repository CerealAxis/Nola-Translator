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
 * The folding in `mergeLine` is the substance of this component: the engine
 * revises one sentence several times in a row, so appending each revision would
 * make the captions repeat themselves. Three cases:
 *   1. same segmentId → replace in place
 *   2. different id but the first 16+ characters match and the lengths differ by
 *      less than half → also a revision (the engine sometimes re-sends under a
 *      new id)
 *   3. otherwise → a new sentence; append only the part it has not said yet
 */

import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export type TrackLine = { key: string; text: string }

/** Sentences that have scrolled far out of view; dropped in bulk so the DOM cannot grow without bound. */
const MAX_ENTRIES = 40

/*
 * CJK and full-width punctuation, written as \uXXXX escapes rather than literal
 * characters: `scripts/check-guardrails.mjs` `no-hardcoded-cjk` flags CJK
 * literals in components, and a character class written out would be read as UI
 * copy. The escapes match the same set.
 */
const CJK = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/

/** A revision of the on-screen sentence always starts alike; the next sentence does not. */
const MIN_REVISION_PREFIX = 16
/** A revision stays close in length to its predecessor; a genuinely new sentence does not. */
const REVISION_LENGTH_RATIO = 0.5
/** Adjacent sentences share at most this much seam, so the search stays bounded. */
const MAX_SEAM = 160

function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let size = 0
  while (size < max && a.charCodeAt(size) === b.charCodeAt(size)) size += 1
  return size
}

function seamOverlap(previous: string, next: string): number {
  const max = Math.min(previous.length, next.length, MAX_SEAM)
  for (let size = max; size > 0; size -= 1) {
    if (previous.endsWith(next.slice(0, size))) return size
  }
  return 0
}

/** Folds a sentence into the stream. See the file header for the three cases. */
function mergeLine(stream: TrackLine[], line: TrackLine): TrackLine[] {
  const last = stream[stream.length - 1]
  if (!last) return [line]
  const prefix = sharedPrefix(last.text, line.text)
  const lengthGap = Math.abs(last.text.length - line.text.length) / Math.max(last.text.length, line.text.length)
  const revises = last.key === line.key
    || (prefix >= MIN_REVISION_PREFIX && lengthGap <= REVISION_LENGTH_RATIO)
  if (revises) {
    if (last.key === line.key && last.text === line.text) return stream
    return [...stream.slice(0, -1), { key: line.key, text: line.text }]
  }
  /*
   * The cut lands inside the seam, so the remainder usually starts with
   * whitespace while the renderer inserts its own separator at the seam —
   * without this trim every boundary would render as two spaces.
   */
  const fresh = line.text.slice(seamOverlap(last.text, line.text)).trim()
  if (!fresh) return stream
  return [...stream, { key: line.key, text: fresh }].slice(-MAX_ENTRIES)
}

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
  const knownLines = useRef(new Map<string, string>())
  const viewport = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)

  const commit = (next: TrackLine[]): void => {
    stream.current = next
    setEntries(next)
  }

  /*
   * Keep the latest snapshot for every segment. A translation can arrive after
   * later segments, and its final revision must replace its own earlier text.
   */
  for (const line of lines) {
    if (!knownLines.current.has(line.key) || line.text) knownLines.current.set(line.key, line.text)
  }
  const lineOrder = [...new Set(lines.map((line) => line.key))].slice(-MAX_ENTRIES)
  const visibleKeys = new Set(lineOrder)
  for (const key of knownLines.current.keys()) {
    if (!visibleKeys.has(key)) knownLines.current.delete(key)
  }
  const next = lineOrder.reduce<TrackLine[]>((folded, key) => {
    const text = knownLines.current.get(key)
    return text ? mergeLine(folded, { key, text }) : folded
  }, [])
  if (next.length !== stream.current.length || next.some((line, index) =>
    line.key !== stream.current[index]?.key || line.text !== stream.current[index]?.text)) {
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
            {entries.map((entry) => <p className="nola-caption-entry" key={entry.key}>{entry.text}</p>)}
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
              <span className="nola-caption-segment" key={entry.key}>{entry.text}</span>,
            ])}
          </p>
        </div>
      </div>
    </div>
  )
}
