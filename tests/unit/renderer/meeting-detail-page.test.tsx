import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CaptionSegment, MeetingMeta } from '../../../src/shared/contracts'
import { MeetingDetailPage } from '../../../src/renderer/pages/MeetingDetailPage'

const meta: MeetingMeta = {
  meetingId: 'm-1',
  title: '周会',
  titleIsCustom: true,
  startedAtMs: new Date(2026, 8, 29, 22, 50, 0).getTime(),
  endedAtMs: new Date(2026, 8, 29, 22, 50, 43).getTime(),
  durationMs: 43_000,
  daySequence: 0,
  segmentCount: 2,
  sourceLanguage: 'auto',
  targetLanguage: 'zh',
  audioFile: 'audio.wav',
  audioDurationMs: 43_000,
}

const segments: CaptionSegment[] = [
  { segmentId: 's1', revision: 1, startedAtMs: 0, endedAtMs: 2000, sourceText: 'Good morning everyone.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '大家早上好。', state: 'complete', provider: 'hymt2' }] },
  { segmentId: 's2', revision: 1, startedAtMs: 2200, sourceText: 'Let us get started.', isFinal: true, translations: [{ targetLanguage: 'zh', text: '我们开始吧。', state: 'complete', provider: 'hymt2' }] },
]

const getMeeting = vi.fn<(id: string) => Promise<MeetingMeta | null>>()
const readMeeting = vi.fn<(id: string) => Promise<CaptionSegment[]>>()
const getMeetingAudioUrl = vi.fn<(id: string) => Promise<string | null>>()
const exportMeeting = vi.fn<(id: string, format: string) => Promise<string | null>>()
const onBack = vi.fn<() => void>()

const renderDetail = () => render(<MeetingDetailPage meetingId={'m-1'} onBack={onBack} />)

describe('会议详情', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getMeeting.mockResolvedValue(meta)
    readMeeting.mockResolvedValue(segments)
    getMeetingAudioUrl.mockResolvedValue('nola-audio://local/m-1/audio.wav')
    exportMeeting.mockResolvedValue('C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + '周会.srt')
    Object.assign(window.nolaTranslator!, { getMeeting, readMeeting, getMeetingAudioUrl, exportMeeting })
  })

  it('原文与译文按 segment 对齐分栏显示', async () => {
    renderDetail()
    const source = (await screen.findByRole('heading', { name: '原文' })).parentElement as HTMLElement
    const target = screen.getByRole('heading', { name: '译文' }).parentElement as HTMLElement
    expect(within(source).getAllByRole('paragraph').map((node) => node.textContent)).toEqual([
      'Good morning everyone.',
      'Let us get started.',
    ])
    expect(within(target).getAllByRole('paragraph').map((node) => node.textContent)).toEqual([
      '大家早上好。',
      '我们开始吧。',
    ])
  })

  it('原文在左、译文在右：分隔条独占一列，译文不会换行到下一行', async () => {
    renderDetail()
    const source = (await screen.findByRole('heading', { name: '原文' })).parentElement as HTMLElement
    const target = (screen.getByRole('heading', { name: '译文' })).parentElement as HTMLElement
    const panes = source.parentElement as HTMLElement
    // 三个子元素，所以网格必须有三列：原文 | 分隔条 | 译文。
    expect(panes.style.gridTemplateColumns).toBe('0.5fr 14px 0.5fr')
    expect([...panes.children].map((node) => node.className)).toEqual([
      'meeting-pane',
      'meeting-divider',
      'meeting-pane',
    ])
    expect(panes.children[0]).toBe(source)
    expect(panes.children[2]).toBe(target)
  })

  it('展示会议名与两条说明徽章，不再出现合成音频的字样', async () => {
    renderDetail()
    expect(await screen.findByRole('heading', { name: '周会' })).toBeInTheDocument()
    expect(screen.getByText('内容自动保存')).toBeInTheDocument()
    expect(screen.getByText('数据安全保护')).toBeInTheDocument()
    expect(screen.queryByText(/合成音频/)).not.toBeInTheDocument()
  })

  it('返回按钮回到列表', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: '返回' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('A+ 与 A- 同时缩放原文与译文, 且有上下限', async () => {
    renderDetail()
    const grow = await screen.findByRole('button', { name: '增大字号' })
    const shrink = screen.getByRole('button', { name: '减小字号' })
    const sizeOf = (name: string) => (screen.getByRole('heading', { name }).parentElement as HTMLElement).style.fontSize
    expect(sizeOf('原文')).toBe('calc(1rem)')
    fireEvent.click(grow)
    fireEvent.click(grow)
    expect(sizeOf('原文')).toBe('calc(1.2rem)')
    expect(sizeOf('译文')).toBe('calc(1.2rem)')
    for (let index = 0; index < 30; index += 1) fireEvent.click(shrink)
    expect(sizeOf('原文')).toBe('calc(0.7rem)')
    for (let index = 0; index < 40; index += 1) fireEvent.click(grow)
    expect(sizeOf('原文')).toBe('calc(2rem)')
  })

  it('分隔条可用键盘调整比例并被夹在 15% 到 85%', async () => {
    renderDetail()
    const divider = await screen.findByRole('separator', { name: '调整原文与译文的显示比例' })
    expect(divider).toHaveAttribute('aria-valuenow', '50')
    fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '55')
    for (let index = 0; index < 30; index += 1) fireEvent.keyDown(divider, { key: 'ArrowRight' })
    expect(divider).toHaveAttribute('aria-valuenow', '85')
    for (let index = 0; index < 30; index += 1) fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    expect(divider).toHaveAttribute('aria-valuenow', '15')
  })

  it('导出菜单按格式调用 exportMeeting 并回显结果', async () => {
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: '导出' }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'SRT' }))
    await waitFor(() => expect(exportMeeting).toHaveBeenCalledWith('m-1', 'srt'))
    expect(await screen.findByRole('status')).toHaveTextContent('已导出到')
  })

  it('用户取消导出时什么都不显示', async () => {
    exportMeeting.mockResolvedValue(null)
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: '导出' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'TXT' }))
    await waitFor(() => expect(exportMeeting).toHaveBeenCalledWith('m-1', 'txt'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('导出失败时给出错误提示', async () => {
    exportMeeting.mockRejectedValue(new Error('EACCES'))
    renderDetail()
    fireEvent.click(await screen.findByRole('button', { name: '导出' }))
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'VTT' }))
    expect(await screen.findByRole('status')).toHaveTextContent('导出失败，请重试。')
  })

  it('有录音时显示播放器与总时长', async () => {
    renderDetail()
    expect(await screen.findByLabelText('播放进度')).toBeInTheDocument()
    expect(screen.getByText('00:00:00 / 00:00:43')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '播放' })).toBeInTheDocument()
  })

  it('没有录音时不渲染播放器', async () => {
    getMeetingAudioUrl.mockResolvedValue(null)
    renderDetail()
    await screen.findByRole('heading', { name: '周会' })
    expect(screen.queryByLabelText('播放进度')).not.toBeInTheDocument()
  })

  it('空会议给出空态而不是空白双栏', async () => {
    readMeeting.mockResolvedValue([])
    renderDetail()
    expect(await screen.findAllByText('本次会议没有识别到语音内容。')).toHaveLength(2)
  })

  it('会议读取失败时给出提示', async () => {
    getMeeting.mockRejectedValue(new Error('会议不存在'))
    renderDetail()
    expect(await screen.findByRole('status')).toHaveTextContent('无法读取会议记录，请重试。')
  })
})
