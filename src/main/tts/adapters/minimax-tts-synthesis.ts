import { audio, pcmWav } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, text, base, option, post, wav } = context
  const url = new URL(base)
  if (option('timbreWeights')) throw new Error('ttsLegacyTimbreWeightsUnsupported')
  url.searchParams.set('GroupId', option('groupId'))
  const emotion = request.controls?.emotion ?? option('emotion')
  const format = request.output?.format ?? 'wav', sampleRate = request.output?.sampleRate ?? 32000
  const response = await post(url.href, { model: model.id, text, stream: true, language_boost: 'auto',
    voice_setting: { voice_id: voice, speed: request.controls?.speed ?? Number(option('speed')), vol: request.controls?.volume ?? Number(option('volume')), pitch: request.controls?.pitch ?? Number(option('pitch')),
      ...(emotion === 'auto' ? {} : { emotion }), latex_read: option('latexRead') === 'true', english_normalization: option('englishNormalization') === 'true' },
    audio_setting: { sample_rate: sampleRate, bitrate: 128000, format },
  })
  const chunks = (await response.text()).split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]').flatMap(line => {
    const item = JSON.parse(line.slice(5))
    if (item.base_resp?.status_code) throw new Error('MiniMax rejected the synthesis request.')
    return item.data?.audio && !item.extra_info ? [Buffer.from(item.data.audio, 'hex')] : []
  })
  const data = Buffer.concat(chunks)
  return format === 'pcm' ? audio(pcmWav(data, sampleRate)) : audio(data, format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
}
