import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage } from 'electron'
import { build } from 'esbuild'

// Real Electron capture, native target tracking and overlay; deterministic test-only OCR/MT.
const output = resolve('artifacts/screen-capture')
await mkdir(output, { recursive: true })
app.setPath('userData', resolve(output, `cache-${process.pid}`))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
await build({ stdin: { contents: `export { ScreenTranslation } from './src/main/screen-translation'; export { DEFAULT_SETTINGS } from './src/shared/settings'; export { screenConfigSchema } from './src/shared/screen-translation'`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: resolve(output, 'service.cjs') })
const { ScreenTranslation, DEFAULT_SETTINGS, screenConfigSchema } = createRequire(import.meta.url)(resolve(output, 'service.cjs'))
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))
const until = async (condition, label, timeout = 15000) => {
  const started = Date.now()
  while (!await condition()) { if (Date.now() - started > timeout) throw new Error(`Timeout: ${label}`); await wait(50) }
}
let service, target, released = 0, captures = 0
const evidence = [], diagnostics = []
void app.whenReady().then(async () => {
try {
  ipcMain.handle('app:get-settings', () => DEFAULT_SETTINGS)
  app.on('web-contents-created', (_event, contents) => contents.on('console-message', details => { if (details.level >= 2) diagnostics.push(details.message) }))
  target = new BrowserWindow({ width: 600, height: 340, x: 120, y: 120, show: true, frame: false, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  await target.loadURL('data:text/html,<title>Nola Capture Fixture</title><body style="margin:0;background:rgb(180,20,20);color:white;font:28px sans-serif">Owned capture fixture</body>')
  await target.webContents.executeJavaScript('window.animation=setInterval(()=>document.body.style.background=`rgb(${80+Math.floor(performance.now()/60)%100},20,20)`,60)')
  target.focus()
  const source = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })).find(item => item.name === 'Nola Capture Fixture')
  assert(source)
  service = new ScreenTranslation({ mainDir: resolve('out/main'), configPath: resolve(output, `config-${process.pid}.json`), settings: () => DEFAULT_SETTINGS,
    gatewaySnapshot: () => ({ state: 'running', availableModels: { mt: [{ binding: 'cloud:google', kind: 'mt', name: 'Test MT', origin: 'cloud', free: true }] } }),
    prepareOcr: async () => () => { released++ },
    inferOcr: async request => {
      const image = nativeImage.createFromDataURL(request.image), { width, height } = image.getSize(), pixels = image.toBitmap()
      assert(width > 100 && height > 100)
      const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
      const text = pixels[offset + 2] > pixels[offset] ? 'red' : 'blue'
      captures++
      await wait(500)
      return { width, height, blocks: [{ id: 'fixture', text, confidence: .99, quad: [[10, 10], [280, 10], [280, 50], [10, 50]] }] }
    },
    inferModel: async request => ({ text: `translated-${request.text}` }), publish: () => {} })
  assert(!(await service.sources()).some(item => item.id === source.id), 'Nola-owned windows are excluded from the user picker')
  await service.configure(screenConfigSchema.parse({ captureMode: 'window', sourceId: source.id, processingMode: 'cascade', model: 'cloud:google', sourceLanguage: 'en', targetLanguage: 'zh', intervalMs: 250 }))
  await service.start(); target.focus()
  await until(() => service.snapshot().blocks.some(block => block.translation === 'translated-red' && !block.hidden), 'real capture and overlay')
  assert(service.snapshot().visualProbes.length > 0, 'actual rendered glyphs produce visual evidence')
  for (let sample = 0; sample < 20; sample++) {
    await wait(100)
    assert(service.snapshot().blocks.some(block => block.translation === 'translated-red' && !block.hidden), 'animated background does not withdraw verified text')
  }
  evidence.push({ check: 'continuous 60ms background animation publishes slow 500ms OCR and retains verified glyphs', passed: true })
  assert(captures > 0)
  assert(service.overlay.isContentProtected())
  assert(!service.overlay.isFocusable())
  assert(service.toolbar.isContentProtected())
  evidence.push({ check: 'window video capture, owned source exclusion, overlay protection and nonfocus', passed: true, captures })
  await until(async () => (await service.overlay.webContents.executeJavaScript('document.body.textContent')).includes('translated-red'), 'overlay DOM')
  const changedAt = Date.now()
  await target.webContents.executeJavaScript('clearInterval(window.animation); document.body.style.background="rgb(20,20,180)"; document.body.textContent="Changed text 101"')
  await until(() => !service.snapshot().blocks.some(block => block.translation === 'translated-red' && !block.hidden), 'stale text withdraws while OCR is pending')
  const withdrawnMs = Date.now() - changedAt
  await until(async () => !(await service.overlay.webContents.executeJavaScript('document.body.textContent')).includes('translated-red'), 'old text removed from final DOM')
  await until(() => service.snapshot().blocks.some(block => block.translation === 'translated-blue' && !block.hidden), 'new actual captured frame translated')
  evidence.push({ check: 'new frame invalidates old final DOM before replacement', passed: true, withdrawnMs })
  const before = target.getBounds()
  target.setPosition(before.x + 60, before.y + 40)
  await until(() => Math.abs(service.overlay.getBounds().x - target.getBounds().x) <= 2 && Math.abs(service.overlay.getBounds().y - target.getBounds().y) <= 2, 'overlay follows native target')
  await target.webContents.executeJavaScript('document.title="Changed fixture title"')
  await wait(350)
  assert.equal(service.snapshot().status, 'running')
  target.minimize()
  await until(() => service.snapshot().status === 'waiting' && !service.overlay.isVisible(), 'minimize clears overlay')
  target.restore()
  await until(() => !target.isMinimized(), 'native window restored')
  target.show(); target.focus()
  await until(() => target.isFocused(), 'restored target focus')
  await until(() => service.sourceAvailable, 'restored native source is available')
  await wait(300)
  assert.equal(service.snapshot().status, service.targetForeground ? 'running' : 'waiting')
  evidence.push({ check: 'native move, stable identity across title changes, minimize and restore foreground gating', passed: true, restoredNativeForeground: service.targetForeground })
  target.destroy(); target = undefined
  await until(() => service.snapshot().status === 'error' && !service.capture, 'target exit stops capture')
  await service.stop()
  assert.equal(released, 1)
  assert.equal(service.capture, undefined)
  assert.equal(service.overlay, undefined)
  evidence.push({ check: 'target exit and stop release capture and OCR reservation', passed: true })
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, evidence, diagnostics, modelInference: 'deterministic test fixture' }, null, 2))
  console.log(JSON.stringify({ passed: true, evidence }))
} catch (error) {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: false, error: String(error), snapshot: service?.snapshot(), overlayBounds: service?.overlay?.getBounds(), targetBounds: target?.getBounds(), sourceAvailable: service?.sourceAvailable, targetForeground: service?.targetForeground, targetFocused: target?.isFocused(), diagnostics, evidence }, null, 2))
  console.error(error); process.exitCode = 1
} finally {
  await service?.dispose()
  if (target && !target.isDestroyed()) target.destroy()
  app.exit(process.exitCode ?? 0)
}
})
