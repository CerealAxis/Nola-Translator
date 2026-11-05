import { afterEach, expect, it, vi } from 'vitest'
import { setupSpeechRuntime } from './speech-runtime'
import { loadPreferences, DEFAULT_PREFERENCES } from './preferences'
import { getProvider, createProvider } from './providers'
import { translateWith, generateWith } from './provider-execution'

vi.mock('./preferences', async importOriginal => ({ ...await importOriginal<typeof import('./preferences')>(), loadPreferences: vi.fn() }))
vi.mock('./providers', async importOriginal => ({ ...await importOriginal<typeof import('./providers')>(), getProvider: vi.fn() }))
vi.mock('./provider-execution', async importOriginal => ({ ...await importOriginal<typeof import('./provider-execution')>(), translateWith: vi.fn(), generateWith: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it.each(['microsoft-translate', 'nola'])('sends only ASR to Nola and applies selected %s MT prompts and terms', async preset => {
  const asr = createProvider('nola'), mt = { ...createProvider(preset), id: preset === 'nola' ? 'desktop' : 'external-mt' }
  vi.mocked(loadPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', subtitleProvider: mt.id, subtitlePrompt: 'Translate {{text}} from {{sourceLanguage}} to {{targetLanguage}}', glossary: [{ source: 'Nola', target: '诺拉', sites: 'video.test' }, { source: 'Recognized', target: 'ignore', sites: 'other.test' }] })
  vi.mocked(getProvider).mockImplementation(async (id, capability) => {
    if (id === 'desktop' && capability === 'asr') return asr
    if (id === mt.id && capability === 'mt') return mt
    throw new Error('Unexpected provider selection')
  })
  vi.mocked(translateWith).mockResolvedValue('外部译文')
  vi.mocked(generateWith).mockResolvedValue('外部译文')
  let connect!: (port: ChromePort) => void, receive!: (message: unknown) => void
  const nativeListeners: Array<(message: unknown) => void> = []
  const emitNative = (message: unknown) => nativeListeners.forEach(listener => listener(message))
  let streamId = ''
  const nativePost = vi.fn((message: Record<string, unknown>) => {
    queueMicrotask(() => {
      if (message.type === 'hello') emitNative({ type: 'result', id: message.id, value: { protocolVersion: 3 } })
      else if (message.type === 'streamStart') { streamId = String(message.id); emitNative({ type: 'result', id: message.id, value: { streamId } }) }
      else if (message.type === 'streamAudio') {
        emitNative({ type: 'capabilityEvent', id: streamId, event: { type: 'asr', data: { type: 'conversation.item.input_audio_transcription.completed', item_id: 'utterance', transcript: 'Recognized by Nola', audio_start_ms: 0, audio_end_ms: 100 } } })
        emitNative({ type: 'result', id: message.id })
      }
    })
  })
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, runtime: {
    onConnect: { addListener: (listener: typeof connect) => { connect = listener } },
    connectNative: vi.fn(() => ({ onMessage: { addListener: (listener: (message: unknown) => void) => nativeListeners.push(listener) }, onDisconnect: { addListener: vi.fn() }, postMessage: nativePost, disconnect: vi.fn() })),
  } })
  const contentPost = vi.fn()
  const port = { name: 'nola-speech', sender: { tab: { id: 1 }, frameId: 0, url: 'https://video.test/watch' },
    onMessage: { addListener: (listener: typeof receive) => { receive = listener } }, onDisconnect: { addListener: vi.fn() },
    postMessage: contentPost, disconnect: vi.fn() } as unknown as ChromePort
  setupSpeechRuntime(); connect(port)
  receive({ type: 'start', capability: 'asr', sourceLanguage: 'en', targetLanguage: 'zh' })
  await expect.poll(() => contentPost.mock.calls.some(([message]) => message.type === 'ready')).toBe(true)
  receive({ type: 'audio', audio: 'AAA=' })
  const execution = preset === 'nola' ? vi.mocked(generateWith) : vi.mocked(translateWith)
  await expect.poll(() => execution.mock.calls.length).toBe(1)
  const prompt = preset === 'nola' ? vi.mocked(generateWith).mock.calls[0][1] : vi.mocked(translateWith).mock.calls[0][4]
  expect(prompt).toContain('Translate Recognized by Nola from en to zh')
  expect(prompt).toContain('[\"Nola\",\"诺拉\"]')
  expect(prompt).not.toContain('ignore')
  if (preset !== 'nola') expect(translateWith).toHaveBeenCalledWith(mt, 'Recognized by Nola', 'en', 'zh', expect.any(String), expect.any(AbortSignal))
  await expect.poll(() => contentPost.mock.calls.some(([message]) => message.type === 'caption' && message.translation === '外部译文')).toBe(true)
  expect(nativePost.mock.calls.map(([message]) => message.type)).toEqual(['hello', 'streamStart', 'streamAudio'])
  expect(nativePost.mock.calls[1][0]).toMatchObject({ type: 'streamStart', sourceLanguage: 'en' })
  receive({ type: 'stop' })
})
