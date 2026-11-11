import { afterEach, expect, it, vi } from 'vitest'
import { commandEnabled, setupContextMenus } from './context-menus'
import { DEFAULT_PREFERENCES } from './preferences'
it('runs fixed browser commands only while their default shortcut remains configured', () => {
  expect(commandEnabled('togglePageTranslation', DEFAULT_PREFERENCES)).toBe(true)
  expect(commandEnabled('togglePageTranslation', { ...DEFAULT_PREFERENCES, shortcutPage: 'Alt+Y' })).toBe(false)
  expect(commandEnabled('translateSelection', DEFAULT_PREFERENCES)).toBe(true)
  expect(commandEnabled('translateSelection', { ...DEFAULT_PREFERENCES, selectionProvider: 'disabled' })).toBe(false)
  expect(commandEnabled('translateSelection', { ...DEFAULT_PREFERENCES, selectionProvider: 'index-translate', shortcutSelection: 'alt+s' })).toBe(true)
  expect(commandEnabled('unknown', DEFAULT_PREFERENCES)).toBe(false)
})

afterEach(() => vi.unstubAllGlobals())
it('serializes menu refreshes across startup and simultaneous preference updates', async () => {
  const event = () => ({ addListener: vi.fn() })
  let finish: () => void = () => {}
  const first = new Promise<void>(resolve => { finish = resolve })
  const removeAll = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined)
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event() }
  const storage = { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, onChanged: event() }
  vi.stubGlobal('chrome', { runtime, storage, contextMenus: { removeAll, create: vi.fn(), onClicked: event() }, commands: { onCommand: event() } })
  setupContextMenus()
  runtime.onInstalled.addListener.mock.calls[0][0]()
  storage.onChanged.addListener.mock.calls[0][0]({ uiLanguage: { newValue: 'ja' } })
  await vi.waitFor(() => expect(removeAll).toHaveBeenCalledTimes(1))
  finish()
  await vi.waitFor(() => expect(removeAll).toHaveBeenCalledTimes(2))
})

it('registers each context menu only when its own switch is enabled', async () => {
  const event = () => ({ addListener: vi.fn() })
  const runtime = { onInstalled: event(), onStartup: event(), onMessage: event() }
  const settings = { ...DEFAULT_PREFERENCES, contextMenuPage: false, contextMenuSelection: false, contextMenuInput: false }
  const create = vi.fn()
  vi.stubGlobal('chrome', { runtime, storage: { local: { get: vi.fn().mockResolvedValue(settings) }, onChanged: event() }, contextMenus: { removeAll: vi.fn().mockResolvedValue(undefined), create, onClicked: event() }, commands: { onCommand: event() } })
  setupContextMenus();runtime.onInstalled.addListener.mock.calls[0][0]()
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'speakSelection' }))
  expect(create).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'translateArea' }))
})
it('injects a missing receiver before dispatching an explicit selected-text action once', async () => {
  const event = () => ({ addListener: vi.fn() })
  const clicked = event(), sendMessage = vi.fn().mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValue(undefined)
  const executeScript = vi.fn().mockResolvedValue([])
  vi.stubGlobal('chrome', { runtime: { onInstalled: event(), onStartup: event(), onMessage: event() }, storage: { local: { get: vi.fn().mockResolvedValue({ ...DEFAULT_PREFERENCES, ttsProvider: 'edge-tts' }) }, onChanged: event() }, contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() }, tabs: { sendMessage }, scripting: { executeScript } })
  setupContextMenus();clicked.addListener.mock.calls[0][0]({ menuItemId: 'speakSelection', selectionText: 'Selected text' }, { id: 7 })
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  expect(executeScript.mock.calls).toEqual([[{ target: { tabId: 7 }, files: ['capture-handle.js'], world: 'MAIN' }], [{ target: { tabId: 7 }, files: ['content.js'] }]])
  expect(sendMessage).toHaveBeenLastCalledWith(7, { type: 'speakSelection', text: 'Selected text' })
})

it('captures only the active tab after its explicit image menu action', async () => {
  const event = () => ({ addListener: vi.fn() })
  const onMessage = event(), clicked = event()
  const captureVisibleTab = vi.fn().mockResolvedValue('data:image/png;base64,test')
  const sender = { id: 'extension', frameId: 0, tab: { id: 7 }, url: 'https://example.com/page' }
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', onInstalled: event(), onStartup: event(), onMessage },
    storage: { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, onChanged: event() },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() },
    tabs: { sendMessage: vi.fn().mockResolvedValue({}), query: vi.fn().mockResolvedValue([{ id: 7, url: sender.url }]), captureVisibleTab },
  })
  setupContextMenus()
  const listener = onMessage.addListener.mock.calls[0][0]
  const denied = vi.fn()
  listener({ type: 'captureImageTranslation' }, sender, denied)
  await vi.waitFor(() => expect(denied).toHaveBeenCalledWith({ error: 'permissionFailed' }))
  clicked.addListener.mock.calls[0][0]({ menuItemId: 'translateImage' }, { id: 7, url: sender.url })
  await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1))
  const reply = vi.fn()
  listener({ type: 'captureImageTranslation' }, sender, reply)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ image: 'data:image/png;base64,test' }))
  expect(captureVisibleTab).toHaveBeenCalledOnce()
  listener({ type: 'captureImageTranslation' }, sender, denied)
  expect(captureVisibleTab).toHaveBeenCalledOnce()
})

it('refuses a screenshot when the active tab changed', async () => {
  const event = () => ({ addListener: vi.fn() })
  const onMessage = event(), clicked = event(), captureVisibleTab = vi.fn()
  const url = 'https://example.com/page'
  vi.stubGlobal('chrome', {
    runtime: { id: 'extension', onInstalled: event(), onStartup: event(), onMessage },
    storage: { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, onChanged: event() },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() },
    tabs: { sendMessage: vi.fn().mockResolvedValue({}), query: vi.fn().mockResolvedValue([{ id: 8, url }]), captureVisibleTab },
  })
  setupContextMenus()
  clicked.addListener.mock.calls[0][0]({ menuItemId: 'translateImage' }, { id: 7, url })
  await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1))
  const reply = vi.fn()
  onMessage.addListener.mock.calls[0][0]({ type: 'captureImageTranslation' }, { id: 'extension', frameId: 0, tab: { id: 7 }, url }, reply)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'imageCaptureFailed' }))
  expect(captureVisibleTab).not.toHaveBeenCalled()
})

it('retains the one-use image capture grant across worker restarts', async () => {
  const event = () => ({ addListener: vi.fn() })
  const onMessage = event(), clicked = event(), url = 'https://example.com/page'
  const stored: Record<string, unknown> = {}
  const session = { get: vi.fn(async (key: string) => ({ [key]: stored[key] })), set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(stored, items) }) }
  vi.stubGlobal('chrome', { runtime: { id: 'extension', onInstalled: event(), onStartup: event(), onMessage },
    storage: { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, session, onChanged: event() },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() },
    tabs: { sendMessage: vi.fn().mockResolvedValue({}), query: vi.fn().mockResolvedValue([{ id: 7, url }]), captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,test') } })
  setupContextMenus()
  clicked.addListener.mock.calls[0][0]({ menuItemId: 'translateImage' }, { id: 7, url })
  await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledOnce())
  setupContextMenus()
  const listener = onMessage.addListener.mock.calls[1][0], sender = { id: 'extension', frameId: 0, tab: { id: 7 }, url }
  const capture = vi.fn()
  listener({ type: 'captureImageTranslation' }, sender, capture)
  await vi.waitFor(() => expect(capture).toHaveBeenCalledWith({ image: 'data:image/png;base64,test' }))
  const duplicate = vi.fn()
  listener({ type: 'captureImageTranslation' }, sender, duplicate)
  await vi.waitFor(() => expect(duplicate).toHaveBeenCalledWith({ error: 'permissionFailed' }))
})

it('discards a captured screenshot when the active tab changes during capture', async () => {
  const event = () => ({ addListener: vi.fn() })
  const onMessage = event(), clicked = event(), url = 'https://example.com/page'
  const query = vi.fn().mockResolvedValueOnce([{ id: 7, url }]).mockResolvedValueOnce([{ id: 8, url }])
  vi.stubGlobal('chrome', { runtime: { id: 'extension', onInstalled: event(), onStartup: event(), onMessage },
    storage: { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, onChanged: event() },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() },
    tabs: { sendMessage: vi.fn().mockResolvedValue({}), query, captureVisibleTab: vi.fn().mockResolvedValue('data:image/png;base64,test') } })
  setupContextMenus()
  clicked.addListener.mock.calls[0][0]({ menuItemId: 'translateImage' }, { id: 7, url })
  await vi.waitFor(() => expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1))
  const reply = vi.fn()
  onMessage.addListener.mock.calls[0][0]({ type: 'captureImageTranslation' }, { id: 'extension', frameId: 0, tab: { id: 7 }, url }, reply)
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ error: 'imageCaptureFailed' }))
})
