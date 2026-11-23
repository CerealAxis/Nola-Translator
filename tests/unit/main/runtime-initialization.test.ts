import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeManager } from '../../../src/main/runtime-manager'
import { missingLocalRuntime } from '../../../src/main/local-runtimes'
import { CRISP_RUNTIME_ID } from '../../../src/shared/compute'

const mocks = vi.hoisted(() => ({ run: vi.fn(), hardware: vi.fn(), engine: vi.fn(), llama: vi.fn(), crisp: vi.fn(), candidates: vi.fn() }))
vi.mock('electron', () => ({ net: {}, session: {} }))
vi.mock('node:child_process', () => {
  const execFile = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: mocks.run })
  return { execFile, default: { execFile } }
})
vi.mock('../../../src/main/hardware-inventory', () => ({ probeHardware: mocks.hardware }))
vi.mock('../../../src/main/local-runtimes', async importOriginal => ({
  ...await importOriginal<typeof import('../../../src/main/local-runtimes')>(),
  probeLocalEngine: mocks.engine, probeLocalLlama: mocks.llama, probeLocalCrisp: mocks.crisp, localCandidates: mocks.candidates,
}))

const directories: string[] = []
beforeEach(() => {
  mocks.run.mockResolvedValue({ stdout: '3.12.10', stderr: '' })
  mocks.hardware.mockResolvedValue({ adapters: [], nvidiaDriver: null, notes: [] })
  mocks.candidates.mockResolvedValue({ torch: [], llama: [] })
  mocks.engine.mockImplementation(async (_python: string, path: string) => ({ ...missingLocalRuntime(path), status: 'ready', backend: 'cuda', version: '2.14.1+cu132', gpuAvailable: true }))
  mocks.llama.mockImplementation(async (path: string) => ({ ...missingLocalRuntime(path), status: 'ready', backend: 'vulkan', version: 'b11532', gpuAvailable: true }))
  mocks.crisp.mockImplementation(async (_python: string, path: string) => path.includes(CRISP_RUNTIME_ID)
    ? missingLocalRuntime(path)
    : ({ ...missingLocalRuntime(path), status: 'ready', backend: 'vulkan', version: '0.8.43', gpuAvailable: true }))
})
afterEach(async () => { vi.clearAllMocks(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })

async function createManager(saved = true, catalog = '{"version":1,"packages":[]}', bundleLlama = false) {
  const directory = await mkdtemp(join(tmpdir(), 'nola-startup-runtime-'))
  directories.push(directory)
  await writeFile(join(directory, 'catalog.json'), catalog)
  await writeFile(join(directory, 'recipes.json'), '{"version":1,"recipes":[]}')
  const engine = join(directory, 'existing-torch')
  const llama = join(directory, 'existing-llama')
  if (saved) await writeFile(join(directory, 'current-components.json'), JSON.stringify({
    engine: { ...missingLocalRuntime(engine), status: 'ready' },
    llama: { ...missingLocalRuntime(llama), status: 'ready' },
  }))
  return { directory, engine, llama, manager: new RuntimeManager(directory, join(directory, 'catalog.json'), '', {
    baseDirectory: directory, recipesPath: join(directory, 'recipes.json'), localLlamaDirectory: bundleLlama ? llama : undefined,
  }) }
}

it('validates a previously selected Torch component even when cloud recognition only needs llama', async () => {
  const { manager, engine, directory } = await createManager()
  await manager.initialize()
  expect(mocks.engine).toHaveBeenCalledExactlyOnceWith(join(directory, 'python.exe'), engine)
  expect((await manager.snapshot()).local.engine).toMatchObject({ status: 'ready', version: '2.14.1+cu132' })
  expect(manager.selectedDirectories().engine).toBe(engine)
  expect(JSON.parse(await readFile(join(directory, 'current-components.json'), 'utf8')).engine.status).toBe('ready')
})

it('discovers all existing components without a saved selection regardless of cloud model use', async () => {
  const { manager, engine, llama } = await createManager(false)
  mocks.candidates.mockResolvedValue({ torch: [engine], llama: [llama] })
  await manager.initialize()
  expect((await manager.snapshot()).local.engine.status).toBe('ready')
  expect((await manager.snapshot()).local.llama.status).toBe('ready')
})

it('does not treat a matching external llama runtime as app-managed', async () => {
  const packageId = 'llama-vulkan-test'
  const catalog = JSON.stringify({ version: 1, packages: [{
    id: packageId, name: 'llama.cpp b11532 (Vulkan)', kind: 'llama', backend: 'vulkan', architecture: 'x64', version: 'b11532',
    url: 'https://example.com/llama.zip', sha256: 'a'.repeat(64), bytes: 1,
  }] })
  const { manager, directory } = await createManager(false, catalog)
  const external = join(directory, 'external-llama')
  mocks.candidates.mockResolvedValue({ torch: [], llama: [external] })
  await manager.initialize()
  expect((await manager.snapshot()).local.llama).toMatchObject({ id: packageId, managed: false, status: 'ready' })
})

it('allows uninstalling and reinstalling the bundled llama runtime without downloading it', async () => {
  const packageId = 'llama-b11532-vulkan-test'
  const catalog = JSON.stringify({ version: 1, packages: [{
    id: packageId, name: 'llama.cpp b11532 (Vulkan)', kind: 'llama', backend: 'vulkan', architecture: 'x64', version: 'b11532',
    url: 'https://example.com/llama.zip', sha256: 'a'.repeat(64), bytes: 1,
  }] })
  const { manager, llama } = await createManager(false, catalog, true)
  mocks.candidates.mockResolvedValue({ torch: [], llama: [llama] })
  await manager.initialize()

  expect((await manager.snapshot()).local.llama).toMatchObject({ id: packageId, bundled: true, managed: false, status: 'ready' })
  await manager.uninstall('llama')
  expect((await manager.snapshot()).local.llama.status).toBe('missing')

  await manager.install(packageId)
  expect((await manager.snapshot()).local.llama).toMatchObject({ id: packageId, bundled: true, managed: false, status: 'ready' })
})

it('allows disabling and restoring the bundled CrispASR runtime without downloading it', async () => {
  const { manager } = await createManager(false)
  await manager.initialize()

  expect((await manager.snapshot()).local.crisp).toMatchObject({ id: CRISP_RUNTIME_ID, bundled: true, managed: false, status: 'ready' })
  await manager.uninstall('crisp')
  expect((await manager.snapshot()).local.crisp?.status).toBe('missing')

  await manager.install(CRISP_RUNTIME_ID)
  expect((await manager.snapshot()).local.crisp).toMatchObject({ id: CRISP_RUNTIME_ID, bundled: true, managed: false, status: 'ready' })
})

it('completes startup normally when neither optional inference component is installed', async () => {
  const { manager } = await createManager(false)
  await manager.initialize()
  expect((await manager.snapshot()).local.engine.status).toBe('missing')
  expect((await manager.snapshot()).local.llama.status).toBe('missing')
})

it('records a broken saved component as failed instead of trusting persisted readiness', async () => {
  const { manager, engine } = await createManager()
  mocks.engine.mockResolvedValue({ ...missingLocalRuntime(engine), status: 'failed', reason: 'DLL load failed' })
  await manager.initialize()
  expect((await manager.snapshot()).local.engine).toMatchObject({ status: 'failed', reason: 'DLL load failed' })
  expect(manager.selectedDirectories().engine).toBeUndefined()
})
