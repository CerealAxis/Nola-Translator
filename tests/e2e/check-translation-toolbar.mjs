import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'

app.disableHardwareAcceleration()
const root = process.cwd()
const output = resolve(root, 'artifacts/ui/translation-suite')
const delay = ms => new Promise(done => setTimeout(done, ms))
let settings = { theme: 'light', uiLanguage: 'zh-CN', appearance: { reduceMotion: true } }
let snapshot = { status: 'running', config: { captureMode: 'cursor', strategy: 'auto', sourceId: '', sourceName: '', regions: [] },
  sessionId: 'fixture', epoch: 1, blocks: [], shortcutError: false, frames: 0, ocrMs: 0, translationMs: 0, overlayVisible: true }
const commands = []
let window
const errors = []

app.whenReady().then(async () => {
  await mkdir(output, { recursive: true })
  ipcMain.handle('app:get-settings', () => settings)
  ipcMain.handle('screen:snapshot', () => snapshot)
  ipcMain.handle('screen:bootstrap', () => ({ role: 'toolbar', snapshot }))
  ipcMain.handle('screen:sources', () => [])
  ipcMain.handle('screen:command', (_event, command) => {
    commands.push(command)
    if (command.action === 'toolbarSize') { window.setSize(command.width, command.height); return snapshot }
    if (command.action === 'pause') snapshot = { ...snapshot, status: 'paused' }
    if (command.action === 'resume') snapshot = { ...snapshot, status: 'running' }
    window.webContents.send('screen:changed', snapshot)
    return snapshot
  })
  window = new BrowserWindow({ width: 640, height: 116, frame: false, show: false, transparent: true,
    webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  window.webContents.on('console-message', (_event, level, message) => { if (level === 3) errors.push(message) })
  const evaluate = script => window.webContents.executeJavaScript(script)
  for (const locale of ['zh-CN', 'zh-TW', 'zh-HK', 'en', 'ja', 'ko']) for (const theme of ['light', 'dark']) {
    settings = { ...settings, uiLanguage: locale, theme }
    await window.loadFile(resolve(root, 'out/renderer/screen.html'))
    await delay(350)
    await evaluate('document.fonts.ready')
    await delay(100)
    const geometry = await evaluate(`(() => {
      const bar = document.querySelector('.screen-toolbar');
      return { exists: !!bar, width: bar?.getBoundingClientRect().width, height: bar?.getBoundingClientRect().height, viewport: innerWidth, viewportHeight: innerHeight, text: document.body.innerText,
        buttons: [...document.querySelectorAll('.screen-toolbar__main button')].map(b => ({ label: b.getAttribute('aria-label') || b.innerText, right: b.getBoundingClientRect().right })) };
    })()`)
    assert(geometry.exists)
    assert(geometry.width <= geometry.viewport + 1, `${locale}: toolbar overflows: ${JSON.stringify(geometry)}`)
    assert(geometry.viewport - geometry.width <= 2 && geometry.viewportHeight - geometry.height <= 2, `${locale}: toolbar has blank margins: ${JSON.stringify(geometry)}`)
    assert(geometry.buttons.every(button => button.label && button.right <= geometry.viewport), `${locale}: unlabeled or clipped control`)
    assert(!/数据仅留|不捕获屏幕|示例数据/.test(geometry.text))
    await writeFile(resolve(output, `toolbar-${locale}-${theme}.png`), (await window.webContents.capturePage()).toPNG())
  }
  settings = { ...settings, uiLanguage: 'zh-CN', theme: 'light' }
  await window.loadFile(resolve(root, 'out/renderer/screen.html'))
  await delay(350)
  await evaluate('document.fonts.ready')
  await evaluate("document.querySelectorAll('.screen-toolbar__main button')[2].click()")
  await delay(100)
  assert.equal(commands.filter(command => command.action !== 'toolbarSize').at(-1).action, 'pause')
  await evaluate("document.querySelectorAll('.screen-toolbar__main button')[2].click()")
  await delay(100)
  assert.equal(commands.filter(command => command.action !== 'toolbarSize').at(-1).action, 'resume')
  await evaluate("document.querySelectorAll('.screen-toolbar__main button')[4].click()")
  await delay(500)
  assert.equal(commands.at(-1).action, 'toolbarSize')
  assert(await evaluate("!!document.querySelector('.screen-toolbar__settings')"))
  const expanded = await evaluate("({ height: document.querySelector('.screen-toolbar').getBoundingClientRect().height, viewport: innerHeight })")
  assert(expanded.viewport > 100 && expanded.height <= expanded.viewport + 1, `Expanded settings clipped: ${JSON.stringify(expanded)}`)
  await writeFile(resolve(output, 'toolbar-expanded.png'), (await window.webContents.capturePage()).toPNG())
  assert.equal(errors.length, 0, errors.join('\n'))
  console.log(JSON.stringify({ passed: true, locales: 6, themes: 2, commands: commands.map(command => command.action), output }))
  window.destroy()
  app.quit()
}).catch(error => { console.error(error); window?.destroy(); app.exit(1) })
