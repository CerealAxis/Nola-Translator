import { PROVIDER_PRESETS, type ProviderConnection } from './providers'
import { encodeBase64, nativeRequest, translateNative } from './native-provider'
import type { SpeechAudio } from './provider-client'
import type { GlossaryMatch, GlossaryTerm } from '../../src/shared/glossary'
import { protectGlossary } from './glossary-translation'

export class ProviderError extends Error { constructor(public code: string) { super(code) } }
const SAFE_ERRORS = new Set([
  'providerAddress', 'providerPermission', 'providerNetwork', 'providerAuthentication', 'providerRateLimit',
  'providerModel', 'providerMissing', 'providerCapability', 'providerInvalid', 'providerEmpty', 'providerResponseSize',
  'providerTimeout', 'providerDisconnected', 'providerRequestFailed', 'providerBatchFormat',
  'browserConnectionUnavailable', 'browserConnectionLost', 'browserProtocolMismatch', 'browserPermissionDenied',
  'browserAudioBacklog',
  'browserTextModelUnavailable', 'browserTranslationTimeout', 'browserTranslationRateLimited', 'browserS2sUnavailable',
  'browserS2sTargetUnsupported', 'gatewayNotRunning', 'realtimeBackendUnavailable', 'modelNotLoaded', 'modelDisabled',
  'modelUnavailable', 'modelMissing', 'invalidCredential', 'invalidConfiguration', 'resourceBusy', 'torchUnavailable',
  'llamaUnavailable', 'modelOutOfMemory', 'modelDependencyMissing', 'modelWeightsInvalid', 'translationTimeout',
  'translationNetworkUnavailable', 's2sConfigurationMissing', 's2sConnectionLost', 'lineTooLarge',
  'glossaryChanged', 'glossaryPlaceholderFailed', 'glossaryBudgetExceeded', 'browserGlossaryUnsupported',
  'nativePromptUnsupported',
  'browserGlossaryModeUnsupported',
])
export function safeProviderError(error: unknown): string {
  const code = error instanceof ProviderError ? error.code : error instanceof Error ? error.message : ''
  return SAFE_ERRORS.has(code) ? code : 'providerRequestFailed'
}

/** Bound bytes before retaining chunks; a forged or absent Content-Length cannot bypass the limit. */
export async function readProviderBytes(response: Response, limit: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted()
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) { await response.body?.cancel(); throw new ProviderError('providerResponseSize') }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    while (true) {
      const result = await reader.read()
      signal?.throwIfAborted()
      if (result.done) break
      size += result.value.byteLength
      if (size > limit) { await reader.cancel(); throw new ProviderError('providerResponseSize') }
      chunks.push(result.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (signal?.aborted) throw signal.reason
    if (error instanceof ProviderError) throw error
    throw new ProviderError('providerNetwork')
  } finally { signal?.removeEventListener('abort', abort); reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}
export async function readProviderText(response: Response, limit = 2 * 1024 * 1024, signal?: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await readProviderBytes(response, limit, signal))
}
export async function readProviderJson(response: Response, signal?: AbortSignal, limit = 2 * 1024 * 1024): Promise<any> {
  const text = await readProviderText(response, limit, signal)
  try { return JSON.parse(text) } catch { throw new ProviderError('providerInvalid') }
}
function endpoint(provider: ProviderConnection, path: string): string {
  if (!provider.baseUrl) throw new ProviderError('providerAddress')
  return provider.baseUrl.replace(/\/+$/, '') + path
}
function authorization(provider: ProviderConnection): Record<string, string> {
  return { ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}), ...provider.headers }
}
export async function providerFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted()
  const parsed = new URL(url)
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new ProviderError('providerAddress')
  const origin = `${parsed.origin}/*`
  if (!await chrome.permissions.contains({ origins: [origin] })) throw new ProviderError('providerPermission')
  let response: Response
  try { response = await fetch(url, { ...init, signal, redirect: 'error', credentials: 'omit' }) }
  catch (error) { if (signal.aborted) throw error; throw new ProviderError('providerNetwork') }
  if (!response.ok) {
    await response.body?.cancel()
    throw new ProviderError(response.status === 401 || response.status === 403 ? 'providerAuthentication' : response.status === 429 ? 'providerRateLimit' : response.status === 404 ? 'providerModel' : 'providerRequestFailed')
  }
  return response
}
async function jsonRequest(provider: ProviderConnection, path: string, body: unknown, signal: AbortSignal, headers: Record<string, string> = {}): Promise<any> {
  const response = await providerFetch(endpoint(provider, path), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorization(provider), ...headers }, body: JSON.stringify(body) }, signal)
  return readProviderJson(response, signal)
}
function output(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ProviderError('providerEmpty')
  if (value.length > 64000) throw new ProviderError('providerResponseSize')
  return value.trim()
}
export async function generateWith(provider: ProviderConnection, prompt: string, signal: AbortSignal): Promise<string> {
  const protocol = PROVIDER_PRESETS.find(p => p.id === provider.preset)!.protocol
  if (protocol === 'native') return output((await nativeRequest({ type: 'generate', messages: [{ role: 'user', content: prompt }], ...(provider.model ? { model: provider.model } : {}) }, signal)).text)
  if (!provider.model) throw new ProviderError('providerModel')
  const messages = [{ role: 'user', content: prompt }]
  const temperature = typeof provider.options.temperature === 'number' ? provider.options.temperature : 0.2
  if (protocol === 'bedrock') {
    const result = await jsonRequest(provider, `/model/${encodeURIComponent(provider.model)}/converse`, { messages: [{ role: 'user', content: [{ text: prompt }] }], inferenceConfig: { temperature, maxTokens: 8192 } }, signal)
    return output(result.output?.message?.content?.map((part: any) => part.text ?? '').join(''))
  }
  if (protocol === 'replicate') {
    const [owner, model] = provider.model.split('/')
    if (!owner || !model || provider.model.split('/').length !== 2) throw new ProviderError('providerModel')
    let result = await jsonRequest(provider, `/models/${encodeURIComponent(owner)}/${encodeURIComponent(model)}/predictions`, { input: { prompt, temperature, max_new_tokens: 8192 } }, signal, { Prefer: 'wait=60' })
    const cancel = () => { if (typeof result.id === 'string') void providerFetch(endpoint(provider, `/predictions/${encodeURIComponent(result.id)}/cancel`), { method: 'POST', headers: authorization(provider) }, AbortSignal.timeout(5000)).catch(() => undefined) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      while (result.status === 'starting' || result.status === 'processing') {
        signal.throwIfAborted()
        await new Promise(resolve => setTimeout(resolve, 1000))
        result = await readProviderJson(await providerFetch(endpoint(provider, `/predictions/${encodeURIComponent(result.id)}`), { headers: authorization(provider) }, signal), signal)
      }
      if (result.status !== 'succeeded') throw new ProviderError('providerRequestFailed')
      return output(Array.isArray(result.output) ? result.output.join('') : result.output)
    } finally { signal.removeEventListener('abort', cancel) }
  }
  if (protocol === 'anthropic') {
    const result = await jsonRequest(provider, '/messages', { model: provider.model, max_tokens: 8192, messages, temperature }, signal, { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' })
    return output(result.content?.filter((block: any) => block.type === 'text').map((block: any) => block.text).join(''))
  }
  if (protocol === 'gemini') {
    const result = await jsonRequest(provider, `/models/${encodeURIComponent(provider.model)}:generateContent`, { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature } }, signal, { 'x-goog-api-key': provider.apiKey })
    return output(result.candidates?.[0]?.content?.parts?.filter((part: any) => !part.thought).map((part: any) => part.text ?? '').join(''))
  }
  if (protocol === 'ollama') {
    const result = await jsonRequest(provider, '/api/chat', { model: provider.model, messages, stream: false, options: { temperature } }, signal)
    return output(result.message?.content)
  }
  if (protocol === 'responses') {
    const result = await jsonRequest(provider, '/responses', { model: provider.model, input: messages }, signal)
    return output(result.output_text ?? result.output?.flatMap((item: any) => item.content ?? []).filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join(''))
  }
  if (protocol === 'cohere') {
    const result = await jsonRequest(provider, '/chat', { model: provider.model, messages, temperature }, signal)
    return output(result.message?.content?.map((part: any) => part.text ?? '').join(''))
  }
  const result = await jsonRequest(provider, '/chat/completions', { model: provider.model, messages, temperature, stream: false }, signal)
  return output(result.choices?.[0]?.message?.content)
}
async function translateRaw(provider: ProviderConnection, text: string, source: string, target: string, prompt: string, signal: AbortSignal, terms: readonly GlossaryTerm[] = []): Promise<string> {
  const protocol = PROVIDER_PRESETS.find(p => p.id === provider.preset)!.protocol
  if (source === target) return text
  if (protocol === 'native') {
    const result = await translateNative({ type: 'translate', text, sourceLanguage: source, targetLanguage: target, ...(terms.length ? { glossary: [...terms] } : {}) }, signal)
    return output(result && 'text' in result ? result.text : undefined)
  }
  if (protocol === 'google-free') {
    const query = new URLSearchParams({ client: 'gtx', sl: source, tl: target, dt: 't', q: text })
    const response = await providerFetch(endpoint(provider, '/translate_a/single?') + query, {}, signal)
    const result = await readProviderJson(response, signal)
    return output(result[0]?.map((part: unknown[]) => typeof part[0] === 'string' ? part[0] : '').join(''))
  }
  if (protocol === 'microsoft-free') {
    const query = new URLSearchParams({ to: target, isEnterpriseClient: 'false', ...(source !== 'auto' ? { from: source } : {}) })
    const result = await jsonRequest(provider, '/translate/translatetext?' + query, [text], signal)
    return output(result?.[0]?.translations?.[0]?.text)
  }
  if (protocol === 'deepl') {
    const result = await jsonRequest(provider, '/v2/translate', { text: [text], target_lang: target.toUpperCase(), ...(source !== 'auto' ? { source_lang: source.toUpperCase() } : {}) }, signal, { Authorization: `DeepL-Auth-Key ${provider.apiKey}` })
    return output(result.translations?.[0]?.text)
  }
  if (protocol === 'deeplx') {
    const result = await jsonRequest(provider, '/translate', { text, source_lang: source === 'auto' ? 'auto' : source.toUpperCase(), target_lang: target.toUpperCase() }, signal)
    return output(result.data)
  }
  return generateWith(provider, prompt, signal)
}
export async function translateWith(provider: ProviderConnection, text: string, source: string, target: string, prompt: string, signal: AbortSignal, match?: GlossaryMatch): Promise<string> {
  const protocol = PROVIDER_PRESETS.find(p => p.id === provider.preset)!.protocol
  if (!match?.terms.length || protocol === 'native') return translateRaw(provider, text, source, target, prompt, signal, match?.terms)
  if (['google-free', 'microsoft-free', 'deepl', 'deeplx'].includes(protocol)) {
    const protectedText = protectGlossary(text, match)
    return protectedText.restore(await translateRaw(provider, protectedText.text, source, target, prompt, signal))
  }
  return translateRaw(provider, text, source, target, prompt, signal)
}
export async function synthesizeWith(provider: ProviderConnection, text: string, language: string, voice: string, speed: number, signal: AbortSignal, pitch = 1, volume = 1): Promise<SpeechAudio> {
  const protocol = PROVIDER_PRESETS.find(p => p.id === provider.preset)!.protocol
  if (protocol === 'native') {
    const result = await nativeRequest({ type: 'synthesize', text, ...(voice ? { voice } : {}), ...(provider.model ? { model: provider.model } : {}) }, signal)
    if (typeof result.audioBase64 !== 'string') throw new ProviderError('providerEmpty')
    return { audioBase64: result.audioBase64, contentType: String(result.contentType ?? 'audio/wav') }
  }
  if (protocol === 'edge-tts') {
    const { edgeSpeech } = await import('./provider-speech')
    return edgeSpeech(text, language, voice, speed, signal, pitch, volume)
  }
  if (protocol === 'minimax') {
    const { miniMaxSpeech } = await import('./provider-speech')
    return miniMaxSpeech(provider, text, voice, speed, signal, pitch, volume)
  }
  if (!provider.model) throw new ProviderError('providerModel')
  const response = await providerFetch(endpoint(provider, '/audio/speech'), { method: 'POST', headers: { 'Content-Type': 'application/json', ...authorization(provider) }, body: JSON.stringify({ model: provider.model, input: text, voice: voice || 'alloy', speed, response_format: 'mp3' }) }, signal)
  const bytes = await readProviderBytes(response, 32 * 1024 * 1024, signal)
  if (bytes.length > 32 * 1024 * 1024) throw new ProviderError('providerResponseSize')
  return { audioBase64: encodeBase64(bytes), contentType: response.headers.get('content-type') ?? 'audio/mpeg' }
}
