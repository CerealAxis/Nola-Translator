import { join } from 'node:path'

import { app, BrowserWindow, safeStorage, screen, shell } from 'electron'

import { registerAppIpc } from './app-ipc'
import { createEngineLaunchSpec, EngineProcess } from './engine-process'
import { HistoryStore } from './history-store'
import { registerEngineIpc } from './ipc'
import { SettingsStore } from './settings-store'
import { SecureCredentialStore } from './secure-store'
import { createMainWindowOptions, resolvePreloadPath } from './window-options'
import { computeOverlayBounds, createOverlayWindowOptions } from './windows'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let engine: EngineProcess | null = null
let disposeIpc: (() => void) | null = null
let disposeAppIpc: (() => void) | null = null
let quitting = false

function createMainWindow(): void {
  const preload = resolvePreloadPath(__dirname)
  const window = new BrowserWindow(createMainWindowOptions(preload))
  mainWindow = window

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
    if (!quitting) app.quit()
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createOverlayWindow(): void {
  const preload = resolvePreloadPath(__dirname)
  const window = new BrowserWindow(createOverlayWindowOptions(preload))
  overlayWindow = window
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setIgnoreMouseEvents(true, { forward: true })
  const display = screen.getPrimaryDisplay()
  window.setBounds(computeOverlayBounds('bottom', display.workArea, window.getBounds()))
  window.on('closed', () => {
    if (overlayWindow === window) overlayWindow = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('overlay', '1')
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { overlay: '1' } })
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.setAppUserModelId('com.fluentcaptions.app')

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    const settings = new SettingsStore(join(userData, 'settings.json'))
    const initialSettings = await settings.load()
    const history = new HistoryStore(join(userData, 'history.jsonl'))
    const credentials = new SecureCredentialStore(join(userData, 'credentials.json'), safeStorage)
    await history.setEnabled(initialSettings.historyEnabled)
    await history.restore()
    engine = new EngineProcess({
      ...createEngineLaunchSpec({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
      }),
      env: {
        FLUENTCAPTIONS_MODEL_DIR: join(userData, 'models'),
        XDG_DATA_HOME: join(userData, 'argos', 'data'),
        XDG_CONFIG_HOME: join(userData, 'argos', 'config'),
        XDG_CACHE_HOME: join(userData, 'argos', 'cache'),
        ARGOS_CHUNK_TYPE: 'MINISBD',
        ARGOS_DEVICE_TYPE: 'cpu',
      },
    })
    createMainWindow()
    createOverlayWindow()
    disposeIpc = registerEngineIpc(engine, () => overlayWindow, (provider) => credentials.get(provider))
    disposeAppIpc = registerAppIpc({
      settings,
      initialSettings,
      history,
      credentials,
      engine,
      getOverlayWindow: () => overlayWindow,
      getMainWindow: () => mainWindow,
    })
    engine.on('event', (event) => {
      if (event.type === 'caption' && event.segment.isFinal) {
        void history.add(event.segment).catch((error) => console.error('history write failed', error))
      }
    })
    void engine.start().catch((error) => console.error('engine start failed', error))

    screen.on('display-metrics-changed', () => {
      if (!overlayWindow) return
      const display = screen.getDisplayMatching(overlayWindow.getBounds())
      overlayWindow.setBounds(computeOverlayBounds(settings.current().overlay.mode, display.workArea, overlayWindow.getBounds()))
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', (event) => {
  if (quitting || !engine) return
  event.preventDefault()
  quitting = true
  disposeIpc?.()
  disposeAppIpc?.()
  void engine.stop().finally(() => app.quit())
})
