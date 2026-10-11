import { expect, it, vi } from 'vitest'
import { SessionController } from '../../../src/main/session-controller'
import type { EngineProcess } from '../../../src/main/engine-process'
import type { PrewarmConfig, PrewarmResult } from '../../../src/shared/contracts'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'
import type { SessionConfig } from '../../../src/shared/contracts'

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
