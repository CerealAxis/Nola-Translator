import { afterEach, expect, it, vi } from 'vitest'
import { setupSpeechRuntime } from './speech-runtime'
import { loadPreferences, DEFAULT_PREFERENCES } from './preferences'
import { getProvider, createProvider } from './providers'
import { translateWith, generateWith } from './provider-execution'
import { migrateLegacyGlossary } from './glossary-store'

vi.mock('./preferences', async importOriginal => ({ ...await importOriginal<typeof import('./preferences')>(), loadPreferences: vi.fn() }))
vi.mock('./providers', async importOriginal => ({ ...await importOriginal<typeof import('./providers')>(), getProvider: vi.fn() }))
vi.mock('./provider-execution', async importOriginal => ({ ...await importOriginal<typeof import('./provider-execution')>(), translateWith: vi.fn(), generateWith: vi.fn() }))
vi.mock('./glossary-store', async importOriginal => ({ ...await importOriginal<typeof import('./glossary-store')>(), recoverExtensionConfiguration: vi.fn(), extensionGlossary: { snapshot: vi.fn(async () => migrateLegacyGlossary([{ source: 'Nola', target: '诺拉', sites: 'video.test' }, { source: 'Recognized', target: 'ignore', sites: 'other.test' }], 'Terms')), onChanged: vi.fn(() => () => {}) } }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

it('does not open native capture after stopping while preferences are still loading', async () => {
  let resolvePreferences!: (value: typeof DEFAULT_PREFERENCES) => void
  vi.mocked(loadPreferences).mockImplementationOnce(() => new Promise(resolve => { resolvePreferences = resolve }))
  vi.mocked(getProvider).mockResolvedValue(createProvider('nola'))
  let connect!: (port: ChromePort) => void, receive!: (message: unknown) => void
  const connectNative = vi.fn(), postMessage = vi.fn()
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true) }, runtime: { onConnect: { addListener: (value: typeof connect) => { connect = value } }, connectNative } })
  setupSpeechRuntime()
  connect({ name: 'nola-speech', sender: { tab: { id: 1 }, frameId: 0, url: 'https://video.test/watch' }, onMessage: { addListener: (value: typeof receive) => { receive = value } }, onDisconnect: { addListener: vi.fn() }, postMessage, disconnect: vi.fn() } as unknown as ChromePort)
  receive({ type: 'start', capability: 'asr', sourceLanguage: 'en', targetLanguage: 'zh' })
  await expect.poll(() => Boolean(resolvePreferences)).toBe(true)
  receive({ type: 'stop' })
  resolvePreferences(DEFAULT_PREFERENCES)
  await expect.poll(() => vi.mocked(getProvider).mock.calls.length).toBe(2)
  expect(connectNative).not.toHaveBeenCalled()
  expect(postMessage).not.toHaveBeenCalled()
})

it.each(['microsoft-translate', 'nola'])('sends only ASR to Nola and applies selected %s MT prompts and terms', async preset => {
  const asr = createProvider('nola'), mt = { ...createProvider(preset), id: preset === 'nola' ? 'desktop' : 'external-mt' }
  vi.mocked(loadPreferences).mockResolvedValue({ ...DEFAULT_PREFERENCES, asrProvider: 'desktop', subtitleProvider: mt.id, subtitlePrompt: preset === 'nola' ? '' : 'Translate {{text}} from {{sourceLanguage}} to {{targetLanguage}}' })
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
  const execution = vi.mocked(translateWith)
  await expect.poll(() => execution.mock.calls.length).toBe(1)
  const prompt = vi.mocked(translateWith).mock.calls[0][4]
  if (preset !== 'nola') expect(prompt).toContain('Translate Recognized by Nola from en to zh')
  expect(prompt).toContain('"source":"Nola","target":"诺拉","mode":"fixed"')
  expect(prompt).not.toContain('ignore')
  expect(translateWith).toHaveBeenCalledWith(mt, 'Recognized by Nola', 'en', 'zh', expect.any(String), expect.any(AbortSignal), expect.objectContaining({ terms: [expect.objectContaining({ source: 'Nola', target: '诺拉' })] }))
  expect(generateWith).not.toHaveBeenCalled()
  await expect.poll(() => contentPost.mock.calls.some(([message]) => message.type === 'caption' && message.translation === '外部译文')).toBe(true)
  expect(nativePost.mock.calls.map(([message]) => message.type)).toEqual(['hello', 'streamStart', 'streamAudio'])
  expect(nativePost.mock.calls[1][0]).toMatchObject({ type: 'streamStart', sourceLanguage: 'en' })
  receive({ type: 'stop' })
})

it('rejects direct S2S before opening a provider when applicable extension terms cannot be matched first', async () => {
  vi.mocked(loadPreferences).mockResolvedValue(DEFAULT_PREFERENCES)
  let connect!: (port: ChromePort) => void, receive!: (message: unknown) => void
  const connectNative = vi.fn(), postMessage = vi.fn()
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true) }, runtime: { onConnect: { addListener: (value: typeof connect) => { connect = value } }, connectNative } })
  setupSpeechRuntime()
  connect({ name: 'nola-speech', sender: { tab: { id: 1 }, frameId: 0, url: 'https://video.test/watch' }, onMessage: { addListener: (value: typeof receive) => { receive = value } }, onDisconnect: { addListener: vi.fn() }, postMessage, disconnect: vi.fn() } as unknown as ChromePort)
  receive({ type: 'start', capability: 's2s', sourceLanguage: 'en', targetLanguage: 'zh' })
  await expect.poll(() => postMessage.mock.calls.some(([message]) => message.type === 'error' && message.code === 'browserGlossaryModeUnsupported')).toBe(true)
  expect(connectNative).not.toHaveBeenCalled()
})

it.each(['providerAuthentication', 'providerRateLimit', 'glossaryChanged', 'private upstream details'])('preserves safe translation failure %s in live captions', async failure => {
  vi.mocked(loadPreferences).mockResolvedValue(DEFAULT_PREFERENCES)
  vi.mocked(getProvider).mockImplementation(async (_id, capability) => createProvider(capability === 'asr' ? 'nola' : 'microsoft-translate'))
  vi.mocked(translateWith).mockRejectedValue(new Error(failure))
  let connect!: (port: ChromePort) => void, receive!: (message: unknown) => void, nativeReceive!: (message: unknown) => void
  let streamId = ''
  const postMessage = vi.fn()
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true) }, runtime: {
    onConnect: { addListener: (value: typeof connect) => { connect = value } },
    connectNative: () => ({ onMessage: { addListener: (value: typeof nativeReceive) => { nativeReceive = value } }, onDisconnect: { addListener: vi.fn() }, disconnect: vi.fn(),
      postMessage: (value: Record<string, unknown>) => queueMicrotask(() => {
        if (value.type === 'streamStart') streamId = String(value.id)
        nativeReceive({ type: 'result', id: value.id, value: {} })
      }) }),
  } })
  setupSpeechRuntime()
  connect({ name: 'nola-speech', sender: { tab: { id: 1 }, frameId: 0, url: 'https://video.test/watch' }, onMessage: { addListener: (value: typeof receive) => { receive = value } }, onDisconnect: { addListener: vi.fn() }, postMessage, disconnect: vi.fn() } as unknown as ChromePort)
  receive({ type: 'start', capability: 'asr', sourceLanguage: 'en', targetLanguage: 'zh' })
  await expect.poll(() => postMessage.mock.calls.some(([value]) => value.type === 'ready')).toBe(true)
  nativeReceive({ type: 'capabilityEvent', id: streamId, event: { type: 'asr', data: { type: 'transcript', itemId: 'line', text: 'Nola', final: true } } })
  const expected = failure === 'private upstream details' ? 'providerRequestFailed' : failure
  await expect.poll(() => postMessage.mock.calls.some(([value]) => value.type === 'error' && value.code === expected)).toBe(true)
  expect(JSON.stringify(postMessage.mock.calls)).not.toContain('private upstream details')
  receive({ type: 'stop' })
})
