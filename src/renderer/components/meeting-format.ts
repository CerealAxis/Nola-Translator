import type { MeetingMeta } from '../../shared/contracts'
import type { TranslationValues, UiLanguage } from '../i18n'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function isLive(meta: MeetingMeta): boolean {
  return meta.endedAtMs === undefined
}

/**
 * Auto titles are rendered, not stored: switching the interface language relabels every meeting
 * without touching a single file on disk, which is why MeetingMeta keeps title/titleIsCustom apart.
 */
export function meetingTitleFor(meta: MeetingMeta, language: UiLanguage): string {
  if (meta.titleIsCustom && meta.title) return meta.title
  const at = new Date(meta.startedAtMs)
  if (language === 'en') {
    const date = at.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
    return meta.daySequence > 0
      ? date.replace(/\//g, '-') + ' meeting ' + meta.daySequence
      : date.replace(/\//g, '-') + ' meeting'
  }
  const base = at.getFullYear() + '年' + pad(at.getMonth() + 1) + '月' + pad(at.getDate()) + '日_记录'
  return meta.daySequence > 0 ? base + '_' + meta.daySequence : base
}

export function meetingEndLabel(meta: MeetingMeta): string {
  const at = new Date(meta.endedAtMs ?? meta.startedAtMs)
  return at.getFullYear() + '年' + pad(at.getMonth() + 1) + '月' + pad(at.getDate()) + '日 ' + pad(at.getHours()) + ':' + pad(at.getMinutes())
}

export function meetingDurationLabel(meta: MeetingMeta, t: (message: string, values?: TranslationValues) => string): string {
  const ms = Math.max(0, (meta.endedAtMs ?? Date.now()) - meta.startedAtMs)
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) return t('{minutes}分钟', { minutes: 1 })
  if (minutes < 60) return t('{minutes}分钟', { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? t('{hours}小时{minutes}分钟', { hours, minutes: rest }) : t('{hours}小时', { hours })
}

export function clockLabel(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  return pad(Math.floor(total / 3600)) + ':' + pad(Math.floor((total % 3600) / 60)) + ':' + pad(total % 60)
}
