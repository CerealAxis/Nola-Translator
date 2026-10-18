/** Built-renderer tour checks with profile persistence and no audio, downloads, or network. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
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
const preloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
const listeners = new Set();
const update = async patch => { const settings = await ipcRenderer.invoke('onboarding-fixture:update', patch); listeners.forEach(fn => fn(settings)); return settings; };
const sideEffect = () => ipcRenderer.invoke('onboarding-fixture:side-effect');
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

const target = name => `[data-onboarding="${name}"]`
const walkthrough = [
  ['settings', target('nav-settings')], ['compute', target('settings-compute')],
  ['torch', target('runtime-version-engine') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['llama-tab', target('runtime-llama')], ['llama', target('runtime-version-llama') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['crisp-tab', target('runtime-crisp')], ['crisp', target('runtime-version-crisp') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['models', target('nav-models')], ['recognition-model', target('model-family-recognitionModel')],
  ['model-engine', target('model-engine') + ' button'], ['model-scale', target('model-scale') + ' button'],
  ['model-version', target('model-version') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['recognition-source', target('model-download-source')], ['translation-model', target('model-family-translationModel')],
  ['translation-version', target('model-version') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['service-settings', target('nav-settings')], ['audio-tab', target('settings-audio')],
  ['recognition-provider', target('recognition-provider') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['recognition-config', '.onboarding-tour__actions button:last-child'],
  ['audio-source', target('audio-source') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['translation-tab', target('settings-translation')],
  ['translation-provider', target('translation-provider') + ' [aria-haspopup="listbox"]', 'inspect'],
  ['translation-config', '.onboarding-tour__actions button:last-child'],
  ['quick-nav', target('nav-workspace')], ['quick', '.onboarding-tour__actions button:last-child'],
  ['overlay-nav', target('nav-overlay')], ['overlay', '.onboarding-tour__actions button:last-child'],
  ['browser-nav', target('nav-video-captions')], ['browser', '.onboarding-tour__actions button:last-child'],
]

async function run() {
  await mkdir(output, { recursive: true })
  const preload = resolve(output, 'fixture.cjs')
  await writeFile(preload, preloadSource)
  ipcMain.handle('onboarding-fixture:get', () => settings)
  ipcMain.handle('onboarding-fixture:update', (_event, patch) => {
    if (patch.onboardingSeen === true) markerWrites++
    settings = { ...settings, ...patch }
    return settings
  })
  ipcMain.handle('onboarding-fixture:side-effect', () => { sideEffects++; throw new Error('The lesson must not start installations or captures automatically') })
  const window = new BrowserWindow({ width: 1180, height: 780, show: false, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } })
  const errors = []
  window.webContents.on('console-message', details => { if (details.level === 'error' && !details.message.includes('IPC 桥接缺失')) { errors.push(details.message); console.error(details.message) } })
  const requestedWidth = process.argv.find(arg => arg.startsWith('--width='))?.split('=')[1]
  const configurations = [
    { width: 1180, height: 780, theme: 'light', language: 'zh-CN' },
    { width: 760, height: 560, theme: 'dark', language: 'zh-CN' },
    { width: 1440, height: 960, theme: 'light', language: 'en' },
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
    for (const [step, selector, action] of walkthrough) {
      await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === ${JSON.stringify(step)} && document.querySelector('.onboarding-tour__outline') && document.querySelector('.onboarding-tour__card')?.dataset.ready === 'true'`)
      await delay(160)
      const geometry = await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.onboarding-tour__card');
        const r = card.getBoundingClientRect();
        const t = document.querySelector('.onboarding-tour__outline').getBoundingClientRect();
        const overlap = Math.max(0, Math.min(r.right, t.right) - Math.max(r.left, t.left)) * Math.max(0, Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top));
        return { x: r.x, y: r.y, width: r.width, height: r.height, overlap, overflow: card.scrollWidth > card.clientWidth + 1,
          target: { x: t.x, y: t.y, width: t.width, height: t.height },
          interactive: !document.querySelector('.nola-app-shell').inert,
          accessible: !card.closest('[aria-hidden="true"], [inert]'),
          viewport: { width: innerWidth, height: innerHeight } };
      })()`)
      const info = JSON.stringify({ configuration, step, geometry })
      assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.width <= geometry.viewport.width + 1 && geometry.y + geometry.height <= geometry.viewport.height + 1, info)
      assert.equal(geometry.overflow, false, info)
      assert.equal(geometry.overlap, 0, `Teaching card covers its target: ${info}`)
      assert.equal(geometry.interactive, true, info)
      assert.equal(geometry.accessible, true, `Teaching controls must remain accessible inside model dialogs: ${info}`)
      results.push({ configuration, step, geometry })
      if (['torch', 'model-engine', 'model-version', 'recognition-source', 'audio-tab', 'browser'].includes(step)) {
        await writeFile(resolve(output, `${language}-${theme}-${width}-${step}.png`), (await window.webContents.capturePage()).toPNG())
      }
      await click(window, selector)
      if (action === 'inspect') {
        await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.inspecting === 'true'`)
        // Closing without changing a value teaches inspection while preserving the existing configuration.
        window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      }
    }
    await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === 'complete'`)
    await writeFile(resolve(output, `${language}-${theme}-${width}-complete.png`), (await window.webContents.capturePage()).toPNG())
    await click(window, '.onboarding-tour__card .card__footer button:last-child')
    await waitFor(window, `!document.querySelector('.onboarding-tour') && location.hash === '#/'`)
    await window.webContents.reload()
    await waitFor(window, `document.querySelector('.nola-home') && !document.getElementById('splash')`)
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
  window.destroy()
  app.quit()
}

void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
