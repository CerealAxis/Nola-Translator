import { act, cleanup, render } from '@testing-library/react'
import { toast } from '@heroui/react'
import { afterEach, expect, it, vi } from 'vitest'
import { settingsStore } from '@/store/settingsStore'
import { RuntimeOperationNotice } from './RuntimeOperationNotice'

const toastMock = vi.hoisted(() => Object.assign(vi.fn(() => 'toast'), {
  success: vi.fn(() => 'success'),
  danger: vi.fn(() => 'danger'),
}))
vi.mock('@heroui/react', () => ({ toast: toastMock }))

const initial = settingsStore.getState()

afterEach(() => {
  cleanup()
  settingsStore.setState(initial)
  vi.clearAllMocks()
})

it('announces runtime progress and completion', () => {
  render(<RuntimeOperationNotice />)

  act(() => settingsStore.setState({ runtimeBusy: true, runtimeAction: 'install', runtimeError: null }))
  expect(toast).toHaveBeenCalledWith('运行组件安装已开始', { description: '操作进行中，可下滑查看进度。' })
  act(() => settingsStore.setState({ runtimeBusy: false }))
  expect(toast.success).toHaveBeenCalledWith('运行组件安装完成')
})

it('announces runtime failures with the diagnostic reason', () => {
  render(<RuntimeOperationNotice />)

  act(() => settingsStore.setState({ runtimeBusy: true, runtimeAction: 'uninstall', runtimeError: null }))
  act(() => settingsStore.setState({ runtimeBusy: false, runtimeError: '组件不存在' }))

  expect(toast.danger).toHaveBeenCalledWith('运行组件卸载失败', { description: '组件不存在' })
})
