import { audio, pcmWav } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, model, voice, targetLanguage, text, base, option, apiKey, post, wav } = context
  const requestedFormat = request.output?.format
  const format = requestedFormat === 'wav' || requestedFormat === 'pcm' ? `pcm_${request.output?.sampleRate ?? 24000}`
    : requestedFormat === 'mp3' ? 'mp3_44100_128' : option('outputFormat')
  const voiceSettings = Object.fromEntries(['stability', 'similarityBoost', 'style'].filter(key => !!option(key))
    .map(key => [key === 'similarityBoost' ? 'similarity_boost' : key, Number(option(key))]))
  const response = await post(base + '/text-to-speech/' + encodeURIComponent(voice) + '?output_format=' + encodeURIComponent(format), {
    text, model_id: model.id, language_code: targetLanguage.split('-')[0],
    voice_settings: { ...voiceSettings, ...(request.controls?.speed ? { speed: request.controls.speed } : {}), use_speaker_boost: option('speakerBoost') === 'true' },
  }, { 'xi-api-key': apiKey })
  const data = Buffer.from(await response.arrayBuffer())
  if (format.startsWith('pcm_')) return audio(pcmWav(data, Number(format.slice(4))))
  const mime = format.startsWith('opus_') ? 'audio/ogg' : format.startsWith('wav_') ? 'audio/wav' : 'audio/mpeg'
  return audio(data, mime)
}
