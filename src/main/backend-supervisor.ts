import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { randomBytes, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

import { createEngineLaunchSpec, type EngineLaunchSpec } from './engine-process'
import { logActivity, logDiagnostic, logPythonStderr, registerLogSecret } from './session-log'

/**
 * Supervisor for the FastAPI realtime backend (schema_version 2).
 *
 * Spawns exactly one uvicorn worker on a loopback dynamic port. The per-boot
 * control token and instance id are injected through the child environment
 * (the private bootstrap channel) and never logged or handed to the renderer;
 * the renderer talks to the backend only through IPC that this process owns.
 *
 * Lifecycle: start() resolves on the ready frame (address/instance/protocol
 * version). Crashes emit 'exit' with the code; restart policy is owned by the
 * caller so session teardown can fence playback first.
 */

export type BackendReadyFrame = {
  type: 'ready'
  address: string
  instance_id: string
  protocol_version: number
}

export type BackendSupervisorState = 'stopped' | 'starting' | 'ready' | 'failed'

export type BackendSupervisorOptions = {
  /** Launch spec for `python -m nola_translator_engine.backend`. */
  spec: EngineLaunchSpec | (() => EngineLaunchSpec)
  /** Extra environment merged over the bootstrap variables. */
  env?: NodeJS.ProcessEnv
  /** Bound on waiting for the ready frame; cold imports dominate startup. */
  readyTimeoutMs?: number
  /** Durable session journal directory under the data root. */
  journalDir?: string
}

const READY_FRAME_TIMEOUT_MS = 60_000

export class BackendSupervisor extends EventEmitter {
  private child?: ChildProcessByStdio<null, Readable, Readable>
  private state: BackendSupervisorState = 'stopped'
  private readyFrame?: BackendReadyFrame
  private token = randomBytes(32).toString('base64url')
  private bootId = randomUUID()

  constructor(private readonly options: BackendSupervisorOptions) {
    super()
  }

  get currentState(): BackendSupervisorState {
    return this.state
  }

  get ready(): BackendReadyFrame | undefined {
    return this.readyFrame
  }

  get controlToken(): string { return this.token }
  get instanceId(): string { return this.bootId }

  /** Base URL of the control API, e.g. `http://127.0.0.1:53124`. */
  get baseUrl(): string {
    if (!this.readyFrame) throw new Error('Backend is not ready')
    return `http://${this.readyFrame.address}`
  }

  /** Authorization header value for REST/WS calls from this process only. */
  authorizationHeader(): Record<string, string> {
    return { Authorization: `Bearer ${this.controlToken}` }
  }

  async start(): Promise<BackendReadyFrame> {
    if (this.state === 'ready' && this.readyFrame) return this.readyFrame
    if (this.state === 'starting') throw new Error('Backend is already starting')
    const spec = typeof this.options.spec === 'function' ? this.options.spec() : this.options.spec
    this.state = 'starting'
    this.token = randomBytes(32).toString('base64url')
    registerLogSecret(this.token)
    const instanceId = this.bootId = randomUUID()

    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: {
        ...spec.env,
        ...this.options.env,
        NOLA_BACKEND_CONTROL_TOKEN: this.controlToken,
        NOLA_BACKEND_INSTANCE_ID: instanceId,
        ...(this.options.journalDir ? { NOLA_BACKEND_JOURNAL_DIR: this.options.journalDir } : {}),
        PYTHONUNBUFFERED: '1',
        NOLA_TRANSLATOR_RUN_LOG_STDERR: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child

    return new Promise<BackendReadyFrame>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        detachStartup()
        this.state = 'failed'
        child.kill('SIGKILL')
        const error = Object.assign(new Error(`Backend did not report ready within ${this.options.readyTimeoutMs ?? READY_FRAME_TIMEOUT_MS}ms`), { code: 'BACKEND_START_TIMEOUT' })
        logDiagnostic('backend.start.failed', { instanceId, error })
        reject(error)
      }, this.options.readyTimeoutMs ?? READY_FRAME_TIMEOUT_MS)

      let stdoutBuffer = ''
      let stderrTail = ''
      const onStderr = (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString('utf8')).slice(-8192) }
      child.stderr.on('data', onStderr)
      const onData = (chunk: Buffer) => {
        stdoutBuffer += chunk.toString('utf8')
        while (!settled) {
          const newline = stdoutBuffer.indexOf('\n')
          if (newline < 0) return
          const line = stdoutBuffer.slice(0, newline).trim()
          stdoutBuffer = stdoutBuffer.slice(newline + 1)
          if (!line) continue
          let frame: BackendReadyFrame
          try {
            frame = JSON.parse(line) as BackendReadyFrame
          } catch {
            logDiagnostic('backend.ready.unparsable', { line: line.slice(0, 256) })
            continue
          }
          if (frame?.type !== 'ready') continue
          if (frame.instance_id !== instanceId) {
            // A stale process from a previous boot must never be adopted.
            logDiagnostic('backend.ready.instanceMismatch')
            continue
          }
          settled = true
          clearTimeout(timer)
          child.stdout.off('data', onData)
          this.readyFrame = frame
          this.state = 'ready'
          child.stderr.off('data', onStderr)
          logActivity('backend.ready', { address: frame.address, instance: frame.instance_id })
          resolve(frame)
        }
      }

      const onError = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.stdout.off('data', onData)
        this.state = 'failed'
        logDiagnostic('backend.start.failed', { instanceId, error })
        reject(error)
      }

      // Lifetime listener: stays attached after startup so a post-ready crash
      // surfaces as 'exit' (the caller owns restart policy and playback fencing).
      const onExit = (code: number | null, signal: string | null) => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
          child.stdout.off('data', onData)
          this.state = 'failed'
          logDiagnostic('backend.start.failed', { instanceId, code, signal })
          const reason = stderrTail.trim().split(/\r?\n/).at(-1)
          reject(Object.assign(new Error(reason || `Backend exited during startup (code=${code} signal=${signal})`), {
            code: /DLL load failed|ModuleNotFoundError|ImportError/i.test(stderrTail) ? 'BACKEND_DEPENDENCY_MISSING' : 'BACKEND_START_FAILED',
          }))
          return
        }
        if (this.child !== child) return
        this.state = 'stopped'
        this.readyFrame = undefined
        logActivity('backend.exit', { code: String(code ?? ''), signal: signal ?? '' })
        this.emit('exit', { code, signal })
      }

      const detachStartup = () => {
        child.stdout.off('data', onData)
        child.off('error', onError)
        child.stderr.off('data', onStderr)
      }

      child.stdout.on('data', onData)
      logPythonStderr(child.stderr, 'backend')
      child.once('error', onError)
      child.once('exit', onExit)
    })
  }

  async health(): Promise<boolean> {
    if (!this.readyFrame) return false
    try {
      const response = await fetch(`${this.baseUrl}/api/v2/health/ready`, {
        headers: this.authorizationHeader(),
        signal: AbortSignal.timeout(3000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  /** End the Windows worker tree together so Python cannot leave model workers behind. */
  async stop(graceMs = 5000): Promise<void> {
    const child = this.child
    if (!child || child.exitCode !== null || child.signalCode != null) {
      this.state = 'stopped'
      this.readyFrame = undefined
      this.child = undefined
      return
    }
    const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
    if (process.platform === 'win32' && child.pid) {
      const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe')
      execFile(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: graceMs }, error => {
        if (error && child.exitCode === null && child.signalCode == null) child.kill('SIGKILL')
      })
    } else child.kill('SIGTERM')
    const grace = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already gone */ }
    }, graceMs)
    await exited
    clearTimeout(grace)
    this.state = 'stopped'
    this.readyFrame = undefined
    this.child = undefined
  }
}

/** Build the launch spec for the backend module using the same Python resolution as the engine. */
export function backendLaunchSpec(options: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  managedEngineDirectory?: string
  managedCrispDirectory?: string
  managedOnnxDirectory?: string
}): EngineLaunchSpec {
  // runpy.run_module('nola_translator_engine.backend') executes backend/__main__.py,
  // which starts uvicorn and prints the ready frame. Reusing the engine spec keeps
  // PYTHONPATH, the Python 3.12 assert and the crisp/engine DLL directories identical.
  return createEngineLaunchSpec({ ...options, module: 'nola_translator_engine.backend' })
}
