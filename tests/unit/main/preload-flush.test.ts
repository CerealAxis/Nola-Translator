import { expect, it, vi } from 'vitest'
import type { NolaTranslatorApi } from '../../../src/shared/bridge'

const state = vi.hoisted(() => ({
  api: undefined as NolaTranslatorApi | undefined,
  listeners: new Map<string, (...args: unknown[]) => void>(),
  invoke: vi.fn(async (..._args: unknown[]) => undefined),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: NolaTranslatorApi) => { state.api = api } },
  ipcRenderer: { on: (name: string, callback: (...args: unknown[]) => void) => state.listeners.set(name, callback), off: vi.fn(), invoke: state.invoke, send: vi.fn() },
}))
vi.mock('../../../src/preload/screen-translation', () => ({ createScreenPreload: () => ({}) }))

it('acknowledges shutdown only after settings and comic callbacks both finish, and forwards runtime subsets', async () => {
  await import('../../../src/preload/index')
  const api = state.api!
  let saveSettings!: () => void, saveComic!: () => void
  const settings = vi.fn(() => new Promise<void>(resolve => { saveSettings = resolve }))
  const comic = vi.fn(() => new Promise<void>(resolve => { saveComic = resolve }))
  const removeSettings = api.comic!.onFlushRequested!(settings)
  const removeComic = api.comic!.onFlushRequested!(comic)
  state.listeners.get('comic:flush')!({}, 'token')
  await vi.waitFor(() => expect(comic).toHaveBeenCalledOnce())
  saveSettings()
  await Promise.resolve()
  expect(state.invoke).not.toHaveBeenCalledWith('comic:flush-result', expect.anything())
  saveComic()
  await vi.waitFor(() => expect(state.invoke).toHaveBeenCalledWith('comic:flush-result', { token: 'token', ok: true }))
  removeSettings!(); removeComic!()
  expect(state.invoke).toHaveBeenCalledWith('comic:flush-ready', false)
  await api.prepareRuntimes(['crisp'])
  expect(state.invoke).toHaveBeenCalledWith('runtime:prepare', ['crisp'])
})
