import { afterEach, expect, it, vi } from 'vitest'
import type { MeetingMeta, NolaBridge } from '@/bridge'
import { attachMeetingsStore, detachMeetingsStore, loadMeetings, meetingsStore, removeMeetings, renameMeeting, setMeetingNotes } from './meetingStore'

afterEach(detachMeetingsStore)

it('serializes notes behind rename so both changes survive', async () => {
  let meta = { meetingId: 'record', title: 'Before' } as MeetingMeta
  let finish!: () => void
  const rename = vi.fn(async (_id: string, title: string) => {
    await new Promise<void>(resolve => { finish = resolve })
    return meta = { ...meta, title }
  })
  const setNotes = vi.fn(async (_id: string, notes: string) => meta = { ...meta, notes })
  attachMeetingsStore({ meetings: { list: async () => [meta], rename, setNotes }, events: { onEngineEvent: () => () => {} } } as unknown as NolaBridge)
  await loadMeetings()
  const renamed = renameMeeting(meta.meetingId, 'After')
  const noted = setMeetingNotes(meta.meetingId, 'Notes')
  await vi.waitFor(() => expect(rename).toHaveBeenCalledOnce())
  expect(setNotes).not.toHaveBeenCalled()
  finish()
  await Promise.all([renamed, noted])
  expect(meetingsStore.getState().meetings[0]).toMatchObject({ title: 'After', notes: 'Notes' })
})

it('keeps the current detail when its batch deletion fails and clears it only after removal', async () => {
  const meta = { meetingId: 'kept', title: 'Recording' } as MeetingMeta
  const remove = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  attachMeetingsStore({ meetings: { list: async () => [meta], remove }, events: { onEngineEvent: () => () => {} } } as unknown as NolaBridge)
  await loadMeetings()
  const detail = { meta, segments: [], audioUrl: null }
  meetingsStore.setState({ detail })
  expect(await removeMeetings(['kept'])).toMatchObject({ removed: [], failed: [{ id: 'kept' }] })
  expect(meetingsStore.getState().detail).toBe(detail)
  expect(meetingsStore.getState().meetings).toEqual([meta])
  expect(await removeMeetings(['kept'])).toEqual({ removed: ['kept'], failed: [] })
  expect(meetingsStore.getState().detail).toBeNull()
})

it('rereads records when a game finishes during an older list request', async () => {
  let changed!: (value: { recordRevision: number }) => void
  let finish!: (list: MeetingMeta[]) => void
  const game = { meetingId: 'game', sourceKind: 'game' } as MeetingMeta
  const list = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue([game])
  attachMeetingsStore({ meetings: { list }, events: { onEngineEvent: () => () => {} },
    gameTranslation: { onChanged: (callback: typeof changed) => { changed = callback; return () => {} } } } as unknown as NolaBridge)
  const pending = loadMeetings()
  changed({ recordRevision: 1 })
  finish([]); await pending
  await vi.waitFor(() => expect(meetingsStore.getState().meetings).toEqual([game]))
  changed({ recordRevision: 1 })
  expect(list).toHaveBeenCalledTimes(2)
})
