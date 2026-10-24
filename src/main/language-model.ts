import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import type { AppSettings, CredentialProvider } from '../shared/settings'
import { languageModelStreamRequestSchema } from '../shared/language-model'
import { streamSavedLanguageModel } from './language-model-stream'
import { directModelRequestSchema, workspaceActionSchema } from '../shared/agent-workspace'
import { runDirectModel, type DirectModelServices } from './direct-model'
import type { AgentWorkspace } from './agent-workspace'

export interface LanguageModelServices extends DirectModelServices {
  getSettings: () => AppSettings
  getCredential: (provider: CredentialProvider) => Promise<string>
  workspace?: AgentWorkspace
  listDirectModels?: () => Promise<Array<{ model: string; kind: string; name: string }>>
}

/** The official AI SDK stream crosses IPC; provider secrets remain in the main process. */
export function registerLanguageModelIpc(services: LanguageModelServices, allowed: (sender: WebContents) => boolean) {
  const pending = new Map<string, AbortController>()
  ipcMain.handle('app:agent-workspace', async (event, raw: unknown) => {
    if (!allowed(event.sender) || !services.workspace) throw new Error('Agent workspace unavailable')
    return services.workspace.action(workspaceActionSchema.parse(raw), BrowserWindow.fromWebContents(event.sender) ?? undefined)
  })
  ipcMain.handle('app:direct-model', async (event, raw: unknown, inspect: unknown) => {
    if (!allowed(event.sender)) throw new Error('Direct model access denied')
    const request = directModelRequestSchema.parse(raw)
    const id = event.sender.id + ':' + request.id
    if (pending.has(id)) throw new Error('Duplicate model request')
    const controller = new AbortController()
    const stop = () => controller.abort()
    pending.set(id, controller)
    event.sender.once('destroyed', stop)
    try { return await runDirectModel(services, request, controller.signal, inspect === true) }
    finally { pending.delete(id); if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', stop) }
  })
  ipcMain.handle('app:language-model:cancel', (event, id: unknown) => {
    if (allowed(event.sender) && typeof id === 'string') pending.get(event.sender.id + ':' + id)?.abort()
  })
  ipcMain.handle('app:language-model:stream', async (event, raw: unknown) => {
    if (!allowed(event.sender)) throw new Error('Language model access denied')
    const request = languageModelStreamRequestSchema.parse(raw)
    if (JSON.stringify(request.body).length > 16 * 1024 * 1024) throw new Error('Request too large')
    const id = event.sender.id + ':' + request.id
    if (pending.has(id)) throw new Error('Duplicate model request')
    const controller = new AbortController()
    pending.set(id, controller)
    const stop = () => controller.abort()
    event.sender.once('destroyed', stop)
    try {
      await streamSavedLanguageModel(services, event.sender, request, AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]))
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      pending.delete(id)
      if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', stop)
    }
  })
}
