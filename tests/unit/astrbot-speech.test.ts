import { EventEmitter } from 'node:events'
import { decode } from '@msgpack/msgpack'
import { afterEach, expect, it, vi } from 'vitest'
import type { DirectModelRequest } from '../../src/shared/agent-workspace'
import { astrBotSpeechPresets, type AstrBotSpeechService } from '../../src/shared/astrbot-speech-presets'
import type { WorkspaceConnection } from '../../src/shared/model-workspace'
import { inferAstrBotSpeech } from '../../src/main/astrbot-speech'

vi.mock('msedge-tts', async () => {
  const { Readable } = await import('node:stream')
  return {
    OUTPUT_FORMAT: { AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'mp3' },
    MsEdgeTTS: class {
      async setMetadata() {}
      toStream() { return { audioStream: Readable.from([Buffer.from('mp3')]) } }
      close() {}
    },
  }
})

vi.mock('ws', () => ({
  WebSocket: class extends EventEmitter {
    constructor() {
      super()
      queueMicrotask(() => this.emit('open'))
    }
    send(message: string) {
      const { header } = JSON.parse(message)
      const event = (name: string) => this.emit('message', Buffer.from(JSON.stringify({
        header: { event: name, task_id: header.task_id },
      })), false)
      if (header.action === 'run-task') queueMicrotask(() => event('task-started'))
      if (header.action === 'finish-task') queueMicrotask(() => {
        this.emit('message', Buffer.from('RIFF'), true)
        event('task-finished')
      })
    }
    close() {}
    terminate() {}
  },
}))

function presetConnection(id: AstrBotSpeechService): WorkspaceConnection {
  const preset = astrBotSpeechPresets.find(item => item.id === id)!
  return { id, service: preset.id, capability: preset.capability, name: preset.name,
    endpoint: preset.endpoint, protocol: 'chat-completions', workspace: '', region: '',
    models: [{ id: preset.model, name: preset.model, enabled: true, ...('voice' in preset ? { voice: preset.voice } : {}) }] }
}

async function infer(id: AstrBotSpeechService, connection = presetConnection(id)) {
  const request = { id: crypto.randomUUID(), kind: connection.capability.toLowerCase(), model: 'cloud:' + id, text: 'Hello & world',
    audio: 'data:audio/wav;base64,UklGRg==' } as DirectModelRequest
  return inferAstrBotSpeech(connection, request, id === 'edge-tts' ? '' : 'test-key', new AbortController().signal)
}

afterEach(() => vi.unstubAllGlobals())

it('transcribes with Whisper multipart and MiMo chat audio input', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ text: 'Whisper transcript' }))
    .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'MiMo transcript' } }] }))
  vi.stubGlobal('fetch', fetch)
  await expect(infer('whisper-api')).resolves.toEqual({ text: 'Whisper transcript' })
  await expect(infer('mimo-stt-api')).resolves.toEqual({ text: 'MiMo transcript' })
  const [whisperUrl, whisperInit] = fetch.mock.calls[0]
  expect(whisperUrl).toBe('https://api.openai.com/v1/audio/transcriptions')
  const form = whisperInit?.body as FormData
  expect(form.get('model')).toBe('whisper-1')
  expect(form.get('file')).toMatchObject({ name: 'audio.wav', type: 'audio/wav' })
  const [mimoUrl, mimoInit] = fetch.mock.calls[1]
  expect(mimoUrl).toBe('https://api.xiaomimimo.com/v1/chat/completions')
  expect(JSON.parse(mimoInit!.body as string)).toMatchObject({
    model: 'mimo-v2.5-asr', messages: [{ content: [{ type: 'input_audio', input_audio: { data: 'data:audio/wav;base64,UklGRg==' } }] }],
  })
})

it.each([
  ['openai-tts-api', '/audio/speech', () => new Response('RIFF'), 'audio/wav'],
  ['mimo', '/chat/completions', () => Response.json({ choices: [{ message: { audio: { data: 'UklGRg==' } } }] }), 'audio/wav'],
  ['fishaudio-tts', '/tts', () => new Response('RIFF'), 'audio/wav'],
  ['minimax-tts', '/t2a_v2', () => new Response('data: {"data":{"audio":"52494646"}}\n\n'), 'audio/wav'],
  ['volcengine-tts', '/tts', () => Response.json({ code: 3000, data: 'bXAz' }), 'audio/mpeg'],
  ['gemini-tts', ':generateContent', () => Response.json({ candidates: [{ content: { parts: [{ inlineData: { data: 'AAAAAA==', mimeType: 'audio/L16;rate=24000' } }] } }] }), 'audio/wav'],
  ['elevenlabs-tts', '/text-to-speech/', () => new Response('mp3'), 'audio/mpeg'],
] as const)('synthesizes with %s using the provider endpoint and result format', async (id, path, response, mime) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(response())
  vi.stubGlobal('fetch', fetch)
  const connection = presetConnection(id)
  if (id === 'fishaudio-tts') connection.models[0].voice = 'a'.repeat(32)
  if (id === 'volcengine-tts') {
    connection.models[0].voice = 'voice-id'
    connection.options = { appId: 'test-app' }
  }
  await expect(infer(id, connection)).resolves.toMatchObject({ audio: expect.stringContaining('data:' + mime + ';base64,') })
  expect(fetch).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(path), expect.objectContaining({ method: 'POST', redirect: 'error' }))
  if (id === 'fishaudio-tts') expect(decode(fetch.mock.calls[0][1]!.body as Uint8Array)).toMatchObject({ reference_id: 'a'.repeat(32), format: 'wav' })
})

it('exchanges the Azure Speech key for a token and sends escaped SSML', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response('speech-token')).mockResolvedValueOnce(new Response('RIFF'))
  vi.stubGlobal('fetch', fetch)
  await expect(infer('azure-tts')).resolves.toMatchObject({ audio: 'data:audio/wav;base64,UklGRg==' })
  expect(fetch.mock.calls[0][0]).toBe('https://eastus.api.cognitive.microsoft.com/sts/v1.0/issuetoken')
  expect(fetch.mock.calls[1][1]).toMatchObject({
    headers: { Authorization: 'Bearer speech-token' }, body: expect.stringContaining('Hello &amp; world'),
  })
})

it('collects Edge and DashScope audio over their own WebSocket transports', async () => {
  await expect(infer('edge-tts')).resolves.toMatchObject({ audio: 'data:audio/mpeg;base64,bXAz' })
  await expect(infer('dashscope-tts')).resolves.toMatchObject({ audio: 'data:audio/wav;base64,UklGRg==' })
})

it('does not return a successful empty audio result or include upstream error bodies', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response('secret', { status: 401 }))
    .mockResolvedValueOnce(Response.json({ choices: [] }))
  vi.stubGlobal('fetch', fetch)
  await expect(infer('openai-tts-api')).rejects.toThrow('returned HTTP 401')
  await expect(infer('mimo')).rejects.toThrow('returned no audio')
})

it('wraps MiMo PCM in a 24 kHz mono WAV for playback', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json({
    choices: [{ message: { audio: { data: 'AAAAAA==' } } }],
  }))
  vi.stubGlobal('fetch', fetch)
  const result = await infer('mimo', { ...presetConnection('mimo'), options: { format: 'pcm' } })
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).audio.format).toBe('pcm')
  const wav = Buffer.from(result.audio!.split(',')[1], 'base64')
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.readUInt32LE(24)).toBe(24_000)
  expect(wav.readUInt16LE(22)).toBe(1)
  expect(wav.readUInt32LE(40)).toBe(4)
})
