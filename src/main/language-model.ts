import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import type { AppSettings, CredentialProvider } from '../shared/settings'
import { languageModelStreamRequestSchema } from '../shared/language-model'
import { resolveLanguageModelAudio, streamSavedLanguageModel } from './language-model-stream'
import { directModelRequestSchema, workspaceActionSchema } from '../shared/agent-workspace'
import { closeAllDirectModelWorkers, closeDirectModelWorker, runDirectModel, type DirectModelServices } from './direct-model'
import type { AgentWorkspace } from './agent-workspace'
import type { GatewayLanguageModel } from './gateway-language-model'
import type { ComicReaderService } from './comic-reader'

export interface LanguageModelServices extends DirectModelServices {
  getSettings: () => AppSettings
  getCredential: (provider: CredentialProvider) => Promise<string>
  workspace?: AgentWorkspace
  comicReader?: ComicReaderService
  supportsComicImages?: (profileId: string) => boolean
  listDirectModels?: () => Promise<Array<{ model: string; kind: string; name: string }>>
  releaseDirectModel?: (ownerId: number) => Promise<void>
  acquireLanguageModel?: (binding?: string) => Promise<GatewayLanguageModel & { signal: AbortSignal; release(error?: unknown): void }>
}

/** The official AI SDK stream crosses IPC; provider secrets remain in the main process. */
export function registerLanguageModelIpc(services: LanguageModelServices, allowed: (sender: WebContents) => boolean) {
  const trusted = (event: Electron.IpcMainInvokeEvent) => allowed(event.sender) && event.senderFrame === event.sender.mainFrame
  ipcMain.handle('language-model:comics', async event => {
    if (!trusted(event) || !services.comicReader) throw new Error('Comic reader unavailable')
    return services.comicReader.listProjects()
  })
  const pending = new Map<string, AbortController>()
  const settled = new Map<string, { promise: Promise<void>; resolve: () => void }>()
  const track = (id: string) => {
    let resolve!: () => void
    const promise = new Promise<void>(done => { resolve = done })
    settled.set(id, { promise, resolve })
  }
  const finish = (id: string) => { pending.delete(id); settled.get(id)?.resolve(); settled.delete(id) }
  ipcMain.handle('app:language-model:audio-result', (event, raw: unknown) => {
    if (!trusted(event)) throw new Error('Audio preparation access denied')
    resolveLanguageModelAudio(event.sender.id, raw)
  })
  ipcMain.handle('app:agent-workspace', async (event, raw: unknown) => {
    if (!trusted(event) || !services.workspace) throw new Error('Agent workspace unavailable')
    return services.workspace.action(workspaceActionSchema.parse(raw), BrowserWindow.fromWebContents(event.sender) ?? undefined)
  })
  ipcMain.handle('app:direct-model', async (event, raw: unknown, inspect: unknown) => {
    if (!trusted(event)) throw new Error('Direct model access denied')
    const request = directModelRequestSchema.parse(raw)
    const id = event.sender.id + ':' + request.id
    if (pending.has(id)) throw new Error('Duplicate model request')
    const controller = new AbortController()
    const stop = () => controller.abort()
    pending.set(id, controller)
    track(id)
    event.sender.once('destroyed', stop)
    try { return await runDirectModel(services, request, controller.signal, inspect === true, event.sender.id) }
    finally { finish(id); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', stop) }
  })
  ipcMain.handle('app:language-model:cancel', (event, id: unknown) => {
    if (trusted(event) && typeof id === 'string') pending.get(event.sender.id + ':' + id)?.abort()
  })
  ipcMain.handle('app:direct-model:release', async event => {
    if (!trusted(event)) throw new Error('Direct model access denied')
    if (services.releaseDirectModel) await services.releaseDirectModel(event.sender.id)
      else if (!services.inferModel) await closeDirectModelWorker(event.sender.id)
  })
  ipcMain.handle('app:language-model:stream', async (event, raw: unknown) => {
    if (!trusted(event)) throw new Error('Language model access denied')
    const request = languageModelStreamRequestSchema.parse(raw)
    if (JSON.stringify(request.body).length > 16 * 1024 * 1024) throw new Error('Request too large')
    const id = event.sender.id + ':' + request.id
    if (pending.has(id)) throw new Error('Duplicate model request')
    const controller = new AbortController()
    pending.set(id, controller)
    track(id)
    const stop = () => controller.abort()
    event.sender.once('destroyed', stop)
    try {
      // A tool run can include long media conversion or model loading; cancellation is scoped to the whole workflow.
      await streamSavedLanguageModel(services, event.sender, request, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      finish(id)
      if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', stop)
    }
  })
  return {
    cancelAll: async (): Promise<void> => {
      const tasks = [...settled.values()].map(item => item.promise)
      for (const controller of pending.values()) controller.abort()
      await Promise.allSettled(tasks)
      if (!services.inferModel) await closeAllDirectModelWorkers()
    },
  }
}
