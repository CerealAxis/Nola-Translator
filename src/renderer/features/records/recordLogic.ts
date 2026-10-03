/**
 * 记录屏的纯逻辑：搜索、排序、分页窗口、时间与时长格式化。
 *
 * **为什么单独成文件**：这些都是纯函数，没有任何 JSX 与 store 依赖。
 * 留在 `RecordsPage.tsx` 里就只能靠渲染整页来测，而整页要经过 `@/` 别名、
 * bridge 与弹窗，测的是接线而不是逻辑。拆出来可以直接断言，
 * 页面那边只负责编排。
 *
 * 组件内不出现中文字面量：这些函数只处理数据与数字，不产出界面文案。
 */

import type { MeetingMeta } from '@/bridge'

/**
 * 搜索：按名称与语言对。
 * 字幕正文不进搜索：一条会议几千句，逐句比对既慢又没有意义，
 * 用户想找的是"那场讲某个主题的会"，不是"某句话"。
 */
export function matches(meeting: MeetingMeta, text: string): boolean {
  if (text === '') return true
  return (
    meeting.title.toLowerCase().includes(text) ||
    meeting.sourceLanguage.toLowerCase().includes(text) ||
    meeting.targetLanguage.toLowerCase().includes(text)
  )
}

/** 列表默认按结束时间倒序（最近的在前）。进行中的会议没有 endedAtMs，回落到开始时间。 */
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
 * 分页页码窗口：当前页居中，最多 5 个。
 * 记录条数是几十到几百的量级，5 个页码够用，不需要省略号。
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

/** 越界时把当前页夹回范围。搜索把结果筛没之后必须调用，否则停在第 9 页显示空白。 */
export function clampPage(page: number, total: number, pageSize: number): number {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  return Math.min(Math.max(1, page), pageCount)
}

export function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * 时长。DESIGN 第 12.2 节第 7 条：数字带单位，不写 `43s`。
 * 秒级补 `s`（短会议的读法），分钟级以上走 `m:ss` / `h:mm:ss`（计时器读法）。
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

/** `HH:MM:SS`。数字必须 tabular-nums，调用方负责挂 `.nola-mono`。 */
export function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0
  const total = Math.floor(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

/** 列表用的时间戳：到分钟。它是 `tabular-nums` 的表头列，多余的秒数是噪音。 */
export function formatDateTime(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 没有自定义标题时给一个用户能认出的日期。引擎把 title 留空表示"用默认名"。
 *
 * **必须带 `daySequence`。** 只用 `formatDateTime` 的话，同一天录的每一场会都叫
 * `2026-10-01 10:12`，用户在记录列表里根本分不清哪条是哪条 —— 这正是主仓
 * `meeting-format.ts` 一直带 `_记录_N` 后缀的原因（`MeetingMeta.daySequence` 的注释
 * 就是这么写的）。这里与主仓口径一致：`daySequence === 0` 不带后缀。
 *
 * 完整的中英文自动标题渲染在 `@/meeting-format` 的 `meetingTitleFor()`，它还处理
 * 界面语言与用户自定义标题；这个函数是给导出文件名之类只需要一个 zh 串的地方用的。
 */
export function fallbackTitle(meeting: MeetingMeta): string {
  const base = formatDateTime(meeting.startedAtMs)
  return meeting.daySequence > 0 ? `${base}_记录_${meeting.daySequence}` : base
}
