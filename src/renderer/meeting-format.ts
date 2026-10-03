/**
 * 会议记录的时间、时长与自动标题。
 *
 * **自动标题是渲染时算出来的，不落盘** —— 这就是 `MeetingMeta` 把 `title` 与
 * `titleIsCustom` 分开存的原因：换界面语言会给每一条记录重新起名，而一个文件都不动。
 *
 * `daySequence` 那条规则尤其重要：同一天录了好几场会时，光用日期会让它们**全部重名**，
 * 用户根本分不清哪条是哪条，所以第 N 场带 `_记录_N` 后缀。
 */

import type { MeetingMeta } from '@/bridge'
import type { TranslationKey, UiLanguage } from '@/i18n'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/** 会议还在进行中（引擎还没回 `endedAtMs`）。 */
export function isLive(meta: MeetingMeta): boolean {
  return meta.endedAtMs === undefined
}

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

export function meetingDurationLabel(
  meta: MeetingMeta,
  t: (key: TranslationKey, values?: Record<string, string | number>) => string,
): string {
  const ms = Math.max(0, (meta.endedAtMs ?? Date.now()) - meta.startedAtMs)
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
