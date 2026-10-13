import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBridge } from './bridge'
import { BROWSER_EXTENSION_VERSION } from '../../src/shared/browser'

function fakePort() {
  const messages = new Set<(message: unknown) => void>()
  const disconnects = new Set<(port: ChromePort) => void>()
  const port: ChromePort = { name: 'nola-captions', onMessage: { addListener: callback => { messages.add(callback) }, removeListener: callback => { messages.delete(callback) } }, onDisconnect: { addListener: callback => { disconnects.add(callback) }, removeListener: callback => { disconnects.delete(callback) } }, postMessage: vi.fn(), disconnect: vi.fn() }
  return { port, message(value: unknown) { for (const listener of messages) listener(value) }, disconnect() { for (const listener of disconnects) listener(port) } }
}
afterEach(() => vi.unstubAllGlobals())
describe('content bridge reconnection', () => {
  it('reports the compiled content version even when the background manifest has changed', async () => {
    const fixture = fakePort()
    vi.stubGlobal('chrome', { runtime: { connect: () => fixture.port, getManifest: () => ({ version: '9.9.9' }) } })
    const bridge = createBridge(); const hello = bridge.request({ type: 'hello' })
    const request = vi.mocked(fixture.port.postMessage).mock.calls[0][0] as { id: string; extensionVersion: string }
    expect(request.extensionVersion).toBe(BROWSER_EXTENSION_VERSION)
    fixture.message({ type: 'result', id: request.id }); await hello; bridge.close()
  })
})
