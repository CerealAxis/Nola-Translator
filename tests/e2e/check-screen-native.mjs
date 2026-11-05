import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, screen } from 'electron'
import { build } from 'esbuild'

// Native capture/input acceptance uses a controlled visible target, with stubbed OCR/translation only.
// The solid source box lets the test locate its physical bounds independently of overlay geometry.
const output = resolve('artifacts/screen-native')
app.setPath('userData', resolve(output, `electron-cache-${process.pid}`))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
await mkdir(output, { recursive: true })
await build({ stdin: { contents: `export { ScreenTranslation } from './src/main/screen-translation'; export { ModelGateway } from './src/main/model-gateway'; export { BackendScreenOcr } from './src/main/backend-direct-model';`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: resolve(output, 'screen-service.cjs') })
const defaults = await build({ entryPoints: ['src/shared/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(defaults.outputFiles[0].text).toString('base64')}`)
const { ScreenTranslation, ModelGateway, BackendScreenOcr } = createRequire(import.meta.url)(resolve(output, 'screen-service.cjs'))
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (condition, label, timeout = 15000) => {
  const started = Date.now()
  while (!await condition()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out: ${label}`)
    await wait(150)
  }
}
const evidence = [], diagnostics = []
let actualFrames = 0, target, service, server, gateway, ocrClient
void app.whenReady().then(async () => {
try {
  ipcMain.handle('app:get-settings', () => DEFAULT_SETTINGS)
  app.on('web-contents-created', (_event, contents) => contents.on('console-message', details => diagnostics.push({ message: details.message, level: details.level })))
  server = createServer(async (request, response) => {
    let body = ''
    for await (const chunk of request) body += chunk
    response.setHeader('Content-Type', 'application/json')
    if (request.method === 'POST' && request.url === '/api/v2/screen/ocr') {
      const frame = JSON.parse(body), image = nativeImage.createFromDataURL(frame.image), size = image.getSize()
      assert(size.width > 100 && size.height > 100)
      const pixels = image.toBitmap()
      let left = size.width, top = size.height, right = -1, bottom = -1
      for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
        const offset = (y * size.width + x) * 4
        if (Math.abs(pixels[offset] - 58) <= 2 && Math.abs(pixels[offset + 1] - 34) <= 2 && Math.abs(pixels[offset + 2] - 23) <= 2) {
          left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y)
        }
      }
      const nonBlack = right > left && bottom > top
      if (nonBlack) {
        actualFrames++
        if (actualFrames === 1) await writeFile(resolve(output, 'captured-target.png'), image.toPNG())
      }
      response.end(JSON.stringify({ ...size, blocks: nonBlack ? [{ id: 'dialogue', text: 'Screen capture 123', confidence: 0.99, quad: [[left, top], [right + 1, top], [right + 1, bottom + 1], [left, bottom + 1]] }] : [] }))
    } else response.end(JSON.stringify({ installed: true, state: 'idle', languages: ['auto', 'zh', 'en', 'ja', 'ko'] }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const baseUrl = `http://127.0.0.1:${server.address().port}`
  target = new BrowserWindow({ width: 800, height: 500, x: 220, y: 150, frame: false, show: true, alwaysOnTop: true, webPreferences: { contextIsolation: true, nodeIntegration: false } })
  await target.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><title>Nola Native Capture Fixture</title><body style="margin:0;background:#eef4ff;color:#17223a;font:32px sans-serif"><div style="position:absolute;left:30px;top:60px;width:420px;height:40px;font:32px sans-serif;background:#17223a;color:#eef4ff">Screen capture 123</div><script>window.inputCounts={};for(const name of ["mousedown","mouseup","dblclick","contextmenu","wheel","keydown"])document.addEventListener(name,e=>{inputCounts[name]=(inputCounts[name]||0)+1;if(name==="contextmenu")e.preventDefault()});</script></body>')}`)
  const selected = (await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } })).find(source => source.name === 'Nola Native Capture Fixture')
  assert(selected, 'Controlled target must be discoverable')
  const settings = { ...DEFAULT_SETTINGS, modelGateway: { ...DEFAULT_SETTINGS.modelGateway, asr: false, mt: false, tts: false,
    externalEnabled: false, ocr: true, ocrModel: 'resource:pp-ocrv5-mobile-onnx' },
    modelPolicy: { enabled: { 'ocr:resource:pp-ocrv5-mobile-onnx': true }, defaults: {}, selections: {} } }
  ocrClient = new BackendScreenOcr({ backend: () => ({ ready: true, baseUrl, authorizationHeader: () => ({}) }), ensureBackend: async () => {}, settings: () => settings, changed: () => {} })
  gateway = new ModelGateway({ getSettings: () => settings, directLaunch: async () => { throw new Error('No legacy worker expected') },
    listResources: async () => [{ resourceId: 'pp-ocrv5-mobile-onnx', kind: 'ocrModel', name: 'PP-OCRv5 mobile', installed: true, languages: ['en'] }],
    getKey: async () => 'fixture-key', setKey: async () => {}, ocr: ocrClient })
  await gateway.start()
  assert.equal(gateway.snapshot().services.ocr.state, 'ready')
  service = new ScreenTranslation({ mainDir: resolve('out/main'), configPath: resolve(output, `screen-translation-${process.pid}.json`), settings: () => DEFAULT_SETTINGS,
    prepareOcr: async () => gateway.acquireOcr(), inferOcr: (request, signal) => gateway.inferOcr(request, signal),
    inferModel: async () => ({ text: '屏幕文字已翻译 123' }), publish: snapshot => { diagnostics.push({ status: snapshot.status, error: snapshot.error, frames: snapshot.frames }) },
  })
  const display = screen.getDisplayMatching(target.getBounds())
  const desktop = (await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}})).find(item=>item.display_id===String(display.id))
  assert(desktop)
  await service.configure({ display: { id:String(display.id),width:display.bounds.width,height:display.bounds.height,scale:display.scaleFactor }, sourceId: desktop.id, sourceName: desktop.name, regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0, y: 0, width: 1, height: 1 }], sourceLanguage: 'en', targetLanguage: 'zh', model: 'cloud:google', intervalMs: 250 })
  await service.configure({ ...service.snapshot().config, regions: [{ id: '8ddba01d-f7dd-4ea2-b24e-0a3220212420', x: 0, y: 0, width: 1, height: 1 }] })
  await service.start()
  assert.equal(target.isContentProtected(), false, 'Normal application windows remain capturable'); target.focus()
  await until(() => service.snapshot().blocks.some(block => block.status === 'ready'), 'real capture → OCR transport → translation → overlay', 20000)
  assert(actualFrames > 0)
  let translatedBox
  await until(async () => {
    translatedBox = await service.overlay.webContents.executeJavaScript(`(() => {
    const element = document.querySelector('.screen-overlay__block'); const rect = element?.getBoundingClientRect();
    return rect ? { x: rect.x, y: rect.y, width: rect.width, text: element.textContent } : null;
  })()`)
    return !!translatedBox
  }, 'translated overlay DOM')
  const overlayBounds = service.overlay.getBounds(), sourceBounds = target.getContentBounds()
  assert(Math.abs(overlayBounds.x + translatedBox.x - sourceBounds.x - 30) < 2, JSON.stringify({ translatedBox, overlayBounds, sourceBounds }))
  assert(Math.abs(overlayBounds.y + translatedBox.y - sourceBounds.y - 60) < 2, JSON.stringify({ translatedBox, overlayBounds, sourceBounds }))
  assert.equal(translatedBox.text, '屏幕文字已翻译 123')
  evidence.push({ check: 'translation is anchored at the captured foreign text coordinates', passed: true, translatedBox })
  target.focus()
  await until(() => target.isFocused(), 'controlled target receives native focus')
  await wait(600)
  assert(target.isFocused(), 'Overlay updates must not steal native focus')
  assert(service.overlay && !service.overlay.isFocusable())
  assert.equal(service.overlay.isContentProtected(), true)
  evidence.push({ check: 'real video capture, rendering, content protection and focus', passed: true, actualFrames })
  await service.overlay.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
  // Capture protection intentionally hides the overlay from screenshots; disable it only for this fixture's visual check.
  service.overlay.setContentProtection(false)
  try {
    await wait(250)
    let rendered
    await until(async () => { rendered = await service.overlay.webContents.capturePage(); return rendered.toBitmap().some((channel, index) => index % 4 !== 3 && channel > 32) }, 'translated overlay paints native pixels', 5000)
    await writeFile(resolve(output, 'overlay.png'), rendered.toPNG())
  } finally { service.overlay.setContentProtection(true) }

  if (process.platform === 'win32') {
    await target.webContents.executeJavaScript('document.addEventListener("mousemove", event => { if (event.buttons) window.inputCounts.drag = (window.inputCounts.drag || 0) + 1 })')
    const bounds = target.getBounds(), point = screen.dipToScreenPoint({ x: bounds.x + 70, y: bounds.y + 80 }), { x, y } = point
    const expectedHandle = target.getNativeWindowHandle().readBigUInt64LE().toString()
    const script = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public static class NolaScreenInput {
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window,uint flags);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern void keybd_event(byte key,byte scan,uint flags,UIntPtr extra);
}
'@
$point=New-Object NolaScreenInput+Point; $point.X=${x}; $point.Y=${y}
[void][NolaScreenInput]::SetCursorPos(${x},${y}); Start-Sleep -Milliseconds 100
$hit=[NolaScreenInput]::GetAncestor([NolaScreenInput]::WindowFromPoint($point),2).ToInt64()
if ($hit -ne ${expectedHandle}) { throw 'Controlled input target lost' }
foreach($flag in @(2,4,2,4,8,16,32,64)) { [NolaScreenInput]::mouse_event($flag,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60 }
[NolaScreenInput]::mouse_event(2048,0,0,120,[UIntPtr]::Zero)
[NolaScreenInput]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 80
[void][NolaScreenInput]::SetCursorPos(${x + 30},${y + 20}); Start-Sleep -Milliseconds 80
[NolaScreenInput]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
if ([NolaScreenInput]::GetForegroundWindow().ToInt64() -ne ${expectedHandle}) { throw 'Controlled keyboard focus lost' }
[NolaScreenInput]::keybd_event(65,0,0,[UIntPtr]::Zero); [NolaScreenInput]::keybd_event(65,0,2,[UIntPtr]::Zero)
$hit
`
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true })
    const nativeHandle = target.getNativeWindowHandle(), expected = nativeHandle.length >= 8 ? nativeHandle.readBigUInt64LE().toString() : String(nativeHandle.readUInt32LE())
    assert.equal(stdout.trim(), expected, 'Native hit testing through overlay must resolve to the target')
    await wait(400)
    let counts
    await until(async () => {
      counts = await target.webContents.executeJavaScript('window.inputCounts')
      return counts.mousedown >= 5 && counts.mouseup >= 5 && counts.contextmenu >= 1 && counts.wheel >= 1 && counts.drag >= 1 && counts.keydown >= 1
    }, 'native input event delivery', 5000)
    evidence.push({ check: 'native mouse hit testing, left/right/middle/double click, wheel, drag and keyboard passthrough', passed: true, counts })
  }
  await target.webContents.executeJavaScript('document.title="A changed dialogue title"')
  await wait(800)
  assert.equal(service.snapshot().status, 'running', 'Dynamic title changes must not change source identity')
  evidence.push({ check: 'dynamic title does not invalidate native identity', passed: true })
  await service.pause()
  assert.equal(service.overlay.isVisible(), false)
  target.minimize(); await wait(600)
  assert.equal(service.snapshot().status, 'paused', 'System changes must not override user pause')
  target.restore(); target.focus(); await wait(600)
  assert.equal(service.snapshot().status, 'paused')
  await service.resume(); target.focus()
  await until(() => service.snapshot().blocks.some(block => block.status === 'ready'), 'resume')
  const before = service.overlay.getBounds(), targetBefore = target.getBounds()
  target.setPosition(targetBefore.x + 60, targetBefore.y + 40)
  await wait(600)
  assert.deepEqual(service.overlay.getBounds(), before, 'Desktop translation stays anchored to the display');
  evidence.push({ check: 'pause, minimize/restore and fixed desktop coordinates', passed: true })
  await service.edit()
  await until(() => !!service.editor, 'live desktop region editor')
  await until(() => !service.editor.webContents.isLoadingMainFrame(), 'editor document')
  await wait(500)
  assert(await service.editor.webContents.executeJavaScript('!!document.querySelector("[data-slot=screen-region-editor]")'))
  await writeFile(resolve(output, 'editor.png'), (await service.editor.webContents.capturePage()).toPNG())
  await service.editor.webContents.executeJavaScript('void window.nolaTranslator.screenTranslation.command({action:"cancelEdit"}); true')
  await until(() => service.snapshot().status === 'running', 'editor cancellation')
  evidence.push({ check: 'desktop editor cancellation restores the previous running state', passed: true })
  await service.resume(); target.focus()
  await until(() => service.snapshot().blocks.some(block => block.status === 'ready'), 'resume before target close')
  await service.pause()
  await service.edit()
  await until(() => service.editor && !service.editor.webContents.isLoadingMainFrame(), 'second editor')
  const manyRegions = Array.from({length:64}, (_,index)=>({id:crypto.randomUUID(),x:index%8/8,y:Math.floor(index/8)/8,width:.1,height:.1}))
  await service.editor.webContents.executeJavaScript(`void window.nolaTranslator.screenTranslation.command({action:'regions',regions:${JSON.stringify(manyRegions)}}); true`)
  await until(()=>service.snapshot().status==='paused' && service.snapshot().config.regions.length===64,'confirm 64 areas')
  await service.savePreset('Native desktop areas')
  const savedPreset = service.snapshot().presets[0]
  await service.showRegions()
  await until(()=>service.highlights && !service.highlights.webContents.isLoadingMainFrame(),'blue region highlights')
  await wait(400)
  assert.equal(await service.highlights.webContents.executeJavaScript('document.querySelectorAll(".screen-region-highlights > div").length'),64)
  assert.equal(service.highlights.isFocusable(), false)
  await service.showRegions()
  assert.equal(service.highlights,undefined)
  assert.equal(savedPreset.regions.length,64)
  evidence.push({check:'64 rectangles, named preset persistence and click-through blue highlights',passed:true})
  target.destroy()
  assert.equal(service.snapshot().status,'paused')
  await service.stop()
  assert.equal(service.snapshot().status, 'ready')
  assert.equal(service.capture, undefined); assert.equal(service.overlay, undefined)
  assert.equal(gateway.snapshot().services.ocr.state, 'ready')
  evidence.push({ check: 'stop tears down capture and overlay while OCR stays loaded in Model Gateway', passed: true })
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: true, evidence, diagnostics }, null, 2))
  console.log(JSON.stringify({ passed: true, evidence, output }, null, 2))
} catch (error) {
  await writeFile(resolve(output, 'report.json'), JSON.stringify({ passed: false, error: String(error), evidence, diagnostics, snapshot: service?.snapshot() }, null, 2))
  console.error(error)
  process.exitCode = 1
} finally {
  await service?.dispose()
  await gateway?.dispose()
  ocrClient?.dispose()
  if (target && !target.isDestroyed()) target.destroy()
  server?.closeAllConnections()
  await new Promise(resolve => server ? server.close(resolve) : resolve())
  app.exit(process.exitCode ?? 0)
}
})
