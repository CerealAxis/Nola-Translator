import { afterEach, expect, it, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'node:crypto'
import { ComicTranslation } from '../../../src/main/comic'
import { FeatureActivity } from '../../../src/main/feature-activity'
import type { ComicProject } from '../../../src/shared/comic'

const mocked = vi.hoisted(() => ({ handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: { handle: (name: string, handler: (event: IpcMainInvokeEvent, input?: unknown) => unknown) => mocked.handlers.set(name, handler), removeHandler: (name: string) => mocked.handlers.delete(name) }, dialog: {}, nativeImage: { createFromBuffer: () => ({ getSize: () => ({ width: 120, height: 60 }) }) } }))
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

it('scopes editor requests to their project and keeps library and configuration actions in the host', async () => {
  const book = randomUUID(), other = randomUUID(), frame = { url: 'http://localhost/renderer/comic-editor.html' }
  const sender = { mainFrame: frame }, event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const backend = vi.fn(async () => ({ baseUrl: 'http://127.0.0.1:9999', authorizationHeader: () => ({}) }))
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: book, revision: 1 })))
  const isEditorSender = vi.fn((candidate: IpcMainInvokeEvent, id?: string) => candidate.sender === sender && (!id || id === book))
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null, backend,
    isEditorSender, prepareRun: vi.fn(), publish: vi.fn() })
  await expect(mocked.handlers.get('comic:open')!(event, book)).resolves.toMatchObject({ id: book })
  await expect(mocked.handlers.get('comic:fonts')!(event)).resolves.toBeDefined()
  backend.mockClear()
  for (const [channel, input] of [['comic:open', other], ['comic:edit', { projectId: other }],
    ['comic:export', { projectId: other }], ['comic:list', undefined], ['comic:purge-runtime', undefined],
    ['comic:delete', book], ['comic:import', { projectId: book, kind: 'images' }],
    ['comic:image', {}]] as const) {
    expect(() => mocked.handlers.get(channel)!(event, input)).toThrow('Access denied')
  }
  for (const command of [{ action: 'rename', title: 'Changed' }, { action: 'addChapter', title: 'New' }] as const) {
    expect(() => mocked.handlers.get('comic:edit')!(event, { projectId: book, operationId: randomUUID(),
      expectedRevision: 1, command })).toThrow('Access denied')
  }
  expect(() => mocked.handlers.get('comic:open')!({ ...event, senderFrame: {} } as IpcMainInvokeEvent, book)).toThrow('Access denied')
  expect(backend).not.toHaveBeenCalled()
  await service.dispose()
})

it('allows trusted editors to request only a named font preview', async () => {
  const frame = { url: 'http://localhost/renderer/comic-editor.html' }, sender = { mainFrame: frame }
  const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const fetch = vi.fn(async (_url: URL) => new Response(new Uint8Array([137, 80, 78, 71])))
  vi.stubGlobal('fetch', fetch)
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null,
    backend: async () => ({ baseUrl: 'http://127.0.0.1:9999', authorizationHeader: () => ({}) }),
    isEditorSender: candidate => candidate.sender === sender, prepareRun: vi.fn(), publish: vi.fn() })
  const preview = mocked.handlers.get('comic:font-preview')!
  await expect(preview(event, 'Noto Sans SC')).resolves.toEqual({ image: 'data:image/png;base64,iVBORw==', width: 120, height: 60 })
  expect(String(fetch.mock.calls[0][0])).toContain('/fonts/preview?family=Noto+Sans+SC')
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await expect(preview(event, 'Wingdings')).resolves.toBeNull()
  expect(() => preview({ sender: {}, senderFrame: {} } as IpcMainInvokeEvent, 'Noto Sans SC')).toThrow('Access denied')
  await expect(preview(event, '')).rejects.toThrow()
  await service.dispose()
})

it('scopes region preview to the editor project and sends a read-only preview body', async () => {
  const book = randomUUID(), page = randomUUID(), other = randomUUID(), frame = { url: 'http://localhost/renderer/comic-editor.html' }
  const sender = { mainFrame: frame }, event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const fetch = vi.fn(async (_url: URL, _init?: RequestInit) => Response.json({ image: 'data:image/png;base64,AA==', layout: null }))
  vi.stubGlobal('fetch', fetch)
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null,
    backend: async () => ({ baseUrl: 'http://127.0.0.1:9999', authorizationHeader: () => ({}) }),
    isEditorSender: (candidate, id) => candidate.sender === sender && (!id || id === book), prepareRun: vi.fn(), publish: vi.fn() })
  const preview = mocked.handlers.get('comic:preview-region')!
  const region = { id: randomUUID(), sourceText: 'source', targetText: 'A😀', x: 1, y: 2, width: 20, height: 30,
    confidence: null, locked: true, ignored: false, qa: [], style: { fontSize: 12, color: '#000000', direction: 'horizontal', align: 'left' },
    textRuns: [{ start: 1, end: 2, style: { color: '#ff0000' } }] }
  await expect(preview(event, { projectId: book, pageId: page, region })).resolves.toMatchObject({ image: 'data:image/png;base64,AA==' })
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(String(fetch.mock.calls[0][0])).toContain(`/projects/${book}/pages/${page}/preview-region`)
  expect(fetch.mock.calls[0][1]?.method).toBe('POST')
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ region })
  expect(() => preview(event, { projectId: other, pageId: page, region })).toThrow('Access denied')
  expect(() => preview(event, { projectId: book, pageId: page, region: { ...region, textRuns: [{ start: 1, end: 3, style: { color: '#ff0000' } }] } })).toThrow()
  expect(() => preview(event, { projectId: book, pageId: page, region: { ...region, textRuns: [{ start: 0, end: 2, style: {} }, { start: 1, end: 2, style: {} }] } })).toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
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


it('validates bounded image previews and preserves original requests when no bound is supplied', async () => {
  const book = randomUUID(), page = randomUUID(), layer = randomUUID(), frame = { url: 'http://localhost/renderer/comic-editor.html' }
  const sender = { mainFrame: frame }, event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent
  const fetch = vi.fn(async (_url: URL) => new Response(new Uint8Array([137, 80, 78, 71])))
  vi.stubGlobal('fetch', fetch)
  const service = new ComicTranslation({ mainDir: '', getMainWindow: () => null,
    backend: async () => ({ baseUrl: 'http://127.0.0.1:9999', authorizationHeader: () => ({}) }),
    isEditorSender: candidate => candidate.sender === sender, prepareRun: vi.fn(), publish: vi.fn() })
  for (const [channel, input] of [
    ['comic:image', { projectId: book, pageId: page, kind: 'clean' }],
    ['comic:layer-image', { projectId: book, pageId: page, kind: 'text', layerId: layer }],
  ] as const) {
    const handler = mocked.handlers.get(channel)!
    await handler(event, input)
    expect(new URL(String(fetch.mock.calls.at(-1)![0])).search).toBe('')
    for (const maxPixels of [10_000, 4_000_000]) {
      await handler(event, { ...input, maxPixels })
      expect(new URL(String(fetch.mock.calls.at(-1)![0])).searchParams.get('max_pixels')).toBe(String(maxPixels))
    }
    const calls = fetch.mock.calls.length
    for (const maxPixels of [9999, 4_000_001, 10_000.5, NaN, Infinity, '10000', null, true]) {
      await expect(handler(event, { ...input, maxPixels })).rejects.toThrow()
    }
    expect(fetch).toHaveBeenCalledTimes(calls)
  }
  await service.dispose()
})
