import { useEffect, useRef, useState } from 'react'

import { CaptionText } from '../components/CaptionText'
import { rollingCaptionPages } from './caption-roll'

export type TrackLine = { key: string; text: string }

const EXIT_DURATION_MS = 280
const TRANSLATION_LAG_MS = 180

/** Revisions extend the current line; each language rolls only when its own line fills. */
export function CaptionTrack({ line, kind, segmentId, maxWidth, fontSize }: {
  line: TrackLine | null
  kind: 'source' | 'translation'
  segmentId: string | null
  maxWidth: number
  fontSize: number
}): React.JSX.Element {
  const pages = line ? rollingCaptionPages(line.text, maxWidth, fontSize) : []
  const pageCursor = useRef({ segmentId, index: Math.max(0, pages.length - 1) })
  if (pageCursor.current.segmentId !== segmentId) {
    pageCursor.current = { segmentId, index: Math.max(0, pages.length - 1) }
  } else if (pages.length - 1 > pageCursor.current.index) {
    pageCursor.current.index = pages.length - 1
  }
  const nextLine: TrackLine | null = line && pages.length
    ? { key: `${line.key}:${pageCursor.current.index}`, text: pages[pages.length - 1] }
    : null
  const [shown, setShown] = useState<TrackLine | null>(nextLine)
  const [leaving, setLeaving] = useState<TrackLine | null>(null)
  const previous = useRef<TrackLine | null>(nextLine)
  const currentSegment = useRef<string | null>(segmentId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Pending translation within a segment keeps its last completed line visible.
    if (!nextLine && currentSegment.current === segmentId) return
    const changedSegment = currentSegment.current !== segmentId
    currentSegment.current = segmentId
    if (!nextLine) {
      if (previous.current) {
        setLeaving(previous.current)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLeaving(null), EXIT_DURATION_MS)
      }
      previous.current = null
      setShown(null)
      return
    }
    if (previous.current?.key === nextLine.key) {
      previous.current = nextLine
      setShown(nextLine)
      return
    }
    const next = (): void => {
      if (previous.current) {
        setLeaving(previous.current)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLeaving(null), EXIT_DURATION_MS)
      }
      previous.current = nextLine
      setShown(nextLine)
    }
    if (kind === 'translation' && changedSegment && previous.current) {
      const delay = setTimeout(next, TRANSLATION_LAG_MS)
      return () => clearTimeout(delay)
    }
    next()
  }, [segmentId, nextLine?.key, nextLine?.text])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return <div className={`overlay-track overlay-track-${kind}`} data-track={kind} aria-live="polite">
    {leaving && <CaptionText className={`overlay-track-text overlay-track-out overlay-${kind}`} key={`leaving-${leaving.key}`}>{leaving.text}</CaptionText>}
    {shown && <CaptionText className={`overlay-track-text overlay-track-in overlay-${kind}`} key={shown.key}>{shown.text}</CaptionText>}
  </div>
}
