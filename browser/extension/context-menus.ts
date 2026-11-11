import { browserText } from './i18n'
import { DISABLED_PROVIDER, loadPreferences, siteEnabled, type Preferences } from './preferences'

const commandProviders = { togglePageTranslation: 'pageProvider', translateSelection: 'selectionProvider', toggleSubtitles: 'subtitleProvider', speakSelection: 'ttsProvider', translateInput: 'inputProvider' } as const

export function commandEnabled(command: string, settings: Preferences): boolean {
  const shortcuts = { togglePageTranslation: [settings.shortcutPage, 'alt+t'], translateSelection: [settings.shortcutSelection, 'alt+s'], toggleSubtitles: [settings.shortcutSubtitles, 'alt+v'] }
  const binding = shortcuts[command as keyof typeof shortcuts]
  const provider = commandProviders[command as keyof typeof commandProviders]
  return Boolean(binding && binding[0].toLowerCase() === binding[1] && settings[provider] !== DISABLED_PROVIDER)
}

const menuPreferences = { togglePageTranslation: 'contextMenuPage', translateSelection: 'contextMenuSelection', speakSelection: 'contextMenuSpeak', translateInput: 'contextMenuInput' } as const

async function dispatch(tabId: number, message: { type: string; text?: string }): Promise<void> {
  try { await chrome.tabs.sendMessage(tabId, message); return }
  catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['capture-handle.js'], world: 'MAIN' })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  }
  await chrome.tabs.sendMessage(tabId, message)
}

export function setupContextMenus(): void {
  const captureGrants = new Map<number, { url: string; expires: number }>()
  const session = (chrome.storage as unknown as { session?: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } }).session
  const grantKey = 'imageTranslationCaptureGrants'
  let loaded = false, grantQueue = Promise.resolve()
  const updateGrant = (update: () => boolean) => {
    const action = grantQueue.then(async () => {
      if (!loaded) {
        const saved = session ? (await session.get(grantKey))[grantKey] : undefined
        if (Array.isArray(saved)) for (const entry of saved) {
          if (Array.isArray(entry) && Number.isSafeInteger(entry[0]) && typeof entry[1]?.url === 'string' && typeof entry[1]?.expires === 'number' && entry[1].expires > Date.now()) captureGrants.set(entry[0], entry[1])
        }
        loaded = true
      }
      for (const [id, grant] of captureGrants) if (grant.expires <= Date.now()) captureGrants.delete(id)
      const result = update()
      if (session) await session.set({ [grantKey]: [...captureGrants.entries()] })
      return result
    })
    grantQueue = action.then(() => undefined, () => undefined)
    return action
  }
  const startImageTranslation = async (tab: { id?: number; url?: string }, preferences?: Preferences) => {
    const settings = preferences ?? await loadPreferences()
    if (tab.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url) || !siteEnabled(settings, tab.url)) throw new Error('permissionFailed')
    const tabId = tab.id, url = tab.url
    await updateGrant(() => { captureGrants.set(tabId, { url, expires: Date.now() + 300000 }); return true })
    try { await dispatch(tabId, { type: 'startImageTranslation' }) }
    catch (error) { await updateGrant(() => captureGrants.delete(tabId)); throw error }
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return
    if (!['captureImageTranslation', 'cancelImageTranslation'].includes(String(message.type))) return
    const tabId = sender.tab?.id
    if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || typeof tabId !== 'number' || !/^https?:\/\//.test(sender.url ?? '')) { reply({ error: 'permissionFailed' }); return }
    void updateGrant(() => { const granted = captureGrants.get(tabId)?.url === sender.url; captureGrants.delete(tabId); return granted }).then(async granted => {
      if (message.type === 'cancelImageTranslation') { reply({ ok: true }); return }
      if (!granted) { reply({ error: 'permissionFailed' }); return }
      if (!siteEnabled(await loadPreferences(), sender.url!)) throw new Error('permissionFailed')
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tabs[0]?.id !== tabId || tabs[0]?.url !== sender.url) throw new Error('permissionFailed')
      const image = await chrome.tabs.captureVisibleTab(undefined, { format: 'png' })
      const current = await chrome.tabs.query({ active: true, currentWindow: true })
      if (current[0]?.id !== tabId || current[0]?.url !== sender.url) throw new Error('permissionFailed')
      reply({ image })
    }).catch(() => reply({ error: 'imageCaptureFailed' }))
    return true
  })
  async function refresh() {
    const settings = await loadPreferences()
    const t = browserText(settings.uiLanguage)
    await chrome.contextMenus.removeAll()
    if (!settings.contextMenuEnabled) return
    if (settings.contextMenuPage && settings.pageProvider !== DISABLED_PROVIDER) chrome.contextMenus.create({ id: 'togglePageTranslation', title: `${t('translatePage')} / ${t('restorePage')}`, contexts: ['page'] })
    if (settings.contextMenuSelection && settings.selectionProvider !== DISABLED_PROVIDER) chrome.contextMenus.create({ id: 'translateSelection', title: t('translateSelection'), contexts: ['selection'] })
    if (settings.contextMenuSpeak && settings.ttsProvider !== DISABLED_PROVIDER) chrome.contextMenus.create({ id: 'speakSelection', title: t('readAloud'), contexts: ['selection'] })
    if (settings.contextMenuInput && settings.inputProvider !== DISABLED_PROVIDER) chrome.contextMenus.create({ id: 'translateInput', title: t('inputTranslation'), contexts: ['editable'] })
    if (settings.contextMenuImage) chrome.contextMenus.create({ id: 'translateImage', title: t('imageTranslate'), contexts: ['image'] })
  }
  let pending = Promise.resolve()
  const queueRefresh = () => { pending = pending.then(refresh).catch(() => undefined) }
  chrome.runtime.onInstalled.addListener(queueRefresh)
  chrome.runtime.onStartup.addListener(queueRefresh)
  chrome.storage.onChanged.addListener(changes => { if (changes.uiLanguage || changes.contextMenuEnabled || changes.contextMenuImage || Object.values(menuPreferences).some(key => changes[key]) || Object.values(commandProviders).some(key => changes[key])) queueRefresh() })
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'translateImage' && tab?.id !== undefined && /^https?:\/\//.test(tab.url ?? '')) {
      const tabId = tab.id
      const url = tab.url!
      void loadPreferences().then(settings => {
        if (!settings.contextMenuEnabled || !settings.contextMenuImage) return
        return startImageTranslation({ id: tabId, url }, settings)
      }).catch(() => undefined)
      return
    }
    const type = info.menuItemId as keyof typeof menuPreferences
    if (tab?.id === undefined || !Object.hasOwn(menuPreferences, type)) return
    const tabId = tab.id
    void loadPreferences().then(settings => {
      if (!settings.contextMenuEnabled || !settings[menuPreferences[type]] || settings[commandProviders[type]] === DISABLED_PROVIDER) return
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
