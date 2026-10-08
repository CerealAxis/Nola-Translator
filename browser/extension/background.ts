import { BROWSER_HOST_NAME, browserRequestSchema } from '../../src/shared/browser'

const DEFAULT_ORIGINS = ['https://www.youtube.com/*', 'https://www.bilibili.com/*']
async function registerSites(): Promise<void> {
  const permissions = await chrome.permissions.getAll()
  const matches = (permissions.origins ?? []).filter(origin => origin.startsWith('https://') && !DEFAULT_ORIGINS.includes(origin))
  if (!matches.length) return
  const scripts: ChromeScript[] = [{ id: 'nola-main', matches, js: ['capture-handle.js'], runAt: 'document_start', world: 'MAIN', persistAcrossSessions: true }, { id: 'nola-content', matches, js: ['content.js'], runAt: 'document_idle', persistAcrossSessions: true }]
  const registered = await chrome.scripting.getRegisteredContentScripts()
  for (const script of scripts) {
    if (registered.some(existing => existing.id === script.id)) await chrome.scripting.updateContentScripts([script])
    else await chrome.scripting.registerContentScripts([script])
  }
}
chrome.runtime.onInstalled.addListener(() => { void registerSites().catch(() => undefined) })
chrome.runtime.onStartup.addListener(() => { void registerSites().catch(() => undefined) })
chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'registerSites') {
    void registerSites().then(() => reply({ ok: true }), () => reply({ ok: false }))
    return true
  }
  return false
})
chrome.runtime.onConnect.addListener(content => {
  const popup = content.name === 'nola-popup' && content.sender?.url === chrome.runtime.getURL('popup.html')
  const page = content.name === 'nola-captions' && content.sender?.frameId === 0 && content.sender.tab?.id !== undefined && content.sender.url?.startsWith('https://')
  if (!popup && !page) { content.disconnect(); return }
  let native: ChromePort | null = null
  let closed = false
  content.onMessage.addListener(message => {
    const request = browserRequestSchema.safeParse(message)
    if (!request.success || closed) return
    if (popup && request.data.type !== 'hello') return
    try {
      if (!native) {
        native = chrome.runtime.connectNative(BROWSER_HOST_NAME)
        native.onMessage.addListener(response => { if (!closed) content.postMessage(response) })
        native.onDisconnect.addListener(() => {
          // Reading lastError consumes Chrome's asynchronous diagnostic.
          const diagnostic = chrome.runtime.lastError?.message
          native = null
          if (!closed) content.postMessage({ type: 'error', id: '*', code: 'appUnavailable', message: diagnostic ?? '' })
        })
      }
      native.postMessage(request.data.type === 'hello' ? { ...request.data, browser: navigator.userAgent.includes('Edg/') ? 'edge' : 'chrome' } : request.data)
    } catch {
      content.postMessage({ type: 'error', id: request.data.id, code: 'appUnavailable', message: '' })
    }
  })
  content.onDisconnect.addListener(() => { closed = true; native?.disconnect(); native = null })
})
