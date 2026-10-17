import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIpcBridge } from '@/bridge/ipc/ipcBridge'
import type { OfflineApi, OfflinePreview, OfflineTask } from '../../shared/offline'
import { initOfflineStore, offlineActions, offlineStore } from './offlineStore'

const idle: OfflineTask = { state: 'idle', phase: 'check', current: 0, total: 0 }
let dispose: (() => void) | undefined
function setup() {
  const api: OfflineApi = {
    selectModel: vi.fn(async () => null), selectDestination: vi.fn(async () => null), selectBundle: vi.fn(async () => null),
    prepare: vi.fn(async (): Promise<OfflineTask> => ({ ...idle, state: 'running' })),
    install: vi.fn(async (): Promise<OfflineTask> => ({ ...idle, state: 'running' })),
    snapshot: vi.fn(async () => idle), cancel: vi.fn(async () => undefined), openOutput: vi.fn(async () => undefined),
  }
  const done = vi.fn()
  dispose = initOfflineStore({ ...createIpcBridge(), offline: api }, done)
  return { api, done }
}
afterEach(() => { dispose?.(); vi.useRealTimers(); offlineStore.setState({ mode: null, task: null, preview: null, busy: false, failed: false }) })
describe('offline task lifecycle', () => {
  it('resolves a typed destination before preparing and refuses an invalid directory', async () => {
    const { api } = setup()
    await Promise.resolve()
    vi.mocked(api.selectDestination).mockResolvedValue({ token: 'typed', label: 'G:\\Models' })
    await offlineActions.downloadModel('sensevoice-small', 'huggingface', 'G:\\Models')
    expect(api.selectDestination).toHaveBeenCalledWith('G:\\Models')
    expect(api.prepare).toHaveBeenCalledWith({ modelIds: ['sensevoice-small'], runtimeIds: [], modelSource: 'huggingface' }, { kind: 'model', token: 'typed' })
    vi.mocked(api.prepare).mockClear()
    vi.mocked(api.selectDestination).mockRejectedValue(new Error('Missing folder'))
    await offlineActions.downloadModel('sensevoice-small', 'huggingface', 'G:\\Missing')
    expect(api.prepare).not.toHaveBeenCalled()
    expect(offlineStore.getState().failed).toBe(true)
  })
  it('opens the pinned download list for a recommended model without installing it', () => {
    const { api } = setup()
    offlineActions.openDownloads('sensevoice-small')
    expect(offlineStore.getState()).toMatchObject({ mode: 'model', downloadModelId: 'sensevoice-small', preview: null })
    expect(api.prepare).not.toHaveBeenCalled()
    expect(api.install).not.toHaveBeenCalled()
  })
  it('passes the selected source and opaque destination token to model preparation', async () => {
    const { api } = setup()
    vi.mocked(api.selectDestination).mockResolvedValue({ token: 'opaque-path', label: 'Models' })
    await offlineActions.selectDestination()
    offlineActions.openDownloads('sensevoice-small')
    offlineStore.setState({ destination: { token: 'opaque-path', label: 'Models' } })
    await offlineActions.downloadModel('sensevoice-small', 'hf-mirror')
    expect(api.prepare).toHaveBeenCalledWith({ modelIds: ['sensevoice-small'], runtimeIds: [], modelSource: 'hf-mirror' }, { kind: 'model', token: 'opaque-path' })
  })
  it('does not display a task when no offline operation has started', async () => {
    setup()
    await Promise.resolve()
    expect(offlineStore.getState().task).toBeNull()
  })
  it('keeps polling after closing and refreshes resources once on completion', async () => {
    vi.useFakeTimers()
    const { api, done } = setup()
    await Promise.resolve()
    offlineActions.open('prepare')
    await offlineActions.prepare({ modelIds: ['sensevoice'], runtimeIds: [] })
    offlineActions.close()
    vi.mocked(api.snapshot).mockResolvedValue({ ...idle, state: 'completed', phase: 'verify' })
    await vi.advanceTimersByTimeAsync(1000)
    expect(offlineStore.getState()).toMatchObject({ mode: null, task: { state: 'completed' } })
    expect(done).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5000)
    expect(done).toHaveBeenCalledOnce()
  })
  it('rejects invalid previews before invoking installation', async () => {
    const { api } = setup()
    await Promise.resolve()
    const preview: OfflinePreview = { token: 'opaque', compatible: false, items: [], issues: ['missingFiles'], totalBytes: 0 }
    vi.mocked(api.selectModel).mockResolvedValue(preview)
    await offlineActions.selectModel('directory')
    await offlineActions.install()
    expect(api.install).not.toHaveBeenCalled()
    expect(offlineStore.getState().failed).toBe(true)
  })
  it('cancelling the file picker preserves the current preview', async () => {
    const { api } = setup()
    await Promise.resolve()
    const preview: OfflinePreview = { token: 'opaque', compatible: true, items: [], issues: [], totalBytes: 0 }
    offlineStore.setState({ preview })
    await offlineActions.selectBundle()
    expect(api.selectBundle).toHaveBeenCalledOnce()
    expect(offlineStore.getState().preview).toEqual(preview)
  })
})
