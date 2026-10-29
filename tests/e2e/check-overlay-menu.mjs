// Exercise native menu windows with real pointer input and an engine fixture.
import { app, BrowserWindow, ipcMain } from 'electron'
import { EventEmitter } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

app.disableHardwareAcceleration()
const pause = ms => new Promise(done => setTimeout(done, ms))
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await pause(50) }
  throw new Error('Timed out waiting for native overlay menu')
}
const evaluate = (win, code) => win.webContents.executeJavaScript(code)
async function click(win, selector) {
  const point = await evaluate(win, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const r = element.getBoundingClientRect();
    return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  })()`)
  for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) {
    win.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 })
  }
}

app.whenReady().then(async () => {
  const output = resolve('artifacts/overlay-menu')
  await mkdir(output, { recursive: true })
  const bundle = resolve(output, 'fixture.cjs')
  await build({ stdin: { contents: `export { registerEngineIpc } from './src/main/ipc'; export { configureIpcSenderValidation } from './src/main/logged-ipc'; export { DEFAULT_SETTINGS } from './src/shared/settings'`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: bundle,
    define: { __dirname: JSON.stringify(resolve('out/main')) } })
  const { registerEngineIpc, configureIpcSenderValidation, DEFAULT_SETTINGS } = createRequire(import.meta.url)(bundle)
  configureIpcSenderValidation(() => {})
  let settings = DEFAULT_SETTINGS
  const engine = Object.assign(new EventEmitter(), {
    currentState: 'ready', stops: 0, start: async () => {}, stop: async () => {},
    request: async command => {
      if (command.type === 'listDevices') return { devices: [] }
      if (command.type === 'listResources') return { resources: [], storagePath: '' }
      if (command.type === 'startSession' || command.type === 'stopSession') {
        const event = { protocolVersion: 1, requestId: command.requestId, sessionId: 'menu-test',
          type: command.type === 'startSession' ? 'sessionStarted' : 'sessionStopped' }
        if (command.type === 'stopSession') engine.stops++
        engine.emit('event', event)
        return event
      }
      throw new Error(`Unexpected command ${command.type}`)
    },
  })
  const win = new BrowserWindow({ width: 900, height: 230, show: false, frame: false, transparent: true,
    webPreferences: { preload: resolve('out/preload/index.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  registerEngineIpc(engine, () => win, undefined, null, () => settings)
  ipcMain.handle('app:get-settings', () => settings)
  ipcMain.handle('model-gateway:status', () => null)
  ipcMain.handle('meeting:list', () => [])
  ipcMain.handle('translation:has-credential', () => false)
  await win.loadFile(resolve('out/renderer/index.html'), { query: { overlay: '1' } })
  win.show()
  await until(() => evaluate(win, `Boolean(document.querySelector('.nola-caption-actions'))`))
  assert.equal(await evaluate(win, `Boolean(document.querySelector('[data-menu-kind="model"]'))`), false)
  const menuWindow = async () => {
    await until(() => BrowserWindow.getAllWindows().some(item => item !== win && item.isVisible()))
    return BrowserWindow.getAllWindows().find(item => item !== win && item.isVisible())
  }
  for (const theme of ['light', 'dark']) {
    for (const width of [720, 900]) {
      settings = { ...settings, theme, uiLanguage: width === 720 ? 'zh-CN' : 'en' }
      win.setSize(width, 230)
      win.webContents.send('settings:changed', settings)
      await pause(100)
      await click(win, '[data-menu-kind="layout"] > button')
      const menu = await menuWindow()
      const style = await evaluate(menu, `(() => {
        const element = document.querySelector('.nola-caption-menu'); const s = getComputedStyle(element);
        const r = element.getBoundingClientRect();
        return {background: s.backgroundColor, outline: s.outlineStyle,
          visible: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
          focusedOutline: getComputedStyle(document.activeElement).outlineStyle};
      })()`)
      await writeFile(resolve(output, `menu-${theme}-${width}.png`), (await menu.webContents.capturePage()).toPNG())
      assert.notEqual(style.background, 'rgba(0, 0, 0, 0)')
      assert.equal(style.outline, 'none')
      assert.equal(style.focusedOutline, 'none')
      assert.equal(style.visible, true, 'Menu must fit inside its native window')
      menu.focus()
      await pause(50)
      menu.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      menu.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await until(() => !menu.isVisible())
      console.log(`Menu appearance and Escape passed: ${theme}, ${width}px`)
    }
  }
  await evaluate(win, `window.nolaTranslator.startSession({audioSource:{kind:'defaultOutput'},recognitionModelId:'qwen3-asr-0.6b-hf',recognitionMode:'realtime',sourceLanguage:'auto',targetLanguages:[]})`)
  await click(win, '.nola-caption-actions button:last-child')
  let menu = await menuWindow()
  await click(menu, '.nola-confirm-actions button:first-child')
  await until(() => !menu.isVisible())
  assert.equal(win.isVisible(), true)
  assert.equal(engine.stops, 0)
  await click(win, '.nola-caption-actions button:last-child')
  menu = await menuWindow()
  const hit = await evaluate(menu, `(() => {
    const button=document.querySelector('.nola-confirm-actions button:last-child');
    const r=button.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return hit===button || button.contains(hit);
  })()`)
  await writeFile(resolve(output, 'confirmation.png'), (await menu.webContents.capturePage()).toPNG())
  assert.equal(hit, true, 'Confirmation button must receive pointer input')
  await click(menu, '.nola-confirm-actions button:last-child')
  await until(() => !win.isVisible())
  assert.equal(engine.stops, 1)
  console.log('Native menu appearance and close-and-stop passed')
  win.destroy()
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
