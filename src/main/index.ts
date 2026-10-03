import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'

import { app, BrowserWindow, safeStorage, screen, shell } from 'electron'

import type { AppSettings, OverlaySettings } from '../shared/settings'
import { handleMeetingAudio, MEETING_AUDIO_SCHEME, registerMeetingAudioScheme } from './audio-protocol'
import { registerAppIpc } from './app-ipc'
import { createEngineLaunchSpec, EngineProcess } from './engine-process'
import { migrateLegacyUserData } from './legacy-migration'
import { MeetingStore } from './meeting-store'
import { modelStorageEnvironment } from './model-storage'
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

function createMainWindow(theme: AppSettings['theme']): void {
  const preload = resolvePreloadPath(__dirname)
  const window = new BrowserWindow(createMainWindowOptions(preload, theme))
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
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('theme', theme)
    void window.loadURL(url.toString())
  } else {
    // The theme rides in on the query string because that is the only channel the page's main
    // world can read synchronously: with contextIsolation+sandbox there is no window.process, so
    // the pre-paint boot script would silently fall back to prefers-color-scheme and flash white.
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { theme } })
  }
}

function createOverlayWindow(theme: AppSettings['theme'], overlay: OverlaySettings): void {
  const preload = resolvePreloadPath(__dirname)
  const display = screen.getPrimaryDisplay()
  // The overlay settings come in here, not just the theme: the minimum height is derived from the
  // caption font sizes, so building the window with the stored settings is what keeps a previously
  // saved large font from starting out in a window that is too short to render it.
  const window = new BrowserWindow(
    createOverlayWindowOptions(preload, display.workArea.width, overlay, display.workArea.height),
  )
  overlayWindow = window
  window.setAlwaysOnTop(true, 'screen-saver')
  window.setBounds(computeOverlayBounds('bottom', display.workArea, window.getBounds()))
  window.on('closed', () => {
    if (overlayWindow === window) overlayWindow = null
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('overlay', '1')
    url.searchParams.set('theme', theme)
    void window.loadURL(url.toString())
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { overlay: '1', theme } })
  }
}

// Must run before the app is ready: privileged schemes are frozen afterwards.
registerMeetingAudioScheme()

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.setAppUserModelId('com.nola-translator.app')

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    const userData = app.getPath('userData')
    await migrateLegacyUserData(app.getPath('appData'), userData)
    const settings = new SettingsStore(join(userData, 'settings.json'))
    const initialSettings = await settings.load()
    const meetings = new MeetingStore(join(userData, 'meetings'))
    const credentials = new SecureCredentialStore(join(userData, 'credentials.json'), safeStorage)
    // A read-only userData must not take the window down with it; the store degrades to empty.
    await meetings.initialize(join(userData, 'history.jsonl')).catch((error) =>
      console.error('meeting storage is unavailable', error),
    )
    handleMeetingAudio(meetings)
    const resourceEnvironment = modelStorageEnvironment(userData, initialSettings.modelStoragePath)
    // A disconnected custom drive must not keep the settings UI from opening, and keeping the
    // configured path is what stops downloads from silently falling back to C:.
    await mkdir(resourceEnvironment.TMP, { recursive: true }).catch((error) => console.error('model storage is unavailable', error))
    engine = new EngineProcess({
      ...createEngineLaunchSpec({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
      }),
      env: {
        ...resourceEnvironment,
      },
    })
    createMainWindow(initialSettings.theme)
    createOverlayWindow(initialSettings.theme, initialSettings.overlay)
    disposeIpc = registerEngineIpc(
      engine,
      () => overlayWindow,
      (provider) => credentials.get(provider),
      meetings,
      () => settings.current(),
    )
    disposeAppIpc = registerAppIpc({
      settings,
      initialSettings,
      meetings,
      audioProtocol: `${MEETING_AUDIO_SCHEME}://`,
      credentials,
      engine,
      getOverlayWindow: () => overlayWindow,
      getMainWindow: () => mainWindow,
    })
    engine.on('event', (event) => {
      if (event.type === 'caption' && event.segment.isFinal) {
        void meetings.append(event.sessionId, event.segment).catch((error) =>
          console.error('meeting transcript write failed', error),
        )
      }
    })
    void engine.start().catch((error) => console.error('engine start failed', error))

    screen.on('display-metrics-changed', () => {
      if (!overlayWindow) return
      const display = screen.getDisplayMatching(overlayWindow.getBounds())
      overlayWindow.setBounds(computeOverlayBounds(settings.current().overlay.mode, display.workArea, overlayWindow.getBounds()))
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(settings.current().theme)
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
