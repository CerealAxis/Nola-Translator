/** Built-renderer tour checks with profile persistence and no audio, downloads, or network. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { build } from 'esbuild'

app.disableHardwareAcceleration()
const output = resolve('artifacts/onboarding')
const delay = ms => new Promise(done => setTimeout(done, ms))
let sideEffects = 0
let markerWrites = 0
// Use the real defaults so unrelated settings additions do not break the fixture.
const defaultsBundle = await build({ entryPoints: ['src/shared/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { DEFAULT_SETTINGS } = await import('data:text/javascript;base64,' + Buffer.from(defaultsBundle.outputFiles[0].text).toString('base64'))
let settings = {
  ...structuredClone(DEFAULT_SETTINGS), theme: 'light', uiLanguage: 'zh-CN',
  recognition: { ...DEFAULT_SETTINGS.recognition, modelId: 'sensevoice-small' },
  translation: { ...DEFAULT_SETTINGS.translation, localModelId: 'hy-mt2-1.8b-q4-k-m' },
  appearance: { reduceMotion: true },
}
const resources = [
  { resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice', name: 'SenseVoiceSmall', languages: ['zh', 'en', 'ja', 'ko'], downloadBytes: 1_000_000_000 },
  { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2 1.8B Q4_K_M', languages: ['zh', 'en', 'ja', 'ko'], downloadBytes: 1_130_000_000 },
].map(record => ({ ...record, installed: false, installedBytes: 0, description: '', state: 'idle', cancellable: false }))
const runtime = { packages: [], recipes: [], hardware: { adapters: [], nvidiaDriver: null, notes: [] }, recommendation: { engineId: null, llamaId: null, reasons: [] },
  python: { status: 'ready', reason: '' }, local: { engine: { path: 'fixture', status: 'ready', backend: 'cpu', version: 'fixture' }, llama: { path: 'fixture', status: 'ready', backend: 'cpu', version: 'fixture' }, crisp: { path: 'fixture', status: 'ready', backend: 'vulkan', version: 'fixture' } }, operation: null, directory: '', lastError: null }
// The gateway lesson only reads the snapshot; starting or rotating must never happen from the tour.
const gatewaySnapshot = { state: 'stopped', address: 'http://127.0.0.1:8717/v1', connections: 0, activeRequests: 0, requests: [],
  services: { asr: { state: 'stopped', name: '', model: '' }, mt: { state: 'stopped', name: '', model: '' }, tts: { state: 'stopped', name: '', model: '' } } }
const preloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
const listeners = new Set();
const update = async patch => { const settings = await ipcRenderer.invoke('onboarding-fixture:update', patch); listeners.forEach(fn => fn(settings)); return settings; };
const sideEffect = () => ipcRenderer.invoke('onboarding-fixture:side-effect');
const cardListener = (channel, fn) => { const wrapped = (_e, value) => fn(value); ipcRenderer.on(channel, wrapped); return () => ipcRenderer.off(channel, wrapped); };
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings: () => ipcRenderer.invoke('onboarding-fixture:get'), updateSettings: update,
  onSettingsChanged: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  onOverlayMenuChanged: () => () => {}, onOverlayLockChanged: () => () => {}, onEngineEvent: () => () => {}, onOpenAppearance: () => () => {}, getEngineState: async () => 'ready',
  listMeetings: async () => [], listDevices: async () => [],
  listResources: async () => ({ storagePath: '', resources: ${JSON.stringify(resources)} }),
  getRuntimes: async () => (${JSON.stringify(runtime)}),
  listComputeDevices: async () => ({ devices: [], notes: [], torchVersion: '', activePlan: null }),
  getModelStorage: async () => ({ activePath: '', configuredPath: '', restartRequired: false }),
  hasTranslationCredential: async () => false,
  gateway: {
    snapshot: async () => (${JSON.stringify(gatewaySnapshot)}),
    onChanged: () => () => {},
    revealKey: async () => 'fixture-api-key',
  },
  onboardingCard: {
    available: () => true,
    show: () => ipcRenderer.send('onboarding-card:show'),
    hide: () => ipcRenderer.send('onboarding-card:hide'),
    sendState: state => ipcRenderer.send('onboarding-card:state', state),
    onState: fn => cardListener('onboarding-card:state', fn),
    onPlacement: fn => cardListener('onboarding-card:placement', fn),
    sendAction: action => ipcRenderer.send('onboarding-card:action', action),
    onAction: fn => cardListener('onboarding-tour:action', fn),
    sendRect: rect => ipcRenderer.send('onboarding-card:rect', rect),
    onRect: fn => cardListener('onboarding-card:rect-forward', fn),
    sendHit: interactive => ipcRenderer.send('onboarding-card:hit', interactive),
  },
  browserConnection: async () => ({ enabled: false, registered: false, connections: 0, sessionActive: false, captionServiceActive: false, browsers: [] }),
  checkLatestRelease: async () => ({ currentVersion: 'fixture', latestVersion: null, updateAvailable: false, releaseName: null, releaseNotes: '', releaseUrl: null }),
  manageResource: sideEffect, installRuntime: sideEffect, startSession: sideEffect, testAudio: sideEffect,
});
`

async function waitFor(window, expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await window.webContents.executeJavaScript(expression)) return
    await delay(50)
  }
  const state = await window.webContents.executeJavaScript(`({ step: document.querySelector('.onboarding-tour')?.dataset.step, path: location.hash, body: document.body.innerText.slice(0, 1600) })`)
  throw new Error(`Timed out: ${expression}\n${JSON.stringify(state)}`)
}

async function click(window, selector) {
  await waitFor(window, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el && !el.disabled && el.getBoundingClientRect().width > 0; })()`)
  await window.webContents.executeJavaScript(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (!hit || !el.contains(hit)) throw new Error('Control is covered: ' + ${JSON.stringify(selector)} + ' ' + JSON.stringify({rect: r.toJSON(), hit: hit?.outerHTML.slice(0, 500)}));
    el.click();
  })()`)

}

// The teaching card renders in its own transparent window; assert inside it with these helpers.
const cardWindowOf = () => BrowserWindow.getAllWindows().find(candidate => !candidate.isDestroyed() && candidate.webContents.getURL().includes('onboarding-card'))

async function waitForCard(expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const card = cardWindowOf()
    if (card && await card.webContents.executeJavaScript(expression).catch(() => false)) return
    await delay(50)
  }
  const card = cardWindowOf()
  const state = card ? await card.webContents.executeJavaScript(`({ step: document.querySelector('.onboarding-tour__card')?.dataset.ready, text: document.body.innerText.slice(0, 400) })`).catch(() => null) : null
  throw new Error(`Timed out in card window: ${expression}\n${JSON.stringify(state)}`)
}

async function clickCard(selector) {
  await waitForCard(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el && !el.disabled && el.getBoundingClientRect().width > 0; })()`)
  const card = cardWindowOf()
  await card.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`)
}

const target = name => `[data-onboarding="${name}"]`
const next = '.onboarding-tour__actions button:last-child'
const walkthrough = [
  ['models', target('nav-models')], ['runtime-setup', target('models-runtime-setup')],
  ['runtime-engines', next], ['runtime-return', target('nav-models')],
  ['models-active', next], ['models-tabs', next],
  ['recognition-model', target('model-family-recognitionModel')], ['models-detail', next],
  ['quick-nav', target('nav-workspace')], ['quick', next], ['overlay', next],
  ['browser-nav', target('nav-video-captions')], ['browser', next], ['workbench', next],
  ['gateway-nav', target('nav-model-gateway')], ['gateway-service', next], ['gateway-capabilities', next],
]

async function run() {
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)
  ipcMain.handle('onboarding-fixture:get', () => settings)
  ipcMain.handle('onboarding-fixture:update', (_event, patch) => {
    if (patch.onboardingSeen === true) markerWrites++
    // Match production's nested settings patches when automatic model selection writes defaults.
    settings = { ...settings, ...patch,
      recognition: { ...settings.recognition, ...patch.recognition },
      translation: { ...settings.translation, ...patch.translation },
      modelGateway: { ...settings.modelGateway, ...patch.modelGateway },
    }
    return settings
  })
  ipcMain.handle('onboarding-fixture:side-effect', () => { sideEffects++; throw new Error('The lesson must not start installations or captures automatically') })
  // The real card-window module from src/main, wired to the fixture preload and this window.
  const cardBundle = await build({ entryPoints: ['src/main/onboardingCard.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false })
  const cardModulePath = resolve(output, 'onboarding-card-fixture.cjs')
  await writeFile(cardModulePath, cardBundle.outputFiles[0].text)
  const { registerOnboardingCard } = createRequire(import.meta.url)(cardModulePath)
  const window = new BrowserWindow({ width: 1180, height: 780, show: false, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } })
  const stopCard = registerOnboardingCard(() => settings.theme === 'dark' ? 'dark' : 'light', resolve('out/main'), () => window, options => new BrowserWindow({ ...options, offscreen: true, webPreferences: { ...options.webPreferences, preload } }))
  const errors = []
  window.webContents.on('console-message', details => { if (details.level === 'error' && !details.message.includes('IPC 桥接缺失')) { errors.push(details.message); console.error(details.message) } })
  const requestedWidth = process.argv.find(arg => arg.startsWith('--width='))?.split('=')[1]
  const configurations = [
    { width: 1180, height: 780, theme: 'light', language: 'zh-CN' },
    { width: 760, height: 560, theme: 'dark', language: 'zh-CN' },
    { width: 1440, height: 960, theme: 'light', language: 'en' },
    { width: 760, height: 560, theme: 'light', language: 'zh-TW' },
    { width: 1180, height: 780, theme: 'dark', language: 'zh-HK' },
    { width: 760, height: 560, theme: 'dark', language: 'ja' },
    { width: 1440, height: 960, theme: 'light', language: 'ko' },
  ].filter(configuration => !requestedWidth || configuration.width === Number(requestedWidth))
  const results = []
  for (const configuration of configurations) {
    const { width, height, language, theme } = configuration
    window.setSize(width, height)
    settings = { ...settings, uiLanguage: language, theme, onboardingSeen: false }
    await window.loadURL('about:blank')
    await window.loadFile(resolve('out/renderer/index.html'), { hash: '/settings/more' })
    await waitFor(window, `document.querySelector('.onboarding-welcome') && !document.getElementById('splash')`)
    assert.equal(await window.webContents.executeJavaScript('location.hash'), '#/', 'First-run and replay start at home')
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-welcome a[href="https://github.com/CerealAxis/Nola-Translator"]') !== null`), true)
    await click(window, '.onboarding-welcome button')
    for (const [step, selector] of walkthrough) {
      await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === ${JSON.stringify(step)} && document.querySelector('.onboarding-tour__outline')`)
      await waitForCard(`document.querySelector('.onboarding-tour__card')?.dataset.ready === 'true'`)
      await delay(160)
      const geometry = await window.webContents.executeJavaScript(`(() => {
        const outline = document.querySelector('.onboarding-tour__outline');
        const r = outline.getBoundingClientRect();
        return { outline: { x: r.x, y: r.y, width: r.width, height: r.height },
          interactive: !document.querySelector('.nola-app-shell').inert,
          viewport: { width: innerWidth, height: innerHeight } };
      })()`)
      // Card geometry is read in its own window and mapped back into main-window coordinates.
      const cardGeometry = await cardWindowOf().webContents.executeJavaScript(`(() => {
        const root = document.querySelector('.onboarding-card-window');
        const card = document.querySelector('.onboarding-tour__card');
        const [ox, oy] = (root?.dataset.mainOffset ?? '0,0').split(',').map(Number);
        const r = card.getBoundingClientRect();
        return { x: r.x - ox, y: r.y - oy, width: r.width, height: r.height,
          windowX: r.x, windowY: r.y, windowWidth: innerWidth, windowHeight: innerHeight,
          overflow: card.scrollWidth > card.clientWidth + 1,
          accessible: !card.closest('[aria-hidden="true"], [inert]') };
      })()`)
      const info = JSON.stringify({ configuration, step, geometry, cardGeometry })
      // The card may extend outside the main window by design, but never outside its own.
      assert.ok(cardGeometry.windowX >= 0 && cardGeometry.windowY >= 0
        && cardGeometry.windowX + cardGeometry.width <= cardGeometry.windowWidth + 1
        && cardGeometry.windowY + cardGeometry.height <= cardGeometry.windowHeight + 1, info)
      assert.equal(cardGeometry.accessible, true, info)
      assert.equal(cardGeometry.overflow, false, info)
      const overlap = Math.max(0, Math.min(cardGeometry.x + cardGeometry.width, geometry.outline.x + geometry.outline.width) - Math.max(cardGeometry.x, geometry.outline.x))
        * Math.max(0, Math.min(cardGeometry.y + cardGeometry.height, geometry.outline.y + geometry.outline.height) - Math.max(cardGeometry.y, geometry.outline.y))
      // Near-full-page spotlights leave no clean side; the placer then picks the smallest
      // overlap. Allow a sliver, but never a card parked on top of its own target.
      assert.ok(overlap <= cardGeometry.width * cardGeometry.height * 0.04, `Teaching card covers its target: ${info}`)
      assert.equal(geometry.interactive, true, info)
      results.push({ configuration, step, geometry, cardGeometry })
      if (['runtime-engines', 'models-active', 'recognition-model', 'models-detail', 'quick', 'overlay', 'browser', 'gateway-service'].includes(step)) {
        await writeFile(resolve(output, `${language}-${theme}-${width}-${step}.png`), (await window.webContents.capturePage()).toPNG())
      }
      if (selector.startsWith('.onboarding-tour')) await clickCard(selector)
      else await click(window, selector)
    }
    await waitFor(window, `document.querySelector('[data-onboarding="complete"]')`)
    // Dialog autofocus lands asynchronously; poll briefly instead of asserting on one frame.
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="complete"]').contains(document.activeElement)`)) break
      await delay(50)
    }
    const completion = await window.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('[data-onboarding="complete"]');
      const backdrop = dialog.parentElement?.querySelector('[data-slot="dialog-backdrop"]');
      const rect = dialog.getBoundingClientRect();
      return { modal: dialog.getAttribute('aria-modal'), background: backdrop && getComputedStyle(backdrop).backgroundColor,
        blocked: backdrop?.contains(document.elementFromPoint(8, innerHeight - 8)),
        focused: dialog.contains(document.activeElement),
        visible: rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        overflow: dialog.scrollWidth > dialog.clientWidth + 1 };
    })()`)
    assert.equal(completion.modal, 'true')
    assert.ok(completion.background && completion.background !== 'rgba(0, 0, 0, 0)' && completion.background !== 'transparent', JSON.stringify(completion))
    assert.equal(completion.blocked, true, 'Completion backdrop blocks the underlying page')
    assert.equal(completion.focused, true, 'Completion keeps keyboard focus inside the modal')
    assert.equal(completion.visible, true)
    assert.equal(completion.overflow, false)
    await writeFile(resolve(output, `${language}-${theme}-${width}-complete.png`), (await window.webContents.capturePage()).toPNG())
    await click(window, '[data-onboarding="complete"] [data-slot="dialog-footer"] button:last-child')
    // Completion exits to the settings page that owns the replay entry, not to home.
    await waitFor(window, `!document.querySelector('.onboarding-tour') && location.hash === '#/settings/more'`)
    await window.webContents.reload()
    await waitFor(window, `document.querySelector('[data-page="settings"]') && !document.getElementById('splash')`)
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-tour, .onboarding-welcome') === null`), true)
    // A replay presents the unchanged welcome and returns to home before teaching starts.
    await window.webContents.executeJavaScript(`location.hash = '#/settings/more'`)
    await click(window, target('replay'))
    await waitFor(window, `document.querySelector('.onboarding-welcome') && location.hash === '#/'`)
    await click(window, '.onboarding-welcome button:nth-child(2)')
    console.log(`Verified ${language}, ${theme}, ${width} x ${height}`)
  }
  assert.equal(sideEffects, 0)
  assert.equal(markerWrites, configurations.length)
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ results, markerWrites, sideEffects }, null, 2))
  console.log(`Verified ${results.length} interactive lesson steps without downloads, recording or starting caption services.`)
  stopCard.stop()
  window.destroy()
  app.quit()
}

void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
