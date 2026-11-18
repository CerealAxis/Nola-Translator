import { afterEach, expect, it, vi } from 'vitest'
import { ComicTranslation } from '../../../src/main/comic'
import { emptyGlossary } from '../../../src/shared/glossary'
import { emptyWordRules } from '../../../src/shared/word-rules'

const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: never[]) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: { handle: (name: string, callback: (...args: never[]) => unknown) => state.handlers.set(name, callback), removeHandler: (name: string) => state.handlers.delete(name) },
  dialog: {}, nativeImage: {},
}))
vi.mock('../../../src/main/window-options', () => ({ isTrustedRendererUrl: () => true }))
afterEach(() => { state.handlers.clear(); vi.unstubAllGlobals() })

function fixture() {
  const frame = { url: 'http://localhost/index.html' }
  const sender = { mainFrame: frame, send: vi.fn() }
  const window = { webContents: sender, isDestroyed: () => false }
  const service = new ComicTranslation({ mainDir: '.', getMainWindow: () => window as never,
    backend: async () => ({ baseUrl: 'http://127.0.0.1:12345', authorizationHeader: () => ({ Authorization: 'Bearer test-private' }) }),
    translate: async () => [], glossary: async () => emptyGlossary(), wordRules: async () => emptyWordRules(), publish: () => {},
  })
  const invoke = (name: string, raw?: unknown, event: unknown = { sender, senderFrame: frame }) => state.handlers.get(name)!(event as never, raw as never)
  return { service, invoke, sender, frame }
}

it('rejects other windows and subframes before accessing the backend', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const { service, invoke, sender } = fixture()
  expect(() => invoke('comic:list', undefined, { sender: {}, senderFrame: {} })).toThrow('Access denied')
  expect(() => invoke('comic:list', undefined, { sender, senderFrame: { url: 'http://localhost/index.html' } })).toThrow('Access denied')
  expect(fetch).not.toHaveBeenCalled()
  await service.dispose()
})

it('sends only the private authenticated business request and validates mutations', async () => {
  const fetch = vi.fn(async (_input: unknown, _init?: unknown) => ({ ok: true, json: async () => ({ success: true, data: [] }) })); vi.stubGlobal('fetch', fetch)
  const { service, invoke } = fixture()
  expect(await invoke('comic:list')).toEqual([])
  expect(String(fetch.mock.calls[0][0])).toBe('http://127.0.0.1:12345/api/v2/comics/books')
  expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer test-private' } })
  await expect(invoke('comic:edit', { action: 'shell', path: 'C:/' })).rejects.toThrow()
  await service.dispose()
})

it('waits for the renderer save acknowledgment and propagates failure', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: null }) })))
  const { service, invoke, sender } = fixture()
  invoke('comic:flush-ready')
  const saved = service.flushRenderer()
  const token = sender.send.mock.calls[0][1]
  invoke('comic:flush-result', { token, ok: true })
  await saved
  const failed = service.flushRenderer()
  invoke('comic:flush-result', { token: sender.send.mock.calls[1][1], ok: false })
  await expect(failed).rejects.toThrow('comicSaveFailed')
  await service.dispose()
})

it('rejects malformed backend project and task payloads at the IPC boundary', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: { id: 'not-a-project' } }) })))
  const { service, invoke } = fixture()
  await expect(invoke('comic:quick')).rejects.toThrow()
  await expect(invoke('comic:tasks')).rejects.toThrow()
  await service.dispose()
})

it('accepts an empty backend bookshelf entry without a cover page', async () => {
  const id = crypto.randomUUID()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: [
    { id, title: 'Empty', revision: 0, updatedAt: '', pageCount: 0, chapterCount: 1, coverPageId: null },
  ] }) })))
  const { service, invoke } = fixture()
  await expect(invoke('comic:list')).resolves.toEqual([expect.objectContaining({ id, coverPageId: undefined })])
  await service.dispose()
})

it('drops stale readiness after a reload or crash, including an in-flight flush', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, data: null }) })))
  const { service, invoke, sender } = fixture()
  invoke('comic:flush-ready')
  const pending = service.flushRenderer()
  service.rendererUnavailable()
  await pending
  await service.flushRenderer()
  expect(sender.send).toHaveBeenCalledTimes(1)
  invoke('comic:flush-ready')
  const readyAgain = service.flushRenderer()
  invoke('comic:flush-result', { token: sender.send.mock.calls[1][1], ok: true })
  await readyAgain
  await service.dispose()
})
