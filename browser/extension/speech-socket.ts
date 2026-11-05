import type { ProviderConnection } from './providers'
import { ProviderError } from './provider-execution'

export interface SpeechSocket {
  append(audio: string): Promise<void>
  finish(): Promise<void>
  close(): void
}
type Dnr = { updateSessionRules(options: { removeRuleIds: number[]; addRules?: unknown[] }): Promise<void> }
let ruleCounter = 10000
let handshake = Promise.resolve()

export async function openAliyunSpeech(provider: ProviderConnection, capability: 'asr' | 's2s', source: string, target: string,
  emit: (event: Record<string, unknown>) => void, signal: AbortSignal): Promise<SpeechSocket> {
  signal.throwIfAborted()
  const workspace = String(provider.options.workspaceId ?? '')
  const region = String(provider.options.region ?? 'cn-beijing')
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(workspace) || !['cn-beijing', 'ap-southeast-1'].includes(region) || !provider.apiKey) throw new ProviderError('providerInvalid')
  const model = provider.model || (capability === 's2s' ? 'qwen3.8-livetranslate-flash-realtime' : 'qwen3-asr-flash-realtime')
  const url = `wss://${workspace}.${region}.maas.aliyuncs.com/api-ws/v1/realtime?model=${encodeURIComponent(model)}`
  const origin = `https://${workspace}.${region}.maas.aliyuncs.com/*`
  if (!await chrome.permissions.contains({ origins: [origin] })) throw new ProviderError('providerPermission')
  const dnr = (chrome as unknown as { declarativeNetRequest?: Dnr }).declarativeNetRequest
  if (!dnr) throw new ProviderError('providerCapability')
  const previousHandshake = handshake
  let unlock!: () => void
  handshake = new Promise<void>(resolve => { unlock = resolve })
  await previousHandshake
  if (signal.aborted) { unlock(); signal.throwIfAborted() }
  const ruleId = ++ruleCounter
  // Only this extension's exact authenticated handshake receives the stored secret.
  try { await dnr.updateSessionRules({ removeRuleIds: [ruleId], addRules: [{ id: ruleId, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'Authorization', operation: 'set', value: `Bearer ${provider.apiKey}` }] },
    condition: { regexFilter: `^${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, resourceTypes: ['websocket'], initiatorDomains: [new URL(chrome.runtime.getURL('')).hostname] },
  }] }) } catch { unlock(); throw new ProviderError('providerPermission') }
  let socket: WebSocket
  try { socket = new WebSocket(url) } catch { await dnr.updateSessionRules({ removeRuleIds: [ruleId] }); unlock(); throw new ProviderError('providerNetwork') }
  let closed = false, ready = false
  let finishResolve: (() => void) | undefined, finishReject: ((error: Error) => void) | undefined
  const removeRule = () => dnr.updateSessionRules({ removeRuleIds: [ruleId] }).catch(() => {}).finally(unlock)
  const close = () => { if (closed) return; closed = true; socket.close(); signal.removeEventListener('abort', abort); void removeRule(); finishReject?.(new ProviderError('providerDisconnected')) }
  const abort = () => close()
  signal.addEventListener('abort', abort, { once: true })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { reject(new ProviderError('providerTimeout')); close() }, 20000)
    const fail = () => { clearTimeout(timeout); reject(new ProviderError('providerNetwork')); if (ready) emit({ type: 'error', code: 'providerNetwork' }); close() }
    socket.onerror = fail
    socket.onopen = () => { void removeRule() }
    socket.onclose = () => { if (!closed) fail() }
    socket.onmessage = event => {
      let value: Record<string, unknown>
      try { if (typeof event.data !== 'string' || event.data.length > 1024 * 1024) throw new Error(); value = JSON.parse(event.data) } catch { fail(); return }
      if (value.type === 'error' || value.type === 'conversation.item.input_audio_transcription.failed') { clearTimeout(timeout); reject(new ProviderError('providerRequestFailed')); emit({ type: 'error', code: 'providerRequestFailed' }); close(); return }
      if (value.type === 'session.created') {
        const session = capability === 'asr'
          ? { input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: source === 'auto' ? {} : { language: source }, turn_detection: { type: 'server_vad', threshold: 0.2, silence_duration_ms: 800 } }
          : model.includes('3.8') ? { output_modalities: ['text'], translation: { language: target }, voice: String(provider.options.voice ?? 'Cherry') }
            : { modalities: ['text'], input_audio_format: 'pcm', sample_rate: 16000, input_audio_transcription: source === 'auto' ? {} : { language: source }, translation: { language: target }, voice: String(provider.options.voice ?? 'Cherry'), turn_detection: { type: 'server_vad', threshold: 0.2, silence_duration_ms: 800 } }
        socket.send(JSON.stringify({ type: 'session.update', event_id: crypto.randomUUID(), session }))
      } else if (value.type === 'session.updated') { clearTimeout(timeout); ready = true; resolve() }
      else if (value.type === 'session.finished') { finishResolve?.(); close() }
      else if (ready) emit(value)
    }
    signal.addEventListener('abort', () => { clearTimeout(timeout); reject(signal.reason) }, { once: true })
  }).catch(error => { close(); throw error })
  return {
    async append(audio) {
      signal.throwIfAborted()
      if (closed || socket.readyState !== WebSocket.OPEN) throw new ProviderError('providerDisconnected')
      if (socket.bufferedAmount > 1024 * 1024) throw new ProviderError('providerRateLimit')
      socket.send(JSON.stringify({ type: 'input_audio_buffer.append', event_id: crypto.randomUUID(), audio }))
    },
    finish: () => new Promise<void>((resolve, reject) => {
      if (closed) { resolve(); return }
      const timeout = setTimeout(() => { reject(new ProviderError('providerTimeout')); close() }, 10000)
      finishResolve = () => { clearTimeout(timeout); resolve() }
      finishReject = error => { clearTimeout(timeout); reject(error) }
      socket.send(JSON.stringify({ type: 'session.finish', event_id: crypto.randomUUID() }))
    }),
    close,
  }
}
