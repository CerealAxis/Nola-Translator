/**
 * Pure logic for the records screen: search, sort, pagination window, and the time
 * and duration formats. None of it touches JSX, a store or the bridge.
 */

import type { MeetingMeta } from '@/bridge'

export function matches(meeting: MeetingMeta, text: string): boolean {
  if (text === '') return true
  return (
    meeting.title.toLowerCase().includes(text) ||
    meeting.sourceLanguage.toLowerCase().includes(text) ||
    meeting.targetLanguage.toLowerCase().includes(text)
  )
}

/** Default order is newest first. A running meeting has no endedAtMs and falls back to its start. */
export function endedAt(meeting: MeetingMeta): number {
  return meeting.endedAtMs ?? meeting.startedAtMs
}

export function sortByEndTime(
  meetings: readonly MeetingMeta[],
  ascending: boolean,
): MeetingMeta[] {
  return [...meetings].sort((a, b) => {
    const left = endedAt(a)
    const right = endedAt(b)
    return ascending ? left - right : right - left
  })
}

/**
 * Page-number window centred on the current page, five wide, so the footer needs
 * no ellipsis.
 */
export function pageNumbers(current: number, total: number, windowSize = 5): number[] {
  if (total <= 0) return []
  let start = Math.max(1, current - Math.floor(windowSize / 2))
  const end = Math.min(total, start + windowSize - 1)
  start = Math.max(1, end - windowSize + 1)
  const pages: number[] = []
  for (let value = start; value <= end; value += 1) pages.push(value)
  return pages
}

/** Clamps the page into range; a search that filters everything away would otherwise leave the list on a page past the end. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return Math.min(Math.max(1, page), pageCount)
}

export function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Duration. Seconds carry an `s` suffix and longer spans use `m:ss` or `h:mm:ss`, so a
 * duration is never a bare number with no unit.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  if (minutes > 0) return `${minutes}:${pad(seconds)}`
  return `${seconds}s`
}

/** `HH:MM:SS`. The caller must supply tabular figures, e.g. `.nola-mono`. */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** Timestamp for the list, to the minute: a tabular-nums column, and the seconds are noise. */
export function formatDateTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * A recognisable stand-in when the engine leaves the title empty. `daySequence`
 * matters: on a day with several meetings the date alone names them all identically,
 * so the Nth carries a `_N` suffix. Sequence 0 is the first of the day and takes no
 * suffix, matching `meeting-format.ts`.
 *
 * `meetingTitleFor()` in `@/meeting-format` is the full renderer, including interface
 * language and custom titles; this is for callers that need a bare zh string.
 */
export function fallbackTitle(meeting: MeetingMeta): string {
  const base = formatDateTime(meeting.startedAtMs)
  return meeting.daySequence > 0 ? `${base}_记录_${meeting.daySequence}` : base
}
