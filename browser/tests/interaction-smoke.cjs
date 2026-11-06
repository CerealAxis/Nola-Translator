const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

// This suite uses a local deterministic API, not a free or paid translation service.
// The temporary manifest grants only fixture hosts; the shipped manifest is untouched.
async function main() {
  const root = path.resolve(__dirname, '../..')
  const output = path.join(root, 'artifacts/browser-interactions')
  await fs.mkdir(output, { recursive: true })
  const requests = []; const errors = []
  const server = http.createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*')
    response.setHeader('Access-Control-Allow-Headers', '*')
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
    if (request.method === 'POST' && request.url === '/v1/chat/completions') {
      let body = ''; request.on('data', chunk => { body += chunk })
      request.on('end', () => { requests.push(JSON.parse(body)); response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ choices: [{ message: { content: '固定测试译文' } }] })) })
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html lang="en"><head><title>Nola interaction fixture</title></head><body style="font:16px system-ui;padding:40px"><main><h1>Interaction fixture</h1><p id="paragraph">Hello fixture paragraph.</p><label for="input">Input text</label><textarea id="input" rows="4" cols="40"></textarea></main></body></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const origin = `http://localhost:${port}`; const api = `http://127.0.0.1:${port}/v1`
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-interaction-'))
  const extension = path.join(temporary, 'extension')
  await fs.cp(path.join(root, 'browser/extension/dist'), extension, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'))
  manifest.host_permissions.push('http://localhost/*', 'http://127.0.0.1/*')
  for (const script of manifest.content_scripts) script.matches.push('http://localhost/*')
  await fs.writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest))
  const identity = (await fs.readFile(path.join(root, 'src/shared/browser.ts'), 'utf8')).match(/BROWSER_EXTENSION_ID = '([^']+)'/)[1]
  const context = await chromium.launchPersistentContext(path.join(temporary, 'profile'), {
    executablePath: process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
    viewport: { width: 1280, height: 900 }, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  })
  context.setDefaultTimeout(15000)
  try {
    const settings = await context.newPage(); await settings.goto(`chrome-extension://${identity}/options.html`)
    settings.on('pageerror', error => errors.push(error.message))
    await settings.evaluate(async api => {
      const database = await new Promise((resolve, reject) => { const request = indexedDB.open('nola-extension-providers', 2); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings'); if (!request.result.objectStoreNames.contains('glossary')) request.result.createObjectStore('glossary') }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
      await new Promise((resolve, reject) => { const transaction = database.transaction('settings', 'readwrite'); transaction.objectStore('settings').put([{ id: 'fixture', name: 'Local fixture', preset: 'openai-compatible', baseUrl: api, apiKey: '', model: 'fixture-model', capabilities: ['mt', 'llm'], headers: {}, options: {} }], 'connections'); transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error) }); database.close()
      await chrome.storage.local.set({ uiLanguage: 'en', pageProvider: 'fixture', inputProvider: 'fixture', selectionProvider: 'fixture', pageLanguage: 'zh', sourceLanguage: 'en', inputSourceLanguage: 'en', inputTargetLanguage: 'zh', inputTranslation: true, inputTrigger: 'tripleSpace', translateTitle: false, contextAware: false, floatingButton: true, floatingSide: 'right', floatingPosition: 0.55, floatingLocked: false, floatingClickAction: 'translate', floatingDisabledSites: [], siteBlacklist: [], providerRevision: 'fixture' })
    }, api)
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await page.goto(origin + '/test')
    if (process.argv.includes('--subtitles-only')) {
      await settings.evaluate(() => chrome.storage.local.set({ subtitleProvider: 'fixture', batchSize: 1 }))
      await page.evaluate(() => {
        const video = document.createElement('video'); video.width = 640; video.height = 360; document.body.append(video)
        const track = video.addTextTrack('captions', 'English', 'en'); track.mode = 'hidden'
        for (let i = 0; i < 5; i++) track.addCue(new VTTCue(i * 120, i * 120 + 5, 'Preload cue ' + i))
      })
      await page.locator('[data-nola-extension="trigger"]').waitFor()
      await settings.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); await chrome.tabs.sendMessage(tab.id, { type: 'toggleSubtitles' }) }, origin + '/test')
      for (let i = 0; i < 150 && requests.length < 5; i++) await page.waitForTimeout(100)
      assert.equal(requests.length, 5, 'All five cues must be requested while the video remains paused at zero')
      assert.equal(await page.locator('video').evaluate(video => video.currentTime), 0)
      assert.ok(await page.locator('video').evaluate(video => video.paused))
      assert.deepEqual(errors, [])
      const result = { pausedAt: 0, lastCueAt: 480, translatedBeforePlayback: requests.length, errors }
      await fs.writeFile(path.join(output, 'subtitle-prefetch.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result)); return
    }
    const floating = page.locator('[data-nola-extension="floating"]')
    const trigger = floating.locator('.nola-floating-trigger')
    await trigger.waitFor({ state: 'visible' })
    const patch = values => settings.evaluate(values => chrome.storage.local.set(values), values)
    const prefs = keys => settings.evaluate(keys => chrome.storage.local.get(keys), keys)
    // Translation uses requestAnimationFrame; keep its fixture tab in the foreground.
    await page.bringToFront()
    await trigger.hover({ position: { x: 5, y: 20 } }); await trigger.click()
    await page.locator('#paragraph [data-nola-translation]').waitFor().catch(async error => {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true })
      const status = await settings.evaluate(async url => { const [tab] = await chrome.tabs.query({ url }); return chrome.tabs.sendMessage(tab.id, { type: 'pageStatus' }) }, origin + '/test')
      console.error({ requests, errors, status, floating: await floating.innerText(), preferences: await prefs(['pageProvider', 'pageLanguage', 'sourceLanguage', 'pageDisplay', 'floatingClickAction']) })
      throw error
    })
    assert.equal(await page.locator('#paragraph [data-nola-translation]').textContent(), '固定测试译文')
    await trigger.click()
    await page.waitForFunction(() => !document.querySelector('[data-nola-translation]'))
    const initial = await trigger.boundingBox()
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2); await page.mouse.down(); await page.mouse.move(100, 300, { steps: 12 }); await page.mouse.up()
    await page.waitForTimeout(150)
    const dock = await prefs(['floatingSide', 'floatingPosition'])
    assert.equal(dock.floatingSide, 'left'); assert.ok(Math.abs(dock.floatingPosition - 1 / 3) < 0.05)
    await trigger.hover(); await floating.getByRole('button', { name: 'Keep button visible', exact: true }).click()
    await settings.waitForFunction(async () => (await chrome.storage.local.get(['floatingLocked'])).floatingLocked === true, undefined, { polling: 100 })
    await page.mouse.move(500, 100)
    await page.waitForTimeout(200)
    const pinned = await trigger.boundingBox(); assert.ok(pinned.x >= 0)
    await patch({ floatingLocked: false })
    await trigger.hover({ position: { x: 30, y: 20 } }); await floating.getByRole('button', { name: 'Close', exact: true }).click()
    await floating.getByRole('button', { name: 'Hide on this website', exact: true }).click(); await floating.waitFor({ state: 'hidden' })
    assert.deepEqual((await prefs(['floatingDisabledSites'])).floatingDisabledSites, [origin])
    await page.reload(); await floating.waitFor({ state: 'hidden' })
    await patch({ floatingDisabledSites: [] }); await trigger.waitFor({ state: 'visible' })
    await trigger.hover({ position: { x: 30, y: 20 } }); await floating.getByRole('button', { name: 'Close', exact: true }).click(); await floating.getByRole('button', { name: 'Hide on all websites', exact: true }).click(); await floating.waitFor({ state: 'hidden' })
    assert.equal((await prefs(['floatingButton'])).floatingButton, false)
    await patch({ floatingButton: true }); await trigger.waitFor({ state: 'visible' })
    const input = page.locator('#input'); await input.fill('Hello input'); await input.press('Space'); await input.press('Space'); await input.press('Space')
    await page.waitForFunction(() => document.querySelector('#input').value === '固定测试译文')
    const actions = page.locator('[data-nola-extension="text-actions"]')
    await actions.getByRole('button', { name: 'More', exact: true }).click()
    await actions.getByRole('button', { name: 'Restore input', exact: true }).click()
    assert.equal(await input.inputValue(), 'Hello input  ')
    await input.press('Escape')
    await patch({ siteBlacklist: ['localhost'] }); await floating.waitFor({ state: 'hidden' })
    const before = requests.length
    await input.fill('Disabled input'); await input.press('Space'); await input.press('Space'); await input.press('Space'); await input.press('Alt+Enter')
    await page.waitForTimeout(700)
    assert.equal(requests.length, before); assert.equal(await input.inputValue(), 'Disabled input   ')
    assert.equal(await actions.isVisible(), false)
    await patch({ siteBlacklist: [] }); await trigger.waitFor({ state: 'visible' })
    await trigger.hover({ position: { x: 30, y: 20 } }); await page.screenshot({ path: path.join(output, 'floating-panel.png'), fullPage: true })
    assert.deepEqual(errors, [])
    const result = { browser: 'Edge', kind: 'Local deterministic API fixture; no free-service claim', assertions: ['translate and restore', 'drag persisted', 'pin keeps dock visible', 'hide website / globally', 'three-space automatic input translation', 'restore input', 'global website disable blocks input and floating controls'], apiRequests: requests.length, pageErrors: errors }
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2))
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
