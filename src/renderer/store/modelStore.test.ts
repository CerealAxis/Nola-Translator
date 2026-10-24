import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { EngineChannelEvent, ResourceRecord } from '@/bridge'
import { attachModelsStore, detachModelsStore, loadModels, modelsStore } from './modelStore'
import { DEFAULT_SETTINGS } from '../../shared/settings'

afterEach(() => { detachModelsStore(); vi.restoreAllMocks() })

it('measures download speed from progress events and clears it after failure or retry', () => {
  const bridge = createIpcBridge()
  let emit: (event: EngineChannelEvent) => void = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { emit = callback; return () => undefined })
  const clock = vi.spyOn(Date, 'now').mockReturnValue(0)
  attachModelsStore(bridge)
  const base: ResourceRecord = {
    resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
    name: 'Index-Translate 2B', description: '', languages: [], installed: false,
    installedBytes: 0, downloadBytes: 100, state: 'running', phase: 'download', progress: 0, cancellable: true,
  }
  const publish = (resource: ResourceRecord) => emit({ protocolVersion: 1, requestId: 'rate', type: 'resourceChanged', resource })
  publish(base)
  clock.mockReturnValue(1000)
  publish({ ...base, progress: 0.2 })
  expect(modelsStore.getState().resources[0].bytesPerSecond).toBe(20)
  publish({ ...base, state: 'failed' })
  expect(modelsStore.getState().resources[0].bytesPerSecond).toBeUndefined()
  publish(base)
  expect(modelsStore.getState().resources[0].bytesPerSecond).toBeUndefined()
})


it('removes custom rows on completion and ignores a delayed remove acknowledgement', () => {
  const bridge = createIpcBridge()
  let emit: (event: EngineChannelEvent) => void = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(callback => { emit = callback; return () => undefined })
  attachModelsStore(bridge)
  const pending: ResourceRecord = {
    resourceId: 'hub:local/example', kind: 'recognitionModel', provider: 'llama-asr',
    name: 'Example', description: 'Example', languages: [], installed: true,
    installedBytes: 100, state: 'running', phase: 'remove', cancellable: false,
  }
  const publish = (resource: ResourceRecord) => emit({ protocolVersion: 1, requestId: 'remove', type: 'resourceChanged', resource })
  publish(pending)
  publish({ ...pending, state: 'idle', installed: false, installedBytes: 0 })
  expect(modelsStore.getState().resources).toEqual([])
  emit({ protocolVersion: 1, requestId: 'late', type: 'resourceActionResult', resource: pending })
  expect(modelsStore.getState().resources).toEqual([])
  publish({ ...pending, state: 'idle', phase: undefined })
  expect(modelsStore.getState().resources).toHaveLength(1)
})

it('keeps credential flags when the engine snapshot times out', async () => {
  const bridge = createIpcBridge()
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation(() => () => undefined)
  attachModelsStore(bridge)
  const profile = {
    id: 'mini', name: 'MiniMax', endpoint: 'https://api.minimax.cn/anthropic', model: 'MiniMax-M3.1-Flash',
    apiFormat: 'anthropic' as const, contextWindow: 1_000_000, maxOutputTokens: 512_000,
    languages: ['zh'], sourceLanguages: ['auto'],
  }
  vi.spyOn(bridge.settings, 'get').mockResolvedValue({ ...DEFAULT_SETTINGS, translation: { ...DEFAULT_SETTINGS.translation, customModels: [profile] } })
  vi.spyOn(bridge.translation, 'hasCredential').mockImplementation(async (provider) => provider === 'cloud-model:mini')
  vi.spyOn(bridge.engine, 'listResources').mockRejectedValue(new Error('REQUEST_TIMEOUT'))
  await expect(loadModels({ includeDevices: false })).rejects.toThrow('REQUEST_TIMEOUT')
  // The catalog arrives through the engine's `resources` event regardless, so a credential
  // snapshot dropped with the failed call would leave every key-gated card unconfigured.
  expect(modelsStore.getState().credentials['cloud-model:mini']).toBe(true)
  expect(modelsStore.getState().error).toBe('REQUEST_TIMEOUT')
})

it('retries the snapshot once the engine reports ready after a failure', async () => {
  const bridge = createIpcBridge()
  let emit: (event: EngineChannelEvent) => void = () => undefined
  vi.spyOn(bridge.events, 'onEngineEvent').mockImplementation((callback) => { emit = callback; return () => undefined })
  attachModelsStore(bridge)
  vi.spyOn(bridge.settings, 'get').mockResolvedValue(DEFAULT_SETTINGS)
  vi.spyOn(bridge.translation, 'hasCredential').mockResolvedValue(false)
  const list = vi.spyOn(bridge.engine, 'listResources')
    .mockRejectedValueOnce(new Error('REQUEST_TIMEOUT'))
    .mockResolvedValue({ storagePath: 'models', resources: [] })
  await expect(loadModels({ includeDevices: false })).rejects.toThrow('REQUEST_TIMEOUT')
  emit({ protocolVersion: 1, requestId: 'hello', type: 'ready', engineVersion: '1.0.0', capabilities: [] })
  await vi.waitFor(() => expect(modelsStore.getState().loaded).toBe(true))
  expect(list).toHaveBeenCalledTimes(2)
  expect(modelsStore.getState().error).toBeNull()
})
