import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { vi } from 'vitest'
import { PythonEnvironments } from '../../../src/main/python-environments'

const mocks = vi.hoisted(() => ({ execFile: vi.fn(), probe: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile, default: { execFile: mocks.execFile } }))
vi.mock('../../../src/main/local-runtimes', () => ({ probeLocalEngine: mocks.probe }))

it('exposes pip progress while running and keeps the failure log without applying a component', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-install-progress-'))
  const recipe = JSON.parse(await readFile(resolve('build/runtime-recipes.json'), 'utf8')).recipes.find((r: { id: string }) => r.id === 'torch-2-14-1-cpu')
  await writeFile(join(root, 'recipes.json'), JSON.stringify({ version: 1, recipes: [recipe] }))
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
  let finish: (error: Error | null, stdout: string, stderr: string) => void = () => undefined
  mocks.execFile.mockImplementation((_command, _args, _options, callback) => { finish = callback; return child })
  const manager = new PythonEnvironments(root, root, join(root, 'recipes.json'), async () => undefined, async () => recipe.wheel.sha256)
  try {
    await manager.initialize()
    const task = manager.install(recipe.id, false)
    const failed = task.catch(error => error as Error)
    await vi.waitFor(() => expect(mocks.execFile).toHaveBeenCalled(), { timeout: 2000 })
    child.stdout.write('Downloading tokenizers.whl\n')
    expect(manager.operation?.detail).toBe('Downloading tokenizers.whl')
    expect(manager.operation?.startedAt).toBeGreaterThan(0)
    const args = mocks.execFile.mock.calls[0][1] as string[]
    const options = mocks.execFile.mock.calls[0][2]
    expect(args).toContain('--no-compile')
    expect(options.env.TEMP).toBe(join(root, 'pip-temp'))
    expect(options.env.TMP).toBe(options.env.TEMP)
    child.stderr.write('ERROR: dependency unavailable\n')
    finish(new Error('pip failed'), '', 'ERROR: dependency unavailable')
    expect(await failed).toBeInstanceOf(Error)
    expect(args).toContain('--no-cache-dir')
    const log = await readFile(join(root, `install-${recipe.id}.log`), 'utf8')
    expect(log).toContain('Downloading tokenizers.whl')
    expect(log).toContain('ERROR: dependency unavailable')
    expect(manager.operation).toBeNull()
    expect(manager.states()[0].installed).toBe(false)
    expect(mocks.probe).not.toHaveBeenCalled()
    expect(await readdir(root)).not.toContain('wheel-cache')
    expect(await readdir(root)).not.toContain('pip-temp')
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})

it.each(['failure', 'cancel'])('cleans partially downloaded wheels on %s', async mode => {
  const root = await mkdtemp(join(tmpdir(), 'nola-install-cleanup-'))
  const recipe = JSON.parse(await readFile(resolve('build/runtime-recipes.json'), 'utf8')).recipes[0]
  await writeFile(join(root, 'recipes.json'), JSON.stringify({ version: 1, recipes: [recipe] }))
  let manager: PythonEnvironments
  manager = new PythonEnvironments(root, root, join(root, 'recipes.json'), async (_item, path, signal) => {
    await writeFile(path, 'partial wheel')
    if (mode === 'cancel') manager.cancel()
    signal.throwIfAborted()
    throw new Error('network failed')
  }, async () => recipe.wheel.sha256)
  try {
    await manager.initialize()
    await expect(manager.install(recipe.id, false)).rejects.toThrow(mode === 'cancel' ? '取消' : 'network failed')
    expect(await readdir(root)).toEqual(['recipes.json'])
    expect(manager.lastError).not.toContain('保留')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('cleans interrupted install artifacts on startup and preserves user directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-startup-cleanup-'))
  const recipe = JSON.parse(await readFile(resolve('build/runtime-recipes.json'), 'utf8')).recipes[0]
  await writeFile(join(root, 'recipes.json'), JSON.stringify({ version: 1, recipes: [recipe] }))
  for (const name of ['wheel-cache', 'pip-temp', `staging-${recipe.id}-12345678-1234-1234-1234-123456789abc`, 'my-models']) {
    await mkdir(join(root, name)); await writeFile(join(root, name, 'large.bin'), 'data')
  }
  const manager = new PythonEnvironments(root, root, join(root, 'recipes.json'), async () => undefined, async () => '')
  try {
    await manager.initialize()
    expect((await readdir(root)).sort()).toEqual(['my-models', 'recipes.json'])
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('waits for pip to close before cleaning a cancelled installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-pip-cancel-'))
  const recipe = JSON.parse(await readFile(resolve('build/runtime-recipes.json'), 'utf8')).recipes.find((r: { id: string }) => r.id === 'torch-2-14-1-cpu')
  await writeFile(join(root, 'recipes.json'), JSON.stringify({ version: 1, recipes: [recipe] }))
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() })
  let finish: (error: Error) => void = () => undefined
  mocks.execFile.mockImplementation((_command, _args, _options, callback) => { finish = callback; return child })
  const manager = new PythonEnvironments(root, root, join(root, 'recipes.json'), async (_item, path) => { await writeFile(path, 'wheel') }, async () => recipe.wheel.sha256)
  try {
    await manager.initialize()
    const task = manager.install(recipe.id, false).catch(error => error as Error)
    await vi.waitFor(() => expect(mocks.execFile).toHaveBeenCalled())
    manager.cancel()
    finish(new Error('aborted'))
    await Promise.resolve()
    expect(manager.operation).not.toBeNull()
    expect(await readdir(root)).toContain('pip-temp')
    child.emit('close')
    expect(await task).toBeInstanceOf(Error)
    expect(await readdir(root)).not.toContain('wheel-cache')
    expect(await readdir(root)).not.toContain('pip-temp')
  } finally { child.emit('close'); await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})
