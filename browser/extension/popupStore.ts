import { BrowserFailure } from './bridge'
import type { SubtitleState } from './subtitle-translation'

interface TabStatus {
  pageActive?: boolean
  pageError?: string
  video?: boolean
  realtime?: boolean
  liveError?: string
  subtitles?: boolean
  subtitleError?: string
  subtitleAvailability?: SubtitleState['availability']
}
type TabAction = 'pageStatus' | 'startPageTranslation' | 'stopPageTranslation' | 'toggleSubtitles' | 'toggleRealtime' | 'refreshDesktopConnection'
export interface PopupState extends TabStatus { availability?: 'loading' | 'ready' | 'restricted' | 'unavailable'; enabled: boolean; pending: boolean; error?: string; origin?: string; url?: string; tabId?: number }
const missingReceiver = (error: unknown) => error instanceof Error && /receiving end does not exist/i.test(error.message)
export function createPopupStore() {
  let state: PopupState = { enabled: false, pending: false, availability: 'loading' }
  let revision = 0
  const listeners = new Set<() => void>()
  const set = (patch: Partial<PopupState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener() }
  async function send(type: TabAction, retry = true) {
    if (!state.enabled || state.tabId === undefined) return
    const { tabId, url } = state
    const requested = revision
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type }) as TabStatus | undefined
      if (response && requested === revision) set({ ...response, error: undefined })
    } catch (error) {
      if (requested !== revision) return
      if (missingReceiver(error)) {
        if (retry) {
          const recovery = init({ tabId, url })
          const recoveryRevision = revision
          await recovery
          if (recoveryRevision !== revision || state.tabId !== tabId || state.url !== url) return
          if (state.enabled) {
            if (type === 'pageStatus') return
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
            if (recoveryRevision === revision && active?.id === tabId && active.url === url) await send(type, false)
            return
          }
          if (state.availability === 'restricted') return
        }
        set({ enabled: false, availability: 'unavailable', error: 'providerDisconnected' })
      } else if (type !== 'pageStatus' && type !== 'refreshDesktopConnection') {
        set({ error: 'permissionFailed' })
      }
    }
  }
  async function inject(tabId: number) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['capture-handle.js'], world: 'MAIN' })
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
  }
  async function status(tabId: number) {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'pageStatus' }) as TabStatus | undefined
    if (!response) throw new Error('Receiving end does not exist')
    return response
  }
  async function init(disconnected?: Pick<PopupState, 'tabId' | 'url'>) {
    const requested = ++revision
    state = { enabled: false, pending: false, availability: 'loading' }; set({})
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (requested !== revision) return
      if (tab?.id === undefined || !tab.url) { set({ tabId: tab?.id, availability: 'unavailable' }); return }
      if (!/^https?:\/\//.test(tab.url)) { set({ tabId: tab.id, url: tab.url, availability: 'restricted' }); return }
      const origin = new URL(tab.url).origin
      const enabled = await chrome.permissions.contains({ origins: [origin + '/*'] })
      if (requested !== revision) return
      const current = { origin, url: tab.url, tabId: tab.id }
      if (!enabled) { set({ ...current, availability: 'ready' }); return }
      try {
        // Existing tabs need a one-time injection after an extension reload.
        let response: TabStatus | undefined
        if (disconnected?.tabId !== tab.id || disconnected?.url !== tab.url) {
          response = await status(tab.id).catch(() => undefined)
        }
        if (requested !== revision) return
        if (!response) {
          await inject(tab.id)
          if (requested !== revision) return
          response = await status(tab.id)
        }
        if (requested === revision) set({ ...current, ...response, enabled: true, availability: 'ready' })
      } catch (error) {
        if (requested !== revision) return
        if (missingReceiver(error)) set({ ...current, availability: 'unavailable', error: 'providerDisconnected' })
        else set({ ...current, availability: 'restricted' })
      }
    } catch { if (requested === revision) set({ enabled: false, availability: 'unavailable', error: undefined }) }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    init,
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
        const response = await status(tabId)
        if (requested === revision) set({ ...response, enabled: true, availability: 'ready' })
      }).catch(error => {
        if (requested === revision) set({ error: missingReceiver(error) ? 'providerDisconnected' : 'permissionFailed' })
      }).finally(() => { if (requested === revision) set({ pending: false }) })
    },
    send,
  }
}
