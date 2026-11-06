import { afterEach, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { ComicTranslation } from '../../../src/main/comic'
import { FeatureActivity } from '../../../src/main/feature-activity'
import type { ComicProject } from '../../../src/shared/comic'

const mocked = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) => mocked.handlers.set(name, handler), removeHandler: (name: string) => mocked.handlers.delete(name) }, dialog: {} }))
vi.mock('../../../src/main/window-options', () => ({ isTrustedRendererUrl: (url: string) => url === 'http://localhost/renderer/index.html' }))
afterEach(() => { vi.unstubAllGlobals(); mocked.handlers.clear() })

it('rejects other windows and child frames before opening the repository', async () => {
  const backend = vi.fn()
  const main = { webContents: { mainFrame: {} } }
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => main as never, backend, prepareRun: vi.fn(), publish: vi.fn() })
  const list = mocked.handlers.get('comic:list')!
  expect(() => list({ sender: {}, senderFrame: {} } as IpcMainInvokeEvent)).toThrow('Access denied')
  expect(() => list({ sender: main.webContents, senderFrame: {} } as IpcMainInvokeEvent)).toThrow('Access denied')
  expect(backend).not.toHaveBeenCalled()
  await service.dispose()
})

it('keeps the OCR lease and feature active until cancelled background work is terminal', async () => {
  const book = randomUUID(), page = randomUUID(), release = vi.fn(), activity = new FeatureActivity()
  let jobId = '', polls = 0, cancelRequested = false
  const project = { id: book, title: 'Book', revision: 1, config: { sourceLanguage: 'en', targetLanguage: 'zh', model: '', readingDirection: 'rtl', glossary: { mode: 'off' } }, jobs: [], pages: [] } as unknown as ComicProject
  vi.stubGlobal('fetch', vi.fn(async (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith('/run')) { jobId = JSON.parse(String(init?.body)).jobId; return Response.json({ ...project, jobs: [{ id: jobId, state: 'running' }] }) }
    if (url.pathname.endsWith('/cancel')) { cancelRequested = true; expect(release).not.toHaveBeenCalled(); return Response.json(project) }
    if (cancelRequested) { polls++; if (polls === 1) expect(release).not.toHaveBeenCalled() }
    return Response.json({ ...project, jobs: jobId ? [{ id: jobId, state: cancelRequested && polls > 1 ? 'cancelled' : 'running' }] : [] })
  }))
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null,
    backend: async () => ({ baseUrl: 'http://127.0.0.1:9999', authorizationHeader: () => ({ Authorization: 'private' }) }),
    prepareRun: async () => ({ model: 'test', headers: {}, release }), publish: vi.fn(), activity })
  await service.run({ projectId: book, pageIds: [page], expectedRevision: 1, stage: 'ocr' })
  expect(activity.has('comic-translation')).toBe(true)
  await service.dispose()
  expect(release).toHaveBeenCalledTimes(1)
  expect(polls).toBeGreaterThan(1)
  expect(activity.has('comic-translation')).toBe(false)
})

it('does not start work when shutdown completes during the initial project read', async () => {
  const prepareRun = vi.fn()
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null, backend: vi.fn(), prepareRun, publish: vi.fn() })
  let resolveProject!: (project: ComicProject) => void
  vi.spyOn(service, 'openProject').mockImplementation(() => new Promise(resolve => { resolveProject = resolve }))
  const running = service.run({ projectId: randomUUID(), pageIds: [randomUUID()], expectedRevision: 1, stage: 'ocr' })
  const rejected = expect(running).rejects.toThrow('comicUnavailable')
  await service.dispose()
  resolveProject({ revision: 1 } as ComicProject)
  await rejected
  expect(prepareRun).not.toHaveBeenCalled()
})

it('does not submit a prepared job after stop and releases its reservation', async () => {
  const release = vi.fn(), backend = vi.fn(), activity = new FeatureActivity()
  let prepared!: (value: { model: string; headers: Record<string, string>; release: () => void }) => void
  const prepareRun = vi.fn(() => new Promise<{ model: string; headers: Record<string, string>; release: () => void }>(resolve => { prepared = resolve }))
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null, backend, prepareRun, publish: vi.fn(), activity })
  vi.spyOn(service, 'openProject').mockResolvedValue({ revision: 1 } as ComicProject)
  const running = service.run({ projectId: randomUUID(), pageIds: [randomUUID()], expectedRevision: 1, stage: 'translate' })
  const rejected = expect(running).rejects.toThrow('comicUnavailable')
  await vi.waitFor(() => expect(prepareRun).toHaveBeenCalledOnce())
  const stopping = service.stop()
  prepared({ model: 'test', headers: {}, release })
  await rejected
  await stopping
  expect(backend).not.toHaveBeenCalled()
  expect(release).toHaveBeenCalledOnce()
  expect(activity.has('comic-translation')).toBe(false)
  await service.dispose()
})
