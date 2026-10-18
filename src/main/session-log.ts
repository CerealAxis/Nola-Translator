import { appendFileSync, createReadStream, createWriteStream, lstatSync, mkdirSync, readdirSync, renameSync, unlinkSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { supportErrorCodeForCause } from '../shared/error-catalog'

const KEEP_LAUNCHES = 10
const MAX_ENTRY_BYTES = 256 * 1024
const secrets = new Set<string>()
let file = ''
let sequence = 0
const activity = new Map<string, { count: number; last: number }>()

/** High-frequency streams retain operation counts without writing audio-sized logs. */
export function logActivity(event: string, data: unknown): void {
  const current = activity.get(event) ?? { count: 0, last: 0 }
  current.count++
  const now = performance.now()
  if (current.last === 0 || now - current.last >= 1000) {
    logDiagnostic(event, { observedCount: current.count, latest: data })
    current.last = now
  }
  activity.set(event, current)
}

export function logActivityTotals(): void {
  logDiagnostic('activity.totals', Object.fromEntries([...activity].map(([key, value]) => [key, value.count])))
}

function diagnosticText(value: string): string {
  return redactLog(value).slice(-16000)
}

export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth limit]'
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return diagnosticText(value)
  if (Buffer.isBuffer(value)) return { bytes: value.length }
  if (value instanceof Error) {
    const frames = value.stack?.split(/\r?\n/).slice(1, 13).join('\n')
    const name = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(value.name) ? value.name : 'Error'
    const failureData = sanitizeLogData(processFailure(value), depth + 1)
    const failureRecord = typeof failureData === 'object' && failureData !== null && !Array.isArray(failureData)
      ? failureData as Record<string, unknown>
      : {}
    return { name, ...failureRecord, stackFrames: frames ? diagnosticText(frames) : undefined,
      cause: value.cause === undefined ? undefined : sanitizeLogData(value.cause, depth + 1) }
  }
  if (Array.isArray(value)) return value.slice(0, 64).map(item => sanitizeLogData(item, depth + 1))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value).slice(0, 64)) {
      // Separators only: keeping digits is what makes `pcmBase64` and `database64` match, and
      // they carry raw audio into the log.
      const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      result[key] = PRIVATE_LOG_KEYS.has(normalizedKey)
        ? '[omitted]' : sanitizeLogData(item, depth + 1)
    }
    return result
  }
  return String(value)
}

const PRIVATE_LOG_KEYS = new Set([
  'apikey', 'accesskey', 'password', 'passwd', 'token', 'accesstoken', 'refreshtoken', 'secret', 'secretkey', 'clientsecret', 'privatekey',
  'authorization', 'credentials', 'credential', 'text', 'sourcetext', 'translatedtext',
  'translationtext', 'caption', 'captiontext', 'transcript', 'transcription', 'recognizedtext',
  'rawtext', 'originaltext', 'inputtext', 'outputtext', 'displaytext', 'utterance', 'utterancetext',
  'prompt', 'completion', 'content', 'notes', 'note', 'title', 'audio', 'audiodata',
  'audiobase64', 'pcm', 'pcmdata', 'pcmbase64', 'database64',
])

interface LogFile { name: string; launch: string; modified: number; regularFile: boolean; compressed: boolean }

function logFiles(directory: string): LogFile[] {
  return readdirSync(directory).filter(name => /^startup-[\dTZ-]+-[a-f\d-]+(?:-part-\d+)?\.jsonl(?:\.gz)?$/.test(name))
    .map(name => {
      const entry = lstatSync(join(directory, name))
      const baseName = name.replace(/\.gz$/, '')
      return { name, launch: baseName.replace(/-part-\d+\.jsonl$/, '.jsonl'), modified: entry.mtimeMs,
        regularFile: entry.isFile() && !entry.isSymbolicLink(), compressed: name.endsWith('.jsonl.gz') }
    })
}

function pruneLogs(directory: string, keep: number): string[] {
  const names = logFiles(directory)
  const launches = new Map<string, number>()
  for (const entry of names) launches.set(entry.launch, Math.max(launches.get(entry.launch) ?? 0, entry.modified))
  const retained = new Set([...launches].sort((a, b) => b[1] - a[1]).slice(0, keep).map(([launch]) => launch))
  for (const entry of names) {
    if (!retained.has(entry.launch) && entry.regularFile) unlinkSync(join(directory, entry.name))
  }
  return names.filter(entry => retained.has(entry.launch) && entry.regularFile && !entry.compressed)
    .map(entry => join(directory, entry.name))
}

async function compressPreviousLogs(paths: string[]): Promise<void> {
  for (const path of paths) {
    const compressed = `${path}.gz`
    const partial = `${compressed}.partial`
    try {
      const source = lstatSync(path)
      if (!source.isFile() || source.isSymbolicLink()) continue
      let existing: ReturnType<typeof lstatSync> | null = null
      try {
        existing = lstatSync(compressed)
      } catch { /* The archive does not exist yet. */ }
      if (existing) {
        if (!existing.isFile() || existing.isSymbolicLink()) continue
        utimesSync(compressed, source.atime, source.mtime)
        unlinkSync(path)
        continue
      }
      await pipeline(createReadStream(path), createGzip(), createWriteStream(partial, { flags: 'wx' }))
      renameSync(partial, compressed)
      utimesSync(compressed, source.atime, source.mtime)
      unlinkSync(path)
    } catch (error) {
      try { unlinkSync(partial) } catch { /* No partial archive was created. */ }
      logDiagnostic('session-log.compression.failed', { fileName: path.split(/[\\/]/).at(-1), error })
    }
  }
}

export function registerLogSecret(value: string): void {
  if (value) secrets.add(value)
}

export function redactLog(value: string): string {
  let text = value
  for (const secret of secrets) text = text.split(secret).join('[redacted]')
  return text.replace(/\bsk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/(authorization["'\s]*[:=]["'\s]*(?:bearer\s+)?)[^\s,"'}]+/gi, '$1[redacted]')
    .replace(/((?:api[_-]?key|password|token|secret)["'\s]*[:=]["'\s]*)[^\s,"'}]+/gi, '$1[redacted]')
    .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password)=)[^&#\s]*/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
}

export function sessionLogPath(): string { return file }

// Synchronous appends preserve crash diagnostics; per-entry limits keep malformed payloads bounded.
export function logDiagnostic(event: string, data?: unknown): void {
  if (!file) return
  try {
    let detail = sanitizeLogData(data)
    const detailJson = JSON.stringify(detail ?? null)
    if (Buffer.byteLength(detailJson) > MAX_ENTRY_BYTES) {
      detail = { truncated: true, reason: 'Entry exceeded diagnostic size limit', originalBytes: Buffer.byteLength(detailJson) }
    }
    const line = JSON.stringify({ at: new Date().toISOString(), sequence: ++sequence,
      level: /fail|crash|exception|error/.test(event) ? 'error' : /warn/.test(event) ? 'warning' : 'info',
      event, message: event.replace(/[.-]/g, ' '), data: detail }) + '\n'
    appendFileSync(file, line, 'utf8')
  } catch { /* Diagnostics must remain usable on read-only or full disks. */ }
}

/** Creates the current log synchronously; callers may await prior-log compression before cleanup. */
export function initializeSessionLog(directory: string, metadata: unknown): Promise<void> {
  try {
    mkdirSync(directory, { recursive: true })
    file = ''
    for (const name of readdirSync(directory).filter(name => /^startup-[\dTZ-]+-[a-f\d-]+(?:-part-\d+)?\.jsonl\.gz\.partial$/.test(name))) {
      try {
        const partial = lstatSync(join(directory, name))
        if (partial.isFile() && !partial.isSymbolicLink()) unlinkSync(join(directory, name))
      } catch { /* A stale partial is best-effort cleanup. */ }
    }
    const previousLogs = pruneLogs(directory, KEEP_LAUNCHES - 1)
    file = join(directory, `startup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.jsonl`)
    sequence = 0
    activity.clear()
    logDiagnostic('app.start', metadata)
    return compressPreviousLogs(previousLogs)
  } catch { file = ''; return Promise.resolve() }
}

export function captureMainConsole(): void {
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => { logDiagnostic(`console.${level}`, args); original(...args) }
  }
  process.on('uncaughtExceptionMonitor', (error, origin) => logDiagnostic('app.uncaught-exception', { origin, error }))
}

export function processFailure(error: unknown): Record<string, unknown> {
  const failure = error as Error & { code?: number | string; engineCode?: string; requestId?: string; commandType?: string; action?: string; signal?: string; killed?: boolean; stdout?: string; stderr?: string }
  const code = failure?.code
  const errorName = typeof failure?.name === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(failure.name) ? failure.name : 'Error'
  const nativeMessage = typeof failure?.message === 'string' && failure.message.trim()
    ? failure.message : error instanceof Error
      ? `${errorName}: Operation failed without an error message`
      : String(error).trim() || `${errorName}: Operation failed without an error message`
  return { message: nativeMessage, errorName,
    category: failure?.killed ? 'process-terminated-or-timed-out' : typeof code === 'number' ? 'process-exit-failure' : 'operation-error', code, engineCode: failure?.engineCode,
    windowsStatus: typeof code === 'number' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : undefined,
    supportCode: failure?.engineCode ? supportErrorCodeForCause(failure.engineCode, { commandType: failure.commandType, action: failure.action }) : undefined,
    requestId: failure?.requestId,
    commandType: failure?.commandType,
    action: failure?.action,
    signal: failure?.signal, killed: failure?.killed,
    stdout: failure?.stdout,
    stderr: failure?.stderr,
    stdoutBytes: typeof failure?.stdout === 'string' ? Buffer.byteLength(failure.stdout) : undefined,
    stderrBytes: typeof failure?.stderr === 'string' ? Buffer.byteLength(failure.stderr) : undefined }
}
