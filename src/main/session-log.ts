import { appendFileSync, lstatSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { supportErrorCodeForCause } from '../shared/error-catalog'

const KEEP_LAUNCHES = 20
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

// Preserve native localized diagnostics without mixing UI-language prose into the English log.
function englishText(value: string): string | { encoding: string; originalBase64: string } {
  const text = redactLog(value).slice(-16000)
  return /[^\x00-\x7F]/.test(text) ? { encoding: 'utf8-base64', originalBase64: Buffer.from(text).toString('base64') } : text
}

export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[depth limit]'
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return englishText(value)
  if (Buffer.isBuffer(value)) return { bytes: value.length }
  if (value instanceof Error) {
    const frames = value.stack?.split(/\r?\n/).slice(1, 13).join('\n')
    const name = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/.test(value.name) ? value.name : 'Error'
    const failureData = sanitizeLogData(processFailure(value), depth + 1)
    const failureRecord = typeof failureData === 'object' && failureData !== null && !Array.isArray(failureData)
      ? failureData as Record<string, unknown>
      : {}
    return { name, ...failureRecord, stackFrames: frames ? englishText(frames) : undefined }
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
  'authorization', 'credentials', 'credential', 'deviceid', 'text', 'sourcetext', 'translatedtext',
  'translationtext', 'caption', 'captiontext', 'transcript', 'transcription', 'recognizedtext',
  'reason', 'errordetail', 'rawtext', 'originaltext', 'inputtext', 'outputtext', 'displaytext', 'utterance', 'utterancetext',
  'prompt', 'completion', 'content', 'notes', 'note', 'title', 'audio', 'audiodata',
  'audiobase64', 'pcm', 'pcmdata', 'pcmbase64', 'database64',
])

function pruneLogs(directory: string, keep: number): void {
  const names = readdirSync(directory).filter(name => /^startup-[\dTZ-]+-[a-f\d-]+(?:-part-\d+)?\.jsonl$/.test(name))
    .map(name => {
      const entry = lstatSync(join(directory, name))
      return { name, launch: name.replace(/-part-\d+\.jsonl$/, '.jsonl'), modified: entry.mtimeMs,
        regularFile: entry.isFile() && !entry.isSymbolicLink() }
    })
  const launches = new Map<string, number>()
  for (const entry of names) launches.set(entry.launch, Math.max(launches.get(entry.launch) ?? 0, entry.modified))
  const retained = new Set([...launches].sort((a, b) => b[1] - a[1]).slice(0, keep).map(([launch]) => launch))
  for (const entry of names) {
    if (!retained.has(entry.launch) && entry.regularFile) unlinkSync(join(directory, entry.name))
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

export function initializeSessionLog(directory: string, metadata: unknown): void {
  try {
    mkdirSync(directory, { recursive: true })
    file = ''
    pruneLogs(directory, KEEP_LAUNCHES - 1)
    file = join(directory, `startup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.jsonl`)
    sequence = 0
    activity.clear()
    logDiagnostic('app.start', metadata)
  } catch { file = '' }
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
  const nativeMessage = failure?.message ?? String(error)
  const englishReasons: [RegExp, string][] = [
    [/安装组合不在清单中/, 'Runtime package is not listed in the catalog'],
    [/安装已取消/, 'Installation was cancelled'],
    [/运行包 ID 无效/, 'Runtime package ID is invalid'],
    [/已有组件检查或安装任务|已有组件安装任务/, 'Another runtime operation is already active'],
    [/引擎已退出/, 'Engine process exited'],
    [/Python 引擎尚未运行/, 'Python engine is not running'],
    [/下载校验失败/, 'Downloaded artifact failed integrity verification'],
    [/下载文件不完整/, 'Downloaded artifact is incomplete'],
    [/超时/, 'Operation timed out'],
  ]
  const message = failure?.engineCode ? `Engine operation failed: ${failure.engineCode}`
    : englishReasons.find(([pattern]) => pattern.test(nativeMessage))?.[1]
      ?? 'Operation failed; raw error text omitted'
  return { message, errorName,
    category: failure?.killed ? 'process-terminated-or-timed-out' : typeof code === 'number' ? 'process-exit-failure' : 'operation-error', code, engineCode: failure?.engineCode,
    windowsStatus: typeof code === 'number' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : undefined,
    supportCode: failure?.engineCode ? supportErrorCodeForCause(failure.engineCode, { commandType: failure.commandType, action: failure.action }) : undefined,
    requestId: failure?.requestId,
    commandType: failure?.commandType,
    action: failure?.action,
    signal: failure?.signal, killed: failure?.killed,
    stdoutBytes: typeof failure?.stdout === 'string' ? Buffer.byteLength(failure.stdout) : undefined,
    stderrBytes: typeof failure?.stderr === 'string' ? Buffer.byteLength(failure.stderr) : undefined }
}
