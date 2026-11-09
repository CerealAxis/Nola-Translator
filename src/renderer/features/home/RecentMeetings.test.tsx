import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { MeetingMeta, NolaBridge } from '@/bridge'
import { attachMeetingsStore, detachMeetingsStore, loadMeetings } from '@/store/meetingStore'
import { RecentMeetings } from './RecentMeetings'

function record(meetingId: string, endedAtMs: number, patch: Partial<MeetingMeta> = {}): MeetingMeta {
  return {
    meetingId, title: '自定义原记录名', titleIsCustom: true, startedAtMs: endedAtMs - 60_000,
    endedAtMs, state: 'completed', durationMs: 60_000, daySequence: 0, segmentCount: 1,
    sourceLanguage: 'en', targetLanguage: 'zh', ...patch,
  }
}

function attachRecords(list: () => Promise<MeetingMeta[]>) {
  attachMeetingsStore({
    meetings: { list },
    events: { onEngineEvent: () => () => undefined },
  } as unknown as NolaBridge)
}

afterEach(() => {
  cleanup()
  detachMeetingsStore()
  location.hash = ''
})

it('uses real saved records, their feature names and newest-first order', async () => {
  const user = userEvent.setup()
  attachRecords(async () => [
    record('old-record', 150_000),
    record('stored-meeting', 350_000, { sourceKind: 'meeting', segmentCount: 0, notes: '已保存的笔记' }),
    record('record id/1', 450_000),
    record('saved-game', 250_000, { sourceKind: 'game' }),
  ])
  await loadMeetings()
  render(<RecentMeetings />)

  const panel = screen.getByRole('tabpanel', { name: '全部' })
  expect(within(panel).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([
    '打开记录 · 快速同传', '打开记录 · 会议口译', '打开记录 · 游戏翻译',
  ])
  expect(screen.queryByText('自定义原记录名')).not.toBeInTheDocument()
  await user.click(within(panel).getByRole('button', { name: '打开记录 · 快速同传' }))
  expect(location.hash).toBe('#/records/record%20id%2F1')

  await user.click(screen.getByRole('tab', { name: '快速同传' }))
  const quickPanel = screen.getByRole('tabpanel', { name: '快速同传' })
  expect(within(quickPanel).getAllByRole('button')).toHaveLength(2)
  await user.click(screen.getByRole('tab', { name: '会议口译' }))
  await user.click(screen.getByRole('button', { name: '打开记录 · 会议口译' }))
  expect(location.hash).toBe('#/records/stored-meeting')
})

it('opens the corresponding feature for empty saved sessions and empty filters', async () => {
  const user = userEvent.setup()
  attachRecords(async () => [
    record('empty-game', 150_000, { sourceKind: 'game', segmentCount: 0, notes: '   ' }),
  ])
  await loadMeetings()
  render(<RecentMeetings />)

  await user.click(screen.getByRole('button', { name: '打开功能 · 游戏翻译' }))
  expect(location.hash).toBe('#/game-translation')
  for (const [name, route] of [
    ['会议口译', '#/meeting'],
    ['屏幕翻译', '#/screen-translation'],
    ['漫画翻译', '#/comic-translation'],
  ]) {
    await user.click(screen.getByRole('tab', { name }))
    expect(screen.getByText('暂无最近记录')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开功能 · ' + name }))
    expect(location.hash).toBe(route)
  }
})

it('can retry a failed read instead of presenting it as an empty history', async () => {
  const user = userEvent.setup()
  const list = vi.fn<() => Promise<MeetingMeta[]>>()
    .mockRejectedValueOnce(new Error('Records unavailable'))
    .mockResolvedValueOnce([record('after-retry', 150_000)])
  attachRecords(list)
  await expect(loadMeetings()).rejects.toThrow('Records unavailable')
  render(<RecentMeetings />)

  expect(screen.getByRole('status')).toHaveTextContent('记录加载失败，请重试。')
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('button', { name: '打开记录 · 快速同传' })).toBeInTheDocument()
})
