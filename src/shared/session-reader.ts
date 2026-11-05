import type { CaptionSegment } from './contracts'

export interface SessionReaderSnapshot {
  sessionId: string
  meetingId: string | null
  startedAtMs: number
  status: 'running' | 'paused'
  segments: CaptionSegment[]
  elapsedMs: number
}
