interface CaptureClient { port: ChromePort; id: string; closed: boolean; started: boolean }

export function setupTabAudioRuntime(): void {
  if (!chrome.offscreen || !chrome.tabCapture) return
  const clients = new Map<string, CaptureClient>()
  let offscreen: ChromePort | undefined
  let starting: Promise<ChromePort> | undefined
  let closing: Promise<void> | undefined
  let documentPresent = false
  const waiters = new Set<(port: ChromePort) => void>()
  const reply = (client: CaptureClient, value: unknown) => { if (!client.closed) { try { client.port.postMessage(value) } catch { client.port.disconnect() } } }
  const closeIdle = () => {
    if (starting || closing || !documentPresent || [...clients.values()].some(client => client.started && !client.closed)) return
    // A stale document's disconnect must not terminate a new tab waiting for its replacement.
    offscreen = undefined; documentPresent = false
    closing = Promise.resolve().then(() => chrome.offscreen!.closeDocument()).catch(() => {}).finally(() => { closing = undefined })
  }
  const stop = (client: CaptureClient) => {
    if (client.closed) return
    client.closed = true; clients.delete(client.id)
    try { offscreen?.postMessage({ type: 'close', id: client.id }) } catch { /* The document may already have exited. */ }
    closeIdle()
  }
  async function documentPort(): Promise<ChromePort> {
    if (closing) await closing
    if (offscreen) return offscreen
    if (starting) return starting
    starting = (async () => {
      const url = chrome.runtime.getURL('offscreen.html')
      const contexts = await chrome.runtime.getContexts?.({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] }) ?? []
      if (offscreen) return offscreen
      // An existing document without its port survived a service-worker restart; replace it.
      if (contexts.length) await chrome.offscreen!.closeDocument()
      await chrome.offscreen!.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Capture tab audio and preserve playback outside the captured tab.' })
      documentPresent = true
      if (offscreen) return offscreen
      return new Promise<ChromePort>((resolve, reject) => {
        const ready = (port: ChromePort) => { clearTimeout(timer); waiters.delete(ready); resolve(port) }
        const timer = setTimeout(() => { waiters.delete(ready); reject(new Error('Offscreen capture did not connect')) }, 10000)
        waiters.add(ready)
      })
    })().finally(() => { starting = undefined; closeIdle() })
    return starting
  }
  chrome.runtime.onConnect.addListener(port => {
    if (port.name === 'nola-offscreen-audio') {
      if (closing || port.sender?.url !== chrome.runtime.getURL('offscreen.html')) { port.disconnect(); return }
      if (offscreen && offscreen !== port) { port.disconnect(); return }
      offscreen = port
      documentPresent = true
      for (const ready of [...waiters]) ready(port)
      port.onMessage.addListener(raw => {
        if (offscreen !== port || !raw || typeof raw !== 'object') return
        const message = raw as Record<string, unknown>
        if (typeof message.id !== 'string') return
        const client = clients.get(message.id)
        if (client) reply(client, message)
      })
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError
        if (offscreen !== port) return
        offscreen = undefined; documentPresent = false
        for (const client of [...clients.values()]) { reply(client, { type: 'error', code: 'browserCaptureCancelled' }); stop(client) }
      })
      return
    }
    if (port.name !== 'nola-tab-audio') return
    const sender = port.sender, url = sender?.url, tab = sender?.tab?.id
    let secure = false
    try { const page = new URL(url ?? ''); secure = page.protocol === 'https:' || page.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname) } catch { /* Invalid sender origins are rejected below. */ }
    if (tab === undefined || sender?.frameId !== 0 || !url || !secure) { port.disconnect(); return }
    const client: CaptureClient = { port, id: crypto.randomUUID(), closed: false, started: false }
    clients.set(client.id, client)
    port.onDisconnect.addListener(() => stop(client))
    port.onMessage.addListener(raw => {
      if (client.closed || !raw || typeof raw !== 'object') return
      const message = raw as Record<string, unknown>
      if (message.type === 'start' && !client.started) {
        client.started = true
        void (async () => {
          if (!await chrome.permissions.contains({ origins: [`${new URL(url).origin}/*`] })) { reply(client, { type: 'error', code: 'browserPermissionDenied' }); stop(client); return }
          if (client.closed) return
          const target = await documentPort()
          if (client.closed) return
          let streamId: string
          try { streamId = await chrome.tabCapture!.getMediaStreamId({ targetTabId: tab }) }
          catch { reply(client, { type: 'error', code: 'browserTabCapturePermission' }); stop(client); return }
          if (!client.closed) target.postMessage({ type: 'start', id: client.id, streamId })
        })().catch(() => { reply(client, { type: 'error', code: 'browserCaptureUnsupported' }); stop(client) })
      } else if (message.type === 'gate' && client.started && typeof message.enabled === 'boolean' && Number.isSafeInteger(message.epoch) && Number(message.epoch) >= 0) {
        try { offscreen?.postMessage({ type: 'gate', id: client.id, enabled: message.enabled, epoch: message.epoch }) } catch { reply(client, { type: 'error', code: 'browserCaptureCancelled' }); stop(client) }
      }
    })
  })
}
