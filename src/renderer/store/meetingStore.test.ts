import { afterEach, expect, it, vi } from 'vitest'
import type { MeetingMeta, NolaBridge } from '@/bridge'
import { attachMeetingsStore, detachMeetingsStore, loadMeetings, meetingsStore, removeMeetings } from './meetingStore'

afterEach(detachMeetingsStore)

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
