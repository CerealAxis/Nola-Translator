import { randomUUID } from 'node:crypto'
import { buffer } from 'node:stream/consumers'
import { encode } from '@msgpack/msgpack'
import { WebSocket } from 'ws'
import type { DirectModelRequest, DirectModelResult } from '../shared/agent-workspace'
import { astrBotSpeechPreset } from '../shared/astrbot-speech-presets'
import type { WorkspaceConnection } from '../shared/model-workspace'
import { cloudModelError, cloudModelHttpError } from './cloud-model-tools'

function audio(data: Buffer | string, mime = 'audio/wav'): DirectModelResult {
  const encoded = typeof data === 'string' ? data : data.toString('base64')
  if (!encoded) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'The cloud service returned no audio.')
  return { text: '', audio: 'data:' + mime + ';base64,' + encoded }
}

function pcmWav(data: Buffer, rate: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0); header.writeUInt32LE(data.length + 36, 4)
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
  header.write('data', 36); header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

function xml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function cosyVoice(endpoint: string, model: string, voice: string, text: string, apiKey: string, signal: AbortSignal): Promise<Buffer> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, {
      headers: { Authorization: 'Bearer ' + apiKey }, maxPayload: 4 * 1024 * 1024,
    })
    const task = randomUUID()
    const chunks: Buffer[] = []
    let size = 0
    const send = (action: string, payload: object) => socket.send(JSON.stringify({
      header: { action, task_id: task, streaming: 'duplex' }, payload,
    }))
    let settled = false
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', cancel)
      if (error) { reject(error); socket.terminate() }
      else { resolve(Buffer.concat(chunks)); socket.close() }
    }
    const cancel = () => finish(signal.reason)
    signal.addEventListener('abort', cancel, { once: true })
    socket.once('error', () => finish(new Error('DashScope WebSocket request failed.')))
    socket.once('close', () => finish(new Error('DashScope closed the WebSocket before completing synthesis.')))
    socket.once('open', () => send('run-task', {
      task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer', model,
      parameters: { text_type: 'PlainText', voice, format: 'wav', sample_rate: 24000 }, input: {},
    }))
    socket.on('message', (data, binary) => {
      try {
        if (binary) {
          const chunk = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data)
          size += chunk.length
          if (size > 32 * 1024 * 1024) throw new Error('DashScope response is too large.')
          chunks.push(chunk)
          return
        }
        const header = JSON.parse(data.toString()).header
        if (header?.task_id !== task) return
        if (header.event === 'task-started') {
          send('continue-task', { input: { text } })
          send('finish-task', { input: {} })
        } else if (header.event === 'task-finished') finish()
        else if (header.event === 'task-failed') finish(new Error('DashScope rejected the synthesis request.'))
      } catch (error) { finish(error) }
    })
  })
}

export async function inferAstrBotSpeech(connection: WorkspaceConnection, request: DirectModelRequest, apiKey: string, cancellation: AbortSignal, model = connection.models[0]): Promise<DirectModelResult> {
  const preset = astrBotSpeechPreset(connection.service)
  if (!preset || !model?.enabled) throw new Error('The cloud speech configuration is incomplete.')
  if (!apiKey && !preset.keyless) throw cloudModelError('CLOUD_MODEL_KEY_REQUIRED')
  const signal = AbortSignal.any([cancellation, AbortSignal.timeout(20_000)])
  const base = (connection.endpoint || preset.endpoint || preset.fallback || '').replace(/\/+$/, '')
  const option = (key: string) => connection.options?.[key] ?? preset.fields?.[key] ?? ''
  const voice = request.voice || model.voice || preset.voice || ''
  const text = request.text ?? ''
  const bearer = { Authorization: 'Bearer ' + apiKey }
  const http = async (url: string, init: RequestInit) => {
    const response = await fetch(url, { ...init, signal, redirect: 'error' })
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
    case 'openai-tts-api':
      return wav(await post(base + '/audio/speech', {
        model: model.id, input: text, voice: voice.startsWith('voice_') ? { id: voice } : voice, response_format: 'wav',
      }))
    case 'mimo': {
      const style = [option('style'), option('dialect')].filter(Boolean).join(' ')
      const prefix = style ? '<style>' + (style.includes('唱歌') ? '唱歌' : style) + '</style>' : ''
      const seed = option('seedText').trim()
      const format = option('format')
      if (!['wav', 'mp3', 'pcm'].includes(format)) throw new Error('MiMo audio format must be wav, mp3 or pcm.')
      const messages = [...(seed ? [{ role: 'user', content: seed }] : []), { role: 'assistant', content: prefix + text }]
      const result = await (await post(base.endsWith('/chat/completions') ? base : base + '/chat/completions', {
        model: model.id, messages, audio: { format, ...(!model.id.includes('voicedesign') ? { voice } : {}) },
      })).json()
      const data = result.choices?.[0]?.message?.audio?.data
      if (typeof data !== 'string' || !data) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'The cloud service returned no audio.')
      if (format === 'pcm') return audio(pcmWav(Buffer.from(data, 'base64'), 24000))
      return audio(data, format === 'mp3' ? 'audio/mpeg' : 'audio/wav')
    }
    case 'edge-tts': {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
      signal.throwIfAborted()
      const edge = new MsEdgeTTS({ connectionTimeoutMs: 10_000, synthesisTimeoutMs: 20_000 })
      const close = () => edge.close()
      signal.addEventListener('abort', close, { once: true })
      try {
        await edge.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
        signal.throwIfAborted()
        const { audioStream } = edge.toStream(xml(text), { rate: option('rate'), volume: option('volume'), pitch: option('pitch') })
        return audio(await buffer(audioStream), 'audio/mpeg')
      } finally { signal.removeEventListener('abort', close); close() }
    }
    case 'fishaudio-tts': {
      const headers = { ...bearer, model: model.id }
      let referenceId = voice
      if (!referenceId) {
        for (const sort of ['score', 'task_count', 'created_at']) {
          const query = new URLSearchParams({ title: option('character'), sort_by: sort })
          const result = await (await http(base.replace(/\/v1$/, '') + '/model?' + query, { headers })).json()
          const match = result.items?.find((item: { title?: string }) => item.title?.includes(option('character')))
          if (match?._id) { referenceId = match._id; break }
        }
        if (!referenceId) throw new Error('FishAudio voice not found.')
      }
      if (!/^[a-f\d]{32}$/i.test(referenceId)) throw new Error('FishAudio needs a valid reference ID.')
      return wav(await http(base + '/tts', { method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/msgpack' },
        body: new Uint8Array(encode({ text, format: 'wav', reference_id: referenceId })),
      }))
    }
    case 'dashscope-tts': {
      if (!/^qwen.*tts/i.test(model.id)) {
        return audio(await cosyVoice(base || 'wss://dashscope.aliyuncs.com/api-ws/v1/inference', model.id, voice, text, apiKey, signal))
      }
      const result = await (await post(base || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
        model: model.id, input: { text, voice: voice || 'Cherry' },
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
    case 'azure-tts': {
      const region = option('region')
      if (!/^[a-z\d-]+$/i.test(region)) throw new Error('Invalid Azure Speech region.')
      const subscription = await http('https://' + region + '.api.cognitive.microsoft.com/sts/v1.0/issuetoken', {
        method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': apiKey },
      })
      const token = await subscription.text()
      const ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="zh-CN"><voice name="' + xml(voice) +
        '"><mstts:express-as style="' + xml(option('style')) + '" role="' + xml(option('role')) + '"><prosody rate="' + xml(option('rate')) +
        '" volume="' + xml(option('volume')) + '">' + xml(text) + '</prosody></mstts:express-as></voice></speak>'
      return wav(await http(base || 'https://' + region + '.tts.speech.microsoft.com/cognitiveservices/v1', {
        method: 'POST', body: ssml, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'riff-48khz-16bit-mono-pcm' },
      }))
    }
    case 'minimax-tts': {
      const url = new URL(base)
      url.searchParams.set('GroupId', option('groupId'))
      const weights = option('timbreWeights')
      const emotion = option('emotion')
      const response = await post(url.href, { model: model.id, text, stream: true, language_boost: option('languageBoost'),
        voice_setting: { voice_id: weights ? '' : voice, speed: Number(option('speed')), vol: Number(option('volume')), pitch: Number(option('pitch')),
          ...(emotion === 'auto' ? {} : { emotion }), latex_read: option('latexRead') === 'true', english_normalization: option('englishNormalization') === 'true' },
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'wav' },
        ...(weights ? { timbre_weights: JSON.parse(weights) } : {}),
      })
      const chunks = (await response.text()).split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim() !== '[DONE]').flatMap(line => {
        const item = JSON.parse(line.slice(5))
        if (item.base_resp?.status_code) throw new Error('MiniMax rejected the synthesis request.')
        return item.data?.audio && !item.extra_info ? [Buffer.from(item.data.audio, 'hex')] : []
      })
      return audio(Buffer.concat(chunks))
    }
    case 'volcengine-tts': {
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
    case 'gemini-tts': {
      const api = /\/v1(?:beta|alpha)?$/.test(base) ? base : base + '/v1beta'
      const result = await (await post(api + '/models/' + encodeURIComponent(model.id) + ':generateContent', {
        contents: [{ parts: [{ text: option('prefix') + text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }, { 'x-goog-api-key': apiKey })).json()
      const part = result.candidates?.[0]?.content?.parts?.find((item: { inlineData?: object }) => item.inlineData)?.inlineData
      const data = Buffer.from(part?.data ?? '', 'base64')
      if (!data.length) throw cloudModelError('CLOUD_MODEL_NO_AUDIO', 'Gemini returned no audio.')
      const rate = Number(/rate=(\d+)/i.exec(part.mimeType ?? '')?.[1] ?? 24000)
      return audio(data.toString('ascii', 0, 4) === 'RIFF' ? data : pcmWav(data, rate))
    }
    case 'elevenlabs-tts': {
      const format = option('outputFormat')
      const voiceSettings = Object.fromEntries(['stability', 'similarityBoost', 'style'].filter(key => !!option(key))
        .map(key => [key === 'similarityBoost' ? 'similarity_boost' : key, Number(option(key))]))
      const response = await post(base + '/text-to-speech/' + encodeURIComponent(voice) + '?output_format=' + encodeURIComponent(format), {
        text, model_id: model.id, voice_settings: { ...voiceSettings, use_speaker_boost: option('speakerBoost') === 'true' },
      }, { 'xi-api-key': apiKey })
      const data = Buffer.from(await response.arrayBuffer())
      if (format.startsWith('pcm_')) return audio(pcmWav(data, Number(format.slice(4))))
      const mime = format.startsWith('opus_') ? 'audio/ogg' : format.startsWith('wav_') ? 'audio/wav' : 'audio/mpeg'
      return audio(data, mime)
    }
  }
}
