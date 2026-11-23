import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeManager } from '../../../src/main/runtime-manager'
import { missingLocalRuntime } from '../../../src/main/local-runtimes'
import { BUNDLED_CRISP_RUNTIME, CRISP_RUNTIME_ID, CRISP_RUNTIME_VERSIONS, DEFAULT_ONNX_RUNTIME_ID, ONNX_RUNTIME_VERSIONS } from '../../../src/shared/compute'

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
    : ({ ...missingLocalRuntime(path), status: 'ready', backend: 'vulkan', version: BUNDLED_CRISP_RUNTIME.version, gpuAvailable: true }))
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

it('uses the saved ONNX Runtime and restores the bundled version when it is removed', async () => {
  const { manager, directory } = await createManager(false)
  const directml = ONNX_RUNTIME_VERSIONS.find(item => item.id === DEFAULT_ONNX_RUNTIME_ID)!
  const cpu = ONNX_RUNTIME_VERSIONS.find(item => item.id === 'onnx-cpu-1-23-2')!
  const managed = join(directory, directml.id)
  const bundled = join(directory, 'Lib', 'site-packages')
  for (const path of [managed, bundled]) {
    await mkdir(join(path, 'onnxruntime'), { recursive: true })
    await writeFile(join(path, 'onnxruntime', '__init__.py'), '')
  }
  await writeFile(join(managed, 'runtime-installed.json'), JSON.stringify({ kind: 'onnx', id: directml.id }))
  await writeFile(join(directory, 'current-components.json'), JSON.stringify({ onnx: { path: managed, id: directml.id } }))
  mocks.run.mockImplementation(async (_python, args) => {
    if (args.at(-1) === managed) return { stdout: JSON.stringify([directml.version, ['DmlExecutionProvider', 'CPUExecutionProvider']]) }
    if (args.at(-1) === bundled) return { stdout: JSON.stringify([cpu.version, ['CPUExecutionProvider']]) }
    if (args.includes('CPUExecutionProvider')) return { stdout: 'CPUExecutionProvider' }
    if (args.includes('DmlExecutionProvider')) throw new Error('DirectML adapter unavailable')
    return { stdout: '3.12.10' }
  })

  await manager.initialize()
  expect(manager.selectedDirectories().onnx).toBe(managed)
  expect((await manager.snapshot()).local.onnx).toMatchObject({
    id: directml.id, managed: true, gpuAvailable: false, executionProviders: ['CPUExecutionProvider'],
  })

  await manager.uninstall('onnx')
  expect(manager.selectedDirectories().onnx).toBeUndefined()
  expect((await manager.snapshot()).local.onnx).toMatchObject({ id: cpu.id, bundled: true })
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

it('restores a selected CrispASR CPU release and falls back to the bundle after uninstall', async () => {
  const { manager, directory } = await createManager(false)
  const release = CRISP_RUNTIME_VERSIONS.find(item => item.backend === 'cpu')!
  const managed = join(directory, release.id)
  await mkdir(managed)
  await writeFile(join(managed, 'runtime-installed.json'), JSON.stringify({ kind: 'crisp', id: release.id }))
  await writeFile(join(directory, 'current-components.json'), JSON.stringify({ crisp: { path: managed, id: release.id } }))
  mocks.crisp.mockImplementation(async (_python: string, path: string) => path === managed
    ? { ...missingLocalRuntime(path), status: 'ready', backend: 'cpu', version: release.version }
    : { ...missingLocalRuntime(path), status: 'ready', backend: 'vulkan', version: BUNDLED_CRISP_RUNTIME.version })

  await manager.initialize()
  expect(manager.selectedDirectories().crisp).toBe(managed)
  await manager.uninstall('crisp')
  expect((await manager.snapshot()).local.crisp).toMatchObject({ id: CRISP_RUNTIME_ID, bundled: true, status: 'ready' })
})

it.each([false, true])('upgrades bundled CrispASR and preserves a managed legacy selection (%s)', async managed => {
  const { manager, directory } = await createManager(false)
  const legacyId = 'crispasr-0-8-43-vulkan'
  const legacyDirectory = join(directory, legacyId)
  const bundledDirectory = join(directory, 'Lib', 'site-packages')
  const path = managed ? legacyDirectory : bundledDirectory
  await mkdir(legacyDirectory)
  await writeFile(join(legacyDirectory, 'runtime-installed.json'), JSON.stringify({ kind: 'crisp', id: legacyId }))
  await writeFile(join(directory, 'current-components.json'), JSON.stringify({ crisp: { path, id: legacyId } }))
  mocks.crisp.mockImplementation(async (_python: string, checked: string) => ({
    ...missingLocalRuntime(checked), status: 'ready', backend: 'vulkan',
    version: checked === legacyDirectory ? '0.8.43' : BUNDLED_CRISP_RUNTIME.version,
  }))

  await manager.initialize()

  expect((await manager.snapshot()).local.crisp).toMatchObject({ id: managed ? legacyId : CRISP_RUNTIME_ID, path })
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
