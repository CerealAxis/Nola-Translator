import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { DemoTools, resetDemoTools } from './DemoTools'
import { defaultTools, hotkeyGroups, sourceRestriction, toolIds } from './tools-catalog'
import { exportHistory } from './tools-reading'
import { processGameText } from './tools-processing'

const row = { id: 7, original: '桟橋の先で待っていて。', translation: '在栈桥尽头等我。' }
function mountTools() {
  const onEdit = vi.fn(),
    onAction = vi.fn()
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    history: [row],
    onEdit,
    gameName: 'Tideglass Harbor',
    gameId: 'harbor',
    source: 'hook' as const,
    onAction,
    ruleEnabled: true,
    onRuleChange: vi.fn(),
    memoryEnabled: true,
    onMemoryChange: vi.fn(),
  }
  return { ...render(<DemoTools {...props} />), onEdit, onAction, props }
}
function openTab(name: string) {
  fireEvent.click(within(screen.getByRole('navigation')).getByRole('button', { name }))
}
beforeEach(resetDemoTools)
it('keeps the source restrictions, defaults and shortcut groups of the subtitle toolbar', () => {
  expect([toolIds.length, defaultTools.length, Object.values(hotkeyGroups).flat().length]).toEqual([40, 21, 53])
  expect(defaultTools.filter((k) => sourceRestriction[k] === 'hook')).toEqual(['pickGame', 'pickText'])
  expect(defaultTools.filter((k) => sourceRestriction[k] === 'ocr')).toEqual(['range', 'rangeFrame'])
})
it('sends game selection to the session and edits the chosen history line', () => {
  const view = mountTools()
  fireEvent.click(screen.getByRole('button', { name: '选择游戏' }))
  expect(view.onAction).toHaveBeenCalledWith('select-game')
  openTab('历史记录')
  fireEvent.change(screen.getByLabelText('译文'), { target: { value: '在码头见。' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(view.onEdit).toHaveBeenCalledWith(7, '在码头见。')
})
it('retains a game notebook through closing, remounting and switching notebook scope', async () => {
  const view = mountTools()
  openTab('备忘录')
  fireEvent.change(screen.getByRole('textbox', { name: '备忘录' }), { target: { value: '明天去码头' } })
  view.unmount()
  render(<DemoTools {...view.props} />)
  expect(screen.getByRole('textbox', { name: '备忘录' })).toHaveValue('明天去码头')
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '备忘录' }))
  await user.click(screen.getByRole('option', { name: '全局' }))
  expect(screen.getByRole('textbox', { name: '备忘录' })).toHaveValue('')
})
it('applies only eligible processing rules and exports ordered UTF-8 subtitle content', () => {
  const cache = new Map<string, unknown>()
  expect(processGameText(cache, 'harbor', 'hook', true, 'ＡＡＢＢ', 'input')).toBe('AB')
  expect(processGameText(cache, 'harbor', 'ocr', true, 'ＡＡＢＢ', 'input')).toBe('AABB')
  expect(processGameText(cache, 'harbor', 'hook', true, 'ＡＡＢＢ', 'input', true)).toBe('AABB')
  expect(processGameText(cache, 'harbor', 'hook', false, 'ＡＡＢＢ', 'input')).toBe('ＡＡＢＢ')
  expect(processGameText(cache, 'harbor', 'hook', true, 'We can still catch the last ferry.', 'input')).toBe(
    'We can still catch the last ferry.',
  )
  expect(exportHistory([row], 'SRT')).toBe('1\n00:00:00,000 --> 00:00:03,000\n' + row.original + '\n' + row.translation)
})
it('uses edited replacement rules immediately when the game pipeline delivers its next line', () => {
  const processor = { current: (text: string, _stage: 'input' | 'translation') => text }
  const view = mountTools()
  view.rerender(<DemoTools {...view.props} processorRef={processor} />)
  openTab('文本处理')
  fireEvent.change(screen.getByRole('textbox', { name: '查找' }), { target: { value: '埠頭' } })
  fireEvent.change(screen.getByRole('textbox', { name: '替换为' }), { target: { value: '港' } })
  expect(processor.current('埠頭', 'input')).toBe('港')
  expect(processor.current('埠頭', 'translation')).toBe('埠頭')
})
it('dispatches a user-assigned shortcut and delivers original and translation to separate outputs', () => {
  const view = mountTools()
  openTab('快捷键')
  const binding = screen.getByRole('button', { name: '未分配' })
  fireEvent.click(binding)
  fireEvent.keyDown(binding, { key: 'r', ctrlKey: true, shiftKey: true })
  fireEvent.keyDown(window, { key: 'r', ctrlKey: true, shiftKey: true })
  expect(view.onEdit).toHaveBeenCalledWith(7, row.translation)
  openTab('窗口与输出')
  fireEvent.click(screen.getByRole('switch', { name: 'WebSocket · 原文' }))
  fireEvent.click(screen.getByRole('switch', { name: 'WebSocket · 译文' }))
  fireEvent.click(screen.getByRole('button', { name: '发送文本' }))
  const records = screen.getByRole('list')
  expect(within(records).getByText('WebSocket / original').parentElement).toHaveTextContent(row.original)
  expect(within(records).getByText('WebSocket / translation').parentElement).toHaveTextContent(row.translation)
})
