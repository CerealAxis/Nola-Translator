import { BROWSER_EXTENSION_VERSION, type BrowserRequest, type BrowserResponse, type BrowserWireErrorCode } from '../../src/shared/browser'

export type RequestInput = BrowserRequest extends infer T ? T extends BrowserRequest ? Omit<T, 'id'> : never : never
export interface ExtensionBridge {
  request(request: RequestInput): Promise<Extract<BrowserResponse, { type: 'result' }>['value']>
  subscribe(listener: (response: BrowserResponse) => void): () => void
  close(): void
}
export class BrowserFailure extends Error {
  constructor(public code: BrowserWireErrorCode) { super(code) }
}
const LEGACY_ERROR_CODES: Readonly<Record<string, BrowserWireErrorCode>> = {
  connectionLost: 'browserConnectionLost',
  appUnavailable: 'browserConnectionUnavailable',
  slowAudio: 'browserAudioBacklog',
}
function browserErrorCode(code: string): BrowserWireErrorCode {
  return LEGACY_ERROR_CODES[code] ?? code as BrowserWireErrorCode
}
export function createBridge(name = 'nola-captions'): ExtensionBridge {
  let port: ChromePort | null = null
  const pending = new Map<string, { resolve: (value: Extract<BrowserResponse, { type: 'result' }>['value']) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>()
  const listeners = new Set<(response: BrowserResponse) => void>()
  let disposed = false
  const rejectAll = (code: BrowserWireErrorCode): void => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new BrowserFailure(code)) }
    pending.clear()
  }
  const connect = (): ChromePort => {
    const connected = chrome.runtime.connect({ name })
    port = connected
    connected.onMessage.addListener(message => {
      if (port !== connected) return
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      const response = message as BrowserResponse
      if (response.type === 'error' && response.id === '*') rejectAll(browserErrorCode(response.code))
      else if (response.type === 'result' || response.type === 'error') {
        const request = pending.get(response.id)
        if (request) {
          clearTimeout(request.timer); pending.delete(response.id)
          if (response.type === 'error') request.reject(new BrowserFailure(browserErrorCode(response.code)))
          else request.resolve(response.value)
        }
      }
      for (const listener of listeners) listener(response)
    })
    connected.onDisconnect.addListener(() => {
      void chrome.runtime.lastError
      if (port !== connected || disposed) return
      port = null; rejectAll('browserConnectionLost')
      for (const listener of listeners) listener({ type: 'error', id: '*', code: 'browserConnectionLost', message: '' })
    })
    return connected
  }
  return {
    request(input) {
      if (disposed) return Promise.reject(new BrowserFailure('browserConnectionLost'))
      // Retry hello creates a fresh content port after a service-worker/content disconnect.
      if (!port && input.type !== 'hello') return Promise.reject(new BrowserFailure('browserConnectionLost'))
      const id = crypto.randomUUID()
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new BrowserFailure(input.type === 'audio' ? 'browserAudioBacklog' : 'browserConnectionUnavailable')) }, input.type === 'start' ? 180000 : input.type === 'audio' ? 2000 : input.type === 'finish' ? 11000 : 10000)
        pending.set(id, { resolve, reject, timer })
        // Compile the content bundle's release into hello: getManifest() can already describe a
        // reloaded background while an old page still runs its previous content script.
        try { (port ?? connect()).postMessage({ ...input, ...(input.type === 'hello' ? { extensionVersion: BROWSER_EXTENSION_VERSION } : {}), id }) } catch { port = null; clearTimeout(timer); pending.delete(id); reject(new BrowserFailure('browserConnectionUnavailable')) }
      })
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    close() { disposed = true; rejectAll('browserConnectionLost'); listeners.clear(); port?.disconnect(); port = null },
  }
}
