import { describe, expect, it } from 'vitest'

import type { MeetingMeta } from '../../../src/shared/contracts'
import { translate } from '../../../src/renderer/i18n'
import {
  clockLabel,
  isLive,
  meetingDurationLabel,
  meetingEndLabel,
  meetingTitleFor,
} from '../../../src/renderer/meeting-format'


function meeting(patch: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    meetingId: '20260929-225000-aaaaaaaa',
    title: '',
    titleIsCustom: false,
    startedAtMs: new Date(2026, 8, 29, 22, 50, 0).getTime(),
    durationMs: 0,
    daySequence: 0,
    segmentCount: 0,
    sourceLanguage: 'auto',
    targetLanguage: 'zh',
    ...patch,
  }
}

/**
 * The real `translate`, not a local stub: the duration text is a dictionary key
 * (`homeRecordsUi.durationMinutes`), and a `t` that only substitutes `{placeholders}`
 * would return the key verbatim and make every assertion below vacuous.
 */
const t = (key: string, values?: Record<string, string | number>) =>
  translate(key, 'zh-CN', values)

describe('会议展示格式', () => {
  it('自动标题按界面语言渲染, 不读盘上的 title', () => {
    expect(meetingTitleFor(meeting(), 'zh-CN')).toBe('2026年09月29日_记录')
    expect(meetingTitleFor(meeting({ daySequence: 2 }), 'zh-CN')).toBe('2026年09月29日_记录_2')
    expect(meetingTitleFor(meeting(), 'en')).toMatch(/^\d{2}-\d{2}-\d{4} meeting$/)
    expect(meetingTitleFor(meeting({ daySequence: 2 }), 'en')).toMatch(/meeting 2$/)
  })

  it('手动命名的会议在任何语言下都用存储值', () => {
    const custom = meeting({ title: '产品评审', titleIsCustom: true, daySequence: 3 })
    expect(meetingTitleFor(custom, 'zh-CN')).toBe('产品评审')
    expect(meetingTitleFor(custom, 'en')).toBe('产品评审')
  })

  it('空标题的已改名会议退回自动标题', () => {
    expect(meetingTitleFor(meeting({ title: '', titleIsCustom: true }), 'zh-CN')).toBe('2026年09月29日_记录')
  })

  it('未结束的会议是进行中', () => {
    expect(isLive(meeting())).toBe(true)
    expect(isLive(meeting({ endedAtMs: Date.now() }))).toBe(false)
  })

  /*
   * A finished meeting reads `durationMs`, the main process's content span; recomputing
   * `endedAtMs - startedAtMs` folds in unloading the weights, measured at 25-60s per
   * meeting.
   *
   * The fixture makes the two disagree by 30s on purpose, so an assertion that recomputes
   * turns red instead of quietly showing a longer number.
   */
  it('会议时长按分钟/小时折算, 不足一分钟按一分钟', () => {
    const base = new Date(2026, 8, 29, 22, 0, 0).getTime()
    const at = (ms: number) => meeting({ startedAtMs: base, endedAtMs: base + ms + 30_000, durationMs: ms })
    expect(meetingDurationLabel(at(20_000), t)).toBe('1分钟')
    expect(meetingDurationLabel(at(60_000), t)).toBe('1分钟')
    expect(meetingDurationLabel(at(5 * 60_000), t)).toBe('5分钟')
    expect(meetingDurationLabel(at(60 * 60_000), t)).toBe('1小时')
    expect(meetingDurationLabel(at(95 * 60_000), t)).toBe('1小时35分钟')
  })

  it('结束时间缺省时回落到开始时间', () => {
    expect(meetingEndLabel(meeting())).toBe('2026年09月29日 22:50')
  })

  it('播放器时间用 HH:MM:SS', () => {
    expect(clockLabel(0)).toBe('00:00:00')
    expect(clockLabel(43_000)).toBe('00:00:43')
    expect(clockLabel(3_723_000)).toBe('01:02:03')
    expect(clockLabel(-1)).toBe('00:00:00')
  })
})
