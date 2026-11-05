import { beforeEach, expect, it, vi } from 'vitest'
import { createProvider } from './providers'
import { edgeSpeech, miniMaxSpeech, pcmWav, transcribeWith } from './provider-speech'
import { providerFetch } from './provider-execution'
import { resamplePcm } from './speech-client'

vi.mock('./provider-execution', async importOriginal => ({ ...await importOriginal<typeof import('./provider-execution')>(), providerFetch: vi.fn() }))
beforeEach(() => vi.mocked(providerFetch).mockReset())

it('wraps only valid PCM16 as a mono 16 kHz WAV and resamples captured audio', () => {
  const samples = new Int16Array([100, 200, 300, 400])
  const wav = pcmWav(new Uint8Array(samples.buffer))
  const view = new DataView(wav.buffer)
  expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
  expect(view.getUint32(24, true)).toBe(16000)
  expect(view.getUint32(40, true)).toBe(8)
  expect(() => pcmWav(new Uint8Array(3))).toThrow()
  expect([...new Int16Array(resamplePcm(samples.buffer, 32000))]).toEqual([150, 350])
})

it('uses the consumer token exchange and escapes untrusted text and voice in SSML', async () => {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))
  vi.mocked(providerFetch).mockResolvedValueOnce(new Response(JSON.stringify({ t: `header.${payload}.sig`, r: 'eastus' })))
    .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
  const result = await edgeSpeech('<script>&', 'en', 'en-US-AriaNeural', 1, new AbortController().signal)
  expect(result).toEqual({ audioBase64: 'AQID', contentType: 'audio/mpeg' })
  const [url, init] = vi.mocked(providerFetch).mock.calls[1]
  expect(url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1')
  expect(init.body).toContain('&lt;script&gt;&amp;')
  expect(init.body).not.toContain('<script>')
})

it('reassembles MiniMax indexed transcription deltas without replay duplication', async () => {
  const provider = { ...createProvider('minimax'), model: 'asr-1.0' }
  vi.mocked(providerFetch).mockResolvedValue(new Response('data: {"index":1,"delta":"world"}\n\ndata: {"index":0,"delta":"Hello "}\n\ndata: {"index":1,"delta":"world","finish":true}\n\n'))
  const result = await transcribeWith(provider, btoa('RIFF'), 'en', new AbortController().signal)
  expect(result).toBe('Hello world')
  const [url, init] = vi.mocked(providerFetch).mock.calls[0]
  expect(url).toBe('https://api.minimax.io/v1/speech_to_text')
  expect((init.body as FormData).get('stream')).toBe('true')
})

it('decodes MiniMax speech hex and rejects provider errors instead of playing invalid audio', async () => {
  const provider = createProvider('minimax')
  vi.mocked(providerFetch).mockResolvedValueOnce(new Response(JSON.stringify({ data: { audio: '0102ff' }, base_resp: { status_code: 0 } })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ base_resp: { status_code: 1004 } })))
  expect(await miniMaxSpeech(provider, 'Hello', '', 1, new AbortController().signal)).toEqual({ audioBase64: 'AQL/', contentType: 'audio/mpeg' })
  await expect(miniMaxSpeech(provider, 'Hello', '', 1, new AbortController().signal)).rejects.toThrow('providerAuthentication')
})
