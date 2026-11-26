import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { astrBotSpeechPreset } from '../shared/astrbot-speech-presets'
import type { WorkspaceConnection } from '../shared/model-workspace'
import { cloudModelError, cloudModelHttpError, cloudModelProbeError } from './cloud-model-tools'
import { audio } from './tts/adapters/audio-utils'
import { synthesizeSpeech } from './tts/adapters/speech-dispatch'
import { presetVoiceId } from '../shared/tts/settings-migration'

export async function inferAstrBotSpeech(connection: WorkspaceConnection, request: DirectModelRequest, apiKey: string, cancellation: AbortSignal, model = connection.models[0]): Promise<DirectModelResult> {
  const preset = astrBotSpeechPreset(connection.service)
  if (!preset || !model?.enabled) throw new Error('The cloud speech configuration is incomplete.')
  if (!apiKey && !preset.keyless) throw cloudModelError('CLOUD_MODEL_KEY_REQUIRED')
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(20_000)])
  const base = (connection.endpoint || preset.endpoint || preset.fallback || '').replace(/\/+$/, '')
  const option = (key: string) => connection.options?.[key] ?? preset.fields?.[key] ?? ''
  const condition = request.conditioning
  const voice = condition?.kind === 'preset' || condition?.kind === 'provider-voice' ? condition.voiceId
    : condition ? '' : request.voice || presetVoiceId(model.tts?.defaultVoiceRef) || preset.voice || ''
  const targetLanguage = request.target || 'zh-CN'
  const text = request.text ?? ''
  const bearer = { Authorization: 'Bearer ' + apiKey }
  const http = async (url: string, init: RequestInit) => {
    let response: Response
    try { response = await fetch(url, { ...init, signal, redirect: 'error' }) }
    catch (error) { throw cloudModelProbeError(error, signal) }
    if (!response.ok) throw cloudModelHttpError(response.status, Boolean(apiKey))
    return response
  }
  const post = (url: string, body: unknown, headers: Record<string, string> = bearer) =>
    http(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  const wav = async (response: Response) => audio(Buffer.from(await response.arrayBuffer()))
  const sound = request.audio ?? ''
  const audioBase64 = sound.replace(/^data:audio\/wav;base64,/, '')

  switch (preset.id) {
    case 'whisper-api': {
      if (!audioBase64) throw new Error('Audio is required.')
      const form = new FormData()
      form.set('model', model.id)
      form.set('file', new Blob([new Uint8Array(Buffer.from(audioBase64, 'base64'))], { type: 'audio/wav' }), 'audio.wav')
      const result = await (await http(base + '/audio/transcriptions', { method: 'POST', body: form, headers: bearer })).json()
      if (typeof result.text !== 'string') throw new Error('Invalid Whisper response.')
      return { text: result.text.trim() }
    }
    case 'mimo-stt-api': {
      if (!audioBase64) throw new Error('Audio is required.')
      const content = [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,' + audioBase64 } }]
      const parts = model.id.includes('asr') ? content : [...content, { type: 'text', text: 'Transcribe the audio verbatim.' }]
      const result = await (await post(base + '/chat/completions', { model: model.id, messages: [{ role: 'user', content: parts }], max_completion_tokens: 1024 })).json()
      const message = result.choices?.[0]?.message
      const transcript = message?.content || message?.reasoning_content
      if (typeof transcript !== 'string') throw new Error('Invalid MiMo STT response.')
      return { text: transcript.trim() }
    }
  }
  return synthesizeSpeech(preset.id, { request, model, voice, targetLanguage, text, base, option, apiKey, signal, bearer, http, post, wav, condition })
}
