import { appendFileSync, lstatSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX_BYTES = 4 * 1024 * 1024
const KEEP_SESSIONS = 20
const secrets = new Set<string>()
let file = ''
let bytes = 0
let sequence = 0
let part = 0
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
  if (value instanceof Error) return { name: value.name, ...sanitizeLogData(processFailure(value), depth + 1) as Record<string, unknown>, stack: englishText(value.stack ?? '') }
  if (Array.isArray(value)) return value.slice(0, 64).map(item => sanitizeLogData(item, depth + 1))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value).slice(0, 64)) {
      result[key] = /^(api[_-]?key|password|token|secret|authorization|credentials|text|sourceText|translatedText|prompt|notes|title|audio|pcm|pcmBase64|dataBase64|audioBase64)$/i.test(key)
        ? '[omitted]' : sanitizeLogData(item, depth + 1)
    }
    return result
  }
  return String(value)
}

function pruneLogs(directory: string, keep: number): void {
  const names = readdirSync(directory).filter(name => /^startup-[\dTZ-]+-[a-f\d-]+(?:-part-\d+)?\.jsonl$/.test(name))
    .map(name => ({ name, modified: lstatSync(join(directory, name)).mtimeMs })).sort((a, b) => b.modified - a.modified)
  for (const { name } of names.slice(keep)) {
    const target = join(directory, name)
    const entry = lstatSync(target)
    if (target !== file && entry.isFile() && !entry.isSymbolicLink()) unlinkSync(target)
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
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
}

export function sessionLogPath(): string { return file }

// Synchronous bounded appends preserve crash diagnostics; failures never interrupt the app.
export function logDiagnostic(event: string, data?: unknown): void {
  if (!file) return
  try {
    let detail = sanitizeLogData(data)
    if (JSON.stringify(detail ?? null).length > 32000) detail = { truncated: true, reason: 'Entry exceeded diagnostic size limit' }
    const line = JSON.stringify({ at: new Date().toISOString(), sequence: ++sequence,
      level: /fail|crash|exception|error/.test(event) ? 'error' : /warn/.test(event) ? 'warning' : 'info',
      event, message: event.replace(/[.-]/g, ' '), data: detail }) + '\n'
    if (bytes + Buffer.byteLength(line) > MAX_BYTES) {
      renameSync(file, file.replace(/\.jsonl$/, `-part-${String(++part).padStart(4, '0')}.jsonl`))
      bytes = 0
    }
    appendFileSync(file, line, 'utf8')
    bytes += Buffer.byteLength(line)
    if (bytes === Buffer.byteLength(line)) pruneLogs(dirname(file), KEEP_SESSIONS)
  } catch { /* Diagnostics must remain usable on read-only or full disks. */ }
}

export function initializeSessionLog(directory: string, metadata: unknown): void {
  try {
    mkdirSync(directory, { recursive: true })
    file = ''
    pruneLogs(directory, KEEP_SESSIONS - 1)
    file = join(directory, `startup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.jsonl`)
    bytes = 0
    sequence = 0
    part = 0
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
  const failure = error as Error & { code?: number | string; engineCode?: string; signal?: string; killed?: boolean; stdout?: string; stderr?: string }
  const code = failure?.code
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
      ?? (/[^\x00-\x7F]/.test(nativeMessage) ? 'Operation failed; original native diagnostic preserved in encoded form' : nativeMessage)
  return { message,
    nativeMessage: /[^\x00-\x7F]/.test(nativeMessage) ? nativeMessage : undefined,
    category: failure?.killed ? 'process-terminated-or-timed-out' : typeof code === 'number' ? 'process-exit-failure' : 'operation-error', code, engineCode: failure?.engineCode,
    windowsStatus: typeof code === 'number' ? `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}` : undefined,
    signal: failure?.signal, killed: failure?.killed, stdout: failure?.stdout?.slice(-16000), stderr: failure?.stderr?.slice(-16000) }
}
