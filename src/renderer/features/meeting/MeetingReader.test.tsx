import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { NolaBridge } from '@/bridge'
import * as store from '@/store'
import { notifyError } from '@/components/primitives/notify'
import { MeetingReader } from './MeetingReader'

vi.mock('@/components/primitives/notify', () => ({ notifyError: vi.fn() }))
vi.mock('../workspace/WorkspaceViewControls', () => ({ WorkspaceViewControls: () => null }))
vi.mock('@/components/caption', () => ({ CaptionStage: () => null }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(notifyError).mockClear() })

it('reports a reader action failure without claiming that the interpretation pipeline stopped', async () => {
  const failure = new Error('device unavailable')
  vi.spyOn(store, 'getBridge').mockReturnValue({ meetingMode: { setPaused: vi.fn().mockRejectedValue(failure) } } as unknown as NolaBridge)
  render(<MeetingReader snapshot={{ state: 'running', passthroughActive: false }} />)
  fireEvent.click(screen.getByRole('button', { name: '暂停' }))
  await waitFor(() => expect(notifyError).toHaveBeenCalledWith('无法暂停或继续会议口译，请重试。', { cause: failure }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('keeps the specific reported pipeline reason visible', () => {
  render(<MeetingReader snapshot={{ state: 'failed', passthroughActive: false, error: { key: 'meeting.stopFailed' } }} />)
  expect(screen.getByRole('alert')).toHaveTextContent('未能确认会议口译已停止')
})
