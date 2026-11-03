import { afterEach, expect, it, vi } from 'vitest'
import * as toast from '../ui/toast'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { notifyError, notifyGatewayModelUnavailable, notifyLoading } from './notify'

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/') })

it('routes caption-window errors to the dedicated overlay notification', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const showToast = vi.spyOn(toast, 'showToast')
  const notifyMainError = vi.fn()
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { notifyMainError } } as unknown as NolaBridge)

  notifyError('Audio device unavailable', { cause: new Error('device path and errno 5') })

  expect(showToast).not.toHaveBeenCalled()
  expect(notifyMainError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: 'error',
    message: 'Audio device unavailable',
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
  const openMainPage = vi.fn().mockResolvedValue(undefined)
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { openMainPage } } as unknown as NolaBridge)
  notifyGatewayModelUnavailable('模型网关未启动', '请先前往模型网关启动服务，然后重试。', '模型网关')
  expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    type: 'error',
    title: '模型网关未启动',
    description: '请先前往模型网关启动服务，然后重试。',
    actionProps: { children: '模型网关', onClick: expect.any(Function) },
  }))
  const notice = showToast.mock.calls[0][0]
  if ('actionProps' in notice) notice.actionProps.onClick()
  expect(openMainPage).toHaveBeenCalledExactlyOnceWith('#/model-gateway')
})

it('sends only an approved action identifier for an overlay error', () => {
  window.history.replaceState({}, '', '/?overlay=1')
  const notifyMainError = vi.fn()
  const onPress = vi.fn()
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { notifyMainError } } as unknown as NolaBridge)

  notifyError('本地引擎未连接', {
    description: '可点击下方按钮继续处理。',
    action: { label: '重新载入', onPress, actionId: 'retry-session' },
  })

  expect(onPress).not.toHaveBeenCalled()
  expect(notifyMainError).toHaveBeenCalledExactlyOnceWith({
    type: 'error',
    message: '本地引擎未连接',
    description: '可点击下方按钮继续处理。',
    actionLabel: '重新载入',
    actionId: 'retry-session',
    duration: 10000,
  })
})
