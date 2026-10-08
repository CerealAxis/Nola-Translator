import { translationEngine } from '../shared/model-engines'
import { resolveDeviceIntent } from '../shared/device-selection'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import { app, BrowserWindow, safeStorage, screen, shell } from 'electron'

import type { AppSettings, OverlaySettings } from '../shared/settings'
import { NO_TRANSLATION_LANGUAGE } from '../shared/settings'
import type { SessionConfig } from '../shared/contracts'
import { randomUUID } from 'node:crypto'
import { handleMeetingAudio, MEETING_AUDIO_SCHEME, registerMeetingAudioScheme } from './audio-protocol'
import { registerAppIpc } from './app-ipc'
import { createEngineLaunchSpec, EngineProcess } from './engine-process'
import { clearDataRootPointer, clearPendingDataMigration, fallbackDataRoot, readPendingDataMigration, resolveDataRoot, writeDataRootPointer } from './data-root'
import { freeBytesForDirectory } from './disk-usage'
import { migrateDataRoot, planDataRootMigration } from './data-migration'
import { migrateLegacyUserData } from './legacy-migration'
import { MeetingStore } from './meeting-store'
import { modelStorageEnvironment } from './model-storage'
import { registerEngineIpc } from './ipc'
import { SessionController } from './session-controller'
import { BrowserConnection } from './browser-connection'
import { BrowserIntegrations } from './browser-integrations'
import { RuntimeManager } from './runtime-manager'
import { registerRuntimeIpc } from './runtime-ipc'
import { SettingsStore } from './settings-store'
import { SecureCredentialStore } from './secure-store'
import { createMainWindowOptions, resolvePreloadPath } from './window-options'
import { computeOverlayBounds, createOverlayWindowOptions } from './windows'

let mainWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let engine: EngineProcess | null = null
let disposeIpc: (() => void) | null = null
let disposeAppIpc: (() => void) | null = null
let disposeRuntimeIpc: (() => void) | null = null
let quitting = false
let browserConnection: BrowserConnection | null = null

function createMainWindow(theme: AppSettings['theme']): void {
  const preload = resolvePreloadPath(__dirname)
  const window = new BrowserWindow(createMainWindowOptions(preload, theme, __dirname))
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
    // The theme rides in on the query string because it is the only channel the page's main
    // world can read synchronously: with contextIsolation + sandbox there is no window.process,
    // so the pre-paint boot script would fall back to prefers-color-scheme and flash white.
    void window.loadFile(join(__dirname, '../renderer/index.html'), { query: { theme } })
  }
}

function createOverlayWindow(theme: AppSettings['theme'], overlay: OverlaySettings): void {
  const preload = resolvePreloadPath(__dirname)
  const display = screen.getPrimaryDisplay()
  // The whole overlay settings object comes in, not just the theme: the minimum height is
  // derived from the caption font sizes, so a previously saved large font would otherwise
  // start out in a window too short to render it.
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
    // The app's own stores resolve from the single data root, not from `userData`, which is
    // left as Chromium's disposable state; it is still read here as the destination of the
    // FluentCaptions -> Nola rename migration. See `data-root.ts` for why the two stay apart.
    const userData = app.getPath('userData')
    await migrateLegacyUserData(app.getPath('appData'), userData)
    const dataRoot = resolveDataRoot()
    // A data-root change runs here, before any store is constructed: this is the one moment the
    // tree has no open handles — the meeting store has not mapped an audio file and
    // `credentials.json` is untouched. The settings handler wrote the marker and moved nothing.
    //
    // Nothing in this step may abort startup. A rejection here would abort the `whenReady`
    // chain before `createMainWindow`, and an app that never opens is a far worse outcome than
    // a data root that did not finish moving — the same trade `migrateLegacyUserData` makes.
    const pending = readPendingDataMigration()
    // Both sides come out of `normalize` in `data-root.ts`; this only folds case and a trailing
    // separator, so the same folder written two ways cannot look like a move onto itself.
    const sameDirectory = (left: string, right: string): boolean =>
      left.replace(/[\\/]+$/, '').toLowerCase() === right.replace(/[\\/]+$/, '').toLowerCase()
    if (pending && sameDirectory(pending.from, dataRoot)) {
      // Logged, marker untouched: it is the record of the user's choice, and clearing it here would
      // silently drop a folder the settings page is still showing as the pending destination.
      console.warn('the pending data migration source is already the current data root; nothing to move', dataRoot)
    } else if (pending) {
      /*
       * Measure the target drive first and cancel the whole move when it does not fit. A
       * half-finished copy is the worst state: part of the old root is gone, part of the new one
       * is in place, and the marker still stands, so every later launch retries from the middle.
       * Cancelling is a clean no-op — the app falls back to the old root, intact, and the user
       * re-picks after freeing space. Planning is read-only, so the extra pass is cheap.
       */
      try {
        const plan = await planDataRootMigration(pending.from, dataRoot, pending.extra)
        const required = plan.requiredBytes ?? 0
        const available = freeBytesForDirectory(dataRoot)
        if (available !== undefined && required > available) {
          // Cancelling only has to land the next launch on the directory that still holds the
          // data, so the pointer may only be deleted when the app would resolve back to the old
          // root by itself. A root the pointer used to point at has to be written back instead,
          // or the next launch resolves to an empty directory and the data is orphaned.
          if (sameDirectory(fallbackDataRoot(), pending.from)) clearDataRootPointer()
          else writeDataRootPointer(pending.from)
          clearPendingDataMigration()
          console.error(
            `the data migration was cancelled: ${Math.round(required / 1_048_576)} MB are needed on the new drive but only `
            + `${Math.round(available / 1_048_576)} MB are free. The app stays on ${pending.from}.`,
          )
        } else {
          // Expect this to take a while — the runtimes in `build/runtime-catalog.json` total
          // roughly 680 MB. There is no progress UI because it runs before the window exists,
          // and one line is the whole report a user can act on.
          console.log('moving app data to the chosen data root before the window opens', pending.from, '->', dataRoot)
          const report = await migrateDataRoot(pending.from, dataRoot, pending.extra)
          const bytes = report.requiredBytes ?? 0
          console.log('data root migration finished', {
            copied: report.copied.length, skipped: report.skipped.length,
            failed: report.failed.length, removed: report.removed.length,
            bytes, megabytes: Math.round(bytes / 1_048_576),
          })
          // The marker is cleared only when nothing failed. A cleared marker is what strands a
          // failed entry at the old root for good, whereas leaving it costs one more launch's
          // idempotent pass.
          if (report.failed.length === 0) clearPendingDataMigration()
          else console.error('the data root migration left entries at the old root; it will be retried on the next launch', report.failed)
        }
      } catch (error) {
        console.error('the data root migration could not run; the app starts on the current data root', error)
      }
    }
    const settings = new SettingsStore(join(dataRoot, 'settings.json'))
    const initialSettings = await settings.load()
    const meetings = new MeetingStore(join(dataRoot, 'meetings'))
    const credentials = new SecureCredentialStore(join(dataRoot, 'credentials.json'), safeStorage)
    // A read-only data root must not take the window down with it; the store degrades to empty.
    await meetings.initialize(join(dataRoot, 'history.jsonl')).catch((error) =>
      console.error('meeting storage is unavailable', error),
    )
    handleMeetingAudio(meetings)
    const resourceEnvironment = modelStorageEnvironment(dataRoot, initialSettings.modelStoragePath)
    const pythonBaseDirectory = app.isPackaged ? join(process.resourcesPath, 'engine')
      : join(app.getAppPath(), 'engine', 'dist', 'NolaPythonEngine')
    const bundledLlamaDirectory = app.isPackaged ? join(process.resourcesPath, 'llama')
      : join(app.getAppPath(), 'vendor', existsSync(join(app.getAppPath(), 'vendor', 'llama', 'llama-server.exe')) ? 'llama' : 'llama-cpu')
    const runtimes = new RuntimeManager(join(initialSettings.modelStoragePath || dataRoot, 'runtimes'),
      app.isPackaged ? join(process.resourcesPath, 'runtime-catalog.json') : join(app.getAppPath(), 'build', 'runtime-catalog.json'),
      app.isPackaged ? join(process.resourcesPath, 'runtime', 'extract-runtime.ps1') : join(app.getAppPath(), 'scripts', 'extract-runtime.ps1'),
      { baseDirectory: pythonBaseDirectory, recipesPath: app.isPackaged ? join(process.resourcesPath, 'runtime-recipes.json')
        : join(app.getAppPath(), 'build', 'runtime-recipes.json'),
      localEngine: { ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }), env: resourceEnvironment },
      localLlamaDirectory: bundledLlamaDirectory, source: app.isPackaged ? 'bundled' : 'project' })
    let launchCompute = { ...initialSettings.compute }
    let currentDirectories = ''
    // The runtime init body is deferred into a microtask so it never blocks window creation;
    // only calls that need the environment wait on it.
    const runtimeInitialization = Promise.resolve().then(async () => {
      await runtimes.initialize()
      // TMP, TEMP and TMPDIR are all pinned inside the configured model-storage root, so
      // creating it here is what makes a disconnected custom drive fail loudly here instead of
      // letting the engine fall back to the system temp directory.
      await mkdir(resourceEnvironment.TMP, { recursive: true }).catch((error) => console.error('model storage is unavailable', error))
      try { currentDirectories = JSON.stringify(runtimes.selectedDirectories(launchCompute)) } catch { /* Settings remain accessible for repair. */ }
    })
    const whenRuntimeReady = async (): Promise<void> => {
      await runtimeInitialization
      if (quitting) throw new Error('应用正在退出')
    }
    const pipelineDebugLog = join(dataRoot, 'pipeline-debug.jsonl')
    engine = new EngineProcess({
      resolveLaunchSpec: () => {
        const compute = launchCompute
        const { engine: engineDirectory, llama: llamaDirectory } = runtimes.selectedDirectories(compute)
        runtimes.setActiveDirectories([engineDirectory, llamaDirectory].filter((directory): directory is string => !!directory))
        return {
          ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath,
            managedEngineDirectory: engineDirectory }),
          env: { ...resourceEnvironment,
            NOLA_TRANSLATOR_LLAMA_DIR: llamaDirectory ?? bundledLlamaDirectory,
            // Every layer of the caption pipeline appends to this one file, so a stall can be read
            // end to end instead of inferred from three separate logs.
            NOLA_TRANSLATOR_DEBUG_LOG: pipelineDebugLog,
          },
        }
      },
      ...createEngineLaunchSpec({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
      }),
      env: {
        ...resourceEnvironment,
        NOLA_TRANSLATOR_LLAMA_DIR: bundledLlamaDirectory,
        NOLA_TRANSLATOR_DEBUG_LOG: pipelineDebugLog,
      },
    })
    let sessionActive = false
    engine.on('log', (message: string) => console.error('[engine]', message.trimEnd()))
    engine.on('protocolError', (error: unknown) => console.error('engine protocol failed', error))
    let sessionStarting = false
    let preparation: Promise<void> | null = null
    const prepareEnvironment = (forStart = false, session?: SessionConfig, cancelled: () => boolean = () => false): Promise<void> => {
      const checkCancelled = () => { if (quitting || cancelled()) throw new Error('sessionStartCancelled') }
      try { checkCancelled() } catch (error) { return Promise.reject(error) }
      if (sessionActive || (sessionStarting && !forStart)) return Promise.reject(new Error('请先停止同传，再应用计算环境'))
      if (preparation) return preparation.catch(() => undefined).then(() => prepareEnvironment(forStart, session, cancelled))
      const compute = { ...(session?.compute ?? settings.current().compute) }
      preparation = (async () => {
        await whenRuntimeReady()
        checkCancelled()
        const translationSettings = settings.current().translation
        const provider = session ? session.translationProvider ?? 'local' : translationSettings.provider
        const modelId = session?.translationModelId ?? translationSettings.localModelId
        let translation: 'torch' | 'llama' | 'none' = provider !== 'local' || (session ? !session.targetLanguages.length : translationSettings.targetLanguage === NO_TRANSLATION_LANGUAGE)
          ? 'none' : modelId === 'm2m100-418m' ? 'torch' : 'llama'
        if (translation !== 'none' && engine!.currentState === 'ready') {
          try {
            const resources = await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: `prepare-${randomUUID()}` }, 'resources')
            const model = resources.resources.find(r => r.resourceId === modelId)
            if (model) translation = model.provider === 'm2m100' ? 'torch' : 'llama'
          } catch { /* Best-effort probe: a failed reply leaves the runtime chosen from the model id. */ }
        }
        if (session) {
          if (compute.recognitionEngine !== 'pytorch') throw new Error('所选识别模型是 PyTorch 格式，请选择兼容的识别引擎；当前识别资源尚未提供 GGUF 版本')
          if (translation !== 'none') {
            const expected = translation === 'torch' ? 'pytorch' : 'llama'
            const selected = translationEngine(compute, expected === 'pytorch' ? 'm2m100' : 'llama.cpp', modelId)
            if (selected !== expected) throw new Error('所选翻译模型与推理引擎不兼容，请重新选择模型或引擎')
          }
        }
        await runtimes.prepare(compute, translation)
        checkCancelled()
        const next = JSON.stringify(runtimes.selectedDirectories(compute))
        launchCompute = compute
        if (next !== currentDirectories) {
          await engine!.stop()
          checkCancelled()
          await engine!.start()
          checkCancelled()
          currentDirectories = next
        } else if (engine!.currentState !== 'ready') await engine!.start()
        if (session) {
          const response = await engine!.request({ protocolVersion: 1, type: 'listComputeDevices', requestId: `resolve-${randomUUID()}` }, 'computeDevices', 30_000)
          const hardware = (await runtimes.snapshot()).hardware
          session.compute = { ...compute,
            recognitionDevice: resolveDeviceIntent(compute.recognitionDevice, hardware, response.devices, 'torch'),
            translationDevice: translation === 'none' ? 'auto' : resolveDeviceIntent(compute.translationDevice, hardware, response.devices, translation),
          }
        }
      })().finally(() => { preparation = null })
      return preparation
    }
    disposeRuntimeIpc = registerRuntimeIpc(runtimes, () => mainWindow, () => prepareEnvironment(), () => sessionActive || sessionStarting, whenRuntimeReady)
    const sessions = new SessionController({ engine, meetings, getSettings: () => settings.current(), getCredential: provider => credentials.get(provider), prepare: (config, cancelled) => prepareEnvironment(true, config, cancelled), whenReady: whenRuntimeReady, startingChanged: starting => { sessionStarting = starting }, showOverlay: () => overlayWindow?.showInactive(), hideOverlay: () => overlayWindow?.hide() })
    disposeIpc = registerEngineIpc(
      engine,
      () => overlayWindow,
      (provider) => credentials.get(provider),
      meetings,
      () => settings.current(),
      config => prepareEnvironment(true, config),
      starting => { sessionStarting = starting },
      whenRuntimeReady,
      sessions,
    )
    browserConnection = new BrowserConnection({ engine, sessions, integrations: new BrowserIntegrations({ localAppData: process.env.LOCALAPPDATA ?? app.getPath('userData'), userData: app.getPath('userData') }), getSettings: () => settings.current(), setEnabled: async enabled => {
      const saved = await settings.update({ browserConnection: { enabled } })
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('settings:changed', saved)
    } })
    void browserConnection.initialize(initialSettings.browserConnection.enabled).catch(error => console.error('browser connection initialization failed', error))
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
      if (event.type === 'sessionStarted') sessionActive = true
      if (event.type === 'sessionStopped') sessionActive = false
      if (event.type === 'caption' && event.segment.isFinal && !sessions.isBrowserEvent(event)) {
        void meetings.append(event.sessionId, event.segment).catch((error) =>
          console.error('meeting transcript write failed', error),
        )
      }
    })
    engine.on('state', state => { if (state === 'failed' || state === 'recovering') sessionActive = false })
    createMainWindow(initialSettings.theme)
    createOverlayWindow(initialSettings.theme, initialSettings.overlay)
    void whenRuntimeReady().then(() => engine!.start()).catch((error) => {
      if (!quitting) console.error('engine environment initialization/start failed', error)
    })

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
  disposeRuntimeIpc?.()
  void (browserConnection?.dispose() ?? Promise.resolve()).catch(error => console.error('browser cleanup failed', error)).finally(() => engine!.stop().finally(() => app.quit()))
})
