import { encode } from '@msgpack/msgpack'
import { audio, pcmWav } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, text, targetLanguage, base, bearer, http, condition } = context
  const headers = { ...bearer, model: model.id }
  const referenceId = voice
  const referenceAudio = condition?.kind === 'reference-audio' ? request.audio?.split(',', 2)[1] : undefined
  if (!referenceAudio && !referenceId) throw new Error('FishAudio voice is required.')
  const format = request.output?.format ?? 'wav'
  const response = await http(base + '/tts', { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/msgpack' },
    body: new Uint8Array(encode({ text: request.controls?.emotion ? `[${request.controls.emotion}]${text}` : text,
      language: targetLanguage === 'auto' ? undefined : targetLanguage, format, ...(referenceAudio && condition?.kind === 'reference-audio'
      ? { references: [{ audio: new Uint8Array(Buffer.from(referenceAudio, 'base64')), text: condition.transcript ?? '' }] }
      : { reference_id: referenceId }),
      ...(request.output?.sampleRate ? { sample_rate: request.output.sampleRate } : {}),
      ...(request.controls ? { prosody: { speed: request.controls.speed ?? 1, volume: request.controls.volume === undefined ? 0 : 20 * Math.log10(Math.max(request.controls.volume, 0.0001)) } } : {}),
    })),
  })
  const data = Buffer.from(await response.arrayBuffer())
  return format === 'pcm' ? audio(pcmWav(data, request.output?.sampleRate ?? 44100)) : audio(data, format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
}
