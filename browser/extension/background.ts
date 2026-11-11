import './csp'
import { BROWSER_HOST_NAME, browserRequestSchema } from '../../src/shared/browser'
import { setupProviderRuntime } from './provider-runtime'
import { setupContextMenus } from './context-menus'
import { setupSpeechRuntime } from './speech-runtime'
import { setupTabAudioRuntime } from './tab-audio-runtime'
import { extensionGlossary, hasApplicableGlossary } from './glossary-store'
import { loadPreferences } from './preferences'
import { setupDiagnosticsRuntime } from './diagnostics'

setupDiagnosticsRuntime()
setupProviderRuntime()
setupContextMenus()
setupSpeechRuntime()
setupTabAudioRuntime()

const pages = new Set<ChromePort>()
async function refreshSites(): Promise<void> {
  // Static HTTP(S) scripts now own page activation; remove registrations from older releases.
  const registered = await chrome.scripting.getRegisteredContentScripts()
  const ids = registered.filter(script => script?.id === 'nola-main' || script?.id === 'nola-content').map(script => script.id)
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids })
}
let registration = Promise.resolve()
function registerSites(): Promise<void> { registration = registration.catch(() => undefined).then(refreshSites); return registration }

chrome.runtime.onInstalled.addListener(() => { void registerSites().catch(() => undefined) })
chrome.runtime.onStartup.addListener(() => { void registerSites().catch(() => undefined) })
chrome.permissions.onRemoved.addListener(() => {
  void registerSites().catch(() => undefined)
  void chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(tab => chrome.tabs.sendMessage(tab.id!, { type: 'siteAccessChanged' })))).catch(() => undefined)
  for (const page of pages) {
    const url = page.sender?.url
    if (url) void chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] }).catch(() => false).then(allowed => { if (!allowed) page.disconnect() })
  }
})
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (typeof message !== 'object' || message === null || !('type' in message)) return false
  if (message.type === 'checkSiteAccess') {
    const url = sender?.url
    if (!sender?.id || sender.id !== chrome.runtime.id || sender.frameId !== 0 || sender.tab?.id === undefined || !/^https?:\/\//.test(url ?? '')) { reply({ allowed: false }); return false }
    let origin: string
    try { origin = new URL(url!).origin } catch { reply({ allowed: false }); return false }
    void chrome.permissions.contains({ origins: [origin + '/*'] }).then(allowed => reply({ allowed }), () => reply({ allowed: false }))
    return true
  }
  if (message.type === 'openTranslationPanel') {
    const trusted = ['popup.html', 'options.html', 'sidepanel.html'].some(path => sender?.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL(path))
    const page = sender?.frameId === 0 && /^https?:\/\//.test(sender.url ?? '')
    const tabId = page ? sender?.tab?.id : trusted && 'tabId' in message ? message.tabId : undefined
    if (!sender?.id || sender.id !== chrome.runtime.id || (!trusted && !page) || typeof tabId !== 'number' || !Number.isSafeInteger(tabId) || tabId < 0) { reply({ ok: false, error: 'permissionFailed' }); return false }
    if (!chrome.sidePanel) { reply({ ok: false, error: 'openPanelFromToolbar' }); return false }
    try {
      // Keep this call synchronous with the originating content or extension-page click.
      void chrome.sidePanel.open({ tabId }).then(() => reply({ ok: true }), () => reply({ ok: false, error: 'openPanelFromToolbar' }))
      return true
    } catch { reply({ ok: false, error: 'openPanelFromToolbar' }); return false }
  }
  if (message.type === 'registerSites' && ['popup.html', 'options.html', 'sidepanel.html'].some(path => sender?.url?.split(/[?#]/, 1)[0] === chrome.runtime.getURL(path))) {
    void registerSites().then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  return false
})
chrome.runtime.onConnect.addListener(content => {
  if (['nola-provider', 'nola-speech', 'nola-tab-audio', 'nola-offscreen-audio'].includes(content.name)) return
  const popup = content.name === 'nola-popup' && ['popup.html', 'options.html', 'sidepanel.html'].some(path => content.sender?.url?.split('#')[0].split('?')[0] === chrome.runtime.getURL(path))
  const page = content.name === 'nola-captions' && content.sender?.frameId === 0 && content.sender.tab?.id !== undefined && content.sender.url?.startsWith('https://')
  if (!popup && !page) { content.disconnect(); return }
  if (page) pages.add(content)
  const allowed = page && content.sender?.url
    ? chrome.permissions.contains({ origins: [`${new URL(content.sender.url).origin}/*`] }).catch(() => false)
    : Promise.resolve(true)
  let native: ChromePort | null = null
  let closed = false
  const reply = (message: unknown) => {
    if (!closed) try { content.postMessage(message) } catch { /* The page can enter BFCache before onDisconnect runs. */ }
  }
  const disconnectNative = () => {
    const previous = native
    native = null
    try { previous?.disconnect() } catch { /* Native Messaging may already have closed. */ }
  }
  let directActive = false, directTarget = ''
  const glossaryChanged = page ? extensionGlossary.onChanged(() => {
    if (!directActive || !content.sender?.url) return
    void extensionGlossary.snapshot().then(document => {
      if (directActive && hasApplicableGlossary(document, directTarget, content.sender!.url!)) {
        directActive = false
        reply({ type: 'error', id: '*', code: 'browserGlossaryModeUnsupported', message: '' })
        disconnectNative()
      }
    }).catch(() => {})
  }) : () => {}
  content.onMessage.addListener(message => {
    void allowed.then(async permitted => {
      if (!permitted) { content.disconnect(); return }
      const request = browserRequestSchema.safeParse(message)
      if (!request.success || closed) return
      if (popup && request.data.type !== 'hello') return
      try {
        if (request.data.type === 'start' && content.sender?.url) {
          directTarget = request.data.targetLanguage ?? (await loadPreferences()).videoLanguage
          if (hasApplicableGlossary(await extensionGlossary.snapshot(), directTarget, content.sender.url)) {
            reply({ type: 'error', id: request.data.id, code: 'browserGlossaryModeUnsupported', message: '' }); return
          }
          if (closed) return
          directActive = true
        } else if (request.data.type === 'stop') directActive = false
        if (!native) {
          const connected = chrome.runtime.connectNative(BROWSER_HOST_NAME)
          native = connected
          connected.onMessage.addListener(response => { if (native === connected) reply(response) })
          connected.onDisconnect.addListener(() => {
            // Reading lastError consumes Chrome's asynchronous diagnostic.
            const diagnostic = chrome.runtime.lastError?.message
            if (native !== connected) return
            native = null
            directActive = false
            reply({ type: 'error', id: '*', code: 'appUnavailable', message: diagnostic ?? '' })
          })
        }
        try {
          native.postMessage(request.data.type === 'hello' ? { ...request.data, browser: navigator.userAgent.includes('Firefox/') ? 'firefox' : navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome' } : request.data)
        } catch {
          directActive = false
          disconnectNative()
          reply({ type: 'error', id: '*', code: 'browserConnectionLost', message: '' })
        }
      } catch {
        directActive = false
        reply({ type: 'error', id: request.data.id, code: 'appUnavailable', message: '' })
      }
    })
  })
  content.onDisconnect.addListener(() => {
    void chrome.runtime.lastError
    pages.delete(content); closed = true; directActive = false; glossaryChanged(); disconnectNative()
  })
})
