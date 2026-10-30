import { afterEach, expect, it, vi } from 'vitest'
import * as toast from '../ui/toast'
import { notifyError, notifyLoading } from './notify'

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('keeps caption-window errors in the caption window', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const showToast = vi.spyOn(toast, 'showToast')

  notifyError('Audio device unavailable', { cause: new Error('device path and errno 5') })

  expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: 'error',
    description: 'Audio device unavailable',
    duration: 10000,
  }))
})

it('gives loading notices a finite automatic duration', () => {
  const showToast = vi.spyOn(toast, 'showToast')
  notifyLoading('正在准备运行组件')
  expect(showToast).toHaveBeenCalledExactlyOnceWith({ type: 'loading', description: '正在准备运行组件', duration: 8000 })
})

it('keeps the actionable error in the overlay so only a user click can navigate away', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const showToast = vi.spyOn(toast, 'showToast')

  notifyError('本地引擎未连接', {
    description: '可点击下方按钮继续处理。',
    action: { label: '重新载入', onPress: vi.fn() },
  })

  expect(showToast).toHaveBeenCalledExactlyOnceWith({
    type: 'error',
    title: '本地引擎未连接',
    description: '可点击下方按钮继续处理。',
    actionProps: { children: '重新载入', onClick: expect.any(Function) },
    duration: 10000,
  })
})
