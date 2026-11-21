import { afterEach, expect, it, vi } from 'vitest'
import { captureDiagnostics, recordDiagnostic, setupDiagnosticsRuntime } from './diagnostics'

afterEach(() => vi.unstubAllGlobals())

it('records original compatibility and provider errors while redacting credentials', async () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  recordDiagnostic('document', new TypeError('Math.sumPrecise is not a function'))
  recordDiagnostic('document', new Error('https://example.com/private?api_key=secret Document text'))
  recordDiagnostic('document', new Error('providerNetwork'))
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(3))
  expect(sendMessage.mock.calls.map(([entry]) => entry.code)).toEqual(['Math.sumPrecise unavailable', 'Error', 'providerNetwork'])
  expect(sendMessage.mock.calls[1][0].error.message).toContain('Document text')
  expect(sendMessage.mock.calls[1][0].error.stack).toContain('diagnostics.test.ts')
  expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('api_key=secret')
})

it('does not disrupt the caller if runtime messaging throws or rejects', async () => {
  const sendMessage = vi.fn().mockImplementationOnce(() => { throw new Error('disconnected') }).mockRejectedValueOnce(new Error('disconnected'))
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  expect(() => recordDiagnostic('document', new Error('providerNetwork'))).not.toThrow()
  expect(() => recordDiagnostic('document', new Error('providerNetwork'))).not.toThrow()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
})

it('keeps original nested and aggregate errors in extension diagnostics', async () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  const cause = new Error('original provider failure api_key=private-value')
  recordDiagnostic('background', new AggregateError([cause], 'batch failed', { cause }))
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce())
  expect(sendMessage.mock.calls[0][0].error.cause.message).toBe('original provider failure api_key=[redacted]')
  expect(JSON.stringify(sendMessage.mock.calls)).not.toContain('private-value')
})

it('captures uncaught errors and unhandled rejections using bounded safe codes', async () => {
  const sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { runtime: { sendMessage } })
  captureDiagnostics('document')
  globalThis.dispatchEvent(new ErrorEvent('error', { error: new TypeError('getOrInsertComputed is not a function') }))
  const rejection = new Event('unhandledrejection')
  Object.defineProperty(rejection, 'reason', { value: new Error('providerTimeout') })
  globalThis.dispatchEvent(rejection)
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  expect(sendMessage.mock.calls.map(([entry]) => [entry.event, entry.code])).toEqual([
    ['error', 'Map.getOrInsertComputed unavailable'],
    ['unhandled-rejection', 'providerTimeout'],
  ])
})

it('persists normalized compatibility codes only for extension senders', async () => {
  const add = vi.fn()
  const store = { add, count: () => ({ result: 1 }) }
  const db = {
    transaction: () => {
      const tx = { objectStore: () => store, oncomplete: () => {} }
      queueMicrotask(() => tx.oncomplete())
      return tx
    },
    close: vi.fn(),
  }
  vi.stubGlobal('indexedDB', { open: () => {
    const request = { result: db, onsuccess: () => {} }
    queueMicrotask(() => request.onsuccess())
    return request
  } })
  const addListener = vi.fn()
  vi.stubGlobal('chrome', { runtime: { id: 'extension', onMessage: { addListener }, getManifest: () => ({ version: '2.0.3' }) } })
  setupDiagnosticsRuntime()
  const listener = addListener.mock.calls[0][0]
  const message = { type: 'nolaDiagnostic', context: 'document', event: 'error', code: 'Math.sumPrecise unavailable' }
  listener(message, { id: 'other-extension' }, vi.fn())
  expect(add).not.toHaveBeenCalled()
  listener(message, { id: 'extension' }, vi.fn())
  await vi.waitFor(() => expect(add).toHaveBeenCalledOnce())
  expect(add).toHaveBeenCalledWith(expect.objectContaining({ code: 'Math.sumPrecise unavailable', version: '2.0.3' }))
  listener({ ...message, code: 'audioCaptureStartFailed', supportCode: 'IGNORED' }, { id: 'extension' }, vi.fn())
  await vi.waitFor(() => expect(add).toHaveBeenCalledTimes(2))
  expect(add).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'audioCaptureStartFailed', supportCode: 'AUD-009' }))
})
