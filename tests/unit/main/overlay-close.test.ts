import { EventEmitter } from 'node:events'
import { afterEach, expect, it, vi } from 'vitest'
import type { EngineProcess } from '../../../src/main/engine-process'
import { IPC_CHANNELS, registerEngineIpc } from '../../../src/main/ipc'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>(),
  send: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, fn: (...args: any[]) => any) => electron.handlers.set(channel, fn),
    removeHandler: (channel: string) => electron.handlers.delete(channel) },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: electron.send } }] },
  net: {}, screen: {},
}))
let dispose: () => void
afterEach(() => { dispose?.(); vi.clearAllMocks(); vi.restoreAllMocks() })

function setup() {
  const engine = Object.assign(new EventEmitter(), {
    currentState: 'ready', start: vi.fn(), stop: vi.fn().mockResolvedValue(undefined),
    request: vi.fn().mockImplementation(async (command) => ({ sessionId: 'session-1', type: command.type === 'startSession' ? 'sessionStarted' : 'sessionStopped' })),
  })
  const window = { hide: vi.fn(), showInactive: vi.fn(), isDestroyed: () => false }
  dispose = registerEngineIpc(engine as unknown as EngineProcess, () => window as any)
  const invoke = (channel: string, ...args: unknown[]) => electron.handlers.get(channel)!({}, ...args)
  const start = () => invoke(IPC_CHANNELS.startSession, {
    audioSource: { kind: 'defaultOutput' }, recognitionModelId: 'qwen3-asr-0.6b-hf',
    sourceLanguage: 'auto', targetLanguages: [], recognitionMode: 'realtime',
  })
  return { engine, window, invoke, start }
}

it('closes an idle overlay without starting the engine', async () => {
  const { engine, window, invoke } = setup()
  engine.currentState = 'stopped'
  await invoke(IPC_CHANNELS.closeOverlay)
  expect(window.hide).toHaveBeenCalledTimes(1)
  expect(engine.start).not.toHaveBeenCalled()
  expect(engine.request).not.toHaveBeenCalled()
})

/** 让出整个微任务队列：一次 `await Promise.resolve()` 只推进一格，不够。 */
const flushMicrotasks = () => new Promise<void>(resolve => { setTimeout(resolve, 0) })

it('shares the stop request when closing and stopping concurrently', async () => {
  const { engine, window, invoke, start } = setup()
  await start()
  let finish!: (value: unknown) => void
  engine.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const stop = invoke(IPC_CHANNELS.stopSession, 'session-1')
  const close = invoke(IPC_CHANNELS.closeOverlay)
  /*
   * 这里**必须**把整个微任务队列排空，不能只 `await Promise.resolve()`。
   *
   * `stopSession` → `stopActiveSession` → `ensureReady` → `await whenRuntimeReady()`
   * 这条链上有好几个 await，而 `whenRuntimeReady` 是主进程那道运行时初始化闸门
   * （`index.ts`：`await runtimeInitialization`）。一次微任务只能推进一格，于是断言会在
   * `engine.request` 真正被调用**之前**执行，看到 0 次调用而失败。
   *
   * 去重本身不依赖等多久：`stoppingSession` 是在 `stopActiveSession` 里**同步**赋值的，
   * 所以第二个调用方（关闭浮窗）拿到的必然是同一个 in-flight promise。
   */
  await flushMicrotasks()
  expect(engine.request.mock.calls.filter(([command]) => command.type === 'stopSession')).toHaveLength(1)
  finish({ sessionId: 'session-1' })
  await Promise.all([stop, close])
  expect(window.hide).toHaveBeenCalled()
})

it('closes after the engine died without restarting it for a stale session', async () => {
  const { engine, window, invoke, start } = setup()
  await start()
  engine.currentState = 'failed'
  engine.start.mockRejectedValue(new Error('engine unavailable'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await invoke(IPC_CHANNELS.closeOverlay)
  expect(engine.start).not.toHaveBeenCalled()
  expect(engine.stop).toHaveBeenCalledTimes(1)
  expect(window.hide).toHaveBeenCalled()
  expect(electron.send).toHaveBeenCalledWith(IPC_CHANNELS.event, expect.objectContaining({ type: 'sessionStopped', sessionId: 'session-1' }))
})

it('stops the process and hides the window when session teardown rejects', async () => {
  const { engine, window, invoke, start } = setup()
  await start()
  engine.request.mockRejectedValueOnce(new Error('engine disconnected'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await invoke(IPC_CHANNELS.closeOverlay)
  expect(engine.stop).toHaveBeenCalledTimes(1)
  expect(window.hide).toHaveBeenCalled()
  expect(electron.send).toHaveBeenCalledWith(IPC_CHANNELS.event, expect.objectContaining({ type: 'sessionStopped' }))
})
