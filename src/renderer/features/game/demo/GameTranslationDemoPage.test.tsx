import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { notifyError } from '@/components/primitives/notify'
import GameTranslationDemoPage from './GameTranslationDemoPage'

vi.mock('@/components/primitives/notify', async load => ({
  ...await load<typeof import('@/components/primitives/notify')>(), notifyError: vi.fn(),
}))

it('keeps only the two sources and requires software before starting Hook', async () => {
  render(<GameTranslationDemoPage />)
  for (const name of ['游戏库', '翻译工具', '进行一次 OCR', '再次进行 OCR', '选择游戏']) {
    expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
  }
  expect(screen.queryByText('显示设置')).not.toBeInTheDocument()
  expect(screen.queryByText('自动取字')).not.toBeInTheDocument()
  expect(screen.getByRole('switch', { name: '文本处理' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(notifyError).toHaveBeenCalledWith('选择正在运行的软件')
  fireEvent.click(screen.getByRole('combobox', { name: '软件选择' }))
  fireEvent.click(await screen.findByRole('option', { name: /LanternLetters.exe/ }))
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(screen.getByRole('button', { name: '停止' })).toBeVisible()
  expect(screen.getByRole('combobox', { name: '获取来源' })).toBeDisabled()
  expect(screen.queryByRole('combobox', { name: '选择文本' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '停止' }))
  expect(screen.queryByRole('combobox', { name: '选择文本' })).not.toBeInTheDocument()
})

it('shows screen-style OCR settings and requires a region before starting', async () => {
  render(<GameTranslationDemoPage />)
  fireEvent.click(screen.getByRole('combobox', { name: '获取来源' }))
  expect(await screen.findAllByRole('option')).toHaveLength(2)
  await userEvent.click(screen.getByRole('option', { name: /^OCR$/ }))
  expect(await screen.findByRole('heading', { name: 'OCR 设置' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Hook 设置' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(notifyError).toHaveBeenCalledWith('选取 OCR 范围')
  fireEvent.click(screen.getByRole('button', { name: '选择区域' }))
  fireEvent.click(await screen.findByRole('button', { name: '对白框' }))
  fireEvent.click(screen.getByRole('button', { name: '确认范围' }))
  fireEvent.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(screen.getByRole('button', { name: '停止' })).toBeVisible()
})

it('stores actual regions and formats the interval outside editing', async () => {
  localStorage.removeItem('nola:game-area-presets:v1')
  const user = userEvent.setup()
  const page = render(<GameTranslationDemoPage />)
  fireEvent.click(screen.getByRole('combobox', { name: '获取来源' }))
  await user.click(await screen.findByRole('option', { name: /^OCR$/ }))
  const interval = screen.getByLabelText('识别间隔')
  expect(interval).toHaveValue('600 ms')
  await user.click(interval)
  expect(interval).toHaveValue(600)
  await user.clear(interval)
  await user.type(interval, '900{Enter}')
  expect(interval).toHaveValue('900 ms')
  await user.click(interval)
  await user.clear(interval)
  await user.type(interval, '1200{Escape}')
  expect(interval).toHaveValue('900 ms')
  await user.click(screen.getByRole('button', { name: '选择区域' }))
  await user.click(screen.getByRole('button', { name: '对白框' }))
  await user.click(screen.getByRole('button', { name: '确认范围' }))
  await user.click(screen.getByRole('button', { name: '管理区域方案' }))
  await user.click(await screen.findByRole('menuitem', { name: '保存区域方案' }))
  await user.type(screen.getByLabelText('方案名称'), '对白')
  await user.click(screen.getByRole('button', { name: '保存区域方案' }))
  const saved = JSON.parse(localStorage.getItem('nola:game-area-presets:v1')!)
  expect(saved[0].regions).toEqual([{ x: 32, y: 153, width: 277, height: 43 }])
  page.unmount()
  render(<GameTranslationDemoPage />)
  fireEvent.click(screen.getByRole('combobox', { name: '获取来源' }))
  await user.click(await screen.findByRole('option', { name: /^OCR$/ }))
  fireEvent.click(screen.getByRole('combobox', { name: '翻译区域' }))
  await user.click(await screen.findByRole('option', { name: '对白' }))
  await user.click(screen.getByRole('button', { name: '开始翻译' }))
  expect(screen.getByRole('button', { name: '停止' })).toBeVisible()
})
