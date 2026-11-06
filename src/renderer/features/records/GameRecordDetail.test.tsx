import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { attachMeetingsStore, detachMeetingsStore } from '@/store/meetingStore'
import type { MeetingMeta, NolaBridge } from '@/bridge'
import { RecordDetailPage } from './RecordDetailPage'

afterEach(() => { cleanup(); detachMeetingsStore(); location.hash = '' })

it('searches either language in a reopened game record and opens its export choices', async () => {
  location.hash = '#/records/owned-game'
  const meta = { meetingId: 'owned-game', sourceKind: 'game', gameId: 'owned', title: 'Game transcript', sourceLanguage: 'en', targetLanguage: 'zh', startedAtMs: 0, durationMs: 1200 } as MeetingMeta
  attachMeetingsStore({
    meetings: { get: async () => meta, audioUrl: async () => null, read: async () => ['first', 'second'].map((text, index) =>
      ({ segmentId: text, startedAtMs: index * 1200, isFinal: true, sourceText: text, translations: [{ targetLanguage: 'zh', text: index ? '乙' : '甲' }] })) },
    events: { onEngineEvent: vi.fn(() => () => {}) },
  } as unknown as NolaBridge)
  render(<RecordDetailPage />)
  const search = await screen.findByRole('searchbox')
  fireEvent.change(search, { target: { value: '乙' } })
  expect(screen.getByText('second')).toBeInTheDocument()
  expect(screen.queryByText('first')).toBeNull()
  fireEvent.change(search, { target: { value: 'FiRsT' } })
  expect(screen.getByText('甲')).toBeInTheDocument()
  expect(screen.queryByText('second')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '导出' }))
  expect(await screen.findByRole('tab', { name: /SRT/i })).toBeInTheDocument()
})
