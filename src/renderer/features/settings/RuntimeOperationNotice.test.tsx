import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { settingsStore } from '@/store/settingsStore'
import { RuntimeOperationNotice } from './RuntimeOperationNotice'

const notifyMocks = vi.hoisted(() => ({
  notifyLoading: vi.fn(() => 'loading'),
  notifyInfo: vi.fn(() => 'info'),
  notifySuccess: vi.fn(() => 'success'),
  notifyError: vi.fn(() => 'error'),
}))
vi.mock('@/components/primitives/notify', () => notifyMocks)

const initial = settingsStore.getState()

afterEach(() => {
  cleanup()
  settingsStore.setState(initial)
  vi.clearAllMocks()
})

it('announces runtime progress and completion', () => {
  render(<RuntimeOperationNotice />)

  act(() => settingsStore.setState({ runtimeBusy: true, runtimeAction: 'install', runtimeError: null }))
  expect(notifyMocks.notifyLoading).toHaveBeenCalledWith('运行组件安装已开始', expect.objectContaining({ description: '操作进行中，可下滑查看进度。', action: expect.objectContaining({ label: '查看进度' }) }))
  act(() => settingsStore.setState({ runtimeBusy: false }))
  expect(notifyMocks.notifySuccess).toHaveBeenCalledWith('运行组件安装完成')
})

it('announces runtime failures with the diagnostic reason', () => {
  render(<RuntimeOperationNotice />)

  act(() => settingsStore.setState({ runtimeBusy: true, runtimeAction: 'uninstall', runtimeError: null }))
  act(() => settingsStore.setState({ runtimeBusy: false, runtimeError: '组件不存在' }))

  expect(notifyMocks.notifyError).toHaveBeenCalledWith('运行组件卸载失败', expect.objectContaining({ cause: '组件不存在' }))
})
