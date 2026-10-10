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

it('rechecks a component that disappeared before using the cached readiness', async () => {
  const { manager, engine, local } = await validatedManager()
  await rm(join(engine, 'torch', '__init__.py'))
  const recheck = vi.spyOn(manager, 'recheck').mockImplementation(async () => {
    Object.assign(manager, { local: { ...local, engine: missingLocalRuntime(engine) } })
  })
  await expect(manager.prepare(DEFAULT_SETTINGS.compute, 'none')).rejects.toThrow('RUNTIME_TORCH')
  expect(recheck).toHaveBeenCalledOnce()
})
