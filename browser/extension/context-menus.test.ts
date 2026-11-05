import { afterEach, expect, it, vi } from 'vitest'
import { commandEnabled, setupContextMenus } from './context-menus'
import { DEFAULT_PREFERENCES } from './preferences'
it('runs fixed browser commands only while their default shortcut remains configured', () => {
  expect(commandEnabled('togglePageTranslation', DEFAULT_PREFERENCES)).toBe(true)
  expect(commandEnabled('togglePageTranslation', { ...DEFAULT_PREFERENCES, shortcutPage: 'Alt+Y' })).toBe(false)
  expect(commandEnabled('translateSelection', { ...DEFAULT_PREFERENCES, shortcutSelection: 'alt+s' })).toBe(true)
  expect(commandEnabled('unknown', DEFAULT_PREFERENCES)).toBe(false)
})

afterEach(() => vi.unstubAllGlobals())
it('serializes menu refreshes across startup and simultaneous preference updates', async () => {
  const event = () => ({ addListener: vi.fn() })
  let finish: () => void = () => {}
  const first = new Promise<void>(resolve => { finish = resolve })
  const removeAll = vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined)
  const runtime = { onInstalled: event(), onStartup: event() }
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
  const runtime = { onInstalled: event(), onStartup: event() }
  const settings = { ...DEFAULT_PREFERENCES, contextMenuPage: false, contextMenuSelection: false, contextMenuInput: false }
  const create = vi.fn()
  vi.stubGlobal('chrome', { runtime, storage: { local: { get: vi.fn().mockResolvedValue(settings) }, onChanged: event() }, contextMenus: { removeAll: vi.fn().mockResolvedValue(undefined), create, onClicked: event() }, commands: { onCommand: event() } })
  setupContextMenus();runtime.onInstalled.addListener.mock.calls[0][0]()
  await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: 'speakSelection', contexts: ['selection'] }))
})
it('injects a missing receiver before dispatching an explicit selected-text action once', async () => {
  const event = () => ({ addListener: vi.fn() })
  const clicked = event(), sendMessage = vi.fn().mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValue(undefined)
  const executeScript = vi.fn().mockResolvedValue([])
  vi.stubGlobal('chrome', { runtime: { onInstalled: event(), onStartup: event() }, storage: { local: { get: vi.fn().mockResolvedValue(DEFAULT_PREFERENCES) }, onChanged: event() }, contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: clicked }, commands: { onCommand: event() }, tabs: { sendMessage }, scripting: { executeScript } })
  setupContextMenus();clicked.addListener.mock.calls[0][0]({ menuItemId: 'speakSelection', selectionText: 'Selected text' }, { id: 7 })
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  expect(executeScript.mock.calls).toEqual([[{ target: { tabId: 7 }, files: ['capture-handle.js'], world: 'MAIN' }], [{ target: { tabId: 7 }, files: ['content.js'] }]])
  expect(sendMessage).toHaveBeenLastCalledWith(7, { type: 'speakSelection', text: 'Selected text' })
})
