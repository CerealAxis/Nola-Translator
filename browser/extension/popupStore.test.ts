import { afterEach, expect, it, vi } from 'vitest'
import { createPopupStore } from './popupStore'
afterEach(() => vi.unstubAllGlobals())
it.each(['http://localhost:3000/read', 'http://example.test/read', 'https://example.test/read'])('allows web translation permissions on %s', async url => {
  const contains = vi.fn(async () => true)
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1, url }], sendMessage: async () => ({ pageActive: false }) }, permissions: { contains } })
  const store = createPopupStore(); await store.init()
  expect(store.getSnapshot()).toMatchObject({ enabled: true, origin: new URL(url).origin, tabId: 1 })
  expect(contains).toHaveBeenCalledWith({ origins: [new URL(url).origin + '/*'] })
})
it('classifies privileged browser pages without reporting a permission failure', async () => {
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1, url: 'chrome://settings' }] } })
  const store = createPopupStore(); await store.init(); expect(store.getSnapshot()).toMatchObject({ availability: 'restricted', enabled: false, error: undefined })
})

it('does not report site activation when background registration failed', async () => {
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1, url: 'https://example.test/read' }] }, permissions: { contains: async () => false, request: async () => true }, scripting: { executeScript: vi.fn().mockResolvedValue([]) }, runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false }) } })
  const store = createPopupStore();await store.init();store.enable()
  await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ enabled: false, pending: false, error: 'permissionFailed' }))
})

it('does not mistake a programmatic popup without activeTab URL metadata for a denied webpage', async () => {
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1 }] } })
  const store = createPopupStore();await store.init()
  expect(store.getSnapshot()).toMatchObject({ availability: 'unavailable', tabId: 1, enabled: false, error: undefined })
})
it('reports unavailable metadata when the browser has no active tab', async () => {
  vi.stubGlobal('chrome', { tabs: { query: async () => [] } })
  const store = createPopupStore();await store.init()
  expect(store.getSnapshot()).toMatchObject({ availability: 'unavailable', enabled: false, error: undefined })
})
it('reinjects an already-open ordinary page when static content is not present yet', async () => {
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValue({ pageActive: false })
  const executeScript = vi.fn().mockResolvedValue([])
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 2, url: 'https://ordinary.test/read' }], sendMessage }, permissions: { contains: async () => true }, scripting: { executeScript } })
  const store = createPopupStore();await store.init()
  expect(store.getSnapshot()).toMatchObject({ availability: 'ready', enabled: true })
  expect(executeScript).toHaveBeenCalledTimes(2)
})
it('keeps browser-protected HTTPS pages unavailable without a misleading grant-permission error', async () => {
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 2, url: 'https://chromewebstore.google.com/' }], sendMessage: async () => { throw new Error('No receiver') } }, permissions: { contains: async () => true }, scripting: { executeScript: async () => { throw new Error('Cannot access extensions gallery') } } })
  const store = createPopupStore();await store.init()
  expect(store.getSnapshot()).toMatchObject({ availability: 'restricted', enabled: false, error: undefined })
})

it('clears old tab data and ignores a late status response after a sidebar tab switch', async () => {
  let completeOld: (value: unknown) => void = () => {}
  const oldStatus = new Promise(resolve => { completeOld = resolve })
  const query = vi.fn().mockResolvedValueOnce([{ id: 1, url: 'https://old.test/' }]).mockResolvedValueOnce([{ id: 2, url: 'https://new.test/' }])
  const sendMessage = vi.fn().mockReturnValueOnce(oldStatus).mockResolvedValue({ pageActive: false, video: false })
  vi.stubGlobal('chrome', { tabs: { query, sendMessage }, permissions: { contains: async () => true } })
  const store = createPopupStore(), old = store.init()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce())
  await store.init()
  completeOld({ pageActive: true, video: true, pageError: 'old-error' });await old
  expect(store.getSnapshot()).toMatchObject({ tabId: 2, url: 'https://new.test/', pageActive: false, video: false, error: undefined })
  expect(store.getSnapshot().pageError).toBeUndefined()
})
