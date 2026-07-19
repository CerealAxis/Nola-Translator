import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { app, BrowserWindow } from 'electron'

const projectRoot = process.cwd()
const outputDirectory = resolve(projectRoot, 'artifacts/ui')

app.disableHardwareAcceleration()

async function captureAllViewports() {
  await mkdir(outputDirectory, { recursive: true })
  const windows = []

  for (const viewport of [
    { name: 'default', width: 1180, height: 780 },
    { name: 'minimum', width: 760, height: 560 }
  ]) {
    const window = new BrowserWindow({
      width: viewport.width,
      height: viewport.height,
      minWidth: 760,
      minHeight: 560,
      resizable: true,
      show: false,
      autoHideMenuBar: true,
      backgroundMaterial: 'none',
      backgroundColor: '#f3f3f3',
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#1f1f1f',
        height: 48
      }
    })
    windows.push(window)

    if (!window.isResizable()) throw new Error('The main window must remain resizable')

    console.log(`loading:${viewport.name}`)
    await window.loadFile(resolve(projectRoot, 'out/renderer/index.html'))
    console.log(`loaded:${viewport.name}`)
    window.showInactive()
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))

    console.log(`capturing:${viewport.name}`)
    const image = await window.webContents.capturePage()
    console.log(`captured:${viewport.name}:${image.getSize().width}x${image.getSize().height}`)
    await writeFile(resolve(outputDirectory, `${viewport.name}.png`), image.toPNG())
  }

  windows.forEach((window) => window.destroy())
  app.quit()
}

void app.whenReady().then(captureAllViewports).catch((error) => {
  console.error(error)
  app.exit(1)
})
