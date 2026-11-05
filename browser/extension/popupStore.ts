import { BrowserFailure } from './bridge'

interface TabStatus {
  pageActive?: boolean
  pageError?: string
  video?: boolean
  realtime?: boolean
  liveError?: string
  subtitles?: boolean
  subtitleError?: string
}
type TabAction = 'pageStatus' | 'startPageTranslation' | 'stopPageTranslation' | 'toggleSubtitles' | 'toggleRealtime'
export interface PopupState extends TabStatus { availability?: 'loading' | 'ready' | 'restricted' | 'unavailable'; enabled: boolean; pending: boolean; error?: string; origin?: string; url?: string; tabId?: number }
export function createPopupStore() {
  let state: PopupState = { enabled: false, pending: false, availability: 'loading' }
  let revision = 0
  const listeners = new Set<() => void>()
  const set = (patch: Partial<PopupState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  async function send(type: TabAction) {
    if (!state.enabled || state.tabId === undefined) return
    const tabId = state.tabId, requested = revision
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type }) as TabStatus | undefined
      if (response && requested === revision) set({ ...response, error: undefined })
    } catch { if (requested === revision && type !== 'pageStatus') set({ error: 'permissionFailed' }) }
  }
  async function inject(tabId: number) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['capture-handle.js'], world: 'MAIN' })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async init() {
      const requested = ++revision
      state = { enabled: false, pending: false, availability: 'loading' }; set({})
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (requested !== revision) return
        if (tab?.id === undefined || !tab.url) { set({ enabled: false, tabId: tab?.id, availability: 'unavailable', error: undefined }); return }
        if (!/^https?:\/\//.test(tab.url)) { set({ enabled: false, tabId: tab.id, url: tab.url, availability: 'restricted', error: undefined }); return }
        const origin = new URL(tab.url).origin
        const enabled = await chrome.permissions.contains({ origins: [origin + '/*'] })
        if (requested !== revision) return
        set({ origin, url: tab.url, tabId: tab.id, enabled, availability: 'ready', error: undefined })
        if (enabled) {
          try {
            // Existing tabs need a one-time injection after installation or an extension reload.
            let response: TabStatus | undefined
            try { response = await chrome.tabs.sendMessage(tab.id, { type: 'pageStatus' }) as TabStatus | undefined }
            catch { await inject(tab.id); response = await chrome.tabs.sendMessage(tab.id, { type: 'pageStatus' }) as TabStatus | undefined }
            if (response && requested === revision) set({ ...response, error: undefined })
          } catch { if (requested === revision) set({ enabled: false, availability: 'restricted', error: undefined }) }
        }
      } catch { if (requested === revision) set({ enabled: false, availability: 'unavailable', error: undefined }) }
    },
    enable() {
      if (!state.origin || state.tabId === undefined || state.pending) return
      const { origin, tabId } = state
      const requested = revision
      const permission = chrome.permissions.request({ origins: [origin + '/*'] })
      set({ pending: true, error: undefined })
      void permission.then(async granted => {
        if (!granted) throw new BrowserFailure('permissionFailed')
        await inject(tabId)
        const registered = await chrome.runtime.sendMessage({ type: 'registerSites' }) as { ok?: boolean } | undefined
        if (!registered?.ok) throw new BrowserFailure('permissionFailed')
        if (requested !== revision) return
        set({ enabled: true, availability: 'ready' })
        await send('pageStatus')
      }).catch(() => { if (requested === revision) set({ error: 'permissionFailed' }) }).finally(() => { if (requested === revision) set({ pending: false }) })
    },
    send,
  }
}
