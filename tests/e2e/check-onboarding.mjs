/** Built-renderer tour checks with profile persistence and no audio, downloads, or network. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { execFile } from 'node:child_process'
import { build } from 'esbuild'

app.disableHardwareAcceleration()
const output = resolve('artifacts/onboarding')
const nativeMouse = process.argv.includes('--native-mouse')
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
    revealKey: async () => 'fixture-api-key', start: sideEffect, stop: sideEffect,
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
  showWorkspace: sideEffect, showOverlay: sideEffect, prewarm: sideEffect, enableCaptionService: sideEffect,
  manageResource: sideEffect, installRuntime: sideEffect, startSession: sideEffect, testAudio: sideEffect,
});
`

async function waitFor(window, expression) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await window.webContents.executeJavaScript(expression)) return
    await delay(50)
  }
  const state = await window.webContents.executeJavaScript(`({ step: document.querySelector('.onboarding-tour')?.dataset.step, path: location.hash, body: document.body.innerText.slice(0, 300), targets: [...document.querySelectorAll('[data-onboarding=\"gateway-asr\"]')].map(el => ({rect:el.getBoundingClientRect().toJSON(), parents: [...document.querySelectorAll('.nola-main, .nola-route-view')].map(p => ({class:p.className,rect:p.getBoundingClientRect().toJSON(),scroll:p.scrollTop,height:p.scrollHeight,client:p.clientHeight}))})) })`)
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

async function waitForCardStep(step) {
  await waitForCard(`document.querySelector('.onboarding-tour__card')?.dataset.step === ${JSON.stringify(step)} && document.querySelector('.onboarding-tour__card')?.dataset.ready === 'true'`)
}

async function clickCard(selector) {
  await waitForCard(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el && !el.disabled && el.getBoundingClientRect().width > 0; })()`)
  const card = cardWindowOf()
  const point = await card.webContents.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`)
  if (nativeMouse) {
    const bounds = card.getBounds()
    const physical = screen.dipToScreenPoint({ x: bounds.x + point.x, y: bounds.y + point.y })
    const command = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public class TourMouse { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,System.UIntPtr e); }'; [TourMouse]::SetProcessDPIAware(); [TourMouse]::SetCursorPos(${physical.x},${physical.y}); Start-Sleep -Milliseconds 100; [TourMouse]::mouse_event(2,0,0,0,[System.UIntPtr]::Zero); [TourMouse]::mouse_event(4,0,0,0,[System.UIntPtr]::Zero)`
    await new Promise((done, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true }, (error, stdout) => error ? reject(error) : stdout.includes('False') ? reject(new Error('Windows input desktop rejected SetCursorPos')) : done()))
    return
  }
  card.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  card.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  card.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
}

const target = name => `[data-onboarding="${name}"]`
const next = '.onboarding-tour__footer button'
const tourBundle = await build({ entryPoints: ['src/renderer/features/onboarding/tourSteps.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { TOUR_STEPS: walkthrough } = await import('data:text/javascript;base64,' + Buffer.from(tourBundle.outputFiles[0].text).toString('base64'))

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
  const window = new BrowserWindow({ width: 1180, height: 780, show: nativeMouse, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true, backgroundThrottling: false, offscreen: !nativeMouse } })
  const stopCard = registerOnboardingCard(() => settings.theme === 'dark' ? 'dark' : 'light', resolve('out/main'), () => window, options => new BrowserWindow({ ...options, offscreen: !nativeMouse, webPreferences: { ...options.webPreferences, preload } }))
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
    settings = { ...settings, appearance: { ...settings.appearance, reduceMotion: language !== 'en' }, uiLanguage: language, theme, onboardingSeen: false, onboardingVersion: 0, onboardingStep: 'W0', onboardingCompletedVersion: 0 }
    await window.loadURL('about:blank')
    await window.loadFile(resolve('out/renderer/index.html'), { hash: '/settings/more' })
    await waitFor(window, `document.querySelector('.onboarding-welcome') && !document.getElementById('splash')`)
    const welcome = await window.webContents.executeJavaScript(`(() => { const d = document.querySelector('.onboarding-welcome').getBoundingClientRect(); const f = document.querySelector('.onboarding-welcome .nola-dialog-footer').getBoundingClientRect(); return { left: f.left - d.left, right: d.right - f.right }; })()`)
    assert.ok(Math.abs(welcome.left) <= 2 && Math.abs(welcome.right) <= 2, JSON.stringify(welcome))
    await click(window, target('onboarding-begin'))
    for (const [position, lesson] of walkthrough.entries()) {
      const step = lesson.id
      await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === ${JSON.stringify(step)} && document.querySelector('.onboarding-tour')?.dataset.busy === 'false' && document.querySelector('.onboarding-tour__outline')`)
      await waitForCardStep(step)
      await waitForCard(`!document.querySelector('${next}').disabled`)
      await delay(220)
      await waitFor(window, `(() => {
        const target = document.querySelector(${JSON.stringify(lesson.target)})?.getBoundingClientRect();
        const outline = document.querySelector('.onboarding-tour__outline')?.getBoundingClientRect();
        return !!target && !!outline && Math.min(target.right, outline.right) > Math.max(target.left, outline.left)
          && Math.min(target.bottom, outline.bottom) > Math.max(target.top, outline.top);
      })()`)
      const scene = await window.webContents.executeJavaScript(`(() => {
        const target = document.querySelector(${JSON.stringify(lesson.target)});
        const detail = document.querySelector('[data-onboarding="model-detail"]:not([data-closed])');
        const rect = target.getBoundingClientRect();
        return { path: location.hash, kind: detail?.dataset.modelFamily ?? null, rect: rect.toJSON(),
          list: !!document.querySelector('[data-onboarding="model-file-options"]:not([data-closed])'),
          outline: document.querySelector('.onboarding-tour__outline').getBoundingClientRect().toJSON() };
      })()`)
      assert.equal(scene.path, lesson.path, JSON.stringify({ configuration, step, scene }))
      assert.equal(scene.kind, lesson.scene ?? null)
      if (lesson.list) assert.equal(scene.list, true)
      assert.ok(scene.outline.width > 0 && scene.outline.height > 0)
      // Verify that each small lesson actually highlights its own control, rather than a previous scene.
      const intersection = Math.max(0, Math.min(scene.rect.right, scene.outline.right) - Math.max(scene.rect.left, scene.outline.left))
        * Math.max(0, Math.min(scene.rect.bottom, scene.outline.bottom) - Math.max(scene.rect.top, scene.outline.top))
      assert.ok(intersection > 0, JSON.stringify({ step, scene }))
      await delay(language === 'en' ? 220 : 30)
      const cardGeometry = await cardWindowOf().webContents.executeJavaScript(`(() => {
        const card = document.querySelector('.onboarding-tour__card');
        const rect = card.getBoundingClientRect();
        return { rect: rect.toJSON(), window: { width: innerWidth, height: innerHeight },
          horizontalOverflow: card.scrollWidth > card.clientWidth + 1,
          verticalOverflow: card.scrollHeight > card.clientHeight + 1,
          buttons: card.querySelectorAll('button').length,
          progress: card.querySelector('.onboarding-tour__progress').textContent,
          chapters: !!card.querySelector('.onboarding-tour__chapters, .onboarding-tour__meter') };
      })()`)
      const info = JSON.stringify({ configuration, step, cardGeometry })
      assert.equal(cardGeometry.horizontalOverflow, false, info)
      assert.equal(cardGeometry.verticalOverflow, false, info)
      assert.equal(cardGeometry.buttons, 1, info)
      assert.equal(cardGeometry.chapters, false, info)
      assert.equal(cardGeometry.progress, `${position + 1} / ${walkthrough.length}`, info)
      assert.ok(cardGeometry.rect.x >= 0 && cardGeometry.rect.y >= 0
        && cardGeometry.rect.right <= cardGeometry.window.width + 1
        && cardGeometry.rect.bottom <= cardGeometry.window.height + 1, info)
      if (['H1', 'M1', 'T1', 'T2', 'T3', 'T4', 'M2', 'R1', 'U1', 'U4'].includes(step)) {
        await writeFile(resolve(output, `${language}-${theme}-${width}-${step}.png`), (await window.webContents.capturePage()).toPNG())
        await writeFile(resolve(output, `${language}-${theme}-${width}-${step}-card.png`), (await cardWindowOf().webContents.capturePage()).toPNG())
      }
      if (step === 'T3' && language === 'zh-CN' && width === 1180) {
        assert.equal(settings.onboardingStep, 'T3')
        const reloaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve))
        window.webContents.reload()
        await reloaded
        await waitFor(window, "document.querySelector('.onboarding-tour')?.dataset.step === 'T3' && document.querySelector('.onboarding-tour')?.dataset.busy === 'false'")
        await waitForCardStep('T3')
        await waitForCard(`!document.querySelector('${next}').disabled`)
        await waitFor(window, `document.querySelector('[data-onboarding="model-file-options"]') && document.querySelector('.onboarding-tour')?.dataset.busy === 'false'`)
      }
      const started = Date.now()
      await clickCard(next)
      if (position < walkthrough.length - 1) {
        const upcoming = walkthrough[position + 1].id
        await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === ${JSON.stringify(upcoming)} && document.querySelector('.onboarding-tour')?.dataset.busy === 'false'`)
        assert.ok(Date.now() - started < 2500, `Slow transition after ${step}: ${Date.now() - started}ms`)
      }
      results.push({ configuration, step, scene, cardGeometry, transitionMs: Date.now() - started })
    }
    await waitFor(window, `!document.querySelector('.onboarding-tour') && location.hash === '#/'`)
    assert.equal(settings.onboardingCompletedVersion, 2)
    assert.equal(sideEffects, 0)
    const replaySnapshot = JSON.stringify([settings.onboardingStep, settings.onboardingCompletedVersion])
    await window.loadFile(resolve('out/renderer/index.html'), { hash: '/settings/more' })
    await waitFor(window, `document.querySelector('[data-onboarding="replay"]') && !document.getElementById('splash')`)
    await click(window, target('replay'))
    await waitFor(window, `document.querySelector('.onboarding-welcome')`)
    await click(window, target('onboarding-begin'))
    await waitFor(window, `document.querySelector('.onboarding-tour')?.dataset.step === 'H1'`)
    await waitForCardStep('H1')
    await clickCard('.onboarding-tour__close')
    await waitFor(window, `!document.querySelector('.onboarding-tour')`)
    assert.equal(JSON.stringify([settings.onboardingStep, settings.onboardingCompletedVersion]), replaySnapshot)
    console.log(`Verified ${language}, ${theme}, ${width} x ${height}`)
  }
  assert.equal(sideEffects, 0)
  assert.ok(markerWrites >= configurations.length)
  assert.equal(errors.length, 0, errors.join('\n'))
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ results, markerWrites, sideEffects }, null, 2))
  console.log(`Verified ${results.length} interactive lesson steps without downloads, recording or starting caption services.`)
  stopCard.stop()
  window.destroy()
  app.quit()
}

void app.whenReady().then(run).catch(error => { console.error(error); app.exit(1) })
