import { afterEach, expect, it, vi } from 'vitest'
import { providerRequest } from './provider-client'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('rejects empty envelopes without reading an undefined message id', async () => {
  let receive!: (message: unknown) => void
  const disconnect = vi.fn()
  vi.stubGlobal('chrome', { runtime: { connect: () => ({ postMessage: vi.fn(), disconnect, onMessage: { addListener: (listener: typeof receive) => { receive = listener } }, onDisconnect: { addListener: vi.fn() } }) } })
  const pending = providerRequest({ type: 'generate', text: 'test' })
  const rejected = expect(pending).rejects.toThrow('providerInvalid')
  expect(() => receive(undefined)).not.toThrow()
  await rejected;expect(disconnect).toHaveBeenCalledOnce()
})
it('treats a disconnected cancellation as an abort instead of an unhandled listener exception', async () => {
  const postMessage = vi.fn().mockImplementationOnce(() => {}).mockImplementation(() => { throw new Error('Port disconnected') })
  vi.stubGlobal('chrome', { runtime: { connect: () => ({ postMessage, disconnect: vi.fn(), onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } }) } })
  const controller = new AbortController(), pending = providerRequest({ type: 'generate', text: 'test' }, controller.signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  controller.abort();await rejected
})

it('releases the initial request timer and port when posting races with disconnection', async () => {
  vi.useFakeTimers()
  const disconnect = vi.fn()
  vi.stubGlobal('chrome', { runtime: { connect: () => ({ postMessage: () => { throw new Error('Port disconnected') }, disconnect, onMessage: { addListener: vi.fn() }, onDisconnect: { addListener: vi.fn() } }) } })
  await expect(providerRequest({ type: 'generate', text: 'test' })).rejects.toThrow('providerDisconnected')
  expect(disconnect).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
