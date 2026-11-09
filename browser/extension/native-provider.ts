import { BROWSER_EXTENSION_VERSION, BROWSER_HOST_NAME, BROWSER_PROTOCOL_VERSION, type BrowserResponse, type BrowserSummary } from '../../src/shared/browser'
import { BrowserFailure, createBridge, type RequestInput } from './bridge'

let translationBridge: ReturnType<typeof openTranslationBridge> | undefined

function openTranslationBridge() {
  const bridge = createBridge('native-translation', () => chrome.runtime.connectNative(BROWSER_HOST_NAME))
  let idle: ReturnType<typeof setTimeout>
  let active = 0
  const release = () => {
    clearTimeout(idle)
    if (!active) idle = setTimeout(() => {
      if (translationBridge?.bridge === bridge) translationBridge = undefined
      bridge.close()
    }, 15_000)
  }
  bridge.subscribe(message => {
    if (message.type === 'error' && message.id === '*' && translationBridge?.bridge === bridge) {
      translationBridge = undefined
      bridge.close()
    }
  })
  let handshake: Promise<BrowserSummary> | undefined
  let expiresAt = 0
  const summary = () => {
    release()
    if (!handshake || Date.now() >= expiresAt) {
      expiresAt = Infinity
      handshake = bridge.request({ type: 'hello', browser: navigator.userAgent.includes('Firefox/') ? 'firefox' : navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome' }).then(value => {
        if (!value || !('protocolVersion' in value)) throw new BrowserFailure('browserProtocolMismatch')
        expiresAt = Date.now() + 3000
        return value as BrowserSummary
      }).catch(error => {
        if (translationBridge?.bridge === bridge) translationBridge = undefined
        bridge.close()
        throw error
      })
    }
    return handshake
  }
  return { bridge, summary, async translate(request: Extract<RequestInput, { type: 'translate' }>, signal: AbortSignal) {
    clearTimeout(idle)
    active++
    try {
      const hello = await summary()
      if (request.glossary?.length && (hello.protocolVersion < 4 || !hello.features?.matchedGlossaryV1)) throw new BrowserFailure('browserProtocolMismatch')
      return await bridge.request(request, signal)
    } catch (error) {
      if (error instanceof BrowserFailure && ['browserConnectionLost', 'browserConnectionUnavailable'].includes(error.code) && translationBridge?.bridge === bridge) {
        translationBridge = undefined
        bridge.close()
      }
      throw error
    } finally { active--; release() }
  } }
}

export function nativeTranslationSummary() { return (translationBridge ??= openTranslationBridge()).summary() }

export function translateNative(request: Extract<RequestInput, { type: 'translate' }>, signal: AbortSignal) {
  return (translationBridge ??= openTranslationBridge()).translate(request, signal)
}

export async function nativeRequest(payload: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(BROWSER_HOST_NAME)
    const hello = crypto.randomUUID(), id = crypto.randomUUID()
    const chunks: Uint8Array[] = []
    let audioBytes = 0
    let done = false
    const close = () => { done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); try { port.disconnect() } catch { /* Cleanup must also settle a failed transport. */ } }
    const fail = (error: Error) => { if (!done) { close(); reject(error) } }
    const abort = () => { try { port.postMessage({ type: 'cancel', id: crypto.randomUUID(), requestId: id }) } catch { /* Disconnect still cancels the owner. */ } finally { fail(new DOMException('Aborted', 'AbortError')) } }
    const timer = setTimeout(() => fail(new Error('providerTimeout')), 180000)
    signal.addEventListener('abort', abort, { once: true })
    port.onDisconnect.addListener(() => { void chrome.runtime.lastError; fail(new Error('browserConnectionUnavailable')) })
    port.onMessage.addListener(raw => {
      if (done) return
      try {
        if (!raw || typeof raw !== 'object') throw new Error('providerInvalid')
        const message = raw as BrowserResponse
        if (message.type === 'error') { fail(new Error(message.code)); return }
        if (message.type === 'capabilityEvent' && message.id === id && message.event.type === 'audio') {
          const data = message.event.data
          if (message.event.index !== chunks.length || chunks.length >= 2048 || typeof data !== 'string' || data.length > 128000
              || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) throw new Error('providerInvalid')
          const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0))
          audioBytes += bytes.length
          if (audioBytes > 32 * 1024 * 1024) { fail(new Error('providerResponseSize')); return }
          chunks.push(bytes)
        }
        if (message.type !== 'result') return
        if (message.id === hello) {
          if (payload.type === 'hello') { close(); resolve(message.value as unknown as Record<string, unknown>); return }
          if (Array.isArray(payload.glossary) && payload.glossary.length) {
            const summary = message.value as { protocolVersion?: number; features?: { matchedGlossaryV1?: boolean } } | undefined
            if (!summary || (summary.protocolVersion ?? 0) < 4 || !summary.features?.matchedGlossaryV1) { fail(new Error('browserProtocolMismatch')); return }
          }
          port.postMessage({ ...payload, id })
        } else if (message.id === id) {
          const value = (message.value ?? {}) as Record<string, unknown>
          if ('audioChunks' in value) {
            if (value.audioChunks !== chunks.length) { fail(new Error('providerInvalid')); return }
            const combined = new Uint8Array(audioBytes)
            let offset = 0
            for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length }
            value.audioBase64 = encodeBase64(combined)
            value.contentType = typeof value.format === 'string' && value.format.startsWith('audio/') ? value.format : value.format === 'wav' ? 'audio/wav' : value.format === 'pcm' ? 'audio/pcm' : 'audio/mpeg'
          }
          close(); resolve(value)
        }
      } catch { fail(new Error('providerInvalid')) }
    })
    try { port.postMessage({ type: 'hello', id: hello, protocolVersion: BROWSER_PROTOCOL_VERSION, extensionVersion: BROWSER_EXTENSION_VERSION, browser: navigator.userAgent.includes('Firefox/') ? 'firefox' : navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome' }) }
    catch { fail(new Error('browserConnectionUnavailable')) }
  })
}
export function encodeBase64(bytes: Uint8Array): string {
  let result = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) result += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  return btoa(result)
}
