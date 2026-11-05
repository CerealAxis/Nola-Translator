const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { firefox } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = path.resolve(__dirname, '../..')
async function debuggerClient(port, onPacket = () => {}) {
  const socket = net.createConnection(port, '127.0.0.1')
  let buffer = Buffer.alloc(0)
  const inbox = [], listeners = []
  socket.on('data', chunk => {
    buffer = Buffer.concat([buffer, chunk])
    while (true) {
      const colon = buffer.indexOf(':')
      if (colon < 0) break
      const size = Number(buffer.subarray(0, colon).toString())
      if (buffer.length < colon + 1 + size) break
      const packet = JSON.parse(buffer.subarray(colon + 1, colon + 1 + size).toString())
      buffer = buffer.subarray(colon + 1 + size)
      onPacket(packet)
      const listener = listeners.find(item => item.from === packet.from && !packet.type)
      if (listener) { listeners.splice(listeners.indexOf(listener), 1); listener.resolve(packet) } else inbox.push(packet)
    }
  })
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject) })
  const receive = from => new Promise((resolve, reject) => {
    const i = inbox.findIndex(packet => packet.from === from && !packet.type)
    if (i >= 0) { resolve(inbox.splice(i, 1)[0]); return }
    const timer = setTimeout(() => reject(new Error('Firefox debugger timeout: ' + from)), 15000)
    listeners.push({ from, resolve: packet => { clearTimeout(timer); resolve(packet) } })
  })
  await receive('root')
  return { close: () => socket.destroy(), request: async packet => { const response = receive(packet.to); const data = Buffer.from(JSON.stringify(packet)); socket.write(Buffer.concat([Buffer.from(data.length + ':'), data])); const value = await response; if (value.error) throw new Error(JSON.stringify(value)); return value } }
}
async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nola-firefox-extension-'))
  const extension = path.join(directory, 'extension')
  await fs.cp(path.join(root, 'browser/extension/dist-firefox'), extension, { recursive: true })
  const manifestPath = path.join(extension, 'manifest.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  manifest.host_permissions.push('https://nola.test/*', 'https://edge.microsoft.com/*', 'https://translate.googleapis.com/*')
  manifest.content_scripts.forEach(script => script.matches.push('https://nola.test/*'))
  manifest.background.scripts.unshift('fixture-settings.js')
  await fs.writeFile(path.join(extension, 'fixture-settings.js'), `
    browser.storage.local.set({ uiLanguage: 'en', pageProvider: 'microsoft-translate', selectionProvider: 'microsoft-translate', inputProvider: 'microsoft-translate', subtitleProvider: 'microsoft-translate', pageLanguage: 'zh', sourceLanguage: 'en', pageScope: 'main', pipeline: 'cascade', autoSites: ['https://nola.test'] });
    browser.runtime.connectNative = () => {
      const listeners = []; let streamId = '', chunks = 0, stopped = false;
      const emit = value => setTimeout(() => { if (!stopped) listeners.forEach(f => f(value)); }, 0);
      return { onMessage: { addListener: f => listeners.push(f) }, onDisconnect: { addListener: () => {} }, disconnect: () => { stopped = true; }, postMessage: request => {
        if (request.type === 'streamStart') streamId = request.id;
        if (request.type === 'streamAudio') {
          const samples = new Int16Array(Uint8Array.from(atob(request.pcmBase64), c => c.charCodeAt(0)).buffer);
          if (samples.some(sample => Math.abs(sample) > 300)) {
            chunks++;
            if (chunks % 10 === 0) emit({ type: 'capabilityEvent', id: streamId, event: { type: 'asr', data: { type: 'transcript', item_id: 'phrase-' + chunks, text: 'Captured actual audio.', final: true } } });
          }
        }
        emit({ type: 'result', id: request.id, value: {} });
      } };
    };
  `)
  await fs.writeFile(manifestPath, JSON.stringify(manifest))
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)) }) })
  const uuid = '52b244a1-81d6-47ac-83b9-50af36180f0b'
  const context = await firefox.launchPersistentContext(path.join(directory, 'profile'), {
    executablePath: process.env.FIREFOX_EXECUTABLE,
    headless: true, viewport: { width: 1280, height: 900 }, args: ['-start-debugger-server', String(port)],
    firefoxUserPrefs: { 'extensions.webextensions.uuids': JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: uuid }), 'devtools.chrome.enabled': true, 'devtools.debugger.remote-enabled': true, 'devtools.debugger.prompt-connection': false, 'xpinstall.signatures.required': false, 'media.autoplay.default': 0 },
  })
  let remote
  try {
    remote = await debuggerClient(port)
    const actors = await remote.request({ to: 'root', type: 'getRoot' })
    console.log('Firefox debugger connected')
    const installed = await remote.request({ to: actors.addonsActor, type: 'installTemporaryAddon', addonPath: extension })
    assert.equal(installed.addon.id, manifest.browser_specific_settings.gecko.id)
    console.log('Firefox addon installed')
    const origin = 'moz-extension://' + uuid
    const errors = []
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nola.test/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Firefox fixture</title></head><body><main><p id="source">Hello world.</p><textarea>Editable text</textarea></main></body></html>' }))
    await page.goto('https://nola.test/page')
    await page.locator('#source [data-nola-translation]').waitFor({ timeout: 45000 })
    const translated = await page.locator('#source [data-nola-translation]').innerText()
    assert(/[\u3400-\u9fff]/.test(translated), 'External provider must return Chinese with no native host installed')
    await fs.mkdir(path.join(root, 'artifacts/browser-firefox'), { recursive: true })
    await page.screenshot({ path: path.join(root, 'artifacts/browser-firefox/translated.png') })
    const rate = 16000, samples = rate * 60, wav = Buffer.alloc(44 + samples * 2)
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40)
    for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / rate) * 8000), 44 + i * 2)
    await page.route('https://nola.test/signal.wav', route => route.fulfill({ contentType: 'audio/wav', body: wav }))
    await page.route('https://nola.test/audio', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><video controls src="/signal.wav" style="width:640px;height:360px"></video></body></html>' }))
    await page.goto('https://nola.test/audio')
    await page.locator('video').evaluate(video => video.play())
    await page.locator('[data-nola-extension="trigger"]').getByRole('button').click()
    const panel = page.locator('[data-nola-extension="panel"]')
    await panel.getByRole('button', { name: 'Start live translation', exact: true }).click()
    await page.locator('[data-nola-extension="overlay"]').getByText('Captured actual audio.', { exact: true }).waitFor({ timeout: 30000 })
    await page.screenshot({ path: path.join(root, 'artifacts/browser-firefox/realtime.png') })
    if (!await panel.isVisible()) await page.locator('[data-nola-extension="trigger"]').getByRole('button').click()
    await panel.getByRole('button', { name: 'End', exact: true }).click()
    await panel.getByRole('button', { name: 'Start live translation', exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ browser: 'Firefox', extension: origin, translated, checks: ['temporary addon', 'external Microsoft translation without desktop', 'real player audio capture through native ASR fixture and external MT', 'stop realtime'], errors }))
    if (process.argv.includes('--sites')) {
      const siteResults = []
      for (const [name, url] of [['youtube', 'https://www.youtube.com/watch?v=M7lc1UVf-VE'], ['bilibili', 'https://www.bilibili.com/video/BV16vKb6YEqt/']]) {
        const site = await context.newPage()
        const detail = { site: name, url, stage: 'navigation', passed: false, errors: [] }
        site.on('pageerror', error => detail.errors.push(error.message))
        const mediaState = () => site.locator('video').first().evaluate(video => ({ currentTime: video.currentTime, paused: video.paused, muted: video.muted, volume: video.volume, readyState: video.readyState, networkState: video.networkState, hasAudio: video.mozHasAudio, source: video.currentSrc })).catch(() => null)
        try {
          const response = await site.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
          detail.documentStatus = response?.status()
          detail.stage = 'video-element'
          await site.locator('video').first().waitFor({ state: 'attached', timeout: 20000 })
          detail.beforePlay = await mediaState()
          detail.stage = 'play-media'
          // A human enabling audio clears the player's own autoplay mute as well.
          await site.locator('video').first().evaluate(video => { video.muted = false; video.volume = 0.05; return video.play() })
          detail.stage = 'open-controls'
          await site.locator('[data-nola-extension="trigger"]').getByRole('button').click()
          detail.stage = 'start-capture'
          await site.locator('[data-nola-extension="panel"]').getByRole('button', { name: 'Start live translation', exact: true }).click()
          detail.stage = 'wait-for-pcm-backed-fixture-transcript'
          await site.locator('[data-nola-extension="overlay"]').getByText('Captured actual audio.', { exact: true }).waitFor({ timeout: 30000 })
          await site.screenshot({ path: path.join(root, 'artifacts/browser-firefox/' + name + '-realtime.png') })
          detail.passed = true; detail.stage = 'passed'; detail.afterCapture = await mediaState()
          console.log(JSON.stringify(detail))
        } catch (error) {
          detail.error = error.message.split('\n')[0]
          detail.afterFailure = await mediaState()
          detail.controls = await site.locator('[data-nola-extension="panel"]').innerText().catch(() => '')
          console.log(JSON.stringify(detail))
          await site.screenshot({ path: path.join(root, 'artifacts/browser-firefox/' + name + '-unavailable.png') }).catch(() => {})
        } finally { siteResults.push(detail); await site.close() }
      }
      await fs.writeFile(path.join(root, 'artifacts/browser-firefox/site-results.json'), JSON.stringify({ recognition: 'Native ASR fixture emits only after nonzero real PCM; no model accuracy claim', translation: 'Actual external Microsoft MT', results: siteResults }, null, 2))
    }
  } catch (error) {
    const page = context.pages().at(-1)
    if (page) { console.log('Firefox page', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0, 1800)); await page.screenshot({ path: path.join(root, 'artifacts/firefox-failure.png') }).catch(() => {}) }
    throw error
  } finally { remote?.close(); await context.close() }
}
module.exports = { debuggerClient }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
