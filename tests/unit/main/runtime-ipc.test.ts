import { expect, it, vi } from 'vitest'
import { recheckRuntimeEnvironment } from '../../../src/main/runtime-ipc'

vi.mock('electron', () => ({ ipcMain: {}, dialog: {}, BrowserWindow: {} }))

it('restarts the engine after a recheck discovers a previously missing Torch path', async () => {
  let directories: { engine?: string; llama?: string } = { llama: 'existing-llama' }
  const order: string[] = []
  const manager = {
    selectedDirectories: () => directories,
    recheck: vi.fn(async () => { order.push('check'); directories = { ...directories, engine: 'existing-torch' } }),
  }
  const engine = { currentState: 'ready' as const,
    stop: vi.fn(async () => { order.push('stop') }),
    start: vi.fn(async () => { order.push('start'); expect(manager.selectedDirectories().engine).toBe('existing-torch') }),
  }
  await expect(recheckRuntimeEnvironment(manager, engine, ['engine'])).resolves.toEqual({ engine: 'existing-torch', llama: 'existing-llama' })
  expect(manager.recheck).toHaveBeenCalledWith(['engine'])
  expect(order).toEqual(['check', 'stop', 'start'])
})

it('preserves the running engine when rechecking unchanged components', async () => {
  const manager = { selectedDirectories: () => ({ engine: 'existing-torch' }), recheck: vi.fn(async () => {}) }
  const engine = { currentState: 'ready' as const, stop: vi.fn(async () => {}), start: vi.fn(async () => {}) }
  await recheckRuntimeEnvironment(manager, engine)
  expect(engine.stop).not.toHaveBeenCalled()
  expect(engine.start).not.toHaveBeenCalled()
})
