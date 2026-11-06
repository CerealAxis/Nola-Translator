import { afterEach, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { execFile, spawn } from 'node:child_process'
import { GameHook } from '../../../src/main/game-hook'

vi.mock('node:child_process', () => {
  const methods = { execFile: vi.fn(), spawn: vi.fn() }
  return { ...methods, default: methods }
})
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks() })

it('never probes or attaches after stop interrupts native resource validation', async () => {
  const hook = new GameHook('C:/Nola/hook')
  let checked!: (available: boolean) => void
  vi.spyOn(hook, 'available').mockImplementation(() => new Promise(resolve => { checked = resolve }))
  const starting = hook.start('window:123:0', undefined, vi.fn())
  await hook.stop()
  checked(true)
  await starting
  expect(execFile).not.toHaveBeenCalled()
  expect(spawn).not.toHaveBeenCalled()
})

it('reports broken native command pipes without an unhandled stream error', async () => {
  const hook = new GameHook('C:/Nola/hook'), changed = vi.fn()
  vi.spyOn(hook, 'available').mockResolvedValue(true)
  vi.mocked(execFile).mockImplementation(((_file: unknown, _args: unknown, _options: unknown, callback: (error: null, result: unknown) => void) => {
    callback(null, { stdout: JSON.stringify({ type: 'target', pid: 42, started: '123', architecture: 'x64', executable: 'C:/game.exe' }) })
  }) as never)
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null as number | null })
  vi.mocked(spawn).mockReturnValue(child as never)
  const starting = hook.start('window:123:0', undefined, changed)
  await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce())
  child.stdout.write('{"type":"ready"}\n')
  await starting
  expect(() => child.stdin.emit('error', new Error('EPIPE'))).not.toThrow()
  expect(changed).toHaveBeenLastCalledWith({ type: 'error', code: 'hookUnavailable' })
  child.exitCode = 0
  child.emit('exit', 0)
  await hook.stop()
})
