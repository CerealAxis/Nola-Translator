import { cloudModelError } from '../../cloud-model-tools'
import { audio, pcmWav } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, text, base, option, apiKey, post } = context
  const api = /\/v1(?:beta|alpha)?$/.test(base) ? base : base + '/v1beta'
  const result = await (await post(api + '/models/' + encodeURIComponent(model.id) + ':generateContent', {
    contents: [{ parts: [{ text: (request.controls?.instruct ? request.controls.instruct + '\n' : option('prefix')) + text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  }, { 'x-goog-api-key': apiKey })).json()
  const part = result.candidates?.[0]?.content?.parts?.find((item: { inlineData?: object }) => item.inlineData)?.inlineData
  const data = Buffer.from(part?.data ?? '', 'base64')
  if (!data.length) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'Gemini returned no audio.')
  const rate = Number(/rate=(\d+)/i.exec(part.mimeType ?? '')?.[1] ?? 24000)
  return audio(data.toString('ascii', 0, 4) === 'RIFF' ? data : pcmWav(data, rate))
}
