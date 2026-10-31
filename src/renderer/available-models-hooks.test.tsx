import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ModelGatewaySnapshot } from '../shared/model-gateway'
import { callableModels } from './features/workbench/installed-models'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { stores } from '@/store'
import { useAvailableModels, useGatewaySnapshot, useModelSelection, type AvailableModel } from './available-models'

const mocks = vi.hoisted(() => ({ getBridge: vi.fn(), updateSettings: vi.fn() }))
vi.mock('@/store', async importOriginal => ({ ...await importOriginal<typeof import('@/store')>(), ...mocks }))
const initialSession = stores.session.getState()
const initialSettings = stores.settings.getState()
const configured = { ...DEFAULT_SETTINGS, modelPolicy: { enabled: { 'asr:resource:old': true, 'asr:resource:new': true }, defaults: {}, selections: { asr: 'resource:old' } } }
const loaded: AvailableModel = { binding: 'resource:new', name: 'New ASR', kind: 'asr', origin: 'gateway', free: true }
const snapshot = (state: ModelGatewaySnapshot['state']): ModelGatewaySnapshot => ({ state, address: '', port: 17860, connections: 0, activeRequests: 0, requests: [],
  services: { asr: { state: 'stopped', model: '', name: '' }, mt: { state: 'stopped', model: '', name: '' }, tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' } } })
beforeEach(() => { vi.clearAllMocks(); mocks.getBridge.mockReturnValue(null); mocks.updateSettings.mockResolvedValue(undefined); stores.settings.setState({ ...initialSettings, settings: configured }); stores.session.setState({ ...initialSession, status: 'idle' }) })
afterEach(() => { cleanup(); stores.session.setState(initialSession); stores.settings.setState(initialSettings) })

it('shares one gateway subscription and read until the last consumer unmounts', async () => {
  const off = vi.fn()
  const api = { onChanged: vi.fn(() => off), snapshot: vi.fn().mockResolvedValue(snapshot('running')) }
  mocks.getBridge.mockReturnValue({ gateway: api })
  const first = renderHook(() => useGatewaySnapshot())
  const second = renderHook(() => useGatewaySnapshot())
  await waitFor(() => expect(first.result.current?.state).toBe('running'))
  expect(second.result.current?.state).toBe('running')
  expect(api.onChanged).toHaveBeenCalledOnce()
  expect(api.snapshot).toHaveBeenCalledOnce()
  first.unmount()
  expect(off).not.toHaveBeenCalled()
  second.unmount()
  expect(off).toHaveBeenCalledOnce()
})

it('keeps a new gateway event when an older initial snapshot resolves later', async () => {
  let resolveRead!: (value: ModelGatewaySnapshot) => void
  let change!: (value: ModelGatewaySnapshot) => void
  mocks.getBridge.mockReturnValue({ gateway: { onChanged: (callback: typeof change) => { change = callback; return vi.fn() },
    snapshot: () => new Promise<ModelGatewaySnapshot>(resolve => { resolveRead = resolve }) } })
  const result = renderHook(() => useGatewaySnapshot())
  act(() => change(snapshot('running')))
  await act(async () => resolveRead(snapshot('stopped')))
  expect(result.result.current?.state).toBe('running')
})

it('repairs a stale selection once and reports the loaded model', async () => {
  const report = vi.fn()
  const result = renderHook(() => useModelSelection('asr', [loaded], configured, report))
  expect(result.result.current.binding).toBe('resource:new')
  await waitFor(() => expect(report).toHaveBeenCalledWith(loaded))
  result.rerender()
  expect(mocks.updateSettings).toHaveBeenCalledOnce()
  expect(mocks.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ modelPolicy: expect.objectContaining({ selections: expect.objectContaining({ asr: 'resource:new' }) }) }))
})

it('does not rewrite the model while a session is running and repairs it after stopping', async () => {
  stores.session.setState({ status: 'running' })
  const report = vi.fn()
  const result = renderHook(() => useModelSelection('asr', [loaded], configured, report))
  expect(result.result.current.binding).toBe('resource:old')
  expect(mocks.updateSettings).not.toHaveBeenCalled()
  act(() => { stores.session.setState({ status: 'idle' }) })
  await waitFor(() => expect(report).toHaveBeenCalledWith(loaded))
  expect(result.result.current.binding).toBe('resource:new')
})

it('keeps an unavailable selection empty without writing a cloud fallback', () => {
  const cloud: AvailableModel = { binding: 'cloud:aliyun', name: 'Aliyun', kind: 'asr', origin: 'cloud', free: false }
  const result = renderHook(() => useModelSelection('asr', [cloud], configured))
  expect(result.result.current).toMatchObject({ binding: '', unavailable: true })
  expect(mocks.updateSettings).not.toHaveBeenCalled()
})


it('uses the authoritative gateway catalog and applies immediate policy disablement', async () => {
  const catalog = { asr: [loaded], mt: [], tts: [], llm: [] }
  mocks.getBridge.mockReturnValue({ gateway: { onChanged: () => vi.fn(), snapshot: async () => ({ ...snapshot('running'), services: { ...snapshot('running').services, asr: { state: 'ready', model: loaded.binding, name: loaded.name } }, availableModels: catalog }) } })
  const initialModels = stores.models.getState()
  stores.models.setState({ resources: [{ resourceId: 'new', installed: true, name: 'New ASR', kind: 'recognitionModel' } as typeof initialModels.resources[number]] })
  try {
    const result = renderHook(() => useAvailableModels())
    await waitFor(() => expect(result.result.current.asr.map(model => model.binding)).toEqual(['resource:new']))
    act(() => { stores.settings.setState({ settings: { ...configured, modelPolicy: { enabled: {}, defaults: {}, selections: {} } } }) })
    expect(result.result.current.asr).toEqual([])
  } finally { act(() => stores.models.setState(initialModels)) }
})


it('removes stale local models from business and callable gateway options on runtime changes', async () => {
  const initialModels = stores.models.getState()
  const catalog = { asr: [loaded], mt: [], tts: [], llm: [] }
  const ready: ModelGatewaySnapshot = { state: 'running', address: '', port: 17860, connections: 0, activeRequests: 0, requests: [],
    services: { asr: { state: 'ready', model: loaded.binding, name: loaded.name },
      mt: { state: 'stopped', model: '', name: '' }, tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' } }, availableModels: catalog }
  let change!: (value: ModelGatewaySnapshot) => void
  mocks.getBridge.mockReturnValue({ gateway: { onChanged: (callback: typeof change) => { change = callback; return vi.fn() }, snapshot: async () => ready } })
  stores.models.setState({ resources: [{ resourceId: 'new', installed: true, name: loaded.name, kind: 'recognitionModel' } as typeof initialModels.resources[number]] })
  try {
    const result = renderHook(() => useAvailableModels())
    await waitFor(() => expect(result.result.current.asr).toHaveLength(1))
    expect(result.result.current.asr[0].origin).toBe('gateway')
    for (const value of [
      { ...ready, state: 'stopped' as const },
      { ...ready, services: { ...ready.services, asr: { ...ready.services.asr, state: 'loading' as const } } },
      { ...ready, services: { ...ready.services, asr: { ...ready.services.asr, model: 'resource:another' } } },
    ]) {
      act(() => change(value))
      expect(result.result.current.asr).toEqual([])
      expect(callableModels(result.result.current, [{ id: loaded.binding, name: loaded.name, kind: 'asr' }]).filter(model => model.kind === 'asr')).toEqual([])
    }
  } finally { act(() => stores.models.setState(initialModels)) }
})
