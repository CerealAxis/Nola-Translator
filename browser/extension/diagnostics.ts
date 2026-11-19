import { supportErrorCodeForCause, type SupportErrorCode } from '../../src/shared/error-catalog'

const databaseName = 'nola-extension-diagnostics'
const limit = 200
export type DiagnosticContext = 'background' | 'document' | 'settings' | 'popup' | 'content'
export interface DiagnosticEntry {
  time: string
  context: DiagnosticContext
  event: 'error' | 'unhandled-rejection' | 'operation'
  code: string
  supportCode?: ReturnType<typeof browserSupportCode>
  requestId?: string
  version: string
  browser: string
}
const errorCodes = new Set([
  'providerAddress', 'providerAuthentication', 'providerCapability', 'providerDisabled',
  'providerDisconnected', 'providerEmpty', 'providerImageUnsupported', 'providerInvalid',
  'providerMissing', 'providerModel', 'providerNetwork', 'providerPermission', 'providerRateLimit',
  'providerRequestFailed', 'providerResponseSize', 'providerTimeout', 'indexTranslateBrowserBlocked',
  'documentInvalid', 'documentLimit', 'documentNoText', 'documentType', 'documentExportFailed',
  'documentExportGlyph', 'browserConnectionUnavailable', 'browserConnectionLost', 'browserPermissionDenied',
  'browserExtensionVersionMismatch', 'browserProtocolMismatch', 'browserTranslationTimeout',
  'browserTranslationRateLimited', 'glossaryChanged', 'glossaryPlaceholderFailed', 'glossaryBudgetExceeded',
  'browserCaptureUnsupported', 'browserCaptureTargetMismatch', 'browserCaptureCancelled', 'browserAudioSilent',
  'browserAudioBacklog', 'browserSessionAlreadyRunning', 'browserSessionNotRunning', 'browserCaptionServiceDisabled',
])

export function browserSupportCode(cause: string): SupportErrorCode | '412' | undefined {
  if (cause === 'indexTranslateBrowserBlocked') return '412'
  const code = supportErrorCodeForCause(cause)
  return code === 'ERR-999' ? undefined : code
}

function safeCode(error: unknown): string {
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (/Math\.sumPrecise (?:is not a function|unavailable)/i.test(text)) return 'Math.sumPrecise unavailable'
  if (/getOrInsertComputed (?:is not a function|unavailable)/i.test(text)) return 'Map.getOrInsertComputed unavailable'
  if (errorCodes.has(text) || (/^[a-z][a-z0-9_]{0,79}$/i.test(text) && browserSupportCode(text))) return text
  if (/^(?:TypeError|RangeError|SyntaxError|Error|AbortError)$/.test(text)) return text
  return error instanceof Error && /^(?:TypeError|RangeError|SyntaxError|Error)$/.test(error.name) ? error.name : 'unknownError'
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('entries', { autoIncrement: true })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function save(entry: DiagnosticEntry): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite')
      const store = tx.objectStore('entries')
      store.add(entry)
      const count = store.count()
      count.onsuccess = () => {
        let remove = count.result - limit
        if (remove <= 0) return
        const cursor = store.openCursor()
        cursor.onsuccess = () => {
          if (!cursor.result || remove <= 0) return
          cursor.result.delete()
          remove--
          cursor.result.continue()
        }
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export async function readDiagnostics(): Promise<DiagnosticEntry[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('entries').objectStore('entries').getAll()
      request.onsuccess = () => resolve(request.result as DiagnosticEntry[])
      request.onerror = () => reject(request.error)
    })
  } finally { db.close() }
}

export async function clearDiagnostics(): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('entries', 'readwrite')
      tx.objectStore('entries').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

export function recordDiagnostic(context: DiagnosticContext, error: unknown, event: DiagnosticEntry['event'] = 'operation', requestId?: string): void {
  const code = safeCode(error)
  if (code === 'AbortError') return
  void Promise.resolve().then(() => chrome.runtime.sendMessage({ type: 'nolaDiagnostic', context, event, code, requestId })).catch(() => {})
}

export function captureDiagnostics(context: DiagnosticContext): void {
  globalThis.addEventListener('error', (event: Event) => {
    const error = event as ErrorEvent
    recordDiagnostic(context, error.error ?? error.message, 'error')
  })
  globalThis.addEventListener('unhandledrejection', (event: Event) => {
    recordDiagnostic(context, (event as PromiseRejectionEvent).reason, 'unhandled-rejection')
  })
}

export function setupDiagnosticsRuntime(): void {
  captureDiagnostics('background')
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== 'nolaDiagnostic') return
    const item = message as { context?: unknown; event?: unknown; code?: unknown; requestId?: unknown }
    if (sender.id !== chrome.runtime.id || !['background', 'document', 'settings', 'popup', 'content'].includes(String(item.context)) ||
      !['error', 'unhandled-rejection', 'operation'].includes(String(item.event)) || typeof item.code !== 'string') return
    const agent = navigator.userAgent
    const browser = agent.match(/Edg\/(\d+)/)?.[0] ?? agent.match(/Firefox\/(\d+)/)?.[0] ?? agent.match(/Chrome\/(\d+)/)?.[0] ?? 'unknown'
    const code = safeCode(item.code)
    if (code === 'AbortError') return
    const supportCode = browserSupportCode(code)
    const requestId = typeof item.requestId === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(item.requestId)
      ? item.requestId : undefined
    const entry: DiagnosticEntry = {
      time: new Date().toISOString(), context: item.context as DiagnosticContext,
      event: item.event as DiagnosticEntry['event'], code, ...(supportCode ? { supportCode } : {}),
      ...(requestId ? { requestId } : {}),
      version: chrome.runtime.getManifest().version, browser,
    }
    void save(entry).then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  })
}
