import { randomUUID } from 'node:crypto'
import { audio } from './audio-utils'
import type { SpeechAdapterContext } from './speech-context'

export async function synthesize(context: SpeechAdapterContext) {
  const { request, voice, text, base, option, apiKey, post } = context
  const appid = option('appId')
  if (!appid || !voice) throw new Error('Volcengine needs an App ID and voice type.')
  const result = await (await post(base, {
    app: { appid, token: apiKey, cluster: option('cluster') }, user: { uid: randomUUID() },
    audio: { voice_type: voice, encoding: 'mp3', speed_ratio: Number(option('speed')), volume_ratio: 1, pitch_ratio: 1 },
    request: { reqid: randomUUID(), text, text_type: 'plain', operation: 'query' },
  }, { Authorization: 'Bearer;' + apiKey })).json()
  if (result.code !== 3000) throw new Error('Volcengine rejected the synthesis request.')
  return audio(result.data ?? '', 'audio/mpeg')
}
