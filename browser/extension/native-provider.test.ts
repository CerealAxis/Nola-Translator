import { afterEach, expect, it, vi } from 'vitest'
import { nativeRequest, translateNative } from './native-provider'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
function fixture() {
  let receive!: (message: unknown) => void
  const postMessage = vi.fn(), disconnect = vi.fn()
  vi.stubGlobal('chrome', { runtime: { connectNative: () => ({ postMessage, disconnect,
    onMessage: { addListener: (listener: typeof receive) => { receive = listener } }, onDisconnect: { addListener: vi.fn() },
  }) } })
  const pending = nativeRequest({ type: 'synthesize', text: 'Hello' }, new AbortController().signal)
  receive({ type: 'result', id: postMessage.mock.calls[0][0].id, value: { protocolVersion: 3 } })
  const id = postMessage.mock.calls[1][0].id
  return { pending, disconnect, emit: (message: unknown) => receive(message), audio: (index: number, data: string) => receive({ type: 'capabilityEvent', id, event: { type: 'audio', index, data } }), finish: (count: number) => receive({ type: 'result', id, value: { audioChunks: count, format: 'audio/wav' } }) }
}

it('assembles validated audio chunks and keeps their advertised audio type', async () => {
  const f = fixture()
  f.audio(0, 'AQI='); f.audio(1, 'AwQ='); f.finish(2)
  await expect(f.pending).resolves.toMatchObject({ audioBase64: 'AQIDBA==', contentType: 'audio/wav' })
  expect(f.disconnect).toHaveBeenCalledOnce()
})

it('sends parallel translations through one native port and cancels only the owned request', async () => {
  vi.useFakeTimers()
  let receive!: (message: unknown) => void
  const postMessage = vi.fn(), disconnect = vi.fn()
  const connectNative = vi.fn(() => ({ postMessage, disconnect,
    onMessage: { addListener: (listener: typeof receive) => { receive = listener } }, onDisconnect: { addListener: vi.fn() },
  }))
  vi.stubGlobal('chrome', { runtime: { connectNative } })
  const cancel = new AbortController()
  const request = { type: 'translate', text: 'One', sourceLanguage: 'en', targetLanguage: 'zh' } as const
  const first = expect(translateNative(request, cancel.signal)).rejects.toThrow('canceled')
  const second = translateNative({ ...request, text: 'Two' }, new AbortController().signal)
  expect(connectNative).toHaveBeenCalledOnce()
  expect(postMessage).toHaveBeenCalledTimes(1)
  receive({ type: 'result', id: postMessage.mock.calls[0][0].id, value: { protocolVersion: 4, textTranslationConcurrency: 10 } })
  await vi.advanceTimersByTimeAsync(0)
  expect(postMessage.mock.calls.slice(1).map(([message]) => message.text)).toEqual(['One', 'Two'])
  cancel.abort(new Error('canceled'))
  expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'cancelTranslation', requestId: postMessage.mock.calls[1][0].id }))
  receive({ type: 'result', id: postMessage.mock.calls[2][0].id, value: { text: '二' } })
  await first
  await expect(second).resolves.toEqual({ text: '二' })
  await vi.advanceTimersByTimeAsync(15_000)
  expect(disconnect).toHaveBeenCalledOnce()
})

it('rejects malformed base64 and malformed event shapes without throwing out of the listener', async () => {
  const f = fixture(), rejected = expect(f.pending).rejects.toThrow('providerInvalid')
  expect(() => f.audio(0, 'bad$base64')).not.toThrow()
  await rejected
  const second = fixture(), malformed = expect(second.pending).rejects.toThrow('providerInvalid')
  expect(() => second.emit(null)).not.toThrow()
  await malformed
})

it('caps audio bytes during accumulation and disconnects before a result frame', async () => {
  const f = fixture(), rejected = expect(f.pending).rejects.toThrow('providerResponseSize')
  const data = 'A'.repeat(128000)
  for (let index = 0; index < 350; index++) f.audio(index, data)
  await rejected
  expect(f.disconnect).toHaveBeenCalledOnce()
})
