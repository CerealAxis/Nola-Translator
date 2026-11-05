import { BrowserFailure } from './bridge'
import type { AudioCapture, AudioChunk } from './capture'
import type { BrowserWireErrorCode } from '../../src/shared/browser'

export async function createTabAudioCapture(onChunk: (chunk: AudioChunk) => void, onDebug?: (event: string, data: Record<string, unknown>) => void,
  onError?: (code: BrowserWireErrorCode) => void, signal?: AbortSignal): Promise<AudioCapture> {
  if (globalThis.isSecureContext === false || location.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) throw new BrowserFailure('browserCaptureUnsupported')
  signal?.throwIfAborted()
  const port = chrome.runtime.connect({ name: 'nola-tab-audio' })
  let closed = false, ready = false
  let rejectStart!: (error: Error) => void, resolveStart!: (audio: AudioCapture) => void
  const promise = new Promise<AudioCapture>((resolve, reject) => { resolveStart = resolve; rejectStart = reject })
  const close = () => { if (closed) return; closed = true; clearTimeout(timer); signal?.removeEventListener('abort', close); try { port.disconnect() } catch { /* A lost connection is already closed. */ }; if (!ready) rejectStart(new BrowserFailure('browserCaptureCancelled')) }
  const fail = (code: BrowserWireErrorCode) => { if (closed) return; rejectStart(new BrowserFailure(code)); if (ready) onError?.(code); close() }
  const timer = setTimeout(() => fail('browserCaptureUnsupported'), 25000)
  const audio: AudioCapture = { enable(enabled, epoch) { if (!closed) port.postMessage({ type: 'gate', enabled, epoch }) }, async close() { close() } }
  port.onMessage.addListener(raw => {
    if (closed || !raw || typeof raw !== 'object') return
    const value = raw as Record<string, unknown>
    try {
      if (value.type === 'ready') { ready = true; clearTimeout(timer); resolveStart(audio) }
      else if (value.type === 'error') fail(value.code === 'browserTabCapturePermission' ? 'browserTabCapturePermission' : value.code === 'browserPermissionDenied' ? 'browserPermissionDenied' : value.code === 'browserCaptureCancelled' ? 'browserCaptureCancelled' : 'browserCaptureUnsupported')
      else if (value.type === 'debug' && typeof value.event === 'string' && value.data && typeof value.data === 'object') onDebug?.(value.event, value.data as Record<string, unknown>)
      else if (value.type === 'chunk' && ready) {
        if (typeof value.audio !== 'string' || value.audio.length > 128000 || !Number.isFinite(value.sampleRate) || Number(value.sampleRate) < 8000 || Number(value.sampleRate) > 192000 || !Number.isSafeInteger(value.epoch) || Number(value.epoch) < 0) throw new Error()
        const bytes = Uint8Array.from(atob(value.audio), character => character.charCodeAt(0))
        if (bytes.length % 2 || bytes.length > Number(value.sampleRate) * 0.4) throw new Error()
        onChunk({ buffer: bytes.buffer, sampleRate: Number(value.sampleRate), epoch: Number(value.epoch), sourcePeak: typeof value.sourcePeak === 'number' ? value.sourcePeak : undefined, workletPeak: typeof value.workletPeak === 'number' ? value.workletPeak : undefined })
      }
    } catch { fail('browserCaptureUnsupported') }
  })
  port.onDisconnect.addListener(() => { void chrome.runtime.lastError; fail('browserCaptureCancelled') })
  signal?.addEventListener('abort', close, { once: true })
  if (signal?.aborted) close()
  try { if (!closed) port.postMessage({ type: 'start' }) } catch { fail('browserCaptureUnsupported') }
  return promise
}
