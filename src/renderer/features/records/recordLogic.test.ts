/**
 * 记录屏纯逻辑测试：搜索、排序、分页、时间与时长格式化。
 *
 * 这些函数是 `recordLogic.ts` 的纯导出，不经过 JSX、store 与 bridge，
 * 所以断言的是逻辑本身，而不是接线。
 */

import { describe, expect, it } from 'vitest'

import type { MeetingMeta } from '@/bridge'
import {
  clampPage,
  endedAt,
  fallbackTitle,
  formatClock,
  formatDateTime,
  formatDuration,
  matches,
  pageNumbers,
  sortByEndTime,
} from './recordLogic'

function meeting(partial: Partial<MeetingMeta> & { meetingId: string }): MeetingMeta {
  return {
    title: '',
    titleIsCustom: false,
    startedAtMs: new Date(2026, 9, 1, 10, 0, 0).getTime(),
    durationMs: 60_000,
    daySequence: 0,
    segmentCount: 0,
    sourceLanguage: 'zh',
    targetLanguage: 'en',
    ...partial,
  } as MeetingMeta
}

const OLDER = meeting({
  meetingId: 'older',
  title: '2026-09-20_周会',
  startedAtMs: new Date(2026, 8, 20, 9, 0, 0).getTime(),
  endedAtMs: new Date(2026, 8, 20, 10, 0, 0).getTime(),
})
const NEWER = meeting({
  meetingId: 'newer',
  title: '2026-10-01_客户答疑',
  startedAtMs: new Date(2026, 9, 1, 10, 0, 0).getTime(),
  endedAtMs: new Date(2026, 9, 1, 11, 0, 0).getTime(),
})
/** 进行中：没有 endedAtMs。 */
const LIVE = meeting({
  meetingId: 'live',
  title: '正在开的会',
  startedAtMs: new Date(2026, 9, 2, 9, 0, 0).getTime(),
})

describe('搜索 matches', () => {
  it('按会议名匹配，大小写不敏感', () => {
    expect(matches(NEWER, '客户')).toBe(true)
    expect(matches(NEWER, '周会')).toBe(false)
  })

  it('按语言对匹配', () => {
    expect(matches(NEWER, 'zh')).toBe(true)
    expect(matches(NEWER, 'en')).toBe(true)
  })

  it('空查询匹配全部（不是"匹配不到任何东西"）', () => {
    expect(matches(NEWER, '')).toBe(true)
  })
})

describe('排序 sortByEndTime', () => {
  it('默认倒序：最近的在前', () => {
    const sorted = sortByEndTime([OLDER, NEWER], false)
    expect(sorted.map((m) => m.meetingId)).toEqual(['newer', 'older'])
  })

  it('升序：最早的在前', () => {
    const sorted = sortByEndTime([OLDER, NEWER], true)
    expect(sorted.map((m) => m.meetingId)).toEqual(['older', 'newer'])
  })

  it('不修改入参数组（[...spread] 拷贝）', () => {
    const input = [OLDER, NEWER]
    sortByEndTime(input, false)
    expect(input.map((m) => m.meetingId)).toEqual(['older', 'newer'])
  })

  it('进行中的会议没有 endedAtMs，回落到 startedAtMs 再排', () => {
    expect(endedAt(LIVE)).toBe(LIVE.startedAtMs)
    const sorted = sortByEndTime([OLDER, LIVE], false)
    // LIVE 开始于 10-02，比 OLDER 新，所以排前面。
    expect(sorted.map((m) => m.meetingId)).toEqual(['live', 'older'])
  })
})

describe('分页 pageNumbers', () => {
  it('当前页居中，最多 5 个', () => {
    expect(pageNumbers(5, 20)).toEqual([3, 4, 5, 6, 7])
  })

  it('靠近开头时窗口左对齐，不出现第 0 页', () => {
    expect(pageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5])
    expect(pageNumbers(2, 20)).toEqual([1, 2, 3, 4, 5])
  })

  it('靠近结尾时窗口右对齐，不超过总页数', () => {
    expect(pageNumbers(20, 20)).toEqual([16, 17, 18, 19, 20])
  })

  it('总页数不足 5 时只给实际存在的页码', () => {
    expect(pageNumbers(1, 3)).toEqual([1, 2, 3])
  })

  it('没有记录时返回空数组而不是 [0]', () => {
    expect(pageNumbers(1, 0)).toEqual([])
  })
})

describe('分页夹取 clampPage', () => {
  it('当前页超过范围时夹回最后一页', () => {
    // 12 条、每页 10 条 -> 共 2 页，停在第 9 页要夹到第 2 页。
    expect(clampPage(9, 12, 10)).toBe(2)
  })

  it('没有记录时是第 1 页而不是 0', () => {
    expect(clampPage(3, 0, 10)).toBe(1)
  })

  it('负数页夹到 1', () => {
    expect(clampPage(-1, 30, 10)).toBe(1)
  })
})

describe('时长 formatDuration', () => {
  it('秒级带 s 单位（DESIGN 第 12.2 节第 7 条：不写裸 43）', () => {
    expect(formatDuration(43_000)).toBe('43s')
  })

  it('分钟级走 m:ss', () => {
    expect(formatDuration(1_104_000)).toBe('18:24')
  })

  it('小时级走 h:mm:ss', () => {
    expect(formatDuration(5_905_000)).toBe('1:38:25')
  })

  it('不足 1 秒是 0s，不出现负数', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(-5000)).toBe('0s')
  })

  it('每一段都补零到两位，数字不跳宽', () => {
    expect(formatDuration(65_000)).toBe('1:05')
  })
})

describe('计时器 formatClock', () => {
  it('固定三段 HH:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00:00')
    expect(formatClock(43_000)).toBe('00:00:43')
    expect(formatClock(3_661_000)).toBe('01:01:01')
  })

  it('非法输入归零而不是产出 NaN', () => {
    expect(formatClock(Number.NaN)).toBe('00:00:00')
    expect(formatClock(-1)).toBe('00:00:00')
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('00:00:00')
  })
})

describe('日期 formatDateTime / fallbackTitle', () => {
  it('到分钟，格式 YYYY-MM-DD HH:mm', () => {
    const ms = new Date(2026, 9, 1, 14, 5, 0).getTime()
    expect(formatDateTime(ms)).toBe('2026-10-01 14:05')
  })

  it('月与日补零', () => {
    const ms = new Date(2026, 0, 2, 3, 4, 0).getTime()
    expect(formatDateTime(ms)).toBe('2026-01-02 03:04')
  })

  it('没有自定义标题时回落到开始时间（引擎把 title 留空表示用默认名）', () => {
    const m = meeting({ meetingId: 'x', title: '', startedAtMs: new Date(2026, 8, 20, 9, 30, 0).getTime() })
    expect(fallbackTitle(m)).toBe('2026-09-20 09:30')
  })
})
