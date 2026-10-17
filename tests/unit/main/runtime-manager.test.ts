import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeManager } from '../../../src/main/runtime-manager'
import { missingLocalRuntime } from '../../../src/main/local-runtimes'
import { DEFAULT_SETTINGS } from '../../../src/shared/settings'

vi.mock('electron', () => ({ net: {}, session: {} }))
const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

async function validatedManager() {
  const directory = await mkdtemp(join(tmpdir(), 'nola-validated-runtime-'))
  directories.push(directory)
  const engine = join(directory, 'engine')
  const llama = join(directory, 'llama')
  const python = join(directory, 'python.exe')
  await mkdir(join(engine, 'torch'), { recursive: true })
  await mkdir(llama)
  await writeFile(python, '')
  await writeFile(join(engine, 'torch', '__init__.py'), '')
  await writeFile(join(llama, 'llama-server.exe'), '')
  const manager = new RuntimeManager(directory, '', '', { baseDirectory: directory, recipesPath: '' })
  const local = {
    engine: { ...missingLocalRuntime(engine), status: 'ready' as const },
    llama: { ...missingLocalRuntime(llama), status: 'ready' as const },
  }
  Object.assign(manager, { local, pythonState: { path: python, ready: true, version: '3.12', reason: '' } })
  return { manager, engine, local }
}

it('reuses validated components on repeated caption starts without spawning another probe', async () => {
  const { manager } = await validatedManager()
  const recheck = vi.spyOn(manager, 'recheck')
  await manager.prepare(DEFAULT_SETTINGS.compute, 'llama')
  await manager.prepare(DEFAULT_SETTINGS.compute, 'llama')
  expect(recheck).not.toHaveBeenCalled()
})

it('runs llama ASR without Torch and checks Torch only when translation needs it', async () => {
  const { manager, engine, local } = await validatedManager()
  await rm(join(engine, 'torch', '__init__.py'))
  Object.assign(manager, { local: { ...local, engine: missingLocalRuntime(engine) } })
  const recheck = vi.spyOn(manager, 'recheck').mockResolvedValue(undefined)
  const compute = { ...DEFAULT_SETTINGS.compute, recognitionEngine: 'llama' as const }
  await expect(manager.prepare(compute, 'none', true)).resolves.toBeUndefined()
  await expect(manager.prepare(compute, 'llama', true)).resolves.toBeUndefined()
  expect(recheck).not.toHaveBeenCalled()
  await expect(manager.prepare(compute, 'torch', true)).rejects.toThrow('RUNTIME_TORCH')
})

it('rechecks a component that disappeared before using the cached readiness', async () => {
  const { manager, engine, local } = await validatedManager()
  await rm(join(engine, 'torch', '__init__.py'))
  const recheck = vi.spyOn(manager, 'recheck').mockImplementation(async () => {
    Object.assign(manager, { local: { ...local, engine: missingLocalRuntime(engine) } })
  })
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'none')).rejects.toThrow('RUNTIME_TORCH')
  expect(recheck).toHaveBeenCalledOnce()
})

it('starts remote-only captions without Torch and still requires local translation components', async () => {
  const { manager, engine, local } = await validatedManager()
  await rm(join(engine, 'torch', '__init__.py'))
  Object.assign(manager, { local: { ...local, engine: missingLocalRuntime(engine) } })
  const recheck = vi.spyOn(manager, 'recheck').mockResolvedValue(undefined)
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'none', false)).resolves.toBeUndefined()
  expect(recheck).not.toHaveBeenCalled()
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'llama', false)).resolves.toBeUndefined()
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'torch', false)).rejects.toThrow('RUNTIME_TORCH')
})

it('allows cloud-only service without either inference component and validates each selected local model', async () => {
  const { manager, engine, local } = await validatedManager()
  await rm(join(engine, 'torch', '__init__.py'))
  await rm(join(local.llama.path, 'llama-server.exe'))
  Object.assign(manager, { local: { engine: missingLocalRuntime(), llama: missingLocalRuntime() } })
  const recheck = vi.spyOn(manager, 'recheck').mockResolvedValue(undefined)
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'none', false)).resolves.toBeUndefined()
  expect(recheck).not.toHaveBeenCalled()
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'none', true)).rejects.toThrow('RUNTIME_TORCH')
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'llama', false)).rejects.toThrow('RUNTIME_LLAMA')
})

import { OfflineRuntimes } from '../../../src/main/offline-runtimes'
import type { RuntimePackage } from '../../../src/shared/compute'
const offlineProbes = vi.hoisted(() => ({ llama: vi.fn(), engine: vi.fn() }))
vi.mock('../../../src/main/local-runtimes', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/main/local-runtimes')>()
  return { ...actual, probeLocalLlama: offlineProbes.llama, probeLocalEngine: offlineProbes.engine }
})

it.each(['ready', 'corrupted'] as const)('revalidates an existing offline runtime before skipping it: %s', async state => {
  const { manager } = await validatedManager()
  const pkg: RuntimePackage = { id: 'llama-offline-test', name: 'Llama test', kind: 'llama', backend: 'cpu', architecture: 'x64', version: 'b123', bytes: 1, sha256: 'a'.repeat(64), url: 'https://example.com/archive.zip' }
  const directory = join(manager.directory, pkg.id)
  await mkdir(directory)
  await writeFile(join(directory, 'runtime-installed.json'), JSON.stringify({ id: pkg.id, kind: 'llama' }))
  const selected = { ...missingLocalRuntime(directory), id: pkg.id, managed: true, status: 'ready' as const, backend: 'cpu', version: 'b123' }
  Object.assign(manager, { packages: [pkg], local: { engine: missingLocalRuntime(), llama: selected } })
  offlineProbes.llama.mockResolvedValue({ ...selected, version: state === 'ready' ? 'b123' : 'b122' })
  const inspect = vi.spyOn(OfflineRuntimes.prototype, 'inspect').mockResolvedValue([{ id: pkg.id, name: pkg.name, kind: 'runtime', bytes: 1, status: 'ready' }])
  const install = vi.spyOn(OfflineRuntimes.prototype, 'install').mockResolvedValue(undefined)
  try {
    expect((await manager.inspectOffline('bundle'))[0].status).toBe(state === 'ready' ? 'installed' : 'ready')
    await manager.installOffline([pkg.id], 'bundle', new AbortController().signal, vi.fn())
    if (state === 'ready') expect(install).not.toHaveBeenCalled()
    else expect(install).toHaveBeenCalledWith([pkg.id], 'bundle', expect.any(AbortSignal), expect.any(Function))
    expect((await manager.snapshot()).local.llama).toEqual(selected)
    expect(offlineProbes.llama).toHaveBeenCalledTimes(2)
  } finally { inspect.mockRestore(); install.mockRestore(); vi.clearAllMocks() }
})
