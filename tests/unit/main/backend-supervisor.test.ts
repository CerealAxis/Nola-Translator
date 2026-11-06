import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.hoisted(() => vi.fn())
const execFileMock = vi.hoisted(() => vi.fn())
const appMetricsMock = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ app: { getAppMetrics: appMetricsMock } }))
vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, default: { ...actual, spawn: spawnMock, execFile: execFileMock }, spawn: spawnMock, execFile: execFileMock }
})

import { BackendSupervisor, electronPlaybackProcessTree } from '../../../src/main/backend-supervisor'

function fakeChild(stdoutLines: string[], opts?: { exitCode?: number | null; exitSignal?: string | null }) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: null,
    kill: vi.fn(),
    exitCode: opts?.exitCode ?? null,
    pid: 4242,
  })
  setTimeout(() => {
    for (const line of stdoutLines) child.stdout.emit('data', Buffer.from(line + '\n'))
    if (opts?.exitCode !== undefined && opts.exitCode !== null) {
      child.emit('exit', opts.exitCode, opts.exitSignal ?? null)
    }
  }, 0)
  return child
}

afterEach(() => vi.clearAllMocks())

const spec = { command: 'python.exe', args: ['-I', '-X', 'utf8', '-c', 'bootstrap'], cwd: 'C:/engine' }

describe('BackendSupervisor', () => {
  it('resolves on the ready frame and keeps the token out of argv', async () => {
    // A stale ready frame from a previous boot must be ignored; only the frame
    // carrying this supervisor's instance id completes startup.
    const child = fakeChild([])
    spawnMock.mockReturnValue(child as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 1000 })
    const start = supervisor.start()
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'ready', address: '127.0.0.1:9999', instance_id: 'stale-instance', protocol_version: 2,
    }) + '\n'))
    child.stdout.emit('data', Buffer.from('unparsable noise\n'))
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'ready', address: '127.0.0.1:5100', instance_id: supervisor.instanceId, protocol_version: 2,
    }) + '\n'))
    const frame = await start
    expect(frame.address).toBe('127.0.0.1:5100')
    expect(supervisor.baseUrl).toBe('http://127.0.0.1:5100')
    expect(supervisor.currentState).toBe('ready')
    // Token travels via env only, never argv.
    const [, args, options] = spawnMock.mock.calls[0] as never as [string, string[], { env: Record<string, string> }]
    expect(args.join(' ')).not.toContain(supervisor.controlToken)
    expect(options.env.NOLA_BACKEND_CONTROL_TOKEN).toBe(supervisor.controlToken)
    expect(options.env.NOLA_BACKEND_INSTANCE_ID).toBe(supervisor.instanceId)
    expect(supervisor.authorizationHeader().Authorization).toBe(`Bearer ${supervisor.controlToken}`)
  })

  it('fails when the ready frame never arrives', async () => {
    spawnMock.mockReturnValue(fakeChild([]) as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 50 })
    await expect(supervisor.start()).rejects.toThrow(/did not report ready/)
    expect(supervisor.currentState).toBe('failed')
  })

  it('reads a ready frame after other lines in the same stdout chunk', async () => {
    const child = fakeChild([])
    spawnMock.mockReturnValue(child as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 100 })
    const start = supervisor.start()
    const frame = { type: 'ready', address: '127.0.0.1:5100', instance_id: supervisor.instanceId, protocol_version: 2 }
    child.stdout.emit('data', Buffer.from('\nstartup noise\n' + JSON.stringify({ type: 'progress' }) + '\n'
      + JSON.stringify({ ...frame, instance_id: 'stale-instance' }) + '\n' + JSON.stringify(frame) + '\n'))
    await expect(start).resolves.toEqual(frame)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('fails when the child exits during startup', async () => {
    spawnMock.mockReturnValue(fakeChild([], { exitCode: 1 }) as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 2000 })
    await expect(supervisor.start()).rejects.toThrow(/exited during startup/)
    expect(supervisor.currentState).toBe('failed')
  })

  it('emits exit after a crash post-ready and clears the ready frame', async () => {
    const child = fakeChild([])
    spawnMock.mockReturnValue(child as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 2000 })
    const start = supervisor.start()
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'ready', address: '127.0.0.1:5200', instance_id: supervisor.instanceId, protocol_version: 2,
    }) + '\n'))
    await start
    const exited = new Promise(resolve => supervisor.once('exit', resolve))
    child.emit('exit', 3221225477, null)
    const info = await exited as { code: number | null }
    expect(info.code).toBe(3221225477)
    expect(supervisor.currentState).toBe('stopped')
    expect(supervisor.ready).toBeUndefined()
    const oldId = supervisor.instanceId
    const oldToken = supervisor.controlToken
    const replacement = fakeChild([])
    spawnMock.mockReturnValue(replacement as never)
    const restart = supervisor.start()
    replacement.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'ready', address: '127.0.0.1:5201', instance_id: supervisor.instanceId, protocol_version: 2,
    }) + '\n'))
    await restart
    expect(supervisor.instanceId).not.toBe(oldId)
    expect(supervisor.controlToken).not.toBe(oldToken)
  })

  it('stop kills the child and returns to stopped', async () => {
    const child = fakeChild([])
    spawnMock.mockReturnValue(child as never)
    const supervisor = new BackendSupervisor({ spec, readyTimeoutMs: 2000 })
    const start = supervisor.start()
    child.stdout.emit('data', Buffer.from(JSON.stringify({
      type: 'ready', address: '127.0.0.1:5300', instance_id: supervisor.instanceId, protocol_version: 2,
    }) + '\n'))
    await start
    setTimeout(() => child.emit('exit', 0, 'SIGTERM'), 5)
    await supervisor.stop(1000)
    if (process.platform === 'win32') {
      expect(execFileMock).toHaveBeenCalledWith(expect.stringContaining('taskkill.exe'), ['/PID', '4242', '/T', '/F'],
        expect.objectContaining({ windowsHide: true }), expect.any(Function))
    } else expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(supervisor.currentState).toBe('stopped')
  })

  it('health reports false before ready', async () => {
    const supervisor = new BackendSupervisor({ spec })
    expect(await supervisor.health()).toBe(false)
  })
})

describe('electronPlaybackProcessTree', () => {
  it('falls back to the main PID outside Electron', () => {
    appMetricsMock.mockReturnValue(undefined)
    const tree = electronPlaybackProcessTree()
    expect(tree).toContain(process.pid)
    expect(tree.length).toBeGreaterThan(0)
  })

  it('includes every child PID and de-duplicates the tree', () => {
    appMetricsMock.mockReturnValue([
      { pid: process.pid },
      { pid: 4242 },
      { pid: 8080 },
      { pid: 4242 },
    ])
    const tree = electronPlaybackProcessTree()
    expect(tree).toContain(process.pid)
    expect(tree).toContain(4242)
    expect(tree).toContain(8080)
    // The real playback tree covers main + renderer/utility children, deduped.
    expect(new Set(tree).size).toBe(tree.length)
    expect(tree.length).toBeGreaterThanOrEqual(3)
  })

  it('survives a throwing app.getAppMetrics probe', () => {
    appMetricsMock.mockImplementation(() => { throw new Error('probe failed') })
    expect(electronPlaybackProcessTree()).toContain(process.pid)
  })
})
