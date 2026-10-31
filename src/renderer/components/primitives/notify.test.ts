import { afterEach, expect, it, vi } from 'vitest'
import * as toast from '../ui/toast'
import { notifyError, notifyGatewayModelUnavailable, notifyLoading } from './notify'

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

it('uses the explicit title and description layout when requested', () => {
  const showToast = vi.spyOn(toast, 'showToast')
  notifyError('搜索失败', { description: '请检查网络后重试。' })
  expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    title: '搜索失败',
    description: '请检查网络后重试。',
  }))
})

it('shows a local-model availability toast in the app with a gateway action', () => {
  const showToast = vi.spyOn(toast, 'showToast')
  notifyGatewayModelUnavailable('没有可用的ASR模型', '请先启动模型网关。', '模型网关')
  expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: 'error',
    title: '没有可用的ASR模型',
    description: '请先启动模型网关。',
    actionProps: { children: '模型网关', onClick: expect.any(Function) },
  }))
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
