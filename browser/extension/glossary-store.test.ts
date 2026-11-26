import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as providers from './providers'
import { extensionGlossary, recoverExtensionConfiguration, restoreExtensionConfiguration } from './glossary-store'
import { DEFAULT_PREFERENCES } from './preferences'

const rows = new Map<string, unknown>()
let writeQueue = Promise.resolve()
beforeEach(() => {
  rows.clear(); writeQueue = Promise.resolve()
  let lockQueue = Promise.resolve()
  vi.stubGlobal('navigator', { language: 'en', locks: { request(_name: string, run: () => Promise<void>) { const result = lockQueue.then(run); lockQueue = result.catch(() => {}); return result } } })
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } })
  vi.spyOn(providers, 'providerDatabase').mockImplementation(async () => ({ close() {}, transaction(_store: string, mode?: string) {
    let aborted = false
    let changes = new Map(rows)
    let complete!: () => void
    const ready = mode === 'readwrite' ? writeQueue : Promise.resolve()
    if (mode === 'readwrite') writeQueue = new Promise<void>(resolve => { complete = resolve })
    const transaction: any = { objectStore: () => ({
      count(key: string) { const request: any = {}; queueMicrotask(() => { request.result = rows.has(key) ? 1 : 0; request.onsuccess() }); return request },
      get(key: string) { const request: any = {}; void ready.then(() => { changes = new Map(rows); request.result = structuredClone(rows.get(key)); request.onsuccess(); queueMicrotask(() => { if (!aborted) { if (mode === 'readwrite') { rows.clear(); for (const [key, value] of changes) rows.set(key, value) } transaction.oncomplete?.() } complete?.() }) }); return request },
      put(value: unknown, key: string) { changes.set(key, structuredClone(value)) },
      delete(key: string) { changes.delete(key) },
    }), abort() { aborted = true; queueMicrotask(() => { transaction.onabort?.(); complete?.() }) } }
    return transaction
  } }) as unknown as IDBDatabase)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('serializes two writers with the same revision and replays an operation without duplicating it', async () => {
  const document = await extensionGlossary.snapshot()
  const first = { operationId: crypto.randomUUID(), expectedRevision: document.revision, command: { action: 'setEnabled' as const, enabled: false } }
  const outcomes = await Promise.allSettled([extensionGlossary.command(first), extensionGlossary.command({ ...first, operationId: crypto.randomUUID() })])
  expect(outcomes.map(item => item.status)).toEqual(['fulfilled', 'rejected'])
  expect((await extensionGlossary.command(first)).revision).toBe(1)
})

it('keeps a durable configuration journal when Chrome preferences fail and completes it on recovery', async () => {
  const document = await extensionGlossary.snapshot()
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Disk full'))
  await expect(restoreExtensionConfiguration({ glossary: { ...document, enabled: false }, preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' }, providers: [providers.createProvider('google-translate')] }, document.revision)).rejects.toThrow('Disk full')
  expect(rows.has('configuration-restore-v2')).toBe(true)
  expect(rows.get('document-v1')).toMatchObject({ document: { enabled: false, revision: 1 } })
  expect(rows.get('connections')).toEqual(expect.arrayContaining([expect.objectContaining({ preset: 'google-translate' })]))
  await recoverExtensionConfiguration()
  expect(rows.has('configuration-restore-v2')).toBe(false)
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark', glossaryRevision: { revision: 1, matchingRevision: 1 } }))
})
it('validates all imported providers before mutating glossary or preferences', async () => {
  const document = await extensionGlossary.snapshot()
  await expect(restoreExtensionConfiguration({ glossary: { ...document, enabled: false }, preferences: DEFAULT_PREFERENCES, providers: [{ invalid: true }] }, document.revision)).rejects.toThrow()
  expect(rows.get('document-v1')).toMatchObject({ document: { enabled: true, revision: 0 } })
  expect(chrome.storage.local.set).not.toHaveBeenCalled()
})
it('serializes a delayed old recovery with a newer import so old preferences cannot win last', async () => {
  const document = await extensionGlossary.snapshot()
  rows.set('configuration-restore-v2', { id: crypto.randomUUID(), preferences: { theme: 'light' }, revision: 0, matchingRevision: 0 })
  let release!: () => void
  vi.mocked(chrome.storage.local.set).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
  const oldRecovery = recoverExtensionConfiguration()
  await vi.waitFor(() => expect(chrome.storage.local.set).toHaveBeenCalled())
  const newRestore = restoreExtensionConfiguration({ glossary: { ...document, enabled: false }, preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' } }, document.revision)
  expect(rows.get('document-v1')).toMatchObject({ document: { revision: 0 } })
  release()
  await Promise.all([oldRecovery, newRestore])
  expect(chrome.storage.local.set).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark', glossaryRevision: { revision: 1, matchingRevision: 1 } }))
  expect(rows.has('configuration-restore-v2')).toBe(false)
})
