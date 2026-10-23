import { expect, it, vi } from 'vitest'
import { SessionController } from '../../../src/main/session-controller'
import type { EngineProcess } from '../../../src/main/engine-process'
import type { PrewarmConfig, PrewarmResult } from '../../../src/shared/contracts'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { SessionConfig } from '../../../src/shared/contracts'

it('injects the selected custom model key without accepting caller-supplied credentials', async () => {
  const request = vi.fn(async () => ({ sessionId: 'custom-session' }))
  const getCredential = vi.fn(async () => 'selected-model-secret')
  const settings = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModelId: 'second-model' } }
  const controller = new SessionController({ engine: { currentState: 'ready', request } as unknown as EngineProcess, meetings: null,
    getSettings: () => settings, getCredential, whenReady: async () => {}, prepare: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await controller.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'cloud', translationOptions: { endpoint: 'https://second.example/v1', model: 'second', apiKey: 'untrusted-secret' } }, 'desktop')
  expect(getCredential).toHaveBeenCalledExactlyOnceWith('cloud-model:second-model')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ translationOptions: expect.objectContaining({ apiKey: 'selected-model-secret' }) }) }), 'sessionStarted', expect.any(Number))
})

it('pins a custom connection and its credential to the same settings snapshot during startup', async () => {
  const request = vi.fn(async () => ({ sessionId: 'pinned-session' }))
  const first = { ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, provider: 'cloud' as const, customModelId: 'first', cloudEndpoint: 'https://first.example/v1', cloudModel: 'first-model' } }
  let current = first
  const getCredential = vi.fn(async (provider: string) => {
    if (provider === 'aliyun-asr') current = { ...first, translation: { ...first.translation, customModelId: 'second', cloudEndpoint: 'https://second.example/v1', cloudModel: 'second-model' } }
    return 'first-secret'
  })
  const controller = new SessionController({ engine: { currentState: 'ready', request } as unknown as EngineProcess, meetings: null,
    getSettings: () => current, getCredential, whenReady: async () => {},
    prepare: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await controller.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', recognitionProvider: 'aliyun', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'cloud', translationOptions: { endpoint: first.translation.cloudEndpoint, model: first.translation.cloudModel } }, 'desktop')
  expect(getCredential).toHaveBeenNthCalledWith(2, 'cloud-model:first')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ translationOptions: expect.objectContaining({ endpoint: 'https://first.example/v1', apiKey: 'first-secret' }) }) }), 'sessionStarted', expect.any(Number))
})

it('uses persisted VAD timing when a session starts', async () => {
  const request = vi.fn(async () => ({ sessionId: 'vad-session' }))
  const settings = { ...DEFAULT_SETTINGS, recognition: { ...DEFAULT_SETTINGS.recognition, max_segment_ms: 15000, silence_end_ms: 1200 } }
  const sessions = new SessionController({ engine: { currentState: 'ready', start: vi.fn(), request } as unknown as EngineProcess, meetings: null,
    getSettings: () => settings, getCredential: async () => '', whenReady: async () => {}, prepare: async () => {},
    startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await sessions.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: [], max_segment_ms: 6000, silence_end_ms: 600 }, 'desktop')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ max_segment_ms: 15000, silence_end_ms: 1200 }) }), 'sessionStarted', expect.any(Number))
})

it('reserves a two-second audio preview without preparing models, recording or opening the overlay', async () => {
  let finish!: (value: { audioBase64: string; durationMs: 2000; hasSignal: boolean }) => void
  const engine = { currentState: 'ready', start: vi.fn(), supports: () => true,
    request: vi.fn(() => new Promise(resolve => { finish = resolve })),
  }
  const prepare = vi.fn()
  const overlay = vi.fn()
  const sessions = new SessionController({ engine: engine as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', whenReady: async () => {},
    prepare, startingChanged: () => {}, showOverlay: overlay, hideOverlay: () => {},
  })
  const preview = sessions.testAudio({ kind: 'microphone', deviceId: 'selected' })
  await vi.waitFor(() => expect(engine.request).toHaveBeenCalledOnce())
  expect(sessions.busy).toBe(true)
  await expect(sessions.start({}, 'browser')).rejects.toThrow('sessionAlreadyRunning')
  expect(engine.request).toHaveBeenCalledWith(expect.objectContaining({ type: 'testAudio',
    audioSource: { kind: 'microphone', deviceId: 'selected' } }), 'audioTested', 8000)
  finish({ audioBase64: 'preview', durationMs: 2000, hasSignal: true })
  await expect(preview).resolves.toMatchObject({ durationMs: 2000, hasSignal: true })
  expect(sessions.busy).toBe(false)
  expect(prepare).not.toHaveBeenCalled()
  expect(overlay).not.toHaveBeenCalled()
})

it('reserves model loading across both clients and uses the resolved compute configuration', async () => {
  let finish!: (result: PrewarmResult) => void
  const engine = {
    currentState: 'ready', start: vi.fn(),
    prewarmModels: vi.fn(() => new Promise<PrewarmResult>(resolve => { finish = resolve })),
  }
  const startingChanged = vi.fn()
  const sessions = new SessionController({ engine: engine as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', whenReady: async () => {},
    prepare: async config => { config.compute = { ...(config.compute ?? DEFAULT_SETTINGS.compute), recognitionDevice: 'cpu' } },
    startingChanged, showOverlay: () => {}, hideOverlay: () => {},
  })
  const config: PrewarmConfig = { compute: DEFAULT_SETTINGS.compute, recognitionModelId: 'sensevoice-small', sourceLanguage: 'auto', targetLanguages: [] }
  const work = sessions.prewarm(config)
  await vi.waitFor(() => expect(engine.prewarmModels).toHaveBeenCalledOnce())
  expect(sessions.busy).toBe(true)
  expect(engine.prewarmModels).toHaveBeenCalledWith(expect.objectContaining({ compute: expect.objectContaining({ recognitionDevice: 'cpu' }) }))
  await expect(sessions.start({}, 'browser')).rejects.toThrow('sessionAlreadyRunning')
  await expect(sessions.prewarm(config)).resolves.toMatchObject({ state: 'failed', code: 'sessionAlreadyRunning' })
  finish({ state: 'ready' })
  await work
  expect(sessions.busy).toBe(false)
  expect(startingChanged.mock.calls).toEqual([[true], [false]])
})

it('injects the encrypted ASR credential and removes caller-supplied translation credentials', async () => {
  const request = vi.fn(async () => ({ sessionId: 'remote-session' }))
  const engine = { currentState: 'ready', start: vi.fn(), request }
  const getCredential = vi.fn(async () => 'stored-aliyun-key')
  const sessions = new SessionController({ engine: engine as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential, whenReady: async () => {}, prepare: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  const config: SessionConfig = { audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'], recognitionProvider: 'aliyun',
    recognitionOptions: { workspaceId: 'workspace', apiKey: 'caller-asr-key' }, translationProvider: 'mymemory', translationOptions: { apiKey: 'caller-translation-key', email: 'test@example.com' } }
  await sessions.start(config, 'desktop')
  expect(getCredential).toHaveBeenCalledExactlyOnceWith('aliyun-asr')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ recognitionOptions: { workspaceId: 'workspace', apiKey: 'stored-aliyun-key' }, translationOptions: { email: 'test@example.com' } }) }), 'sessionStarted', expect.any(Number))
  expect(config.recognitionOptions?.apiKey).toBe('caller-asr-key')
})

it('rejects a missing ASR credential before runtime preparation or capture', async () => {
  const prepare = vi.fn()
  const request = vi.fn()
  const sessions = new SessionController({ engine: { currentState: 'ready', request } as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential: async () => '', whenReady: async () => {}, prepare, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await expect(sessions.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: [], recognitionProvider: 'aliyun' }, 'desktop')).rejects.toThrow('CLOUD_RECOGNITION_CREDENTIAL_MISSING')
  expect(prepare).not.toHaveBeenCalled()
  expect(request).not.toHaveBeenCalled()
  expect(sessions.busy).toBe(false)
})

it('starts the public Index-Translate service without reading or forwarding a cloud key', async () => {
  const request = vi.fn(async () => ({ sessionId: 'public-session' }))
  const getCredential = vi.fn(async () => 'saved-cloud-secret')
  const sessions = new SessionController({ engine: { currentState: 'ready', start: vi.fn(), request } as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential, whenReady: async () => {}, prepare: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await sessions.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'index-translate', translationOptions: { apiKey: 'caller-cloud-secret' } }, 'desktop')
  expect(getCredential).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ translationProvider: 'index-translate', translationOptions: {} }) }), 'sessionStarted', expect.any(Number))
})

it('injects a stored Google Translate key and removes caller-supplied credentials', async () => {
  const request = vi.fn(async () => ({ sessionId: 'google-session' }))
  const getCredential = vi.fn(async () => 'stored-google-key')
  const sessions = new SessionController({ engine: { currentState: 'ready', request } as unknown as EngineProcess, meetings: null,
    getSettings: () => DEFAULT_SETTINGS, getCredential, whenReady: async () => {}, prepare: async () => {}, startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {},
  })
  await sessions.start({ audioSource: { kind: 'defaultOutput' }, recognitionMode: 'realtime', sourceLanguage: 'auto', targetLanguages: ['zh'], translationProvider: 'google', translationOptions: { apiKey: 'caller-google-key' } }, 'desktop')
  expect(getCredential).toHaveBeenCalledExactlyOnceWith('google')
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ config: expect.objectContaining({ translationProvider: 'google', translationOptions: { apiKey: 'stored-google-key' } }) }), 'sessionStarted', expect.any(Number))
})
