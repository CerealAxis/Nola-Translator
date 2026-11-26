import { cloudModelError } from '../../cloud-model-tools'
import { audio, pcmWav } from './audio-utils'
import { mimoSynthesisPayload } from './mimo'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, base, option, post, wav } = context
  const style = [option('style'), option('dialect')].filter(Boolean).join(' ')
  const payload = mimoSynthesisPayload(request, model.id, voice, {
    format: option('format'), instruction: option('seedText').trim(), style,
  })
  const format = payload.audio.format
  const result = await (await post(base.endsWith('/chat/completions') ? base : base + '/chat/completions', payload)).json()
  const data = result.choices?.[0]?.message?.audio?.data
  if (typeof data !== 'string' || !data) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'The cloud service returned no audio.')
  if (format === 'pcm' || format === 'pcm16') return audio(pcmWav(Buffer.from(data, 'base64'), 24000))
  return audio(data, format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
}
