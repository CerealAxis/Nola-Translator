import { useEffect, useRef, useState } from 'react'

import { CaptionText } from '../components/CaptionText'

export type TrackLine = { key: string; text: string }

const EXIT_DURATION_MS = 280
const TRANSLATION_LAG_MS = 180

/** Each language owns its transition; a late translation never restarts the source animation. */
export function CaptionTrack({ line, kind, segmentId }: { line: TrackLine | null; kind: 'source' | 'translation'; segmentId: string | null }): React.JSX.Element {
  const [shown, setShown] = useState<TrackLine | null>(line)
  const [leaving, setLeaving] = useState<TrackLine | null>(null)
  const previous = useRef<TrackLine | null>(line)
  const currentSegment = useRef<string | null>(segmentId)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // A revision belongs to the same spoken sentence. Keep the existing DOM node
    // and translation while recognition or translation catches up.
    if (currentSegment.current === segmentId) {
      if (line) {
        previous.current = line
        setShown(line)
      }
      return
    }
    currentSegment.current = segmentId
    if (!line) {
      if (previous.current) {
        setLeaving(previous.current)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLeaving(null), EXIT_DURATION_MS)
      }
      previous.current = null
      setShown(null)
      return
    }
    const next = (): void => {
      if (previous.current && previous.current.key !== line.key) {
        setLeaving(previous.current)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setLeaving(null), EXIT_DURATION_MS)
      }
      previous.current = line
      setShown(line)
    }
    if (kind === 'translation' && previous.current && previous.current.key !== line.key) {
      const delay = setTimeout(next, TRANSLATION_LAG_MS)
      return () => clearTimeout(delay)
    }
    next()
  }, [segmentId, line?.key, line?.text])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return <div className={`overlay-track overlay-track-${kind}`} data-track={kind} aria-live="polite">
    {leaving && <CaptionText className={`overlay-track-text overlay-track-out overlay-${kind}`} key={`leaving-${leaving.key}`}>{leaving.text}</CaptionText>}
    {shown && <CaptionText className={`overlay-track-text overlay-track-in overlay-${kind}`} key={shown.key}>{shown.text}</CaptionText>}
  </div>
}
