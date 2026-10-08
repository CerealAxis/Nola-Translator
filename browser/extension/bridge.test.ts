import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from './bridge'

function fakePort() {
  const messages = new Set<(message: unknown) => void>()
  const disconnects = new Set<(port: ChromePort) => void>()
  const port: ChromePort = { name: 'nola-captions', onMessage: { addListener: callback => { messages.add(callback) }, removeListener: callback => { messages.delete(callback) } }, onDisconnect: { addListener: callback => { disconnects.add(callback) }, removeListener: callback => { disconnects.delete(callback) } }, postMessage: vi.fn(), disconnect: vi.fn() }
  return { port, message(value: unknown) { for (const listener of messages) listener(value) }, disconnect() { for (const listener of disconnects) listener(port) } }
}
afterEach(() => vi.unstubAllGlobals())
describe('content bridge reconnection', () => {
  it('recreates a disconnected content port on retry hello and ignores stale port messages', async () => {
    const first = fakePort(); const second = fakePort()
    const connect = vi.fn().mockReturnValueOnce(first.port).mockReturnValueOnce(second.port)
    vi.stubGlobal('chrome', { runtime: { connect } })
    const bridge = createBridge(); const receive = vi.fn(); bridge.subscribe(receive)
    const initial = bridge.request({ type: 'hello' })
    const request = vi.mocked(first.port.postMessage).mock.calls[0][0] as { id: string }
    first.message({ type: 'result', id: request.id })
    await initial; first.disconnect()
    expect(receive).toHaveBeenLastCalledWith({ type: 'error', id: '*', code: 'connectionLost', message: '' })
    const retry = bridge.request({ type: 'hello' })
    expect(connect).toHaveBeenCalledTimes(2)
    const next = vi.mocked(second.port.postMessage).mock.calls[0][0] as { id: string }
    first.message({ type: 'error', id: '*', code: 'appUnavailable' })
    second.message({ type: 'result', id: next.id })
    await expect(retry).resolves.toBeUndefined()
    bridge.close()
    await expect(bridge.request({ type: 'hello' })).rejects.toThrow('connectionLost')
    expect(connect).toHaveBeenCalledTimes(2)
  })
  it('retries native-host failures over the surviving content port', async () => {
    const fixture = fakePort(); const connect = vi.fn(() => fixture.port)
    vi.stubGlobal('chrome', { runtime: { connect } })
    const bridge = createBridge()
    const failed = bridge.request({ type: 'hello' }); const rejection = expect(failed).rejects.toThrow('appUnavailable')
    fixture.message({ type: 'error', id: '*', code: 'appUnavailable', message: '' }); await rejection
    const retry = bridge.request({ type: 'hello' })
    const request = vi.mocked(fixture.port.postMessage).mock.calls[1][0] as { id: string }
    fixture.message({ type: 'result', id: request.id }); await retry
    expect(connect).toHaveBeenCalledOnce(); bridge.close()
  })
})
