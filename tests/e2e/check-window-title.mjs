import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const expected = '诺拉翻译'

void app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false })
  const devUrl = process.argv[2]
  if (devUrl) await window.loadURL(devUrl)
  else await window.loadFile(resolve('out/renderer/index.html'))
  const result = await window.webContents.executeJavaScript('({ title: document.title, charset: document.characterSet })')
  console.log(JSON.stringify(result))
  window.destroy()
  app.exit(result.title === expected && result.charset === 'UTF-8' ? 0 : 1)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
