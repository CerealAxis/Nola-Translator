import { afterEach, expect, it, vi } from 'vitest'
import { nativeRequest } from './native-provider'

afterEach(() => vi.unstubAllGlobals())
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
