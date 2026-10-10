import { expect, it, vi } from 'vitest'
import { SessionController } from '../../../src/main/session-controller'
import type { EngineProcess } from '../../../src/main/engine-process'
import type { PrewarmConfig, PrewarmResult } from '../../../src/shared/contracts'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

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
