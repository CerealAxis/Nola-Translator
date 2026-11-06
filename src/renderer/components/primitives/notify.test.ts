import { afterEach, expect, it, vi } from 'vitest'
import * as toast from '../ui/toast'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { translate, type TranslationKey } from '@/i18n'
import { notifyError, notifyGatewayModelUnavailable, notifyGatewayStartIssue, notifyLoading, sessionConflictMessage } from './notify'

const t = (key: TranslationKey, variables?: Parameters<typeof translate>[2]) => translate(key, 'zh-CN', variables)

afterEach(() => { vi.restoreAllMocks(); window.history.replaceState({}, '', '/'); document.documentElement.lang = '' })

it('describes known IPC failures in the current interface language without exposing raw details', () => {
  document.documentElement.lang = 'ja'
  const showToast = vi.spyOn(toast, 'showToast')
  notifyError('Export failed', { cause: new Error("Error invoking remote method 'comic:export': Error: modelOutOfMemory") })
  expect(showToast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Export failed', description: translate('errors.modelOutOfMemory', 'ja') }))
  notifyError('Export failed', { cause: new Error('secret path or provider response') })
  expect(showToast).toHaveBeenLastCalledWith({ type: 'error', description: 'Export failed', duration: 10000 })
  notifyError('Export failed', { cause: { code: 'ENOSPC', supportCode: 'STO-022' }, description: 'Choose another disk.' })
  expect(showToast).toHaveBeenLastCalledWith(expect.objectContaining({ description: 'Choose another disk.' }))
})

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

it('reports a failed model even while Model Gateway is running', async () => {
  const showToast = vi.spyOn(toast, 'showToast')
  const model = 'resource:asr'
  vi.spyOn(store, 'getBridge').mockReturnValue({ gateway: { snapshot: async () => ({
    state: 'running', services: { asr: { state: 'failed', model, errorCode: 'model_out_of_memory' } },
  }) } } as unknown as NolaBridge)

  await expect(notifyGatewayStartIssue(t, 'asr', model)).resolves.toBe(true)
  expect(showToast).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    title: t('gateway.selectedModelUnavailable', { name: t('gateway.asr') }),
    description: t('errors.modelOutOfMemory'),
  }))
})

it('only names a busy feature when the refusal identifies it', () => {
  expect(sessionConflictMessage(t, new Error('FEATURE_CONFLICT:meeting'))).toContain(t('meeting.title'))
  expect(sessionConflictMessage(t, new Error('sessionAlreadyRunning'))).toBe(t('gateway.realtimeSessionBusy'))
})
