import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename, isAbsolute, normalize } from 'node:path'
import { stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { offlinePrepareSchema } from '../shared/offline'
import { loggedHandle } from './logged-ipc'
import { OfflineError, type OfflineManager } from './offline-manager'
import type { OfflinePreview } from '../shared/offline'
import { logDiagnostic } from './session-log'
import { z } from 'zod'

const prepareDestinationSchema = z.object({ kind: z.enum(['package', 'model']).default('package'), token: z.string().min(1).max(128).optional() }).strict()

function inputPath(raw: unknown): string {
  const value = z.string().trim().min(1).max(32767).parse(raw)
  const path = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
  if (!isAbsolute(path) || path.includes('\0')) throw new Error('invalidConfiguration')
  return normalize(path)
}

async function directoryPath(raw: unknown): Promise<string> {
  const path = inputPath(raw)
  if (!(await stat(path)).isDirectory()) throw new Error('invalidConfiguration')
  return path
}

/** Only the main desktop window can select local resources or start installation. */
export function registerOfflineIpc(manager: OfflineManager, getWindow: () => BrowserWindow | null, whenReady: () => Promise<void>): () => Promise<void> {
  const channels = ['offline:select-model', 'offline:select-bundle', 'offline:prepare', 'offline:install', 'offline:snapshot', 'offline:cancel', 'offline:open-output', 'offline:select-destination']
  const destinations = new Map<string, string>()
  const inspect = async (action: () => Promise<OfflinePreview>): Promise<OfflinePreview> => {
    try { return await action() }
    catch (error) {
      logDiagnostic('offline.preflight.failed', { error: String(error) })
      return { token: '', items: [], totalBytes: 0, issues: [error instanceof OfflineError ? error.issue : 'invalidPackage'], compatible: false }
    }
  }
  const handle = (channel: string, listener: (parent: BrowserWindow, ...args: unknown[]) => unknown) => {
    loggedHandle(channel, async (event, ...args: unknown[]) => {
      const parent = getWindow()
      if (!parent || parent.isDestroyed() || event.sender.id !== parent.webContents.id) throw new Error('invalidConfiguration')
      // Snapshot only reads the manager's in-memory task. It must remain available
      // when runtime initialization fails, so startup diagnostics are not masked.
      if (channel !== 'offline:snapshot') await whenReady()
      return listener(parent, ...args)
    })
  }
  handle(channels[0], async (parent, kind, repo, path) => {
    if (kind !== 'file' && kind !== 'directory') throw new Error('invalidConfiguration')
    const repository = z.string().trim().max(200).regex(/^(?:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)?$/).parse(repo ?? '')
    let selected: string
    if (path !== undefined) selected = kind === 'directory' ? await directoryPath(path) : inputPath(path)
    else {
      const result = await dialog.showOpenDialog(parent, { properties: [kind === 'file' ? 'openFile' : 'openDirectory'],
        ...(kind === 'file' ? { filters: [{ name: 'GGUF', extensions: ['gguf'] }] } : {}) })
      if (result.canceled || !result.filePaths[0]) return null
      selected = result.filePaths[0]
    }
    return { ...await inspect(() => manager.inspectModel(selected, repository || undefined)), sourcePath: selected }
  })
  handle(channels[1], async parent => {
    const result = await dialog.showOpenDialog(parent, { properties: ['openFile'], filters: [{ name: 'Nola offline manifest', extensions: ['json'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    if (basename(result.filePaths[0]) !== 'manifest.json') throw new Error('invalidConfiguration')
    return inspect(() => manager.inspectBundle(result.filePaths[0]))
  })
  handle('offline:select-destination', async (parent, path) => {
    let selected: string
    if (path !== undefined) selected = await directoryPath(path)
    else {
      const result = await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled || !result.filePaths[0]) return null
      selected = result.filePaths[0]
    }
    const token = randomUUID()
    destinations.clear()
    destinations.set(token, selected)
    return { token, label: selected }
  })
  handle(channels[2], async (parent, raw, destination) => {
    const request = offlinePrepareSchema.parse(raw)
    const parsedDestination = destination === undefined ? { kind: 'package' as const }
      : prepareDestinationSchema.parse(destination)
    const kind = parsedDestination.kind
    if (kind === 'model') {
      const selected = parsedDestination.token ? destinations.get(parsedDestination.token) : undefined
      if (!selected) throw new Error('invalidConfiguration')
      destinations.delete(parsedDestination.token!)
      return manager.prepare(request, selected, 'model')
    }
    const result = await dialog.showOpenDialog(parent, { properties: ['openDirectory', 'createDirectory'] })
    return result.canceled || !result.filePaths[0] ? null : manager.prepare(request, result.filePaths[0], kind)
  })
  handle(channels[3], (_parent, token) => {
    if (typeof token !== 'string' || token.length > 128) throw new Error('invalidConfiguration')
    return manager.install(token)
  })
  handle(channels[4], () => manager.snapshot())
  handle(channels[5], () => manager.cancel())
  handle(channels[6], async () => {
    const task = manager.snapshot()
    if (task.state === 'completed' && task.outputPath) await shell.openPath(task.outputPath)
  })
  return async () => { for (const channel of channels) ipcMain.removeHandler(channel); await manager.dispose() }
}
