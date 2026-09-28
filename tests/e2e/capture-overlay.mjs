import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'

const root = process.cwd()
const output = resolve(root, 'artifacts/ui/overlay-console.png')
const settings = {
  overlay: {
    mode: 'bottom', colorScheme: 'dark', locked: false, alwaysOnTop: true,
    fontFamily: 'Segoe UI Variable', fontSize: 17, fontWeight: 500,
    translationFontSize: 16, translationFontWeight: 400,
    sourceColor: '#F7F7F7', translationColor: '#BFC2C8',
    backgroundColor: '#0D0E10', backgroundOpacity: 0.96,
    maxLines: 2, lineHeight: 1.24, translationMaxLines: 2, translationLineHeight: 1.28,
    showSource: true, showTranslation: true,
  },
}

app.disableHardwareAcceleration()
void app.whenReady().then(async () => {
  ipcMain.handle('app:get-settings', () => settings)
  ipcMain.handle('app:update-settings', () => settings)
  ipcMain.handle('overlay:hide', () => undefined)
  const window = new BrowserWindow({
    width: 900, height: 118, show: false, frame: false, transparent: true,
    webPreferences: { preload: resolve(root, 'out/preload/index.cjs'), contextIsolation: true, sandbox: true },
  })
  await window.loadFile(resolve(root, 'out/renderer/index.html'), { query: { overlay: '1' } })
  window.showInactive()
  window.webContents.send('engine:event', { protocolVersion: 1, type: 'sessionStarted', requestId: 'preview', sessionId: 'preview' })
  window.webContents.send('engine:event', {
    protocolVersion: 1, type: 'caption', requestId: 'preview-caption', sessionId: 'preview',
    segment: {
      segmentId: 'preview-segment', revision: 1, startedAtMs: 0, isFinal: true,
      sourceText: 'We will discuss why society makes us feel bad for resting.',
      translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '我们将讨论为什么社会让我们为休息而感到难过。' }],
    },
  })
  await new Promise((done) => setTimeout(done, 600))
  await mkdir(resolve(root, 'artifacts/ui'), { recursive: true })
  await writeFile(output, (await window.webContents.capturePage()).toPNG())
  window.webContents.send('engine:event', {
    protocolVersion: 1, type: 'caption', requestId: 'preview-next', sessionId: 'preview',
    segment: {
      segmentId: 'preview-next', revision: 1, startedAtMs: 2000, isFinal: true,
      sourceText: 'Taking a break is important for a healthy, balanced life.',
      translations: [{ targetLanguage: 'zh', state: 'complete', provider: 'example', text: '休息对健康而平衡的生活很重要。' }],
    },
  })
  await new Promise((done) => setTimeout(done, 70))
  await writeFile(resolve(root, 'artifacts/ui/overlay-source-transition.png'), (await window.webContents.capturePage()).toPNG())
  await new Promise((done) => setTimeout(done, 110))
  await writeFile(resolve(root, 'artifacts/ui/overlay-translation-transition.png'), (await window.webContents.capturePage()).toPNG())
  settings.overlay.showTranslation = false
  window.webContents.send('settings:changed', settings)
  await new Promise((done) => setTimeout(done, 350))
  await writeFile(resolve(root, 'artifacts/ui/overlay-source-only.png'), (await window.webContents.capturePage()).toPNG())
  window.webContents.send('engine:event', {
    protocolVersion: 1, type: 'caption', requestId: 'preview-roll', sessionId: 'preview',
    segment: {
      segmentId: 'preview-next', revision: 2, startedAtMs: 2000, isFinal: false,
      sourceText: 'Taking a break is important for a healthy, balanced life. We can return to our work with a clearer mind and more energy than before.',
      translations: [{ targetLanguage: 'zh', state: 'pending', provider: 'example' }],
    },
  })
  await new Promise((done) => setTimeout(done, 70))
  await writeFile(resolve(root, 'artifacts/ui/overlay-line-roll.png'), (await window.webContents.capturePage()).toPNG())
  console.log(output)
  window.destroy()
  app.quit()
}).catch((error) => { console.error(error); app.exit(1) })
