import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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
    const log = await readFile(join(root, `install-${recipe.id}.log`), 'utf8')
    expect(log).toContain('Downloading tokenizers.whl')
    expect(log).toContain('ERROR: dependency unavailable')
    expect(manager.operation).toBeNull()
    expect(manager.states()[0].installed).toBe(false)
    expect(mocks.probe).not.toHaveBeenCalled()
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})
