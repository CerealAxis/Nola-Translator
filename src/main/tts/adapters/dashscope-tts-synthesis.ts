import { cloudModelError } from '../../cloud-model-tools'
import { audio, cosyVoice } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { model, voice, targetLanguage, text, base, apiKey, signal, http, post, wav } = context
  if (model.id.startsWith('qwen-audio-') || base.includes('.maas.aliyuncs.com')) {
    if (!base.startsWith('https://')) throw new Error('dashscopeWorkspaceEndpointRequired')
    const endpoint = new URL('/api/v1/services/audio/tts/SpeechSynthesizer', base).href
    return wav(await post(endpoint, { model: model.id, input: { text, voice },
      parameters: { format: 'wav', sample_rate: 24000 } }))
  }
  if (model.id.includes('-realtime')) throw new Error('dashscopeRealtimeAdapterRequired')
  if (!/^qwen.*tts/i.test(model.id)) {
    return audio(await cosyVoice(base || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', model.id, voice, text, apiKey, signal))
  }
  const result = await (await post(base || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
    model: model.id, input: { text, voice: voice || 'Cherry', language_type: targetLanguage.split('-')[0] === 'zh' ? 'Chinese'
      : ({ en: 'English', ja: 'Japanese', ko: 'Korean', de: 'German', fr: 'French', ru: 'Russian', pt: 'Portuguese', es: 'Spanish', it: 'Italian' } as Record<string, string>)[targetLanguage.split('-')[0]] },
  })).json()
  const output = result.output?.audio
  if (output?.data) return audio(output.data)
  if (!output?.url) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'DashScope returned no audio.')
  const url = new URL(output.url)
  if (url.protocol !== 'https:' || !/\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(url.hostname)) {
    throw new Error('DashScope returned an invalid audio URL.')
  }
  return wav(await http(url.href, {}))
}
