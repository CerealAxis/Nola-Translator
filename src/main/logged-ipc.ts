import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { normalizeThrownError } from '../shared/ipc-error'
import { logDiagnostic } from './session-log'

/** Record IPC operations centrally without persisting credential or document payloads. */
export function loggedHandle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    const operationId = randomUUID()
    const started = performance.now()
    const privateArguments = /credential|meeting:(rename|set-notes)|hub:(search|model-card)/.test(channel)
    logDiagnostic('ipc.request', { operationId, channel, windowId: event.sender?.id,
      arguments: privateArguments ? { count: args.length, contents: '[omitted]' } : args })
    try {
      const result: unknown = await listener(event, ...args)
      logDiagnostic('ipc.complete', { operationId, channel, durationMs: Math.round(performance.now() - started),
        resultType: result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result,
        resultCount: Array.isArray(result) ? result.length : undefined, result })
      return result
    } catch (error) {
      const correlationId = randomUUID()
      const classification = normalizeThrownError(error, { correlationId, operation: channel })
      logDiagnostic('ipc.failed', { operationId, channel, durationMs: Math.round(performance.now() - started), correlationId, classification, error })
      const rendererError = new Error(classification.code)
      Object.assign(rendererError, classification)
      throw rendererError
    }
  })
}
