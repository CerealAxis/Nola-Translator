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

/**
 * 会议生命周期。
 *
 * 以前只看 `endedAtMs`：没有就当进行中。但 `endedAtMs` 只有一个写入方（主进程的
 * `MeetingStore.finish()`），而它依赖一张不落盘的 `sessionId → meetingId` 表。
 * 应用在同传中被关掉 / 崩掉时 `finish()` 根本没跑过，重启后这张表是空的、也再也补不回来，
 * 那条记录就永远停在「进行中」——几小时前录完的东西看着像还在录。
 *
 * 所以状态由主进程显式落盘（`MeetingMeta.state`），`interrupted` 就是「开过、没走完、
 * 现在肯定不在跑」这一种。字段是可选的：老文件没有它时按 `endedAtMs` 推断，
 * 主进程启动时会把推断结果补写回磁盘。
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
 * 自动标题的**纯格式器**。
 *
 * `meetingTitleFor`（记录列表用）与会话弹窗里那个「名称」框的预览共用它。预览如果另写
 * 一份格式，用户在弹窗里看到的名字就会和之后记录列表里的对不上 —— 而那两个名字指的是
 * 同一件事。
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

/**
 * 本地日键。**口径必须与主进程 `MeetingStore.localDayKey` 一致** —— 两边都用本地时区
 * （不是 UTC），否则跨零点的会议会被算到相邻的一天，序号也就错位了。
 */
function localDayKey(at: number): string {
  const date = new Date(at)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

/**
 * 下一场会将会拿到的 `daySequence`，即当天**已经存在**的会议数。
 *
 * 与主进程 `nextDaySequence` 同口径：`begin()` 是在把新记录放进 cache **之前**数的，
 * 所以当天第一场拿到 0（不带 `_记录_N` 后缀），第二场 1，以此类推。
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
   * 结束后的时长**直接读 `durationMs`**，不再用 `endedAtMs - startedAtMs` 重算一遍。
   * 那条式子把引擎卸载权重的收尾时间也算进去了（实测每场多 25~60 秒），而 `endedAtMs`
   * 现在是"内容结束的时刻"、不是"按下停止的时刻"，两个数本来就不相等。
   * `durationMs` 是主进程算好的内容跨度，是"时长"在这套代码里**唯一**的定义 ——
   * 过去列表算一套、详情页读 `durationMs` 另一套，同一条记录两个地方能显示不同数字。
   *
   * 只有真在跑的时候才用「现在」当终点。中断的会议没有 `endedAtMs`，拿 `Date.now()`
   * 去减会得到一个随时间一直变大的时长 —— 越晚打开页面越离谱。
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
