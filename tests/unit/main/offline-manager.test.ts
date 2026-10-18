import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { offlineArchive } from '../../../src/main/offline-archive'
import { OfflineManager, type ModelWorkerRequest } from '../../../src/main/offline-manager'

const roots: string[] = []
const managers: OfflineManager[] = []
afterEach(async () => {
  for (const manager of managers.splice(0)) await manager.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nola-offline-test-')); roots.push(root)
  const runtime = { prepareOffline: vi.fn(async () => {}), inspectOffline: vi.fn(async () => []), installOffline: vi.fn(async () => {}) }
  const models = vi.fn(async (_request?: ModelWorkerRequest) => ({ items: [{ id: 'test', name: 'Test', kind: 'model', bytes: 4, status: 'ready' }], totalBytes: 4, issues: [], compatible: true }))
  const release = vi.fn(async () => {})
  const reserve = vi.fn(() => release)
  const manager = new OfflineManager({ modelRoot: join(root, 'models'), runtimeRoot: join(root, 'runtimes'), appVersion: '1.0.9', runtimes: runtime, models, reserve, network: () => ({}) })
  managers.push(manager)
  return { root, runtime, models, release, reserve, manager }
}
async function settled(manager: OfflineManager) {
  for (let i = 0; i < 400 && manager.snapshot().state === 'running'; i++) await new Promise(resolve => setTimeout(resolve, 5))
  return manager.snapshot()
}
describe('offline resources coordinator', () => {
  it('preserves local compatibility mode and repository metadata across preview and installation', async () => {
    const { root, manager, models } = await fixture()
    const preview = await manager.inspectModel(join(root, 'local-model'), 'owner/custom')
    manager.install(preview.token)
    expect((await settled(manager)).state).toBe('completed')
    const requests = models.mock.calls.map(([request]) => request)
    expect(requests).toHaveLength(3)
    expect(requests.every(request => request?.localImport === true && request.repo === 'owner/custom')).toBe(true)
    expect(requests.at(-1)?.operation).toBe('install')
  })
  it('writes the completion manifest only after resources finish, without installing on the preparing computer', async () => {
    const { root, manager, runtime, reserve } = await fixture()
    runtime.inspectOffline.mockResolvedValue([{ id: 'torch-cpu', name: 'Torch', kind: 'runtime', bytes: 4, status: 'ready' }] as never)
    expect(manager.prepare({ modelIds: ['test'], runtimeIds: ['torch-cpu'] }, root).state).toBe('running')
    const task = await settled(manager)
    expect(task.state).toBe('completed')
    expect(task.outputPath).toMatch(/\.zip$/)
    const preview = await manager.inspectBundle(task.outputPath!)
    expect(preview.compatible).toBe(true)
    expect(preview.items.map(item => item.id)).toEqual(['test', 'torch-cpu'])
    expect(runtime.installOffline).not.toHaveBeenCalled()
    expect(reserve).not.toHaveBeenCalled()
  })
  it('allows a trusted versioned model ID for a direct model download', async () => {
    const { root, manager, models } = await fixture()
    const modelId = 'hy-mt2-1.8b-iq2-m'
    models.mockImplementation(async request => {
      if (request?.operation === 'prepare' && request.destination) {
        const modelDirectory = join(request.destination, 'models', modelId)
        await mkdir(modelDirectory, { recursive: true })
        await writeFile(join(modelDirectory, 'weights.gguf'), 'data')
        await writeFile(join(modelDirectory, 'model-manifest.json'), '{}')
      }
      return { items: [], totalBytes: 0, issues: [], compatible: true }
    })
    const task = manager.prepare({ modelIds: [modelId], runtimeIds: [], modelSource: 'huggingface' }, root, 'model')
    expect(task.state).toBe('running')
    const completed = await settled(manager)
    expect(completed.state).toBe('completed')
    expect(completed.outputPath).toBe(join(root, modelId, modelId))
    expect(await readFile(join(root, modelId, modelId, 'model-manifest.json'), 'utf8')).toBe('{}')
  })
  it('rejects an untrusted model ID before using it as an output path', async () => {
    const { root, manager, models } = await fixture()
    expect(() => manager.prepare({ modelIds: ['../../outside'], runtimeIds: [] }, root, 'model')).toThrow()
    expect(models).not.toHaveBeenCalled()
  })
  it('rejects forged preview tokens and never runs an installer', async () => {
    const { manager, runtime } = await fixture()
    expect(() => manager.install('C:\\somewhere')).toThrow()
    expect(runtime.installOffline).not.toHaveBeenCalled()
  })
  it('revalidates local files before install and holds the reservation until completion', async () => {
    const { root, manager, models, reserve, release } = await fixture()
    const preview = await manager.inspectModel(root)
    expect(preview.compatible).toBe(true)
    manager.install(preview.token)
    expect(reserve).toHaveBeenCalledTimes(1)
    expect((await settled(manager)).state).toBe('completed')
    expect(models.mock.calls.length).toBe(3)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('refuses a manifest for another application version before invoking resource code', async () => {
    const { root, manager, models } = await fixture()
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ format: 'nola-offline', version: 1, platform: 'win32-x64', appVersion: '0.0.1', modelIds: ['test'], runtimeIds: [] }))
    const archive = join(root, 'invalid.zip')
    const source = join(root, 'package')
    await mkdir(source)
    await writeFile(join(source, 'manifest.json'), await readFile(join(root, 'manifest.json')))
    await offlineArchive('python', 'pack', source, archive, new AbortController().signal, () => {})
    await expect(manager.inspectBundle(archive)).rejects.toMatchObject({ issue: 'incompatible' })
    expect(models).not.toHaveBeenCalled()
  })
  it('turns cancellation into a terminal state and cannot launch a competing task', async () => {
    const { root, manager, runtime } = await fixture()
    runtime.prepareOffline.mockImplementationOnce(async (_ids?: unknown, _path?: unknown, signal?: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
    })
    manager.prepare({ modelIds: [], runtimeIds: ['torch-cpu'] }, root)
    expect(() => manager.prepare({ modelIds: ['test'], runtimeIds: [] }, root)).toThrow()
    await new Promise(resolve => setTimeout(resolve, 10))
    manager.cancel()
    expect((await settled(manager)).state).toBe('cancelled')
  })
  it('cancels and drains a preflight worker when the app exits', async () => {
    const { manager, models, root } = await fixture()
    models.mockImplementationOnce(async (_request?: unknown, signal?: AbortSignal) => {
      await new Promise<void>((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
      throw new Error('unreachable')
    })
    const inspected = manager.inspectModel(root).catch(error => error as Error)
    expect(manager.busy).toBe(true)
    await manager.dispose()
    expect(await inspected).toBeInstanceOf(Error)
    expect(manager.busy).toBe(false)
  })
})
