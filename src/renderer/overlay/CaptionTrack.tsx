import { useEffect, useRef, useState } from 'react'

import { CaptionText } from '../components/CaptionText'
import { rollingCaptionPages } from './caption-roll'

export type TrackLine = { key: string; text: string }

const EXIT_DURATION_MS = 280
const TRANSLATION_LAG_MS = 180

/** Revisions extend the visible line in place; each track advances to its next line on its own dwell timer. */
export function CaptionTrack({ line, kind, segmentId, maxWidth, fontSize, maxLines }: {
  line: TrackLine | null
  kind: 'source' | 'translation'
  segmentId: string | null
  maxWidth: number
  fontSize: number
  maxLines: number
}): React.JSX.Element {
  const pages = line ? rollingCaptionPages(line.text, maxWidth, fontSize, maxLines) : []
  const [, advancePage] = useState(0)
  const pageCursor = useRef({ segmentId, index: 0, hadText: pages.length > 0, pageCount: pages.length })
  if (pageCursor.current.segmentId !== segmentId) {
    pageCursor.current = { segmentId, index: 0, hadText: pages.length > 0, pageCount: pages.length }
  } else if (pages.length > 0) {
    if (!pageCursor.current.hadText) {
      pageCursor.current.index = 0
      pageCursor.current.hadText = true
    } else if (pages.length > pageCursor.current.pageCount) {
      // A live revision can only lengthen the last page, so jump straight to it.
      pageCursor.current.index = pages.length - 1
    }
    pageCursor.current.pageCount = pages.length
    pageCursor.current.index = Math.min(pageCursor.current.index, pages.length - 1)
  }
  const nextLine: TrackLine | null = line && pages.length
    ? { key: `${line.key}:${pageCursor.current.index}`, text: pages[pageCursor.current.index] }
    : null
  const [shown, setShown] = useState<TrackLine | null>(nextLine)
  const [leaving, setLeaving] = useState<TrackLine | null>(null)
  const previous = useRef<TrackLine | null>(nextLine)
  const currentSegment = useRef<string | null>(segmentId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // A translation still pending inside the same segment must not blank the last finished line.
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

  useEffect(() => {
    if (!line || pageCursor.current.index >= pages.length - 1) return
    const dwell = Math.min(1600, Math.max(700, pages[pageCursor.current.index].length * 22))
    const timeout = setTimeout(() => {
      pageCursor.current.index += 1
      advancePage((value) => value + 1)
    }, dwell)
    return () => clearTimeout(timeout)
  }, [segmentId, line?.text, pages.length, nextLine?.key])

  return <div className={`overlay-track overlay-track-${kind}`} data-track={kind} aria-live="polite"
    style={{ '--overlay-visible-lines': maxLines } as React.CSSProperties}>
    {leaving && <CaptionText className={`overlay-track-text overlay-track-out overlay-${kind}`} key={`leaving-${leaving.key}`}>{leaving.text}</CaptionText>}
    {shown && <CaptionText className={`overlay-track-text overlay-track-in overlay-${kind}`} key={shown.key}>{shown.text}</CaptionText>}
  </div>
}
