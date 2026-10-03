/**
 * 同传记录域。列表 + 单条详情 + 改名 / 删除 / 导出。
 *
 * 引擎没有"记录变了"的通道，所以增量更新只挂在一个真正会改变列表的事件上：
 * `sessionStopped`。一场同传结束时引擎才把 meeting 落盘并补上 endedAtMs / durationMs，
 * 那是列表唯一需要重新拉的时刻。在那之前列表是稳定的，没有理由让每个页面各自去拉一次。
 *
 * 改名与删除都做乐观更新：列表行是用户正在看的东西，让它等一次磁盘往返再变会显得卡。
 */

import type { NolaBridge } from '@/bridge'
import type { CaptionSegment, ExportFormat, MeetingMeta } from '@/bridge'
import { createStore, createWriteQueue } from './createStore'

export interface MeetingDetail {
  meta: MeetingMeta
  segments: CaptionSegment[]
  audioUrl: string | null
}

export interface MeetingsState {
  meetings: MeetingMeta[]
  loaded: boolean
  loading: boolean
  error: string | null
  /** 正在进行乐观改写的记录 id。行内的 spinner 读它。 */
  pendingIds: readonly string[]
  detail: MeetingDetail | null
  detailLoading: boolean
  exporting: boolean
  /** 导出返回的文件路径；null 表示用户取消了系统对话框。 */
  exportedPath: string | null
}

const initialState: MeetingsState = {
  meetings: [],
  loaded: false,
  loading: false,
  error: null,
  pendingIds: [],
  detail: null,
  detailLoading: false,
  exporting: false,
  exportedPath: null,
}

export const meetingsStore = createStore<MeetingsState>(initialState)

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null
/** 引擎确认过的列表快照，回滚基准。 */
let confirmed: MeetingMeta[] = []
/** 乐观但未确认的改动，按顺序排队。 */
let inFlight: Array<{ id: string; patch: MeetingMeta | null }> = []

const enqueue = createWriteQueue()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function publish(): void {
  let next = confirmed
  for (const item of inFlight) {
    const { patch } = item
    if (patch === null) {
      next = next.filter((meeting) => meeting.meetingId !== item.id)
    } else {
      next = next.map((meeting) => (meeting.meetingId === item.id ? patch : meeting))
    }
  }
  meetingsStore.setState({
    meetings: next,
    pendingIds: inFlight.map((item) => item.id),
  })
}

// -- 公开动作 -----------------------------------------------------------------

export async function loadMeetings(): Promise<void> {
  if (!bridge) return
  const state = meetingsStore.getState()
  if (state.loading) return
  meetingsStore.setState({ loading: true, error: null })
  try {
    const list = await bridge.meetings.list()
    confirmed = list
    publish()
    meetingsStore.setState({ loaded: true, loading: false })
  } catch (error) {
    meetingsStore.setState({ loading: false, error: errorMessage(error) })
    throw error
  }
}

/** 记录详情。字幕与音频地址一次取回，页面的 loading 态只依赖这一个 promise。 */
export async function loadMeetingDetail(id: string): Promise<MeetingDetail | null> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  meetingsStore.setState({ detailLoading: true, detail: null, error: null })
  try {
    const [meta, segments, audioUrl] = await Promise.all([
      bridge.meetings.get(id),
      bridge.meetings.read(id),
      bridge.meetings.audioUrl(id),
    ])
    if (!meta) {
      meetingsStore.setState({ detailLoading: false })
      return null
    }
    const detail: MeetingDetail = { meta, segments, audioUrl }
    meetingsStore.setState({ detail, detailLoading: false })
    return detail
  } catch (error) {
    meetingsStore.setState({ detailLoading: false, error: errorMessage(error) })
    throw error
  }
}

/** 乐观改名。失败回滚到引擎确认过的标题。 */
export async function renameMeeting(id: string, title: string): Promise<MeetingMeta> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const current = confirmed.find((meeting) => meeting.meetingId === id)
  if (!current) throw new Error('找不到这条记录')

  const optimistic: MeetingMeta = { ...current, title: title.trim(), titleIsCustom: true }
  const record = { id, patch: optimistic }
  inFlight = [...inFlight, record]
  publish()
  meetingsStore.setState({ error: null })

  return enqueue(async () => {
    try {
      const saved = await bridge!.meetings.rename(id, title)
      confirmed = confirmed.map((meeting) => (meeting.meetingId === id ? saved : meeting))
      return saved
    } finally {
      inFlight = inFlight.filter((item) => item !== record)
      publish()
    }
  })
}

/**
 * 乐观保存笔记。
 *
 * 与 rename 同样的乐观模式，但**不排进 enqueue 串行队列**：笔记是高频写入（见 WorkspacePage 的
 * 防抖），排在写标题的队列后面会互相拖慢；而 MeetingStore.setNotes 自己是原子的（读-改-写 +
 * 与 append/finish 共用同一条写队列），重复写同一个值也是安全的。
 */
export async function setMeetingNotes(id: string, notes: string): Promise<MeetingMeta> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const current = confirmed.find((meeting) => meeting.meetingId === id)
  if (!current) throw new Error('找不到这条记录')

  const optimistic: MeetingMeta = { ...current, notes: notes.trim() ? notes : undefined }
  const record = { id, patch: optimistic }
  inFlight = [...inFlight, record]
  publish()

  try {
    const saved = await bridge!.meetings.setNotes(id, notes)
    confirmed = confirmed.map((meeting) => (meeting.meetingId === id ? saved : meeting))
    return saved
  } finally {
    inFlight = inFlight.filter((item) => item !== record)
    publish()
  }
}

/** 乐观删除。行先消失，失败再放回来。 */
export async function removeMeeting(id: string): Promise<boolean> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const record = { id, patch: null }
  inFlight = [...inFlight, record]
  publish()
  meetingsStore.setState({ error: null })

  return enqueue(async () => {
    try {
      const removed = await bridge!.meetings.remove(id)
      confirmed = removed
        ? confirmed.filter((meeting) => meeting.meetingId !== id)
        : confirmed
      if (removed) {
        // 详情页展示的正是被删掉的那条，别让用户停在一个已经不存在的东西上。
        if (meetingsStore.getState().detail?.meta.meetingId === id) {
          meetingsStore.setState({ detail: null })
        }
      }
      return removed
    } catch (error) {
      meetingsStore.setState({ error: errorMessage(error) })
      throw error
    } finally {
      inFlight = inFlight.filter((item) => item !== record)
      publish()
    }
  })
}

/** 导出。返回落盘路径，null 表示引擎判定这条记录没有可导出的内容。 */
export async function exportMeeting(id: string, format: ExportFormat): Promise<string | null> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  meetingsStore.setState({ exporting: true, error: null, exportedPath: null })
  try {
    const path = await bridge.meetings.export(id, format)
    meetingsStore.setState({ exporting: false, exportedPath: path })
    return path
  } catch (error) {
    meetingsStore.setState({ exporting: false, error: errorMessage(error) })
    throw error
  }
}

export function clearMeetingsError(): void {
  meetingsStore.setState({ error: null, exportedPath: null })
}

// -- 注入 ---------------------------------------------------------------------

export function attachMeetingsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event) => {
    // 一场同传结束时引擎才补齐 endedAtMs / durationMs，这是列表唯一需要重拉的时刻。
    if (event.type !== 'sessionStopped') return
    void loadMeetings().catch(() => {
      // 已经在 state.error 里了，事件回调里再抛一次只会变成 unhandled rejection。
    })
  })
}

export function detachMeetingsStore(): void {
  unsubscribe?.()
  unsubscribe = null
  bridge = null
  confirmed = []
  inFlight = []
  meetingsStore.setState(initialState)
}
