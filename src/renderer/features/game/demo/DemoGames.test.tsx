import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { demoGames, DemoLibrary, GamePicker, ThreadPicker } from './DemoGames'

afterEach(cleanup)

describe('game process and text selection', () => {
  it('registers a selected desktop process only when it is confirmed', () => {
    const onPick = vi.fn()
    const onOpenChange = vi.fn()
    const picker = render(<GamePicker open onOpenChange={onOpenChange} onPick={onPick} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '4180' } })
    fireEvent.click(screen.getByRole('button', { name: /Tideglass Harbor/ }))
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onPick).not.toHaveBeenCalled()
    picker.rerender(<GamePicker open={false} onOpenChange={onOpenChange} onPick={onPick} />)
    picker.rerender(<GamePicker open onOpenChange={onOpenChange} onPick={onPick} />)
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /Tideglass Harbor/ }))
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(onPick).toHaveBeenCalledWith(demoGames[0])
  })

  it('associates the loaded title with its own ID on a shared emulator host', () => {
    const onPick = vi.fn()
    render(<GamePicker open onOpenChange={vi.fn()} onPick={onPick} />)
    fireEvent.click(screen.getByRole('button', { name: /PPSSPPWindows64/ }))
    fireEvent.click(screen.getByRole('button', { name: '确定' }))
    expect(onPick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Lantern Post/ }))
    fireEvent.click(screen.getByRole('button', { name: '载入游戏' }))
    expect(onPick).toHaveBeenCalledWith(demoGames[3])
    expect(demoGames[2].pid).toBe(demoGames[3].pid)
    expect(demoGames[2].id).not.toBe(demoGames[3].id)
  })

  it('merges in selection order and permits embedding without displaying a thread', () => {
    function Picker() {
      const [threads, setThreads] = useState<string[]>([])
      const [embedded, setEmbedded] = useState(false)
      return <ThreadPicker open onOpenChange={vi.fn()} threads={threads} onChange={setThreads}
        embedded={embedded} onEmbed={setEmbedded} lines={{ name: 'Mio', dialogue: 'Hello', menu: 'Start' }} translation="你好" />
    }
    render(<Picker />)
    fireEvent.click(screen.getByRole('checkbox', { name: '显示 · 对白' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '显示 · 人物名' }))
    expect(screen.getByText('Hello Mio')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '显示 · 对白' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '显示 · 人物名' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '内嵌译文 · 对白' }))
    expect(screen.getByText('未选择显示线程')).toBeInTheDocument()
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: '内嵌译文 · 菜单' })).not.toBeInTheDocument()
  })
})

it('sorts the read-only recent list by session completion and confirms removals in all games', () => {
  const onRemove = vi.fn()
  render(<DemoLibrary games={demoGames.slice(0, 2)} recentIds={[demoGames[1].id, demoGames[0].id]}
    onAdd={vi.fn()} onBack={vi.fn()} onPlay={vi.fn()} onRemove={onRemove} />)
  fireEvent.click(screen.getByRole('button', { name: '最近游戏' }))
  expect(screen.queryByRole('button', { name: /移出游戏库/ })).not.toBeInTheDocument()
  expect(screen.getAllByText(/Tideglass Harbor|Lantern Letters/).map(item => item.textContent)).toEqual(['Lantern Letters', 'Tideglass Harbor'])
  fireEvent.click(screen.getByRole('button', { name: '所有游戏' }))
  fireEvent.click(screen.getByRole('button', { name: '移出游戏库 · Lantern Letters' }))
  expect(onRemove).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确定' }))
  expect(onRemove).toHaveBeenCalledWith(demoGames[1].id)
})

it('adds selected game profiles without launching a game, and can duplicate existing settings', () => {
  const onAdd = vi.fn()
  const onPlay = vi.fn()
  const existing = { ...demoGames[0], launchSource: 'ocr' as const }
  render(<DemoLibrary games={[existing]} onAdd={onAdd} onBack={vi.fn()} onPlay={onPlay} onRemove={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '添加游戏' }))
  const dialog = within(screen.getByRole('dialog'))
  fireEvent.click(dialog.getByRole('checkbox', { name: /Tideglass Harbor/ }))
  expect(dialog.getByRole('button', { name: '添加选中游戏' })).toBeDisabled()
  fireEvent.click(dialog.getByRole('checkbox', { name: '复制已有档案的设置' }))
  fireEvent.click(dialog.getByRole('checkbox', { name: /Lantern Letters/ }))
  fireEvent.click(dialog.getByRole('button', { name: '添加选中游戏' }))
  expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ originalId: demoGames[0].id, launchSource: 'ocr' }))
  expect(onAdd).toHaveBeenCalledWith(demoGames[1])
  expect(onPlay).not.toHaveBeenCalled()
})

it('opens a linked profile and returns to the library without launching it', () => {
  const onProfileChange = vi.fn()
  const onPlay = vi.fn()
  render(<DemoLibrary games={demoGames} profileId={demoGames[3].id} onProfileChange={onProfileChange}
    onAdd={vi.fn()} onBack={vi.fn()} onPlay={onPlay} onRemove={vi.fn()} />)
  const dialog = within(screen.getByRole('dialog', { name: 'Lantern Post' }))
  expect(dialog.getByText(/ULJS-99002/)).toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: '关闭' }))
  expect(onProfileChange).toHaveBeenCalledWith(null)
  expect(onPlay).not.toHaveBeenCalled()
})
