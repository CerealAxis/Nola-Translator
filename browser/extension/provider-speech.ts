import { PROVIDER_PRESETS, type ProviderConnection } from './providers'
import { ProviderError, providerFetch, readProviderJson, readProviderBytes, readProviderText } from './provider-execution'
import { encodeBase64, nativeRequest } from './native-provider'
import type { SpeechAudio } from './provider-client'

const xml = (text: string) => text.replace(/[<>&"']/g, value => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[value]!)
const defaults: Record<string, string> = { zh: 'zh-CN-XiaoxiaoNeural', en: 'en-US-AriaNeural', ja: 'ja-JP-NanamiNeural', ko: 'ko-KR-SunHiNeural', fr: 'fr-FR-DeniseNeural', de: 'de-DE-KatjaNeural', es: 'es-ES-ElviraNeural' }
let edgeToken: { token: string; region: string; expires: number } | undefined

/** The public Translator client signature authenticates the consumer token exchange. */
export async function translatorSignature(url: string, date: string, nonce: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', Uint8Array.from(atob('oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=='), c => c.charCodeAt(0)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const input = `MSTranslatorAndroidApp${encodeURIComponent(url.replace(/^https?:\/\//, ''))}${date}${nonce}`.toLowerCase()
  const signature = encodeBase64(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))))
  return `MSTranslatorAndroidApp::${signature}::${date}::${nonce}`
}

export async function edgeSpeech(text: string, language: string, voice: string, speed: number, signal: AbortSignal, pitch = 1, volume = 1): Promise<SpeechAudio> {
  if (!edgeToken || edgeToken.expires < Date.now() + 60000) {
    const url = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'
    const date = new Date().toUTCString(), nonce = crypto.randomUUID().replaceAll('-', '')
    const response = await providerFetch(url, { method: 'POST', headers: {
      'X-ClientVersion': '4.0.530a 5fe1dc6c', 'X-UserId': '0f04d16a175c411e',
      'X-HomeGeographicRegion': 'zh-Hans-CN', 'X-ClientTraceId': nonce,
      'X-MT-Signature': await translatorSignature(url, date, nonce),
      'Content-Type': 'application/json; charset=utf-8',
    } }, signal)
    const value = await readProviderJson(response, signal)
    if (typeof value.t !== 'string' || typeof value.r !== 'string' || !/^[a-z0-9-]+$/.test(value.r)) throw new ProviderError('providerInvalid')
    let expires: number
    try { expires = JSON.parse(atob(value.t.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).exp * 1000 } catch { throw new ProviderError('providerInvalid') }
    if (!Number.isFinite(expires)) throw new ProviderError('providerInvalid')
    edgeToken = { token: value.t, region: value.r, expires }
  }
  const selected = voice || defaults[language.split('-')[0]] || defaults.en
  const locale = selected.match(/^([a-z]{2,3}-[A-Z]{2})-/)?.[1] ?? 'en-US'
  const rate = `${Math.round((Math.max(0.5, Math.min(2, speed)) - 1) * 100)}%`
  const ssml = `<speak version="1.0" xml:lang="${xml(locale)}"><voice name="${xml(selected)}"><prosody rate="${rate}" pitch="${Math.round((Math.max(0.5, Math.min(2, pitch)) - 1) * 100)}%" volume="${Math.round(Math.max(0, Math.min(1, volume)) * 100)}">${xml(text)}</prosody></voice></speak>`
  const response = await providerFetch(`https://${edgeToken.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST', headers: { Authorization: `Bearer ${edgeToken.token}`, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' }, body: ssml,
  }, signal)
  const bytes = await readProviderBytes(response, 32 * 1024 * 1024, signal)
  if (!bytes.length || bytes.length > 32 * 1024 * 1024) throw new ProviderError('providerResponseSize')
  return { audioBase64: encodeBase64(bytes), contentType: 'audio/mpeg' }
}

export function pcmWav(pcm: Uint8Array, rate = 16000): Uint8Array<ArrayBuffer> {
  if (pcm.length % 2 || pcm.length > 8 * 1024 * 1024 || rate !== 16000) throw new ProviderError('providerInvalid')
  const wav = new Uint8Array(44 + pcm.length), view = new DataView(wav.buffer)
  for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) for (let i = 0; i < value.length; i++) wav[offset + i] = value.charCodeAt(i)
  view.setUint32(4, 36 + pcm.length, true); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, pcm.length, true)
  wav.set(pcm, 44)
  return wav
}

export async function transcribeWith(provider: ProviderConnection, audioBase64: string, language: string, signal: AbortSignal): Promise<string> {
  const protocol = PROVIDER_PRESETS.find(value => value.id === provider.preset)!.protocol
  if (protocol === 'native') return String((await nativeRequest({ type: 'transcribe', audio: audioBase64, sourceLanguage: language, ...(provider.model ? { model: provider.model } : {}) }, signal)).text ?? '')
  if (!['openai', 'minimax'].includes(protocol)) throw new ProviderError('providerCapability')
  if (!provider.model) throw new ProviderError('providerModel')
  const bytes = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0))
  if (bytes.length > 8 * 1024 * 1024) throw new ProviderError('providerResponseSize')
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav'); form.set('model', provider.model)
  if (protocol === 'minimax') form.set('stream', 'true')
  else if (language !== 'auto') form.set('language', language)
  const response = await providerFetch(provider.baseUrl.replace(/\/+$/, '') + (protocol === 'minimax' ? '/speech_to_text' : '/audio/transcriptions'), {
    method: 'POST', headers: { ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}), ...(protocol === 'minimax' && language !== 'auto' ? { language } : {}), ...provider.headers }, body: form,
  }, signal)
  if (protocol !== 'minimax') {
    const value = await readProviderJson(response, signal)
    if (typeof value.text !== 'string') throw new ProviderError('providerInvalid')
    return value.text
  }
  const body = await readProviderText(response, 1024 * 1024, signal)
  if (body.length > 1024 * 1024) throw new ProviderError('providerResponseSize')
  let text = ''
  const chunks = new Map<number, string>()
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:') || line.slice(5).trim() === '[DONE]') continue
    let value: Record<string, any>
    try { value = JSON.parse(line.slice(5)) } catch { throw new ProviderError('providerInvalid') }
    if (value.base_resp?.status_code) throw new ProviderError('providerRequestFailed')
    if (Number.isInteger(value.index) && typeof value.delta === 'string') { chunks.set(value.index, value.delta); text = [...chunks].sort(([a], [b]) => a - b).map(([, part]) => part).join(''); continue }
    const part = value.text ?? value.data?.text ?? value.choices?.[0]?.delta?.content
    if (typeof part === 'string') text = value.is_final ? part : text + part
  }
  return text
}

export async function miniMaxSpeech(provider: ProviderConnection, text: string, voice: string, speed: number, signal: AbortSignal, pitch = 1, volume = 1): Promise<SpeechAudio> {
  const response = await providerFetch(provider.baseUrl.replace(/\/+$/, '') + '/t2a_v2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}`, ...provider.headers },
    body: JSON.stringify({ model: provider.model || 'speech-2.8-hd', text, stream: false, output_format: 'hex',
      voice_setting: { voice_id: voice || String(provider.options.voice ?? 'English_Graceful_Lady'), speed: Math.max(0.5, Math.min(2, speed)), vol: Math.max(0.1, Math.min(10, volume)), pitch: Math.max(-12, Math.min(12, Math.round((pitch - 1) * 12))) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 } }),
  }, signal)
  const value = await readProviderJson(response, signal, 64 * 1024 * 1024 + 65536)
  if (value.base_resp?.status_code) throw new ProviderError(value.base_resp.status_code === 1004 ? 'providerAuthentication' : 'providerRequestFailed')
  const audio = value.data?.audio
  if (typeof audio !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(audio) || audio.length > 64 * 1024 * 1024) throw new ProviderError('providerInvalid')
  const bytes = new Uint8Array(audio.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(audio.slice(i * 2, i * 2 + 2), 16)
  return { audioBase64: encodeBase64(bytes), contentType: 'audio/mpeg' }
}

export async function testSpeechProvider(provider: ProviderConnection, capability: 'asr' | 's2s', signal: AbortSignal): Promise<void> {
  if (provider.preset === 'alibaba') {
    const { openAliyunSpeech } = await import('./speech-socket')
    const stream = await openAliyunSpeech(provider, capability, 'auto', 'en', () => {}, signal)
    stream.close()
  } else if (capability === 'asr') await transcribeWith(provider, encodeBase64(pcmWav(new Uint8Array(16000))), 'auto', signal)
  else throw new ProviderError('providerCapability')
}
