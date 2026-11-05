import { browserText } from './i18n'
import { loadPreferences, type Preferences } from './preferences'

export function commandEnabled(command: string, settings: Preferences): boolean {
  const shortcuts = { togglePageTranslation: [settings.shortcutPage, 'alt+t'], translateSelection: [settings.shortcutSelection, 'alt+s'], toggleSubtitles: [settings.shortcutSubtitles, 'alt+v'] }
  const binding = shortcuts[command as keyof typeof shortcuts]
  return Boolean(binding && binding[0].toLowerCase() === binding[1])
}

const menuPreferences = { togglePageTranslation: 'contextMenuPage', translateSelection: 'contextMenuSelection', speakSelection: 'contextMenuSpeak', translateInput: 'contextMenuInput' } as const

async function dispatch(tabId: number, message: { type: string; text?: string }): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, { type: 'pageStatus' }) }
  catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['capture-handle.js'], world: 'MAIN' })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  }
  await chrome.tabs.sendMessage(tabId, message)
}

export function setupContextMenus(): void {
  async function refresh() {
    const settings = await loadPreferences()
    const t = browserText(settings.uiLanguage)
    await chrome.contextMenus.removeAll()
    if (!settings.contextMenuEnabled) return
    if (settings.contextMenuPage) chrome.contextMenus.create({ id: 'togglePageTranslation', title: `${t('translatePage')} / ${t('restorePage')}`, contexts: ['page'] })
    if (settings.contextMenuSelection) chrome.contextMenus.create({ id: 'translateSelection', title: t('translateSelection'), contexts: ['selection'] })
    if (settings.contextMenuSpeak) chrome.contextMenus.create({ id: 'speakSelection', title: t('readAloud'), contexts: ['selection'] })
    if (settings.contextMenuInput) chrome.contextMenus.create({ id: 'translateInput', title: t('inputTranslation'), contexts: ['editable'] })
  }
  let pending = Promise.resolve()
  const queueRefresh = () => { pending = pending.then(refresh).catch(() => undefined) }
  chrome.runtime.onInstalled.addListener(queueRefresh)
  chrome.runtime.onStartup.addListener(queueRefresh)
  chrome.storage.onChanged.addListener(changes => { if (changes.uiLanguage || changes.contextMenuEnabled || Object.values(menuPreferences).some(key => changes[key])) queueRefresh() })
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const type = info.menuItemId as keyof typeof menuPreferences
    if (tab?.id === undefined || !Object.hasOwn(menuPreferences, type)) return
    const tabId = tab.id
    void loadPreferences().then(settings => {
      if (!settings.contextMenuEnabled || !settings[menuPreferences[type]]) return
      return dispatch(tabId, { type, ...(typeof info.selectionText === 'string' ? { text: info.selectionText } : {}) })
    }).catch(() => undefined)
  })
  chrome.commands.onCommand.addListener(command => {
    void loadPreferences().then(async settings => {
      if (!commandEnabled(command, settings)) return
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id !== undefined) return dispatch(tab.id, { type: command })
    }).catch(() => undefined)
  })
}
