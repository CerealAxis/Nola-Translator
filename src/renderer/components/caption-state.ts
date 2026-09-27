import type { CaptionSegment, EngineEvent } from '../../shared/contracts'

export type CurrentCaption = { sessionId: string | null; caption: CaptionSegment | null; seen: string[] }
export const EMPTY_CAPTION: CurrentCaption = { sessionId: null, caption: null, seen: [] }

/** Revisions update a sentence; they never make an older sentence current again. */
export function receiveCaption(state: CurrentCaption, event: EngineEvent): CurrentCaption {
  if (event.type === 'sessionStarted') return { sessionId: event.sessionId, caption: null, seen: [] }
  if (event.type !== 'caption') return state
  if (state.sessionId && state.sessionId !== event.sessionId) return state
  const next = event.segment
  const current = state.caption
  if (current) {
    if (current.segmentId === next.segmentId) {
      if (next.revision < current.revision) return state
    } else if (next.startedAtMs < current.startedAtMs || state.seen.includes(next.segmentId)) return state
  }
  return { sessionId: event.sessionId, caption: next, seen: current?.segmentId === next.segmentId ? state.seen : [...state.seen, next.segmentId] }
}
