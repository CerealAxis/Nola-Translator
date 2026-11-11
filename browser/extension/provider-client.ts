import { requestId } from './id'
import { requestProviderAccess, type Capability, type ProviderConnection } from './providers'

export type TranslationPurpose = 'web' | 'subtitle' | 'selection' | 'input' | 'document'
export interface SpeechAudio { audioBase64: string; contentType: string }
export interface ProviderResult { text?: string; audioBase64?: string; contentType?: string; message?: string; webConcurrency?: number; subtitleConcurrency?: number; desktopConcurrency?: number }
export class ProviderRequestError extends Error {
  constructor(code: string, public retryAfterMs?: number) { super(code) }
}
export function providerRequest(payload: Record<string, unknown>, signal?: AbortSignal): Promise<ProviderResult> {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'nola-provider' })
    const id = requestId()
    let finished = false
    const cleanup = () => { finished = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); try { port.disconnect() } catch { /* The background may have closed first. */ } }
    const abort = () => { try { port.postMessage({ type: 'cancel', id }) } catch { /* Cancellation can race with a disconnected background. */ } finally { cleanup(); reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')) } }
    const timer = setTimeout(() => { cleanup(); reject(new Error('providerTimeout')) }, 180000)
    port.onMessage.addListener(raw => {
      if (finished) return
      if (!raw || typeof raw !== 'object') { cleanup(); reject(new Error('providerInvalid')); return }
      const message = raw as { id?: string; error?: string; retryAfterMs?: unknown; result?: ProviderResult }
      if (message.id !== id || finished) return
      cleanup()
      if (message.error) reject(new ProviderRequestError(message.error, typeof message.retryAfterMs === 'number' && Number.isFinite(message.retryAfterMs) && message.retryAfterMs >= 0 ? message.retryAfterMs : undefined))
      else resolve(message.result ?? {})
    })
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError
      if (!finished) { cleanup(); reject(new Error('providerDisconnected')) }
    })
    signal?.addEventListener('abort', abort, { once: true })
    try { port.postMessage({ ...payload, id }) } catch { cleanup(); reject(new Error('providerDisconnected')) }
  })
}
export async function translate(text: string, sourceLanguage: string, targetLanguage: string, purpose: TranslationPurpose, signal?: AbortSignal, providerId?: string): Promise<string> {
  const result = await providerRequest({ type: 'translate', text, sourceLanguage, targetLanguage, purpose, providerId }, signal)
  if (!result.text) throw new Error('providerEmpty')
  return result.text
}
export async function generate(prompt: string, signal?: AbortSignal, providerId?: string): Promise<string> {
  const result = await providerRequest({ type: 'generate', text: prompt, providerId }, signal)
  if (!result.text) throw new Error('providerEmpty')
  return result.text
}
export async function translateImage(image: string, targetLanguage: string, signal?: AbortSignal, text?: string): Promise<string> {
  const result = await providerRequest({ type: 'translateImage', image, targetLanguage, ...(text ? { text } : {}) }, signal)
  if (!result.text) throw new Error('providerEmpty')
  return result.text
}
export async function synthesize(text: string, language: string, signal?: AbortSignal, providerId?: string): Promise<SpeechAudio> {
  const result = await providerRequest({ type: 'synthesize', text, language, providerId }, signal)
  if (!result.audioBase64 || !result.contentType) throw new Error('providerEmpty')
  return { audioBase64: result.audioBase64, contentType: result.contentType }
}
export async function testProvider(connection: ProviderConnection, capability?: Capability): Promise<string> {
  if (!await requestProviderAccess(connection)) throw new Error('providerPermission')
  const result = await providerRequest({ type: 'test', connection, capability })
  return result.message ?? 'OK'
}
export async function clearTranslationCache(): Promise<void> { await providerRequest({ type: 'clearCache' }) }
