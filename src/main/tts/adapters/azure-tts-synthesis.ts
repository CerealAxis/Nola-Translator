import { audio, pcmWav, xml } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'
import { ttsProviderLanguage } from '../../../shared/tts/compatibility'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, voice, targetLanguage, text, base, option, apiKey, http, wav } = context
  const region = option('region')
  if (!/^[a-z\d-]+$/i.test(region)) throw new Error('Invalid Azure Speech region.')
  const subscription = await http('https://' + region + '.api.cognitive.microsoft.com/sts/v1.0/issuetoken', {
    method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': apiKey },
  })
  const token = await subscription.text()
  const controls = request.controls
  const rate = controls?.speed === undefined ? option('rate') : `${(controls.speed - 1) * 100}%`
  const volume = controls?.volume === undefined ? option('volume') : `${controls.volume * 100}`
  const pitch = controls?.pitch === undefined ? '' : ` pitch="${controls.pitch >= 0 ? '+' : ''}${controls.pitch}st"`
  const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="' + xml(ttsProviderLanguage('azure-tts', targetLanguage)) + '"><voice name="' + xml(voice) +
    '"><mstts:express-as style="' + xml(option('style')) + '" role="' + xml(option('role')) + '"><prosody rate="' + xml(rate) +
    '" volume="' + xml(volume) + '"' + pitch + '>' + xml(text) + '</prosody></mstts:express-as></voice></speak>'
  const format = request.output?.format ?? 'wav'
  const response = await http(base || 'https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
    method: 'POST', body: ssml, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': format === 'mp3' ? 'audio-48khz-192kbitrate-mono-mp3' : format === 'pcm' ? 'raw-48khz-16bit-mono-pcm' : 'riff-48khz-16bit-mono-pcm' },
  })
  const data = Buffer.from(await response.arrayBuffer())
  return format === 'pcm' ? audio(pcmWav(data, 48000)) : audio(data, format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
}
