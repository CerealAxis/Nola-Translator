import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

import { PREWARM_ERROR_CODES } from '../shared/contracts'
import type { EngineCommand, EngineEvent, EngineProcessState, PrewarmConfig, PrewarmErrorCode, PrewarmResult } from '../shared/contracts'
import { engineCommandSchema, parseEventLine } from '../shared/schemas'

/** Re-exported so a caller can read the state union without importing a main-process module. */
export type { EngineProcessState }

export type EngineLaunchSpec = {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
}

export type EngineProcessOptions = EngineLaunchSpec & {
  resolveLaunchSpec?: () => EngineLaunchSpec
  /**
   * Ceiling on one `hello` handshake. The default leaves room for a cold `import torch`
   * on a slow disk, which is the bulk of the wait.
   *
   * A wall clock is still the backstop, not the primary signal: a wedged child that never
   * speaks and never exits is exactly the case this bound exists for. Normal startup is
   * decided by the engine's own `ready`.
   */
  startupTimeoutMs?: number
  restartDelaysMs?: number[]
}

type PendingRequest = {
  expectedType: EngineEvent['type']
  /** Whether a matching event is the answer, or progress the caller merely streams onward. */
  isFinal: (event: EngineEvent) => boolean
  resolve: (event: EngineEvent) => void
  reject: (error: Error) => void
  /** `null` when the request is bounded by child lifetime instead of a deadline. */
  timer: ReturnType<typeof setTimeout> | null
  clear(): void
}

export function createEngineLaunchSpec(options: {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
  managedEngineDirectory?: string
}): EngineLaunchSpec {
  if (!options.isPackaged && !options.managedEngineDirectory && existsSync(join(options.appPath, '.venv', 'Scripts', 'python.exe'))) {
    return { command: join(options.appPath, '.venv', 'Scripts', 'python.exe'), args: ['-m', 'nola_translator_engine'], cwd: join(options.appPath, 'engine') }
  }
  const pythonDirectory = options.managedEngineDirectory ?? (options.isPackaged
    ? join(options.resourcesPath, 'engine') : join(options.appPath, 'engine', 'dist', 'NolaPythonEngine'))
  if (existsSync(join(pythonDirectory, 'python.exe'))) {
    return { command: join(pythonDirectory, 'python.exe'), args: ['-I', '-m', 'nola_translator_engine'], cwd: pythonDirectory }
  }
  if (options.managedEngineDirectory) {
    const command = join(options.managedEngineDirectory, 'NolaTranslatorEngine.exe')
    return { command, args: [], cwd: dirname(command) }
  }
  if (options.isPackaged) {
    const command = join(options.resourcesPath, 'engine', 'NolaTranslatorEngine.exe')
    return { command, args: [], cwd: dirname(command) }
  }
  return {
    command: join(options.appPath, '.venv', 'Scripts', 'python.exe'),
    args: ['-m', 'nola_translator_engine'],
    cwd: join(options.appPath, 'engine'),
  }
}

export class CaptionEventCoalescer {
  private readonly partials = new Map<string, Extract<EngineEvent, { type: 'caption' }>>()
  private readonly finalized = new Set<string>()
  private scheduled = false

  constructor(private readonly deliver: (event: EngineEvent) => void) {}

  push(event: EngineEvent): void {
    if (event.type !== 'caption') {
      if (event.type === 'sessionStarted' || event.type === 'sessionStopped') this.reset()
      this.deliver(event)
      return
    }

    const key = `${event.sessionId}:${event.segment.segmentId}`
    if (event.segment.isFinal) {
      this.partials.delete(key)
      this.finalized.add(key)
      if (this.finalized.size > 2048) this.finalized.delete(this.finalized.values().next().value!)
      this.deliver(event)
      return
    }
    if (this.finalized.has(key)) return

    const previous = this.partials.get(key)
    if (!previous || event.segment.revision > previous.segment.revision) this.partials.set(key, event)
    if (!this.scheduled) {
      this.scheduled = true
      setImmediate(() => this.flush())
    }
  }

  flush(): void {
    this.scheduled = false
    const events = [...this.partials.values()]
    this.partials.clear()
    for (const event of events) this.deliver(event)
  }

  reset(): void {
    this.partials.clear()
    this.finalized.clear()
  }
}

/**
 * Whether a later attempt could plausibly succeed.
 *
 * A missing or non-executable interpreter is the launch configuration itself being wrong, so
 * every retry re-pays a full cold start to reach the same failure. Retrying it only delays the
 * verdict the user needs to see, and the settings page is where they can fix it. A crash or a
 * missed handshake is transient by nature, which is what the backoff table is for.
 */
function isRetryable(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code !== 'ENOENT' && code !== 'EACCES' && code !== 'EPERM'
}

export class EngineProcess extends EventEmitter {
  private readonly options: Required<Pick<EngineProcessOptions, 'startupTimeoutMs' | 'restartDelaysMs'>> &
    EngineLaunchSpec & Pick<EngineProcessOptions, 'resolveLaunchSpec'>
  private child: ChildProcessWithoutNullStreams | null = null
  private lines: ReadlineInterface | null = null
  private desiredRunning = false
  private connectionTask: Promise<void> | null = null
  private writeQueue: Promise<void> = Promise.resolve()
  private readonly pending = new Map<string, PendingRequest>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private cancelRetry: (() => void) | null = null
  private readonly coalescer: CaptionEventCoalescer
  private state: EngineProcessState = 'stopped'
  private restarts = 0
  private capabilities: readonly string[] = []

  supports(capability: string): boolean { return this.capabilities.includes(capability) }

  constructor(options: EngineProcessOptions) {
    super()
    this.options = {
      ...options,
      startupTimeoutMs: options.startupTimeoutMs ?? 60_000,
      restartDelaysMs: options.restartDelaysMs ?? [250, 1_000, 4_000],
    }
    this.coalescer = new CaptionEventCoalescer((event) => this.emit('event', event))
  }

  get currentState(): EngineProcessState {
    return this.state
  }

  get restartCount(): number {
    return this.restarts
  }

  async start(): Promise<void> {
    if (this.state === 'ready') return
    this.desiredRunning = true
    this.restarts = 0
    await this.ensureConnection()
  }

  /**
   * `timeoutMs: null` binds the request to the child's lifetime: it settles when the engine
   * answers, or fails when the process dies, and no wall clock can cut it off. Used for the
   * handshake, where a slow cold start must not be mistaken for a dead engine.
   */
  async request<TType extends EngineEvent['type']>(
    command: EngineCommand,
    expectedType: TType,
    timeoutMs: number | null = 10_000,
    isFinal: (event: Extract<EngineEvent, { type: TType }>) => boolean = () => true
  ): Promise<Extract<EngineEvent, { type: TType }>> {
    const validated = engineCommandSchema.parse(command) as EngineCommand
    if (this.pending.has(validated.requestId)) {
      throw new Error(`重复的 requestId：${validated.requestId}`)
    }

    const response = new Promise<EngineEvent>((resolve, reject) => {
      const timer = timeoutMs === null
        ? null
        : setTimeout(() => {
          this.pending.delete(validated.requestId)
          reject(new Error(`等待 ${expectedType} 超时`))
        }, timeoutMs)
      const entry: PendingRequest = {
        expectedType,
        isFinal: event => isFinal(event as Extract<EngineEvent, { type: TType }>),
        resolve,
        reject,
        timer,
        clear: () => { if (timer !== null) clearTimeout(timer) },
      }
      this.pending.set(validated.requestId, entry)
    })

    try {
      await this.enqueueWrite(validated)
    } catch (error) {
      const pending = this.pending.get(validated.requestId)
      if (pending) {
        pending.clear()
        this.pending.delete(validated.requestId)
        pending.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    return (await response) as Extract<EngineEvent, { type: TType }>
  }

  /**
   * Loads the weights named by `config` without opening a session, and answers when they are
   * resident. `timeoutMs: null` for the handshake's reason — reading a model off disk is slow and
   * varies with the disk, and a wall clock here would report a healthy engine as a dead one.
   *
   * A refusal arrives as an `error` event rather than as a third state, so it reaches this method
   * as a rejection and is turned back into a result: the UI branches on `code`, not on a thrown
   * error. `state: 'loading'` reaches `onEngineEvent` and deliberately does not settle this call.
   */
  async prewarmModels(config: PrewarmConfig): Promise<PrewarmResult> {
    try {
      const event = await this.request(
        { protocolVersion: 1, type: 'prewarmModels', requestId: `prewarm-${randomUUID()}`, config },
        'modelsPrewarmed',
        null,
        answer => answer.state !== 'loading'
      )
      if (event.state !== 'ready') throw new Error(`引擎预热进度异常：${event.state}`)
      return { state: 'ready' }
    } catch (error) {
      const code = (error as { engineCode?: unknown }).engineCode
      return {
        state: 'failed',
        ...(typeof code === 'string' && (PREWARM_ERROR_CODES as readonly string[]).includes(code) ? { code: code as PrewarmErrorCode } : {}),
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async stop(): Promise<void> {
    this.desiredRunning = false
    this.cancelRetry?.()
    this.cancelRetry = null
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null

    const child = this.child
    if (!child) {
      this.setState('stopped')
      return
    }

    const wasReady = this.state === 'ready'
    this.setState('stopping')
    const exited = this.waitForChildExit(child, 2_000)
    if (wasReady) {
      try {
        await this.request(
          { protocolVersion: 1, type: 'shutdown', requestId: `shutdown-${randomUUID()}` },
          'shutdownComplete',
          2_000
        )
      } catch {
        // Falls through to the kill below.
      }
    }

    if (!(await exited) && this.child === child && child.exitCode === null) child.kill()
    this.detachChild(child)
    this.rejectPending(new Error('引擎已停止'))
    this.coalescer.reset()
    this.setState('stopped')
  }

  private ensureConnection(): Promise<void> {
    if (this.connectionTask) return this.connectionTask
    const task = this.connectWithRetries()
    this.connectionTask = task
    void task.finally(() => {
      if (this.connectionTask === task) this.connectionTask = null
    }).catch(() => undefined)
    return task
  }

  private async connectWithRetries(): Promise<void> {
    let lastError: Error = new Error('引擎启动失败')
    while (this.desiredRunning) {
      try {
        await this.spawnAndHandshake()
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.disposeCurrentChild()
        if (!this.desiredRunning) throw lastError
        if (!this.hasRetryLeft() || !isRetryable(lastError)) {
          this.setState('failed')
          this.emit('fatalError', lastError)
          throw lastError
        }
        const delayMs = this.options.restartDelaysMs[this.restarts]
        this.restarts += 1
        this.emit('restarting', { attempt: this.restarts, delayMs })
        await this.waitForRetry(delayMs)
      }
    }
    throw lastError
  }

  private async spawnAndHandshake(): Promise<void> {
    this.setState('starting')
    const launch = this.options.resolveLaunchSpec?.() ?? this.options
    const child = spawn(launch.command, launch.args, {
      cwd: launch.cwd,
      env: { ...process.env, ...this.options.env, ...launch.env, PYTHONUTF8: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
    this.lines.on('line', (line) => {
      if (this.child === child) this.handleLine(line)
    })
    child.stderr.on('data', (chunk: Buffer) => this.emit('log', chunk.toString('utf8')))
    child.once('error', (error) => this.handleTermination(child, error))
    child.once('exit', (code, signal) =>
      this.handleTermination(child, new Error(`引擎已退出（code=${code}, signal=${signal ?? 'none'}）`))
    )

    /*
     * Bounded by the child's lifetime rather than a wall clock: a cold `import torch`
     * decides when the engine is ready, and a slow disk must not read as a dead engine.
     * `startupTimeoutMs` still caps the one case a liveness signal cannot catch — a child
     * that stays alive but never answers. `handleTermination` settles this request if the
     * process dies first.
     */
    const handshake = await this.request(
      {
        protocolVersion: 1,
        type: 'hello',
        requestId: `hello-${randomUUID()}`,
        clientVersion: '0.1.0',
      },
      'ready',
      this.options.startupTimeoutMs
    )
    this.capabilities = handshake.capabilities
    if (this.child !== child) throw new Error('引擎在握手期间退出')
    this.setState('ready')
  }

  private enqueueWrite(command: EngineCommand): Promise<void> {
    const line = `${JSON.stringify(command)}\n`
    const write = async (): Promise<void> => {
      const child = this.child
      if (!child || child.stdin.destroyed) throw new Error('Python 引擎尚未运行')
      await new Promise<void>((resolve, reject) => {
        child.stdin.write(line, 'utf8', (error) => (error ? reject(error) : resolve()))
      })
    }
    const result = this.writeQueue.then(write, write)
    this.writeQueue = result.catch(() => undefined)
    return result
  }

  private handleLine(line: string): void {
    let event: EngineEvent
    try {
      event = parseEventLine(line)
    } catch (error) {
      this.emit('protocolError', error)
      this.rejectPending(new Error(`引擎通信数据无效：${String(error).slice(0, 1024)}`))
      this.child?.kill()
      return
    }

    const pending = this.pending.get(event.requestId)
    if (pending && (event.type === 'error' || (event.type === pending.expectedType && pending.isFinal(event)))) {
      pending.clear()
      this.pending.delete(event.requestId)
      if (event.type === 'error') {
        const reason = typeof event.details?.reason === 'string' ? `：${event.details.reason.slice(0, 512)}` : ''
        // The code rides along as a property so a caller that branches on it does not have to take
        // a localized message apart to find it. The message itself is unchanged.
        pending.reject(Object.assign(new Error(`引擎错误：${event.code}${reason}`), { engineCode: event.code }))
      } else {
        pending.resolve(event)
      }
    }
    this.coalescer.push(event)
  }

  private handleTermination(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return
    const shouldReconnect = this.desiredRunning && this.state === 'ready'
    this.detachChild(child)
    this.rejectPending(error)
    if (!this.desiredRunning) {
      this.setState('stopped')
      return
    }
    // Only this class can answer "recovering or given up": the backoff table and the used count
    // live here. A crash during the handshake uses the same test, because `rejectPending` has
    // already rejected that `hello` while `connectWithRetries` is still looping.
    this.setState(this.hasRetryLeft() ? 'recovering' : 'failed')
    this.emit('crash', error)
    if (shouldReconnect) void this.ensureConnection().catch(() => undefined)
  }

  /** Remaining backoff attempts. Defined here only, so a second count can never disagree. */
  private hasRetryLeft(): boolean {
    return this.restarts < this.options.restartDelaysMs.length
  }

  private detachChild(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return
    this.lines?.close()
    this.lines = null
    this.child = null
  }

  private disposeCurrentChild(): void {
    const child = this.child
    if (!child) return
    this.detachChild(child)
    if (child.exitCode === null) child.kill()
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.clear()
      pending.reject(error)
    }
    this.pending.clear()
  }

  private waitForRetry(delayMs: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = (): void => {
        if (this.retryTimer) clearTimeout(this.retryTimer)
        this.retryTimer = null
        this.cancelRetry = null
        resolve()
      }
      this.cancelRetry = finish
      this.retryTimer = setTimeout(finish, delayMs)
    })
  }

  private waitForChildExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
    if (child.exitCode !== null) return Promise.resolve(true)
    return new Promise((resolve) => {
      const finish = (exited: boolean): void => {
        clearTimeout(timer)
        child.off('exit', onExit)
        resolve(exited)
      }
      const onExit = (): void => finish(true)
      const timer = setTimeout(() => finish(false), timeoutMs)
      child.once('exit', onExit)
    })
  }

  private setState(state: EngineProcessState): void {
    if (this.state === state) return
    this.state = state
    this.emit('state', state)
  }
}
