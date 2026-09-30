import { useLayoutEffect, useRef, useState } from 'react'

export type TrackLine = { key: string; text: string }

/** Entries already scrolled far above the viewport are dropped so a long session cannot grow without bound. */
const MAX_ENTRIES = 40

const CJK = /[⺀-鿿豈-﫿＀-￯]/

/** A revision of the sentence already on screen opens with the same words; the next sentence never does. */
const MIN_REVISION_PREFIX = 16
/** A cross-segment revision stays close in length; a genuinely new sentence has no such tie. */
const REVISION_LENGTH_RATIO = 0.5
/** Only a short seam is ever shared by two consecutive sentences, so the search stays bounded. */
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

/**
 * Fold one segment's text into the stream.
 *
 * A revision of the sentence already on screen replaces it in place — same segment id, or a new
 * id that re-states the same opening with a comparable length. Anything else is the next sentence,
 * and only the part it does not already re-state is appended.
 */
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
  // The cut lands mid-seam, so the remainder usually opens on whitespace; `joinStream` adds its own
  // separator and would otherwise render a double space at every sentence boundary.
  const fresh = line.text.slice(seamOverlap(last.text, line.text)).trim()
  if (!fresh) return stream
  return [...stream, { key: line.key, text: fresh }].slice(-MAX_ENTRIES)
}

/** Sentences run together in one paragraph; only Latin scripts need a space at the seam. */
function joinStream(entries: TrackLine[]): string {
  return entries.reduce((text, entry) => {
    if (!text) return entry.text
    const seam = CJK.test(text.slice(-1)) && CJK.test(entry.text.slice(0, 1))
    return seam ? text + entry.text : `${text} ${entry.text}`
  }, '')
}

/**
 * One continuous text stream per track, the way 讯飞同传 renders it.
 *
 * Nothing is broken on sentence boundaries: the source and each translation accumulate
 * into a single paragraph that fills the box from the top and then keeps rolling upward
 * as new sentences append below. A track with room for one line therefore slides that
 * line out on every revision, while a taller track simply loses its top lines as the
 * block outgrows the viewport.
 *
 * In `sentence` layout each entry gets its own block, so a new sentence always
 * pushes the previous one down without rolling the viewport.
 */
export function CaptionTrack({ line, kind, maxLines, layout }: {
  line: TrackLine | null
  kind: 'source' | 'translation'
  maxLines: number
  layout: 'rolling' | 'sentence'
}): React.JSX.Element {
  const [entries, setEntries] = useState<TrackLine[]>([])
  const [offset, setOffset] = useState(0)
  const stream = useRef<TrackLine[]>([])
  const viewport = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)

  const key = line?.key ?? null
  const text = line?.text ?? null
  const commit = (next: TrackLine[]): void => {
    stream.current = next
    setEntries(next)
  }
  // `mergeLine` is not a fixed point — it stores a de-duplicated slice under the incoming segment's
  // own key, so re-folding the same input would read that entry as a revision of itself and restore
  // the text the seam logic had just removed. Remembering the last folded input makes the fold
  // idempotent no matter how many times React re-invokes this component with unchanged props.
  const folded = useRef<{ key: string; text: string } | null>(null)
  // Adjusted during render so a burst of revisions never paints an intermediate stream.
  if (key && text && (folded.current?.key !== key || folded.current.text !== text)) {
    folded.current = { key, text }
    const next = mergeLine(stream.current, { key, text })
    if (next !== stream.current) commit(next)
  }

  useLayoutEffect(() => {
    // Measured from the untransformed block: scrollHeight would shrink as the block rolls up.
    const measure = (): void => {
      const box = viewport.current
      if (!box) return
      if (layout === 'sentence') {
        // Sentence mode keeps one block per entry inside an `overflow: auto` flow, and CSS pins its
        // transform to `none`, so the only way to reveal the newest sentence is to scroll. This is
        // programmatic, so it still works while the card is a `-webkit-app-region: drag` region.
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
    return () => observer?.disconnect()
  }, [entries, maxLines, layout])

  if (layout === 'sentence') {
    return <div className={`overlay-track overlay-track-${kind}`} data-track={kind} data-layout="sentence"
      data-rolling="false" style={{ '--overlay-visible-lines': maxLines } as React.CSSProperties} aria-live="polite">
      <div className="overlay-track-flow overlay-track-sentence" ref={viewport}>
        <div className="overlay-track-content" ref={content}>
          {entries.map((entry) => <p className="overlay-track-entry" key={entry.key}>{entry.text}</p>)}
        </div>
      </div>
    </div>
  }

  return <div className={`overlay-track overlay-track-${kind}`} data-track={kind} data-layout="rolling" data-rolling={offset > 0}
    style={{ '--overlay-visible-lines': maxLines } as React.CSSProperties} aria-live="polite">
    <div className="overlay-track-flow" ref={viewport}>
      <div className="overlay-track-content" ref={content} style={{ transform: offset > 0 ? `translate3d(0, -${offset}px, 0)` : 'none' }}>
        <p className="overlay-track-entry">{joinStream(entries)}</p>
      </div>
    </div>
  </div>
}
