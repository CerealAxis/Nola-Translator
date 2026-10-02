import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MeetingMeta } from '../../../src/shared/contracts'
import { MeetingsPage } from '../../../src/renderer/pages/MeetingsPage'

function meeting(patch: Partial<MeetingMeta> & { meetingId: string }): MeetingMeta {
  return {
    title: '',
    titleIsCustom: false,
    startedAtMs: new Date(2026, 8, 27, 13, 0, 0).getTime(),
    endedAtMs: new Date(2026, 8, 27, 13, 1, 0).getTime(),
    durationMs: 60_000,
    daySequence: 0,
    segmentCount: 1,
    sourceLanguage: 'auto',
    targetLanguage: 'zh',
    ...patch,
  }
}

const listMeetings = vi.fn<() => Promise<MeetingMeta[]>>()
const deleteMeeting = vi.fn<(id: string) => Promise<boolean>>()
const renameMeeting = vi.fn<(id: string, title: string) => Promise<MeetingMeta>>()
const onOpenMeeting = vi.fn<(id: string) => void>()

describe('会议记录列表', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listMeetings.mockResolvedValue([])
    deleteMeeting.mockResolvedValue(true)
    renameMeeting.mockImplementation(async (id, title) => meeting({ meetingId: id, title, titleIsCustom: true }))
    Object.assign(window.nolaTranslator!, { listMeetings, deleteMeeting, renameMeeting })
  })

  it('没有记录时给出空态, 而不是空白表格', async () => {
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    expect(await screen.findByText('暂无会议记录')).toBeInTheDocument()
    expect(screen.getByText('共 0 条会议记录')).toBeInTheDocument()
  })

  it('列出会议名、结束时间与时长, 点击进入详情', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1' })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    const title = await screen.findByRole('button', { name: '2026年09月27日_记录' })
    expect(screen.getByText('2026年09月27日 13:01')).toBeInTheDocument()
    expect(screen.getByText('1分钟')).toBeInTheDocument()
    fireEvent.click(title)
    expect(onOpenMeeting).toHaveBeenCalledWith('m-1')
  })

  it('记录中的会议带标记且不显示结束时间', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-live', endedAtMs: undefined })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    expect(await screen.findByText('记录中')).toBeInTheDocument()
  })

  it('按会议名称搜索', async () => {
    listMeetings.mockResolvedValue([
      meeting({ meetingId: 'm-1', title: '产品评审', titleIsCustom: true }),
      meeting({ meetingId: 'm-2', title: '周会', titleIsCustom: true }),
    ])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    await screen.findByText('产品评审')
    fireEvent.change(screen.getByLabelText('请输入会议名称'), { target: { value: '周' } })
    expect(screen.getByText('周会')).toBeInTheDocument()
    expect(screen.queryByText('产品评审')).not.toBeInTheDocument()
    expect(screen.getByText('共 1 条会议记录')).toBeInTheDocument()
  })

  it('删除前先确认, 确认后调用 deleteMeeting', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1', title: '周会', titleIsCustom: true })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/确定删除“周会”吗/)).toBeInTheDocument()
    expect(deleteMeeting).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    await waitFor(() => expect(deleteMeeting).toHaveBeenCalledWith('m-1'))
  })

  it('取消删除时什么都不发生', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1' })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(deleteMeeting).not.toHaveBeenCalled()
  })

  it('双击会议名进入重命名, 回车保存', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1' })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    const title = await screen.findByRole('button', { name: '2026年09月27日_记录' })
    fireEvent.doubleClick(title)
    const input = screen.getByDisplayValue('2026年09月27日_记录')
    fireEvent.change(input, { target: { value: '周会' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(renameMeeting).toHaveBeenCalledWith('m-1', '周会'))
  })

  it('重命名输入为空时不发请求', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1' })])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    fireEvent.doubleClick(await screen.findByRole('button', { name: '2026年09月27日_记录' }))
    const input = screen.getByDisplayValue('2026年09月27日_记录')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.queryByDisplayValue('   ')).not.toBeInTheDocument())
    expect(renameMeeting).not.toHaveBeenCalled()
  })

  it('删除失败时给出提示而不是静默', async () => {
    listMeetings.mockResolvedValue([meeting({ meetingId: 'm-1' })])
    deleteMeeting.mockRejectedValue(new Error('磁盘忙'))
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    fireEvent.click(await screen.findByRole('button', { name: '删除' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '删除' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('删除会议失败，请重试。')
  })

  it('读取失败时给出提示', async () => {
    listMeetings.mockRejectedValue(new Error('EIO'))
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('无法读取会议记录，请重试。')
  })

  it('按结束时间倒序排列, 点击表头切换', async () => {
    listMeetings.mockResolvedValue([
      meeting({ meetingId: 'm-old', startedAtMs: new Date(2026, 8, 26, 9, 0, 0).getTime(), endedAtMs: new Date(2026, 8, 26, 10, 0, 0).getTime() }),
      meeting({ meetingId: 'm-new', startedAtMs: new Date(2026, 8, 29, 22, 0, 0).getTime(), endedAtMs: new Date(2026, 8, 29, 22, 50, 0).getTime() }),
    ])
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    await screen.findByText('2026年09月29日_记录')
    const names = () => screen.getAllByRole('button', { name: /^2026年/ }).map((node) => node.textContent)
    expect(names()).toEqual(['2026年09月29日_记录', '2026年09月26日_记录'])
    fireEvent.click(screen.getByRole('button', { name: '按会议结束时间排序' }))
    expect(names()).toEqual(['2026年09月26日_记录', '2026年09月29日_记录'])
  })

  it('超过一页时按 10 条分页并可跳转', async () => {
    const many = Array.from({ length: 23 }, (_, index) => meeting({
      meetingId: 'm-' + index,
      title: '会议' + index,
      titleIsCustom: true,
      endedAtMs: new Date(2026, 8, 29, 10, 0, 0).getTime() + index * 60_000,
    }))
    listMeetings.mockResolvedValue(many)
    render(<MeetingsPage onOpenMeeting={onOpenMeeting} />)
    expect(await screen.findByText('共 23 条会议记录')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()

    // 倒序排列, 第 3 页是时间最早的 3 条.
    fireEvent.change(screen.getByLabelText('跳至页码'), { target: { value: '3' } })
    expect(await screen.findByText('会议0')).toBeInTheDocument()
    expect(screen.getByText('会议1')).toBeInTheDocument()
    expect(screen.getByText('会议2')).toBeInTheDocument()
    expect(screen.queryByText('会议10')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    expect(await screen.findByText('会议10')).toBeInTheDocument()
    expect(screen.queryByText('会议0')).not.toBeInTheDocument()
  })
})
