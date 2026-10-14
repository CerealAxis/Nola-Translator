import { afterEach, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { EngineChannelEvent, ResourceRecord } from '@/bridge'
import { attachModelsStore, detachModelsStore, modelsStore } from './modelStore'

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
