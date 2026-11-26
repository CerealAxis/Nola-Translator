import { audio, pcmWav } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, text, base, post, wav, condition } = context
  const response = await post(base + '/audio/speech', {
    model: model.id, input: text, voice: condition?.kind === 'provider-voice' ? { id: voice } : voice, response_format: request.output?.format ?? 'wav',
    ...(request.controls?.instruct ? { instructions: request.controls.instruct } : {}),
    ...(request.controls?.speed ? { speed: request.controls.speed } : {}),
  })
  const data = Buffer.from(await response.arrayBuffer())
  return request.output?.format === 'pcm' ? audio(pcmWav(data, 24000))
    : audio(data, request.output?.format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
}
