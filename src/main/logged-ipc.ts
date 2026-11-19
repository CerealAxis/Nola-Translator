import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { encodeIpcError, normalizeThrownError } from '../shared/ipc-error'
import { featureConflictOwner } from '../shared/feature-activity'
import { logDiagnostic } from './session-log'

let assertSender: (event: Electron.IpcMainInvokeEvent) => void = () => { throw new Error('Access denied') }
let pendingInvocations = 0
const idleWaiters = new Set<() => void>()

/** Disposing handlers prevents new requests; an offline snapshot also waits for admitted writes. */
export function drainLoggedIpc(timeoutMs = 15_000): Promise<void> {
  if (!pendingInvocations) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); idleWaiters.delete(done); resolve() }
    const timer = setTimeout(() => { idleWaiters.delete(done); reject(new Error('DATA_WRITERS_NOT_CLOSED')) }, timeoutMs)
    idleWaiters.add(done)
  })
}

/** Install the application trust boundary before registering any handlers. */
export function configureIpcSenderValidation(validate: typeof assertSender): void {
  assertSender = validate
}

/** Record IPC operations centrally without persisting credential or document payloads. */
export function loggedHandle(channel: string, listener: Parameters<typeof ipcMain.handle>[1], validate?: typeof assertSender): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    const operationId = randomUUID()
    const started = performance.now()
    const privatePayload = /^(glossary|word-rules|comic|game|meeting|desktop-data|screen):/.test(channel)
    const privateArguments = privatePayload || /credential|hub:(search|model-card)|app:(agent-workspace|update-settings)|offline:select-model/.test(channel)
    logDiagnostic('ipc.request', { operationId, channel, windowId: event.sender?.id,
      arguments: privateArguments ? { count: args.length, contents: '[omitted]' } : args })
    pendingInvocations++
    try {
      const validateSender = validate ?? assertSender
      validateSender(event)
      const result: unknown = await listener(event, ...args)
      logDiagnostic('ipc.complete', { operationId, channel, durationMs: Math.round(performance.now() - started),
        resultType: result === null ? 'null' : Array.isArray(result) ? 'array' : typeof result,
        resultCount: Array.isArray(result) ? result.length : undefined, result: privatePayload ? '[omitted]' : result })
      return result
    } catch (error) {
      const classification = normalizeThrownError(error, { correlationId: operationId, operation: channel })
      logDiagnostic('ipc.failed', { operationId, channel, durationMs: Math.round(performance.now() - started),
        correlationId: classification.correlationId, classification, error })
      const owner = featureConflictOwner(error)
      throw new Error(encodeIpcError(owner ? `FEATURE_CONFLICT:${owner}` : classification.code, classification))
    } finally {
      pendingInvocations--
      if (!pendingInvocations) for (const resolve of [...idleWaiters]) resolve()
    }
  })
}
