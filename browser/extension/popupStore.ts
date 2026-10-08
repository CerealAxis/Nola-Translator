import { BrowserFailure, createBridge } from './bridge'
export interface PopupState { language: 'zh-CN' | 'en'; enabled: boolean; pending: boolean; error?: string; origin?: string; tabId?: number }
export function createPopupStore() {
  let state: PopupState = { language: navigator.language.startsWith('zh') ? 'zh-CN' : 'en', enabled: false, pending: false }
  const listeners = new Set<() => void>()
  const set = (patch: Partial<PopupState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async init() {
      const bridge = createBridge('nola-popup')
      void bridge.request({ type: 'hello' }).then(summary => { if (summary && 'uiLanguage' in summary) set({ language: summary.uiLanguage }) }).catch(() => undefined).finally(() => bridge.close())
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.url?.startsWith('https://') || tab.id === undefined) { set({ error: 'permissionFailed' }); return }
      const origin = new URL(tab.url).origin
      set({ origin, tabId: tab.id, enabled: await chrome.permissions.contains({ origins: [`${origin}/*`] }) })
    },
    enable() {
      if (!state.origin || state.tabId === undefined || state.pending) return
      const { origin, tabId } = state
      // Permission UI also requires the original user gesture.
      const permission = chrome.permissions.request({ origins: [`${origin}/*`] })
      set({ pending: true, error: undefined })
      void permission.then(async granted => {
        if (!granted) throw new BrowserFailure('permissionFailed')
        await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ['capture-handle.js'], world: 'MAIN' })
        await chrome.scripting.executeScript({ target: { tabId, allFrames: false }, files: ['content.js'] })
        // Registered scripts make the permission durable across reload and future navigation.
        await registerCurrentSites()
        set({ enabled: true })
      }).catch(() => set({ error: 'permissionFailed' })).finally(() => set({ pending: false }))
    },
  }
}
async function registerCurrentSites(): Promise<void> {
  const permissions = await chrome.permissions.getAll()
  const matches = (permissions.origins ?? []).filter(origin => origin.startsWith('https://') && !['https://www.youtube.com/*', 'https://www.bilibili.com/*'].includes(origin))
  if (!matches.length) return
  const registered = await chrome.scripting.getRegisteredContentScripts()
  for (const script of [{ id: 'nola-main', matches, js: ['capture-handle.js'], runAt: 'document_start' as const, world: 'MAIN' as const, persistAcrossSessions: true }, { id: 'nola-content', matches, js: ['content.js'], runAt: 'document_idle' as const, persistAcrossSessions: true }]) {
    if (registered.some(item => item.id === script.id)) await chrome.scripting.updateContentScripts([script])
    else await chrome.scripting.registerContentScripts([script])
  }
}
