import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DemoScene, dispatchDemoSceneTool } from './DemoScene'
import { ClipboardInput } from './ClipboardInput'

afterEach(() => { cleanup(); vi.useRealTimers() })

function props() {
  return {
    source: 'hook' as const, active: true, paused: false, line: { original: '行こう。', translation: '走吧。' },
    showOriginal: true, fontSize: 16, onAdvance: vi.fn(), onCapture: vi.fn(), captureRequest: null,
  }
}

it('keeps one-time OCR and repeated scans separate from continuous regions and the HOOK source', async () => {
  const user = userEvent.setup()
  const options = props()
  const { rerender } = render(<DemoScene {...options} captureRequest={{ id: 1, kind: 'once' }} />)
  expect(screen.getByRole('button', { name: '对白框' })).toHaveFocus()
  await user.keyboard('{Enter}')
  await user.tab()
  await user.tab()
  await user.keyboard('{Enter}')
  expect(options.onCapture).toHaveBeenLastCalledWith('once', { original: '澪 この手紙、あなた宛てです。', translation: '澪 这封信是寄给你的。' })
  rerender(<DemoScene {...options} source="ocr" captureRequest={{ id: 2, kind: 'ocr' }} />)
  await user.click(screen.getByRole('button', { name: '任务提示' }))
  await user.click(screen.getByRole('button', { name: '确认范围' }))
  expect(options.onCapture).toHaveBeenLastCalledWith('ocr', { original: '待ち合わせ 18:40', translation: '碰面时间 18:40' })
  rerender(<DemoScene {...options} targetLanguage="ko" captureRequest={{ id: 3, kind: 'repeat' }} />)
  expect(options.onCapture).toHaveBeenLastCalledWith('once', { original: '澪 この手紙、あなた宛てです。', translation: '미오 이 편지, 당신 앞으로 왔어요.' })
  expect(screen.getByRole('button', { name: '下一句对白' })).toBeEnabled()
})

it('cancels a selection via Escape without replacing the last saved area', () => {
  const options = props()
  render(<DemoScene {...options} captureRequest={{ id: 1, kind: 'once' }} />)
  fireEvent.click(screen.getByRole('button', { name: '对白框' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '确认范围' }), { key: 'Escape' })
  expect(screen.queryByRole('button', { name: '确认范围' })).not.toBeInTheDocument()
  expect(options.onCapture).not.toHaveBeenCalled()
})

it('only forwards new copies while the clipboard source is active and permits manual append while paused', () => {
  const options = { onRead: vi.fn(), visible: true, automatic: false, request: null, write: null }
  const { rerender } = render(<ClipboardInput {...options} />)
  fireEvent.change(screen.getByRole('textbox', { name: '剪贴板内容' }), { target: { value: 'この手紙をください。' } })
  fireEvent.click(screen.getByRole('button', { name: '复制文本' }))
  expect(options.onRead).not.toHaveBeenCalled()
  rerender(<ClipboardInput {...options} automatic />)
  expect(options.onRead).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '复制文本' }))
  expect(options.onRead).toHaveBeenLastCalledWith('この手紙をください。', false)
  rerender(<ClipboardInput {...options} visible={false} request={{ id: 1, append: true }} />)
  expect(screen.queryByRole('textbox', { name: '剪贴板内容' })).not.toBeInTheDocument()
  expect(options.onRead).toHaveBeenLastCalledWith('この手紙をください。', true)
  rerender(<ClipboardInput {...options} write={{ id: 2, text: '信' }} />)
  expect(options.onRead).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '追加到原文' }))
  expect(options.onRead).toHaveBeenLastCalledWith('信', true)
})

it('runs continuous OCR on a changed quest prompt after the configured interval', () => {
  vi.useFakeTimers()
  const options = props()
  render(<DemoScene {...options} source="ocr" captureRequest={{ id: 1, kind: 'ocr' }} />)
  fireEvent.click(screen.getByRole('button', { name: '任务提示' }))
  fireEvent.click(screen.getByRole('button', { name: '确认范围' }))
  fireEvent.click(screen.getByRole('button', { name: '推进游戏时间' }))
  act(() => vi.advanceTimersByTime(1499))
  expect(options.onCapture).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1))
  expect(options.onCapture).toHaveBeenLastCalledWith('ocr', { original: '待ち合わせ 19:15', translation: '碰面时间 19:15' })
  fireEvent.click(screen.getByRole('button', { name: '推进游戏时间' }))
  act(() => vi.advanceTimersByTime(1500))
  expect(options.onCapture).toHaveBeenCalledTimes(2)
})

it('shows a one-time in-place translation without an attached game and restores the subtitles when it closes', () => {
  const options = props()
  const { container } = render(<DemoScene {...options} active={false} />)
  expect(screen.getByText('走吧。')).toBeVisible()
  expect(screen.queryByRole('button', { name: '下一句对白' })).not.toBeInTheDocument()
  act(() => dispatchDemoSceneTool('once-in-place'))
  fireEvent.click(screen.getByRole('button', { name: '对白框' }))
  fireEvent.click(screen.getByRole('button', { name: '确认范围' }))
  expect(container.querySelector('.game-demo-in-place')).toHaveTextContent('这封信是寄给你的。')
  fireEvent.click(screen.getByRole('button', { name: '关闭原地译文' }))
  expect(screen.getByText('走吧。')).toBeVisible()
})

it('focuses a retained OCR region and removes its border through toolbar commands', () => {
  const options = props()
  const { container } = render(<DemoScene {...options} source="ocr" captureRequest={{ id: 1, kind: 'ocr' }} />)
  fireEvent.click(screen.getByRole('button', { name: '任务提示' }))
  fireEvent.click(screen.getByRole('button', { name: '确认范围' }))
  act(() => dispatchDemoSceneTool('nearest-region'))
  expect(container.querySelector('.game-demo-region')).toHaveAttribute('data-focused', 'true')
  act(() => dispatchDemoSceneTool('toggle-region-frame'))
  expect(container.querySelector('.game-demo-region')).toBeNull()
  act(() => { dispatchDemoSceneTool('toggle-region-frame'); dispatchDemoSceneTool('clear-regions') })
  expect(container.querySelector('.game-demo-region')).toBeNull()
})

it('uses independent subtitle sizes and preserves OCR line breaks when adjacent line merging is disabled', () => {
  const options = props()
  const { container, rerender } = render(<DemoScene {...options} source="ocr" originalFontSize={22} />)
  expect(screen.getByText('行こう。')).toHaveStyle({ fontSize: '22px' })
  expect(container.querySelector('.game-demo-caption')).toHaveStyle({ fontSize: '16px' })
  fireEvent.click(screen.getByText('OCR 区域'))
  fireEvent.click(screen.getByRole('switch', { name: '合并临近行' }))
  rerender(<DemoScene {...options} source="ocr" captureRequest={{ id: 4, kind: 'ocr' }} />)
  fireEvent.click(screen.getByRole('button', { name: '对白框' }))
  fireEvent.click(screen.getByRole('button', { name: '确认范围' }))
  expect(options.onCapture).toHaveBeenLastCalledWith('ocr', { original: '澪\nこの手紙、あなた宛てです。', translation: '澪\n这封信是寄给你的。' })
})

it('renders the embedded dialogue independently of the selected subtitle thread and its visibility', () => {
  const options = { ...props(), line: { original: '船長', translation: '船长' }, embedded: true, embeddedLine: '请出示船票。' }
  const { rerender, container } = render(<DemoScene {...options} />)
  expect(screen.getByText('船长')).toBeVisible()
  expect(container.querySelector('.game-demo-game-dialogue')).toHaveTextContent('请出示船票。')
  rerender(<DemoScene {...options} showOriginal={false} showTranslation={false} />)
  expect(screen.queryByText('船长')).not.toBeInTheDocument()
  expect(container.querySelector('.game-demo-game-dialogue')).toHaveTextContent('请出示船票。')
})
