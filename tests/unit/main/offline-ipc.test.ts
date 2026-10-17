import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { OfflineManager } from '../../../src/main/offline-manager'
import { registerOfflineIpc } from '../../../src/main/offline-ipc'

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
const { handlers } = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }))
vi.mock('../../../src/main/logged-ipc', () => ({ loggedHandle: (name: string, handler: Handler) => handlers.set(name, handler) }))
vi.mock('../../../src/main/session-log', () => ({ logDiagnostic: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: class { webContents = { id: 7 }; isDestroyed() { return false } },
  dialog: { showOpenDialog: vi.fn() }, shell: { openPath: vi.fn() }, ipcMain: { removeHandler: vi.fn() },
}))
const roots: string[] = []
const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
  handlers.clear()
  vi.clearAllMocks()
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'nola-offline-ipc-'))
  roots.push(root)
  const models = vi.fn(async () => ({ items: [{ id: 'local', name: 'Local', kind: 'model', bytes: 0, status: 'ready' }], totalBytes: 0, issues: [], compatible: true }))
  const manager = new OfflineManager({ modelRoot: root, runtimeRoot: root, appVersion: '1.0.9', models,
    runtimes: { prepareOffline: vi.fn(), inspectOffline: vi.fn(), installOffline: vi.fn() }, network: () => ({}), reserve: () => async () => {} })
  const parent = new BrowserWindow()
  disposers.push(registerOfflineIpc(manager, () => parent, async () => {}))
  const invoke = (name: string, ...args: unknown[]) => handlers.get(name)!({ sender: { id: 7 } }, ...args)
  return { root, manager, models, invoke }
}

it('inspects a typed folder without opening a dialog and returns its full path', async () => {
  const { root, models, invoke } = await setup()
  await expect(invoke('offline:select-model', 'directory', undefined, `"${root}"`)).resolves.toMatchObject({ sourcePath: root, compatible: true })
  expect(models).toHaveBeenCalledWith(expect.objectContaining({ source: root, localImport: true }), expect.anything(), expect.anything())
  expect(dialog.showOpenDialog).not.toHaveBeenCalled()
})

it('rejects relative paths, missing folders and files without invoking the model worker', async () => {
  const { root, models, invoke } = await setup()
  const file = join(root, 'weights.gguf')
  await writeFile(file, 'data')
  for (const path of ['relative', join(root, 'missing'), file]) {
    await expect(invoke('offline:select-model', 'directory', undefined, path)).rejects.toThrow()
  }
  expect(models).not.toHaveBeenCalled()
})

it('keeps typed paths restricted to the main window', async () => {
  const { root, models } = await setup()
  await expect(handlers.get('offline:select-model')!({ sender: { id: 99 } }, 'directory', undefined, root)).rejects.toThrow('invalidConfiguration')
  expect(models).not.toHaveBeenCalled()
})

it('turns a typed download destination into a main-process token', async () => {
  const { root, manager, invoke } = await setup()
  const destination = await invoke('offline:select-destination', root) as { token: string; label: string }
  expect(destination.label).toBe(root)
  const prepare = vi.spyOn(manager, 'prepare').mockReturnValue({ state: 'running', phase: 'check', current: 0, total: 0 })
  await invoke('offline:prepare', { modelIds: ['sensevoice-small'], runtimeIds: [] }, { kind: 'model', token: destination.token })
  expect(prepare).toHaveBeenCalledWith({ modelIds: ['sensevoice-small'], runtimeIds: [] }, root, 'model')
  expect(dialog.showOpenDialog).not.toHaveBeenCalled()
})

it('returns the complete folder path from the picker and unregisters its handler', async () => {
  const { root, invoke } = await setup()
  vi.mocked(dialog.showOpenDialog).mockResolvedValue({ canceled: false, filePaths: [root] })
  await expect(invoke('offline:select-destination')).resolves.toMatchObject({ label: root })
  await disposers.pop()!()
  expect(ipcMain.removeHandler).toHaveBeenCalledWith('offline:select-destination')
})
