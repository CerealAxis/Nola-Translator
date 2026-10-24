import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { EngineLaunchSpec } from './engine-process'

export type GatewayWorkerResult = Record<string, unknown>
export class GatewayWorkerError extends Error {
  constructor(readonly code: 'invalid_request' | 'inference_failed' | 'out_of_memory', message: string) { super(message) }
}
export interface GatewayWorker {
  ready: Promise<GatewayWorkerResult>
  request(payload: GatewayWorkerResult, signal?: AbortSignal, onEvent?: (event: GatewayWorkerResult) => void): Promise<GatewayWorkerResult>
  subscribe(listener: (event: GatewayWorkerResult) => void): () => void
  close(): Promise<void>
}
export type GatewayWorkerFactory = (launch: EngineLaunchSpec, init: GatewayWorkerResult, failed: (message: string) => void) => GatewayWorker

/** A process owns one capability, so cancellation cannot unload the other two models. */
export const createGatewayWorker: GatewayWorkerFactory = (launch, init, failed) => new PythonGatewayWorker(launch, init, failed)

class PythonGatewayWorker implements GatewayWorker {
  readonly ready: Promise<GatewayWorkerResult>
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<string, { resolve(value: GatewayWorkerResult): void; reject(error: Error): void; cleanup(): void; onEvent?: (event: GatewayWorkerResult) => void }>()
  private output = ''
  private stopped = false
  private closing?: Promise<void>
  private resolveClosed!: () => void
  private readonly closed = new Promise<void>(resolve => { this.resolveClosed = resolve })

  constructor(launch: EngineLaunchSpec, init: GatewayWorkerResult, private readonly failed: (message: string) => void) {
    const args = launch.args.map(arg => arg.replaceAll('nola_translator_engine.local_call', 'nola_translator_engine.gateway_worker'))
    if (!args.some(arg => arg.includes('nola_translator_engine.gateway_worker'))) throw new Error('Gateway worker launch module is unavailable')
    this.child = spawn(launch.command, args, { cwd: launch.cwd, env: { ...process.env, ...launch.env,
      HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true, stdio: 'pipe' })
    this.child.stdout.setEncoding('utf8').on('data', (chunk: string) => this.receive(chunk))
    // Native libraries can print paths, prompts and credentials; diagnostics never cross this boundary.
    this.child.stderr.on('data', () => undefined)
    this.child.stdin.on('error', () => this.fail('Inference worker communication failed'))
    this.child.once('error', () => { this.fail('Inference worker could not start'); this.resolveClosed() })
    this.child.once('close', () => { this.fail('Inference worker exited'); this.resolveClosed() })
    this.ready = this.request({ op: 'init', ...init }).catch(error => { this.fail(error.message); throw error })
  }

  request(payload: GatewayWorkerResult, signal?: AbortSignal, onEvent?: (event: GatewayWorkerResult) => void): Promise<GatewayWorkerResult> {
    if (this.stopped) return Promise.reject(new Error('Inference worker is unavailable'))
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
    if (this.pending.size >= 16) return Promise.reject(new Error('Inference worker is busy'))
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      // Native inference may not be interruptible. Detach this response while the worker
      // drains its bounded task; another client's request keeps its loaded model.
      const abort = () => { const pending = this.pending.get(id); if (!pending) return; this.pending.delete(id); pending.cleanup(); reject(new DOMException('Aborted', 'AbortError')) }
      const timer = setTimeout(() => this.fail(payload.op === 'init' ? 'Model loading timed out' : 'Inference request timed out'), 10 * 60_000)
      this.pending.set(id, { resolve, reject, onEvent, cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort) } })
      signal?.addEventListener('abort', abort, { once: true })
      this.child.stdin.write(JSON.stringify({ ...payload, id }) + '\n')
    })
  }

  private receive(chunk: string): void {
    this.output += chunk
    if (this.output.length > 40 * 1024 * 1024) { this.fail('Inference worker exceeded its output limit'); return }
    let newline: number
    while ((newline = this.output.indexOf('\n')) >= 0) {
      const line = this.output.slice(0, newline); this.output = this.output.slice(newline + 1)
      try {
        const message = JSON.parse(line) as GatewayWorkerResult
        const request = this.pending.get(String(message.id))
        if (message.fatal && !request) { this.fail('Inference worker failed'); return }
        if (message.event) {
          // Realtime events use their persistent session id rather than an individual append id.
          for (const entry of this.pending.values()) entry.onEvent?.(message)
          for (const listener of this.listeners) listener(message)
        } else if (request) {
          this.pending.delete(String(message.id)); request.cleanup()
          if (message.error) {
            const code = message.error === 'out_of_memory' ? 'Model ran out of memory' : message.error === 'invalid_request' ? 'Invalid inference request' : 'Inference worker failed'
            request.reject(new GatewayWorkerError(message.error === 'invalid_request' ? 'invalid_request' : message.error === 'out_of_memory' ? 'out_of_memory' : 'inference_failed', code))
            if (message.fatal) this.fail(code)
          } else request.resolve((message.result ?? {}) as GatewayWorkerResult)
        }
      } catch { this.fail('Inference worker returned an invalid response') }
    }
  }

  private readonly listeners = new Set<(event: GatewayWorkerResult) => void>()
  subscribe(listener: (event: GatewayWorkerResult) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener) }

  private fail(message: string, error = new Error(message)): void {
    if (this.stopped) return
    this.stopped = true
    for (const request of this.pending.values()) { request.cleanup(); request.reject(error) }
    this.pending.clear()
    for (const listener of this.listeners) listener({ fatal: true })
    this.listeners.clear()
    this.kill()
    this.failed(message)
  }

  private kill(): void {
    if (process.platform === 'win32' && this.child.pid) execFile('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true }, () => undefined)
    else this.child.kill('SIGKILL')
  }

  close(): Promise<void> {
    if (this.closing) return this.closing
    this.stopped = true
    for (const request of this.pending.values()) { request.cleanup(); request.reject(new DOMException('Gateway stopped', 'AbortError')) }
    this.pending.clear()
    this.kill()
    this.closing = Promise.race([this.closed, new Promise<void>(resolve => { const timer = setTimeout(resolve, 5000); timer.unref() })])
    return this.closing
  }
}
