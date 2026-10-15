/** Built-renderer tour checks with profile persistence and no audio, downloads, or network. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'

app.disableHardwareAcceleration()
const output = resolve('artifacts/onboarding')
const delay = ms => new Promise(done => setTimeout(done, ms))
let sideEffects = 0
let markerWrites = 0
let settings = {
  version: 1, theme: 'light', uiLanguage: 'zh-CN', modelStoragePath: '',
  recognition: { provider: 'local', modelId: 'sensevoice-small', sourceLanguage: 'auto', audioSource: 'defaultOutput' },
  recording: { keepAudio: true }, appearance: { reduceMotion: true }, browserConnection: { enabled: false },
  network: { useHuggingFaceMirror: true, usePypiMirror: true, pypiMirrorUrl: 'https://mirrors.aliyun.com/pypi/simple/', useGithubAccelerate: false, githubAccelerateUrl: '', proxyUrl: '', proxyForPip: false, proxyForModelDownload: false, proxyForRuntimeDownload: false },
  compute: { recognitionEngine: 'pytorch', translationEngine: 'auto', recognitionDevice: 'auto', translationDevice: 'auto', allowCpuFallback: true, precision: 'auto', quantization: 'auto', reservedVramMb: 1024, cpuThreads: 0, gpuLayers: -1, contextSize: 4096, flashAttention: 'auto' },
  overlay: { mode: 'bottom', colorScheme: 'dark', alwaysOnTop: true, fontFamily: 'system-ui', fontSize: 26, fontWeight: 500, translationFontSize: 22, translationFontWeight: 500, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, lineHeight: 1.3, translationLineHeight: 1.35, showSource: true, showTranslation: true, layout: 'rolling' },
  videoCaptions: { showSource: true, showTranslation: true, layout: 'sentence', fontSize: 26, position: 5, audioSource: 'tab' },
  browserCaptions: { showSource: true, showTranslation: true, colorScheme: 'dark', fontFamily: 'system-ui', sourceFontSize: 20, translationFontSize: 24, lineHeight: 1.35, sourceColor: '#FFFFFF', translationColor: '#FFFFFF', backgroundColor: '#111111', backgroundOpacity: 0.84, bottomOffset: 5 },
  translation: { provider: 'local', localModelId: 'hy-mt2-1.8b-q4-k-m', targetLanguage: 'zh', translateIntermediate: false, cloudEndpoint: '', cloudModel: '', cloudApiFormat: 'chat-completions', microsoftEndpoint: '', microsoftRegion: '', fallback: { provider: 'disabled' } },
}
const resources = [
  { resourceId: 'sensevoice-small', kind: 'recognitionModel', provider: 'sensevoice', name: 'SenseVoiceSmall', languages: ['zh', 'en', 'ja', 'ko'], downloadBytes: 1_000_000_000 },
  { resourceId: 'hy-mt2-1.8b-q4-k-m', kind: 'translationModel', provider: 'hymt2', name: 'Hy-MT2 1.8B Q4_K_M', languages: ['zh', 'en', 'ja', 'ko'], downloadBytes: 1_130_000_000 },
].map(record => ({ ...record, installed: false, installedBytes: 0, description: '', state: 'idle', cancellable: false }))
const runtime = { packages: [], recipes: [], hardware: { adapters: [], nvidiaDriver: null, notes: [] }, recommendation: { engineId: null, llamaId: null, reasons: [] },
  python: { status: 'ready', reason: '' }, local: { engine: { path: 'fixture', status: 'ready', backend: 'cpu', version: 'fixture' }, llama: { path: 'fixture', status: 'ready', backend: 'cpu', version: 'fixture' } }, operation: null, directory: '', lastError: null }
const preloadSource = `
const { contextBridge, ipcRenderer } = require('electron');
const listeners = new Set();
const update = async patch => { const settings = await ipcRenderer.invoke('onboarding-fixture:update', patch); listeners.forEach(fn => fn(settings)); return settings; };
const sideEffect = () => ipcRenderer.invoke('onboarding-fixture:side-effect');
contextBridge.exposeInMainWorld('nolaTranslator', {
  getSettings: () => ipcRenderer.invoke('onboarding-fixture:get'), updateSettings: update,
  onSettingsChanged: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  onEngineEvent: () => () => {}, onOpenAppearance: () => () => {}, getEngineState: async () => 'ready',
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
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await window.webContents.executeJavaScript(expression)) return
    await delay(50)
  }
  throw new Error(`Timed out: ${expression}`)
}

async function press(window, index = -1) {
  await window.webContents.executeJavaScript(`(() => {
    const buttons = [...document.querySelectorAll('.onboarding-tour__card button')];
    const button = buttons.at(${index});
    if (!button || button.disabled) throw new Error('Tour button unavailable');
    button.click();
  })()`)
}

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
  ipcMain.handle('onboarding-fixture:side-effect', () => { sideEffects++; throw new Error('The tour must not run an installation or capture') })
  const window = new BrowserWindow({ width: 1180, height: 780, show: false, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: true } })
  const errors = []
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 3 && !message.includes('IPC 桥接缺失')) errors.push(message) })
  await window.loadFile(resolve('out/renderer/index.html'))
  await waitFor(window, `document.querySelector('.onboarding-welcome') !== null && !document.getElementById('splash')`)
  assert.equal(settings.onboardingSeen, true, 'Legacy profiles must acquire a saved marker')
  assert.equal(markerWrites, 1, 'StrictMode must not write the marker twice')
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-tour') === null`), true, 'The tour needs an explicit Start action')
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-welcome a')?.href`), 'https://github.com/CerealAxis/Nola-Translator')
  await window.webContents.executeJavaScript(`document.querySelector('.onboarding-welcome button').click()`)
  await waitFor(window, `document.querySelector('.onboarding-welcome') === null`)
  await window.webContents.reload()
  await waitFor(window, `document.querySelector('.nola-home') !== null && !document.getElementById('splash')`)
  assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-tour, .onboarding-welcome') === null`), true, 'Reload must not repeat onboarding')

  const scenarios = []
  const configurations = [
    ...[1440, 1180, 760].flatMap(width => ['light', 'dark'].map(theme => ({ width, height: width === 760 ? 560 : width === 1440 ? 960 : 780, theme, language: 'zh-CN' }))),
    ...['en', 'zh-TW', 'zh-HK', 'ja', 'ko'].flatMap(language => ['light', 'dark'].map(theme => ({ width: 1180, height: 780, theme, language }))),
  ]
  const welcomeScenarios = []
  for (const configuration of configurations) {
    const { width, height, language, theme } = configuration
    console.log(`Checking ${language}, ${theme}, ${width} x ${height}`)
    window.setSize(width, height)
    settings = { ...settings, uiLanguage: language, theme, onboardingSeen: false }
    await window.webContents.reload()
    await waitFor(window, `document.querySelector('.onboarding-welcome') !== null && !document.getElementById('splash')`)
    await delay(200)
    const welcome = await window.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('.onboarding-welcome'), bounds = dialog.getBoundingClientRect();
      const controls = [...dialog.querySelectorAll('[data-slot="modal-footer"] button, [data-slot="modal-footer"] a')].map(element => { const r = element.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, viewport: { width: innerWidth, height: innerHeight }, controls, overflow: dialog.scrollWidth > dialog.clientWidth + 1 };
    })()`)
    assert.ok(welcome.x >= 0 && welcome.y >= 0 && welcome.x + welcome.width <= welcome.viewport.width + 1 && welcome.y + welcome.height <= welcome.viewport.height + 1, 'Welcome must fit the window')
    assert.equal(welcome.overflow, false)
    assert.equal(welcome.controls.length, 3)
    assert.ok(Math.max(...welcome.controls.map(item => item.top)) < Math.min(...welcome.controls.map(item => item.bottom)), 'All three welcome actions must share one row')
    welcomeScenarios.push({ configuration, geometry: welcome })
    await writeFile(resolve(output, `${language}-${theme}-${width}-welcome.png`), (await window.webContents.capturePage()).toPNG())
    await window.webContents.executeJavaScript(`document.querySelectorAll('.onboarding-welcome button')[1].click()`)
    await waitFor(window, `document.querySelector('[data-onboarding="replay"]') !== null`)
    await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="replay"]').click()`)
    for (let step = 0; step < 9; step++) {
      await waitFor(window, `document.querySelector('.onboarding-tour__progress')?.textContent.trim() === '${step + 1} / 9' && document.querySelector('.onboarding-tour__outline') !== null && !document.querySelector('.onboarding-tour__actions button:last-child')?.disabled`)
      await delay(80)
      const geometry = await window.webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.onboarding-tour__card');
        const rect = card.getBoundingClientRect();
        const outline = document.querySelector('.onboarding-tour__outline').getBoundingClientRect();
        const footerItems = [...card.querySelectorAll('.onboarding-tour__progress, button')].map(element => {
          const bounds = element.getBoundingClientRect(); return { top: bounds.top, bottom: bounds.bottom };
        });
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, overflow: card.scrollWidth > card.clientWidth + 1,
          viewport: { width: innerWidth, height: innerHeight }, focusInside: card.contains(document.activeElement),
          footerItems, buttonCount: card.querySelectorAll('button').length,
          target: { x: outline.x, y: outline.y, width: outline.width, height: outline.height }, title: document.querySelector('#onboarding-heading').textContent };
      })()`)
      assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.width <= geometry.viewport.width + 1 && geometry.y + geometry.height <= geometry.viewport.height + 1, `Tip outside viewport: ${JSON.stringify({ configuration, step, geometry })}`)
      assert.equal(geometry.overflow, false, 'Tip must not overflow horizontally')
      assert.equal(geometry.focusInside, true, 'Focus must stay inside the tour')
      assert.equal(geometry.buttonCount, 2, 'Only Skip and Next/Done belong in the footer')
      assert.ok(Math.max(...geometry.footerItems.map(item => item.top)) < Math.min(...geometry.footerItems.map(item => item.bottom)), 'Progress and both buttons must share one row')
      assert.ok(geometry.target.width > 0 && geometry.target.height > 0, 'Every step must have a visible real target')
      const target = geometry.target
      const overlap = Math.max(0, Math.min(geometry.x + geometry.width, target.x + target.width) - Math.max(geometry.x, target.x))
        * Math.max(0, Math.min(geometry.y + geometry.height, target.y + target.height) - Math.max(geometry.y, target.y))
      assert.equal(overlap, 0, `Tip covers the highlighted control: ${JSON.stringify({ configuration, step, geometry })}`)
      scenarios.push({ configuration, step: step + 1, geometry })
      if (step === 0 || language === 'zh-CN' && [3, 7, 8].includes(step)) {
        await writeFile(resolve(output, `${language}-${theme}-${width}-step-${step + 1}.png`), (await window.webContents.capturePage()).toPNG())
      }
      await press(window)
    }
    await waitFor(window, `document.querySelector('.onboarding-tour') === null`)
    await window.webContents.executeJavaScript(`document.querySelector('[data-onboarding="replay"]').click()`)
    await waitFor(window, `document.querySelector('.onboarding-tour__outline') !== null`)
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.onboarding-welcome') === null`), true, 'Manual replay skips the welcome')
    await press(window, 0)
    await waitFor(window, `document.querySelector('.onboarding-tour') === null`)
  }
  assert.equal(sideEffects, 0)
  assert.equal(markerWrites, configurations.length + 1, 'Each first-run invitation writes once; replay never rewrites it')
  assert.equal(errors.length, 0, `Renderer errors: ${errors.join('\n')}`)
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ scenarios, welcomeScenarios, markerWrites, sideEffects }, null, 2))
  console.log(`Verified ${scenarios.length} tour steps across ${configurations.length} viewport/theme/language combinations; profile persisted with no installation or capture.`)
  window.destroy()
  app.quit()
}

void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
