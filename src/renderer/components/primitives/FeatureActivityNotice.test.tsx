import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { FeatureActivityNotice, requestFeatureStart } from './FeatureActivityNotice'
import { notifyError } from './notify'
import type { ModelGatewaySnapshot } from '../../../shared/model-gateway'

vi.mock('./notify', () => ({ notifyError: vi.fn(), notifyInfo: vi.fn(), notifySuccess: vi.fn() }))

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('feature conflict coordination', () => {
  it('asks before stopping the owner and starts only after the stop completes', async () => {
    const stop = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(store, 'getBridge').mockReturnValue({ activity: { snapshot: async () => ({ owner: 'model-gateway', phase: 'running' }), stop } } as unknown as NolaBridge)
    render(<FeatureActivityNotice />)
    const start = vi.fn().mockResolvedValue('started')
    let result!: Promise<string | undefined>
    await act(async () => { result = requestFeatureStart(start, 'interpretation') })
    expect(start).not.toHaveBeenCalled()
    expect(stop).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '停止并启动' }))
    await expect(result).resolves.toBe('started')
    expect(stop).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
    expect(stop.mock.invocationCallOrder[0]).toBeLessThan(start.mock.invocationCallOrder[0])
  })

  it('cancels an atomic conflict without stopping or retrying', async () => {
    const stop = vi.fn()
    vi.spyOn(store, 'getBridge').mockReturnValue({ activity: { stop } } as unknown as NolaBridge)
    render(<FeatureActivityNotice />)
    const start = vi.fn().mockRejectedValue(new Error('IPC: FEATURE_CONFLICT:workbench'))
    let result!: Promise<unknown>
    await act(async () => { result = requestFeatureStart(start) })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await expect(result).resolves.toBeUndefined()
    expect(stop).not.toHaveBeenCalled()
    expect(start).toHaveBeenCalledOnce()
  })

  it('preserves unrelated start failures for the caller', async () => {
    const error = new Error('model missing')
    await expect(requestFeatureStart(() => Promise.reject(error))).rejects.toBe(error)
  })

  it('confirms an explicit quit only after the user chooses it', async () => {
    let requestQuit!: () => void
    const confirmQuit = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(store, 'getBridge').mockReturnValue({ confirmQuit, onQuitRequested: (callback: () => void) => { requestQuit = callback; return () => undefined } } as unknown as NolaBridge)
    render(<FeatureActivityNotice />)
    act(() => requestQuit())
    expect(confirmQuit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '退出应用' }))
    await waitFor(() => expect(confirmQuit).toHaveBeenCalledOnce())
  })

  it('reports a failed capability once even while the other services stay running', async () => {
    const ready: ModelGatewaySnapshot = { state: 'running', address: '', port: 17860, connections: 0, activeRequests: 0, requests: [], services: {
      asr: { state: 'ready', model: 'asr', name: 'ASR' }, mt: { state: 'ready', model: 'mt', name: 'MT' }, tts: { state: 'ready', model: 'tts', name: 'TTS' },
    } }
    let receive!: (snapshot: ModelGatewaySnapshot) => void
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(store, 'getBridge').mockReturnValue({ gateway: {
      snapshot: async () => ready,
      onChanged: (callback: typeof receive) => { receive = callback; return () => undefined },
    } } as unknown as NolaBridge)
    render(<FeatureActivityNotice />)
    await act(async () => undefined)
    const failed = { ...ready, services: { ...ready.services, asr: { ...ready.services.asr, state: 'failed' as const, error: 'CUDA out of memory: private traceback' } } }
    act(() => { receive(failed); receive({ ...failed, connections: 2 }) })
    expect(notifyError).toHaveBeenCalledOnce()
    expect(notifyError).toHaveBeenCalledWith('语音识别 已停止响应', { description: '可用内存不足。请关闭其他模型或选择更小的模型后重试。' })
  })
})
