/**
 * Meeting record domain: list + one detail + rename / delete / export. The engine
 * has no "records changed" channel, so refresh rides `sessionStopped`, where the
 * main process fills in endedAtMs / durationMs. Rename and delete are optimistic.
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
  /** Records under an optimistic rewrite; the row's spinner reads it. */
  pendingIds: readonly string[]
  detail: MeetingDetail | null
  detailLoading: boolean
  exporting: boolean
  /** Path written by the last export; null means the save dialog was cancelled. */
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
/** The list snapshot the engine confirmed. The rollback baseline. */
let confirmed: MeetingMeta[] = []
/** Optimistic but unconfirmed changes, in order. */
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

/** Detail. Captions and audio URL are fetched together, so the page's loading state hangs off one promise. */
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

/** Optimistic rename. A failure rolls back to the title the engine confirmed. */
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
 * The main process's `setNotes` is atomic on its own side, so a repeated value
 * is safe.
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

/** Optimistic delete. The row goes first and comes back if the write fails. */
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
        // The detail view is showing the record just deleted; do not strand the user on it.
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

/** Export. Returns the written path; null means the user cancelled the save dialog. */
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

export function attachMeetingsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event) => {
    // The engine fills in endedAtMs / durationMs only at session end, so this is the one moment to reload.
    if (event.type !== 'sessionStopped') return
    void loadMeetings().catch(() => {
      // Already in state.error; rethrowing from an event callback is an unhandled rejection.
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
