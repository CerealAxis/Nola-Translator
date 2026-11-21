import { execFile, spawn } from 'node:child_process'
import { z } from 'zod'
import type { EngineLaunchSpec } from './engine-process'
import { OfflineError, type ModelWorkerRequest, type OfflineProgress } from './offline-manager'
import { logDiagnostic, logPythonStderr } from './session-log'

const progressSchema = z.object({ phase: z.enum(['check', 'download', 'copy', 'install', 'verify', 'pack']),
  current: z.number().finite().nonnegative(), total: z.number().finite().nonnegative(), detail: z.string().max(512).optional() })
const errorSchema = z.enum(['missingFiles', 'checksumMismatch', 'unsupportedModel', 'incompatible', 'insufficientSpace', 'invalidPackage', 'busy', 'failed'])

/** Keep model copying and loader trials outside the long-lived caption engine. */
export function runOfflineModelWorker(spec: EngineLaunchSpec, request: ModelWorkerRequest, signal: AbortSignal, progress: OfflineProgress): Promise<unknown> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, { cwd: spec.cwd, windowsHide: true,
      env: { ...process.env, ...spec.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', NOLA_TRANSLATOR_RUN_LOG_STDERR: '1' }, stdio: 'pipe' })
    const terminate = () => {
      // Native model trials can own a second Python process and a llama-server.
      if (process.platform === 'win32' && child.pid) {
        execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => child.kill())
      } else child.kill()
    }
    signal.addEventListener('abort', terminate, { once: true })
    if (signal.aborted) terminate()
    let pending = ''
    let result: unknown
    let hasResult = false
    let failure: Error | null = null
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      pending += chunk
      if (pending.length > 1024 * 1024) { failure = new OfflineError('failed'); terminate(); return }
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end).trim(); pending = pending.slice(end + 1)
        if (!line) continue
        try {
          const value = z.object({ type: z.string(), result: z.unknown().optional(), issue: z.unknown().optional(), reason: z.string().max(2048).nullish() }).passthrough().parse(JSON.parse(line))
          if (value.type === 'progress') {
            const event = progressSchema.parse(value)
            progress(event.phase, event.current, event.total, event.detail)
          } else if (value.type === 'result') { result = value.result; hasResult = true }
          else if (value.type === 'error') failure = new OfflineError(errorSchema.catch('failed').parse(value.issue), value.reason ?? undefined)
        } catch (error) { logDiagnostic('offline.model-worker.protocol.failed', { pid: child.pid, error }); failure = new OfflineError('failed'); terminate() }
      }
    })
    logPythonStderr(child.stderr, 'offline', undefined, { pid: child.pid })
    child.on('error', error => { logDiagnostic('offline.model-worker.failed', { pid: child.pid, error }); failure = error })
    child.on('close', (code, processSignal) => {
      if (code !== 0 && !signal.aborted) logDiagnostic('offline.model-worker.exited', { pid: child.pid, code, signal: processSignal, error: failure })
      signal.removeEventListener('abort', terminate)
      if (signal.aborted) reject(signal.reason ?? new Error('cancelled'))
      else if (failure) reject(failure)
      else if (code !== 0 || !hasResult) reject(new OfflineError('failed'))
      else resolve(result)
    })
    child.stdin.on('error', error => { failure = error })
    child.stdin.end(JSON.stringify(request) + '\n')
  })
}
