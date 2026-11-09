import { expect, it, vi } from 'vitest'
import { migrateLegacyGlossary } from './glossary-store'

vi.mock('./provider-runtime', () => ({ setupProviderRuntime: vi.fn() }))
vi.mock('./context-menus', () => ({ setupContextMenus: vi.fn() }))
vi.mock('./speech-runtime', () => ({ setupSpeechRuntime: vi.fn() }))
vi.mock('./tab-audio-runtime', () => ({ setupTabAudioRuntime: vi.fn() }))
vi.mock('./glossary-store', async original => ({ ...await original<typeof import('./glossary-store')>(), extensionGlossary: { snapshot: vi.fn(), onChanged: vi.fn(() => () => {}) } }))

it('allows diagnostics from a settings section without trusting another extension page', async () => {
  const event = () => ({ addListener: vi.fn() })
  const native = { onMessage: event(), onDisconnect: event(), postMessage: vi.fn() }
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}`, connectNative: vi.fn(() => native) }
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event() } })
  await import('./background')
  const connect = runtime.onConnect.addListener.mock.calls[0][0]
  const port = { name: 'nola-popup', sender: { url: runtime.getURL('options.html#apiProviders') }, onMessage: event(), onDisconnect: event(), disconnect: vi.fn(), postMessage: vi.fn() }
  connect(port)
  port.onMessage.addListener.mock.calls[0][0]({ type: 'hello', id: 'diagnostic' })
  await Promise.resolve()
  expect(runtime.connectNative).toHaveBeenCalledOnce()
  expect(native.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'hello', id: 'diagnostic' }))
  const unrelated = { ...port, sender: { url: runtime.getURL('unknown.html#apiProviders') }, disconnect: vi.fn() }
  connect(unrelated)
  expect(unrelated.disconnect).toHaveBeenCalledOnce()
})

it('skips missing registrations and removes only obsolete scripts', async () => {
  vi.resetModules()
  const event = () => ({ addListener: vi.fn() })
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
  let finish: () => void = () => {}
  const first = new Promise<void>(resolve => { finish = resolve })
  let registered = [undefined, { id: 'nola-main' }, { id: 'nola-content' }, { id: 'keep-other-script' }]
  const scripting = { getRegisteredContentScripts: vi.fn(async () => [...registered]), unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => { await first; registered = registered.filter(script => script && !ids.includes(script.id)) }), registerContentScripts: vi.fn() }
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event() }, scripting })
  await import('./background')
  runtime.onInstalled.addListener.mock.calls[0][0]()
  const reply = vi.fn()
  runtime.onMessage.addListener.mock.calls[0][0]({ type: 'registerSites' }, { url: runtime.getURL('sidepanel.html') }, reply)
  await vi.waitFor(() => expect(scripting.unregisterContentScripts).toHaveBeenCalledTimes(1))
  expect(scripting.getRegisteredContentScripts).toHaveBeenCalledTimes(1)
  finish()
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true }))
  expect(registered).toEqual([{ id: 'keep-other-script' }])
  expect(scripting.registerContentScripts).not.toHaveBeenCalled()
})

it('opens a native panel synchronously only for an authenticated top-level content or extension-page request', async () => {
  vi.resetModules()
  const event = () => ({ addListener: vi.fn() })
  const runtime = { id: 'nola', onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
  const open = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event() }, sidePanel: { open } })
  await import('./background')
  const message = runtime.onMessage.addListener.mock.calls[0][0], reply = vi.fn()
  message({ type: 'openTranslationPanel', tabId: 99 }, { id: 'nola', frameId: 0, tab: { id: 7 }, url: 'https://example.test/' }, reply)
  expect(open).toHaveBeenCalledWith({ tabId: 7 })
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ ok: true }))
  for (const sender of [{ id: 'other', frameId: 0, tab: { id: 7 }, url: 'https://example.test/' }, { id: 'nola', frameId: 1, tab: { id: 7 }, url: 'https://example.test/' }, { id: 'nola', url: runtime.getURL('unknown.html') }]) message({ type: 'openTranslationPanel', tabId: 7 }, sender, reply)
  expect(open).toHaveBeenCalledTimes(1)
  message({ type: 'openTranslationPanel', tabId: 8 }, { id: 'nola', url: runtime.getURL('popup.html') }, reply)
  expect(open).toHaveBeenLastCalledWith({ tabId: 8 })
})

it('returns the toolbar instruction when the native panel API is unavailable', async () => {
  vi.resetModules()
  const event = () => ({ addListener: vi.fn() })
  const runtime = { id: 'nola', onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
  const open = vi.fn()
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event() }, sidebarAction: { open } })
  await import('./background')
  const reply = vi.fn()
  runtime.onMessage.addListener.mock.calls[0][0]({ type: 'openTranslationPanel' }, { id: 'nola', frameId: 0, tab: { id: 7 }, url: 'https://example.test/' }, reply)
  expect(reply).toHaveBeenCalledWith({ ok: false, error: 'openPanelFromToolbar' })
  expect(open).not.toHaveBeenCalled()
  expect(() => runtime.onMessage.addListener.mock.calls[0][0]({ type: 'openTranslationPanel' }, undefined, reply)).not.toThrow()
  expect(reply).toHaveBeenLastCalledWith({ ok: false, error: 'permissionFailed' })
})

it('replaces a broken native port and consumes the page disconnect diagnostic', async () => {
  vi.resetModules()
  const event = () => ({ addListener: vi.fn() })
  const lost = { onMessage: event(), onDisconnect: event(), postMessage: vi.fn(() => { throw new Error('disconnected') }), disconnect: vi.fn() }
  const fresh = { ...lost, postMessage: vi.fn() }
  const lastError = vi.fn(() => ({ message: 'Page entered BFCache' }))
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(),
    getURL: (path: string) => `chrome-extension://nola/${path}`,
    connectNative: vi.fn().mockReturnValueOnce(lost).mockReturnValueOnce(fresh), get lastError() { return lastError() } }
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event() } })
  await import('./background')
  const port = { name: 'nola-popup', sender: { url: runtime.getURL('popup.html') }, onMessage: event(), onDisconnect: event(), postMessage: vi.fn() }
  runtime.onConnect.addListener.mock.calls[0][0](port)
  const request = port.onMessage.addListener.mock.calls[0][0]
  request({ type: 'hello', id: 'before' })
  await Promise.resolve()
  expect(lost.disconnect).toHaveBeenCalledOnce()
  expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ code: 'browserConnectionLost' }))
  request({ type: 'hello', id: 'after' })
  await Promise.resolve()
  expect(fresh.postMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 'after' }))
  port.onDisconnect.addListener.mock.calls[0][0]()
  expect(lastError).toHaveBeenCalledOnce()
})

it('broadcasts permission changes without relying on revoked URL metadata and checks only the sender origin', async () => {
  vi.resetModules()
  const event = () => ({ addListener: vi.fn() })
  const runtime = { id: 'nola', onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}` }
  const removed = event(), contains = vi.fn().mockResolvedValue(false), sendMessage = vi.fn().mockRejectedValue(new Error('No receiver'))
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: removed, contains }, tabs: { query: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2, url: 'https://other.test/' }]), sendMessage }, scripting: { getRegisteredContentScripts: vi.fn().mockResolvedValue([]) } })
  await import('./background')
  removed.addListener.mock.calls[0][0]()
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  expect(sendMessage).toHaveBeenCalledWith(1, { type: 'siteAccessChanged' })
  const message = runtime.onMessage.addListener.mock.calls[0][0], reply = vi.fn()
  message({ type: 'checkSiteAccess', origin: 'https://spoofed.test' }, { id: 'nola', frameId: 0, tab: { id: 1 }, url: 'https://actual.test/read' }, reply)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ allowed: false }))
  expect(contains).toHaveBeenCalledWith({ origins: ['https://actual.test/*'] })
  contains.mockResolvedValue(true)
  message({ type: 'checkSiteAccess' }, { id: 'nola', frameId: 0, tab: { id: 2 }, url: 'https://other.test/' }, reply)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ allowed: true }))
})

it('keeps private extension terms out of a direct desktop audio session and provides an actionable mode error', async () => {
  vi.resetModules()
  const glossary = await import('./glossary-store')
  vi.mocked(glossary.extensionGlossary.snapshot).mockResolvedValue(migrateLegacyGlossary([{ source: 'Nola', target: '诺拉', sites: 'video.test' }], 'Terms'))
  const event = () => ({ addListener: vi.fn() })
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event(), onConnect: event(), getURL: (path: string) => `chrome-extension://nola/${path}`, connectNative: vi.fn() }
  vi.stubGlobal('chrome', { runtime, permissions: { onRemoved: event(), contains: vi.fn(async () => true) } })
  await import('./background')
  const port = { name: 'nola-captions', sender: { url: 'https://video.test/watch', frameId: 0, tab: { id: 1 } }, onMessage: event(), onDisconnect: event(), disconnect: vi.fn(), postMessage: vi.fn() }
  runtime.onConnect.addListener.mock.calls[0][0](port)
  port.onMessage.addListener.mock.calls[0][0]({ type: 'start', id: 'start', source: 'tab', streamId: 'stream', epoch: 0, videoTimeMs: 0, playbackRate: 1, targetLanguage: 'zh' })
  await vi.waitFor(() => expect(port.postMessage).toHaveBeenCalledWith({ type: 'error', id: 'start', code: 'browserGlossaryModeUnsupported', message: '' }))
  expect(runtime.connectNative).not.toHaveBeenCalled()
})
