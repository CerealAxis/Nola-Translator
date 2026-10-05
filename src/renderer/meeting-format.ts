/**
 * Meeting time, duration and auto-generated title.
 *
 * The auto title is computed at render time and never persisted — which is why
 * `MeetingMeta` stores `title` and `titleIsCustom` separately: changing the UI
 * language renames every record without touching a file.
 *
 * `daySequence` matters most: recording several meetings in one day would make
 * them all share a date-only name, so the Nth one carries a `_记录_N` suffix.
 */

import type { MeetingMeta } from '@/bridge'
import type { TranslationKey, UiLanguage } from '@/i18n'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * Meeting lifecycle.
 *
 * `endedAtMs` alone is not enough: it has exactly one writer (`MeetingStore.finish()`
 * in the main process) and that depends on an in-memory `sessionId → meetingId` table.
 * If the app is closed or crashes mid-session, `finish()` never runs, the table is
 * gone on the next launch, and the record stays "in progress" forever.
 *
 * So the state is persisted explicitly (`MeetingMeta.state`), where `interrupted`
 * means "started, never finished, certainly not running now". The field is
 * optional: an older file without it is inferred from `endedAtMs`, and the main
 * process writes the inference back on startup.
 */
export type MeetingState = 'running' | 'completed' | 'interrupted'

export function meetingState(meta: MeetingMeta): MeetingState {
  if (meta.state) return meta.state
  return meta.endedAtMs === undefined ? 'running' : 'completed'
}

export function isLive(meta: MeetingMeta): boolean {
  return meetingState(meta) === 'running'
}

/**
 * Pure formatter for the auto title.
 *
 * Shared by `meetingTitleFor` (the record list) and the preview in the session
 * dialog's name field. A second copy would let the preview disagree with the
 * list about the name of the same meeting.
 */
export function autoMeetingTitle(startedAtMs: number, daySequence: number, language: UiLanguage): string {
  const at = new Date(startedAtMs)
  if (language === 'en') {
    const date = at.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return daySequence > 0
      ? date.replace(/\//g, '-') + ' meeting ' + daySequence
      : date.replace(/\//g, '-') + ' meeting'
  }
  const base = at.getFullYear() + '年' + pad(at.getMonth() + 1) + '月' + pad(at.getDate()) + '日_记录'
  return daySequence > 0 ? base + '_' + daySequence : base
}

export function meetingTitleFor(meta: MeetingMeta, language: UiLanguage): string {
  if (meta.titleIsCustom && meta.title) return meta.title
  return autoMeetingTitle(meta.startedAtMs, meta.daySequence, language)
}

/** Local day key. Must agree with `MeetingStore.localDayKey` in the main process — both use the local timezone, not UTC, or a meeting across midnight lands on the wrong day and the sequence shifts. */
function localDayKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * The `daySequence` the next meeting will get: how many already exist that day.
 *
 * Same basis as the main process `nextDaySequence`: `begin()` counts before the
 * new record enters the cache, so the first meeting of the day gets 0 (no
 * suffix), the second gets 1, and so on.
 */
export function nextDaySequence(meetings: readonly MeetingMeta[], at: number): number {
  const day = localDayKey(at)
  return meetings.filter((meta) => localDayKey(meta.startedAtMs) === day).length
}

export function meetingEndLabel(meta: MeetingMeta): string {
  const at = new Date(meta.endedAtMs ?? meta.startedAtMs)
  return at.getFullYear() + '年' + pad(at.getMonth() + 1) + '月' + pad(at.getDate()) + '日 ' + pad(at.getHours()) + ':' + pad(at.getMinutes())
}

export function meetingDurationLabel(
  meta: MeetingMeta,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
): string {
  /*
   * A finished meeting reads `durationMs` directly rather than recomputing
   * `endedAtMs - startedAtMs`: that expression folds in the teardown of the
   * engine's model weights (measured at 25–60s per meeting), and `endedAtMs` is
   * now the moment the content ended, not the moment Stop was pressed.
   * `durationMs` is the main process's content span and the only definition of
   * "duration" here.
   *
   * A live meeting uses "now" as the end. An interrupted one has no `endedAtMs`,
   * and subtracting from `Date.now()` would grow without bound as the page stays
   * open.
   */
  const ms = isLive(meta) ? Math.max(0, Date.now() - meta.startedAtMs) : Math.max(0, meta.durationMs)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return t('homeRecordsUi.durationMinutes', { minutes: 1 })
  if (minutes < 60) return t('homeRecordsUi.durationMinutes', { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest
    ? t('homeRecordsUi.durationHoursMinutes', { hours, minutes: rest })
    : t('homeRecordsUi.durationHours', { hours })
}

export function clockLabel(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor((total % 3600) / 60)) + ':' + pad(total % 60)
}
