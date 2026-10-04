import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface, type Interface as ReadlineInterface } from 'node:readline'

import type { EngineCommand, EngineEvent, EngineProcessState } from '../shared/contracts'
import { engineCommandSchema, parseEventLine } from '../shared/schemas'

/**
 * 状态联合类型现在住在 `shared/contracts.ts`（界面也要读它），这里原样转出，
 * 免得 `import ... from './engine-process'` 的调用点为了拿一个类型而依赖主进程模块。
 * 类型是唯一的定义，**不要**在这里再抄一份。
 */
export type { EngineProcessState }

export type EngineLaunchSpec = {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
}

export type EngineProcessOptions = EngineLaunchSpec & {
  resolveLaunchSpec?: () => EngineLaunchSpec
  startupTimeoutMs?: number
  restartDelaysMs?: number[]
}

type PendingRequest = {
  expectedType: EngineEvent['type']
  resolve: (event: EngineEvent) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
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

  constructor(options: EngineProcessOptions) {
    super()
    this.options = {
      ...options,
      startupTimeoutMs: options.startupTimeoutMs ?? 10_000,
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

  async request<TType extends EngineEvent['type']>(
    command: EngineCommand,
    expectedType: TType,
    timeoutMs = 10_000
  ): Promise<Extract<EngineEvent, { type: TType }>> {
    const validated = engineCommandSchema.parse(command) as EngineCommand
    if (this.pending.has(validated.requestId)) {
      throw new Error(`重复的 requestId：${validated.requestId}`)
    }

    const response = new Promise<EngineEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(validated.requestId)
        reject(new Error(`等待 ${expectedType} 超时`))
      }, timeoutMs)
      this.pending.set(validated.requestId, { expectedType, resolve, reject, timer })
    })

    try {
      await this.enqueueWrite(validated)
    } catch (error) {
      const pending = this.pending.get(validated.requestId)
      if (pending) {
        clearTimeout(pending.timer)
        this.pending.delete(validated.requestId)
        pending.reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    return (await response) as Extract<EngineEvent, { type: TType }>
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
        // The exit path below still falls back to killing the process.
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
        if (!this.hasRetryLeft()) {
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

    await this.request(
      {
        protocolVersion: 1,
        type: 'hello',
        requestId: `hello-${randomUUID()}`,
        clientVersion: '0.1.0',
      },
      'ready',
      this.options.startupTimeoutMs
    )
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
    if (pending && (event.type === pending.expectedType || event.type === 'error')) {
      clearTimeout(pending.timer)
      this.pending.delete(event.requestId)
      if (event.type === 'error') {
        const reason = typeof event.details?.reason === 'string' ? `：${event.details.reason.slice(0, 512)}` : ''
        pending.reject(new Error(`引擎错误：${event.code}${reason}`))
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
    /*
     * **崩溃那一刻要报的是"还在重试"还是"没救了"，而只有这里答得出来。**
     *
     * 这一行原来无条件 `setState('failed')`，紧接着 `ensureConnection()` 又把状态置成
     * `starting`：一次 250ms 就能自愈的崩溃，在界面上先闪过一条红色 ENG-001，再自己好了。
     * 退避表（`restartDelaysMs`）和已用次数都在本类里，所以**重试意图在这里宣布**，
     * 界面照着显示"正在恢复"；退避耗尽时 `connectWithRetries` 自己置 `failed`
     * （上面那条），那才是真的要报障、也真的不会自己好。
     *
     * 握手途中崩掉（`state !== 'ready'`）也走同一个判据：那次 `hello` 已经被
     * `rejectPending` 拒掉，`connectWithRetries` 的循环还活着，所以"还有没有下一次尝试"
     * 问的仍然是同一件事。界面不需要、也不该知道这些分支。
     */
    this.setState(this.hasRetryLeft() ? 'recovering' : 'failed')
    this.emit('crash', error)
    if (shouldReconnect) void this.ensureConnection().catch(() => undefined)
  }

  /**
   * 退避表还剩几次。**定义只有这一处**，界面与 `ipc.ts` 都不得自己数 ——
   * 数错了就会出现"引擎已经放弃而界面还在说正在恢复"。
   */
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
      clearTimeout(pending.timer)
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
