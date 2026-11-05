const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

// Uses a real browser action popup and a local API fixture, with no external translation dependency.
async function main() {
  const root = path.resolve(__dirname, '../..')
  const executable = process.env.POPUP_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const name = /quark/i.test(executable) ? 'quark' : /msedge/i.test(executable) ? 'edge' : 'chrome'
  const output = path.join(root, 'artifacts/browser-toolbar', name)
  await fs.mkdir(output, { recursive: true })
  const apiRequests = []
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*'); response.setHeader('Access-Control-Allow-Headers', '*')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let body = ''; request.on('data', chunk => { body += chunk })
      request.on('end', () => { apiRequests.push(JSON.parse(body)); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content: '固定测试译文' } }] })) })
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end('<!doctype html><html lang="en"><head><title>Nola toolbar acceptance</title></head><body><main style="max-width:650px;margin:80px auto;font:18px/1.7 sans-serif"><h1>Browser translation test</h1><p id="source">Good ideas can travel across languages.</p><p>This page checks the actual browser toolbar and the floating translation button.</p></main></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-toolbar-'))
  const context = await chromium.launchPersistentContext(profile, { executablePath: executable, headless: process.env.POPUP_HEADLESS === '1', viewport: null, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging', '--window-size=1100,850', '--disable-features=msEdgeTranslate,Translate'] })
  const results = []; const errors = []; const externalErrors = []; const worlds = new Map()
  const cdp = await context.browser().newBrowserCDPSession()
  const pending = new Map(); let nextId = 0
  cdp.on('Target.receivedMessageFromTarget', event => {
    const message = JSON.parse(event.message)
    if (message.method === 'Runtime.executionContextCreated') worlds.set(event.sessionId + ':' + message.params.context.id, message.params.context)
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      const world = worlds.get(event.sessionId + ':' + detail.executionContextId)
      // Quark AI injects into extension pages too; retain its errors separately with the actual owner.
      const external = name === 'quark' && world?.name === 'Quark AI' && world.origin === 'chrome-extension://ohnljapjcohnpigdhnhbhfdkpphniljh' && world.auxData?.isDefault === false
      ;(external ? externalErrors : errors).push({ detail, world })
    }
    const key = event.sessionId + ':' + message.id
    if (pending.has(key)) { pending.get(key)(message); pending.delete(key) }
  })
  async function connectPopup(targetId) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false })
    const call = async (method, params = {}) => {
      const id = ++nextId
      let timer
      const answer = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Popup command timed out: ' + method)), 10000); pending.set(sessionId + ':' + id, resolve) })
      try { await cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }); const result = await answer; if (result.error) throw new Error(JSON.stringify(result.error)); return result.result } finally { clearTimeout(timer) }
    }
    await call('Runtime.enable')
    const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value }
    const wait = async expression => { for (let i = 0; i < 150; i++) { const value = await evaluate(`Boolean(${expression})`); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)) } throw new Error('Popup condition timed out: ' + expression) }
    const click = async expression => {
      await wait(`Boolean(${expression})`)
      const point = await evaluate(`(()=>{const e=${expression}; e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
    }
    return { call, evaluate, wait, click, screenshot: async file => { const result = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(output, file), Buffer.from(result.data, 'base64')) } }
  }
  try {
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(root, 'browser/extension/dist') })
    const worker = context.serviceWorkers().find(worker => worker.url().includes(id)) || await context.waitForEvent('serviceworker')
    await worker.evaluate(async endpoint => {
      const database = await new Promise((resolve, reject) => { const request = indexedDB.open('nola-extension-providers', 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings') }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      const providers = [
        { id: 'desktop', name: 'Nola Translator', preset: 'nola', baseUrl: '', apiKey: '', model: '', capabilities: ['asr', 'mt', 'tts', 's2s', 'llm'], headers: {}, options: {} },
        { id: 'fixture', name: 'Local fixture', preset: 'openai-compatible', baseUrl: endpoint, apiKey: '', model: 'fixture', capabilities: ['mt', 'llm'], headers: {}, options: {} },
      ]
      await new Promise((resolve, reject) => { const transaction = database.transaction('settings', 'readwrite'); transaction.objectStore('settings').put(providers, 'connections'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error) }); database.close()
      await chrome.storage.local.set({ providerRevision: 'toolbar-fixture', translateTitle: false })
    }, `http://127.0.0.1:${server.address().port}/v1`)
    console.log('Extension loaded:', id)
    const page = context.pages()[0]
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    page.on('pageerror', error => errors.push(error.message))
    const floating = page.locator('[data-nola-extension="floating"]')
    await floating.waitFor({ state: 'visible' })
    const dock = floating.locator('.nola-floating-trigger')
    const idle = await dock.boundingBox()
    const viewport = await page.evaluate(() => innerWidth)
    assert.ok(viewport - idle.x >= 15 && viewport - idle.x <= 25, 'Idle dock exposes about 20px at the page edge')
    await dock.hover({ position: { x: 5, y: 20 } })
    await page.waitForFunction(() => document.querySelector('[data-nola-extension="floating"]').shadowRoot.querySelector('.nola-floating-controls').dataset.expanded === 'true')
    await floating.locator('.nola-floating-tool').last().waitFor({ state: 'visible' })
    await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-nola-extension="floating"]').shadowRoot.querySelector('.nola-floating-trigger')).opacity === '1')
    await page.screenshot({ path: path.join(output, 'floating-expanded.png') })
    results.push({ check: 'ordinary HTTP page gets a floating button without manual enable', exposedWidth: viewport - idle.x })
    async function openPopup(locale, theme) {
      await worker.evaluate(values => chrome.storage.local.set(values), { uiLanguage: locale, theme })
      await page.bringToFront()
      await worker.evaluate(() => chrome.action.openPopup())
      let target
      for (let i = 0; i < 60 && !target; i++) { target = (await cdp.send('Target.getTargets')).targetInfos.find(target => target.url === `chrome-extension://${id}/popup.html`); if (!target) await new Promise(resolve => setTimeout(resolve, 50)) }
      assert.ok(target, 'Browser created an action popup')
      const popup = await connectPopup(target.targetId)
      await popup.wait(`document.documentElement.lang === ${JSON.stringify(locale)} && document.documentElement.dataset.theme === ${JSON.stringify(theme)} && document.querySelector('.nola-popup-translate') && !document.querySelector('.nola-popup-translate').disabled`)
      await popup.wait(`getComputedStyle(document.querySelector('.nola-popup-translate')).opacity === '1'`)
      return popup
    }
    for (const locale of process.argv.includes('--quick') ? ['zh-CN'] : ['en', 'zh-CN', 'zh-TW', 'zh-HK', 'ja', 'ko']) for (const theme of ['light', 'dark']) {
      console.log('Checking toolbar', locale, theme)
      const popup = await openPopup(locale, theme)
      const size = await popup.evaluate(`(()=>{const r=document.querySelector('.nola-popup-footer').getBoundingClientRect();return{width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth,footerBottom:r.bottom,alerts:document.querySelectorAll('[role=alert]').length}})()`)
      assert.ok(size.width >= 376 && size.width < 410, JSON.stringify(size))
      assert.ok(size.scroll <= size.width, 'No clipped horizontal content')
      assert.ok(size.footerBottom <= size.height + 1, 'Footer fits the browser popup')
      assert.equal(size.alerts, 0)
      await popup.screenshot(`popup-${locale}-${theme}.png`)
      results.push({ locale, theme, ...size })
      await popup.evaluate('window.close()')
      for (let i = 0; i < 50; i++) { if (!(await cdp.send('Target.getTargets')).targetInfos.some(target => target.url.endsWith('/popup.html'))) break; await new Promise(resolve => setTimeout(resolve, 50)) }
    }
    const popup = await openPopup('en', 'light')
    await popup.click(`document.querySelector('[aria-label="Source language"]')`)
    await popup.click(`document.querySelector('input[aria-label="Search languages"]')`)
    await popup.call('Input.insertText', { text: 'English' })
    await popup.click(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('English'))`)
    await popup.wait(`document.querySelector('[aria-label="Source language"]').textContent.includes('English')`)
    await popup.click(`document.querySelector('[aria-label="API connections"]')`)
    await popup.wait(`document.querySelector('[role=dialog]')`)
    const drawer = await popup.evaluate(`(()=>{const r=document.querySelector('[role=dialog]').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()`)
    assert.ok(drawer.x >= -1 && drawer.y >= -1 && drawer.right <= drawer.width + 1 && drawer.bottom <= drawer.height + 1, JSON.stringify(drawer))
    await popup.screenshot('providers.png')
    await popup.click(`document.querySelector('[role=dialog] [role=combobox]')`)
    await popup.click(`Array.from(document.querySelectorAll('[role=option]')).find(e=>e.textContent.includes('Local fixture'))`)
    await popup.wait(`document.querySelector('[role=dialog] [role=combobox]').textContent.includes('Local fixture')`)
    await popup.click(`document.querySelector('[role=dialog] [aria-label="Close"]')`)
    await popup.wait(`!document.querySelector('[role=dialog]')`)
    await popup.click(`document.querySelector('.nola-popup-translate')`)
    console.log('Translation requested:', await popup.evaluate(`document.querySelector('.nola-popup').innerText`))
    await page.locator('#source [data-nola-translation]').waitFor({ timeout: 45000 })
    assert.match(await page.locator('#source [data-nola-translation]').innerText(), /[\u3400-\u9fff]/)
    await popup.wait(`document.querySelector('.nola-popup-translate').getAttribute('aria-label') === 'Restore original'`)
    await popup.click(`document.querySelector('.nola-popup-translate')`)
    await page.locator('#source [data-nola-translation]').waitFor({ state: 'detached' })
    results.push({ check: 'real popup search, provider drawer, local API translation and restore' })
    await popup.evaluate('window.close()')
    await dock.hover({ position: { x: 5, y: 20 } })
    await dock.click()
    await page.locator('#source [data-nola-translation]').waitFor({ timeout: 45000 })
    await dock.click()
    await page.locator('#source [data-nola-translation]').waitFor({ state: 'detached' })
    await page.screenshot({ path: path.join(output, 'floating-translation-restored.png') })
    results.push({ check: 'floating main button translates and restores using local API fixture' })
    const panelPopup = await openPopup('en', 'light')
    await panelPopup.click(`document.querySelector('[aria-label="Open translation sidebar"]')`)
    let panelTarget
    for (let i = 0; i < 60 && !panelTarget; i++) { panelTarget = (await cdp.send('Target.getTargets')).targetInfos.find(target => target.url === `chrome-extension://${id}/sidepanel.html`); if (!panelTarget) await new Promise(resolve => setTimeout(resolve, 100)) }
    assert.ok(panelTarget, 'Toolbar click opens a native browser sidebar')
    const panel = await connectPopup(panelTarget.targetId)
    await panel.wait(`document.querySelector('.nola-popup-translate') && !document.querySelector('.nola-popup-translate').disabled`)
    await panel.screenshot('native-sidebar.png')
    const second = await context.newPage()
    await second.goto(`http://127.0.0.1:${server.address().port}/second`)
    await second.locator('[data-nola-extension="floating"]').waitFor()
    await panel.wait(`!document.querySelector('.nola-popup-translate').disabled`)
    await panel.click(`document.querySelector('.nola-popup-translate')`)
    await second.locator('#source [data-nola-translation]').waitFor({ timeout: 45000 })
    assert.equal(await page.locator('#source [data-nola-translation]').count(), 0, 'Sidebar follows the newly active tab')
    await panel.wait(`document.querySelector('.nola-popup-translate').getAttribute('aria-label') === 'Restore original'`)
    await panel.click(`document.querySelector('.nola-popup-translate')`)
    await second.locator('#source [data-nola-translation]').waitFor({ state: 'detached' })
    await second.close()
    results.push({ check: 'native sidebar opens from popup and translates the newly active tab' })
    assert.deepEqual(errors, [])
    assert.ok(apiRequests.length > 0, 'Browser actions reached the local API fixture')
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ browser: name, version: await worker.evaluate(() => chrome.runtime.getManifest().version), results, errors, externalErrors, limits: ['No paid ASR or audio test in this focused popup regression'] }, null, 2))
    console.log(JSON.stringify({ browser: name, checks: results.length, errors, externalErrors: externalErrors.length }))
    if (process.argv.includes('--inspect')) { await worker.evaluate(() => chrome.storage.local.set({ uiLanguage: 'zh-CN', theme: 'light' })); console.log('Ready for native toolbar click inspection; send Enter to close.'); await new Promise(resolve => process.stdin.once('data', resolve)) }
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
