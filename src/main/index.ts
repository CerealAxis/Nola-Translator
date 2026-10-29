import { FeatureActivity, type FeatureLease } from './feature-activity'
import { ModelGateway } from './model-gateway'
import { NolaTray } from './tray'
import { configureIpcSenderValidation, loggedHandle } from './logged-ipc'
import { modelEngines, supportsSelectedEngine } from '../shared/model-engines'
import { INDEX_TRANSLATE_MODEL_IDS } from '../shared/index-translate'
import { registerWorkbench, isWorkbenchWindow } from './workbench'
import { registerOnboardingCard } from './onboardingCard'
import { closeDirectModelWorker } from './direct-model'
import { AgentWorkspace } from './agent-workspace'
import { customModelsOf } from '../shared/custom-models'
import { captureMainConsole, initializeSessionLog, logActivityTotals, logDiagnostic, relocateSessionLogs } from './session-log'
import { resolveDeviceIntent } from '../shared/device-selection'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import { app, BrowserWindow, ipcMain, safeStorage, screen, session, shell, type IpcMainInvokeEvent } from 'electron'

import type { AppSettings, OverlaySettings } from '../shared/settings'
import { NO_TRANSLATION_LANGUAGE } from '../shared/settings'
import type { SessionConfig } from '../shared/contracts'
import { randomUUID } from 'node:crypto'
import { handleMeetingAudio, MEETING_AUDIO_SCHEME, registerMeetingAudioScheme } from './audio-protocol'
import { registerAppIpc, resetOverlayLock } from './app-ipc'
import { createEngineLaunchSpec, EngineProcess } from './engine-process'
import { clearDataRootPointer, clearPendingDataMigration, defaultDataRoot, fallbackDataRoot, legacyDefaultDataRoot, readDataRootPointer, readPendingDataMigration, resolveDataRoot, setSessionDataRoot, writeDataRootPointer, writePendingDataMigration } from './data-root'
import { freeBytesForDirectory } from './disk-usage'
import { dataRootEntries, migrateDataRoot, planDataRootMigration } from './data-migration'
import { migrateLegacyUserData } from './legacy-migration'
import { MeetingStore } from './meeting-store'
import { cleanupStorageCaches, modelStorageEnvironment } from './model-storage'
import { registerEngineIpc } from './ipc'
import { SessionController } from './session-controller'
import { BrowserConnection } from './browser-connection'
import { BrowserIntegrations } from './browser-integrations'
import { RuntimeManager } from './runtime-manager'
import { registerRuntimeIpc, recheckRuntimeEnvironment } from './runtime-ipc'
import { OfflineManager } from './offline-manager'
import { registerOfflineIpc } from './offline-ipc'
import { runOfflineModelWorker } from './offline-worker'
import { SettingsStore } from './settings-store'
import { SecureCredentialStore } from './secure-store'
import { createMainWindowOptions, isAllowedRendererPermission, isTrustedRendererUrl, resolvePreloadPath } from './window-options'
import { computeOverlayBounds, createOverlayWindowOptions, suppressSystemMenuOnRightClick } from './windows'
import { prepareOverlayMenu } from './overlay-menu'
import { resolveModelNetwork } from './network-region'

let mainWindow: BrowserWindow | null = null
let migrationWindow: BrowserWindow | null = null
let migrationProgress = -1
let overlayWindow: BrowserWindow | null = null
let workspaceWindow: BrowserWindow | null = null
let workspaceReady: Promise<void> = Promise.resolve()
let engine: EngineProcess | null = null
let disposeIpc: (() => void) | null = null
let disposeAppIpc: (() => void) | null = null
let disposeRuntimeIpc: (() => void) | null = null
let disposeOfflineIpc: (() => Promise<void>) | null = null
let quitting = false
let browserConnection: BrowserConnection | null = null
let tray: NolaTray | null = null
let gateway: ModelGateway | null = null
let stopWorkbench: (() => Promise<void>) | null = null
let stopOnboardingCard: (() => void) | null = null
let stopSessions: (() => Promise<void>) | null = null
let closeBehavior: () => AppSettings['closeBehavior'] = () => 'tray'
let requestQuit: () => void = () => app.quit()
const activity = new FeatureActivity(snapshot => {
  for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('feature-activity:changed', snapshot)
  tray?.activityChanged(snapshot)
})
function assertFeatureSender(event: IpcMainInvokeEvent, mainOnly = false): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || window.isDestroyed() || event.senderFrame !== event.sender.mainFrame) throw new Error('Access denied')
  if (mainOnly ? window !== mainWindow : ![mainWindow, workspaceWindow, overlayWindow].includes(window) && !isWorkbenchWindow(window)) throw new Error('Access denied')
  if (!isTrustedRendererUrl(event.sender.getURL(), __dirname)) throw new Error('Access denied')
}
function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createMainWindow(theme: AppSettings['theme']): void {
  const preload = resolvePreloadPath(__dirname)
  const window = new BrowserWindow(createMainWindowOptions(preload, theme, __dirname))
  mainWindow = window

  window.once('ready-to-show', () => window.show())
  window.on('close', event => {
    if (quitting) return
    event.preventDefault()
    if (closeBehavior() === 'quit') requestQuit()
    else { window.hide(); tray?.hidden() }
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
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

/** Paint the migration dialog before walking or copying data; no stores exist at this point. */
async function showDataMigrationWindow(): Promise<void> {
  const window = new BrowserWindow({
    ...createMainWindowOptions(resolvePreloadPath(__dirname), 'system', __dirname),
    width: 520, height: 200, minWidth: 520, minHeight: 200,
    resizable: false, maximizable: false, minimizable: false, closable: false,
    frame: false, backgroundMaterial: 'none',
  })
  migrationWindow = window
  migrationProgress = -1
  const painted = new Promise<void>(resolve => window.once('ready-to-show', () => resolve()))
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('migration', '1')
    await window.loadURL(url.toString())
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'), { query: { migration: '1' } })
  }
  await painted
  window.show()
}

function publishMigrationProgress(percent: number): void {
  // Keep thousands of small files from flooding the startup renderer with IPC messages.
  const next = Math.max(0, Math.min(100, Math.floor(percent)))
  if (next === migrationProgress) return
  migrationProgress = next
  if (migrationWindow && !migrationWindow.isDestroyed()) {
    migrationWindow.webContents.send('app:data-migration-progress', next)
  }
}

// Keep the reader mounted while hidden so captions, notes and view preferences survive closing.
function createWorkspaceWindow(theme: AppSettings['theme']): void {
  const window = new BrowserWindow({
    ...createMainWindowOptions(resolvePreloadPath(__dirname), theme, __dirname),
    title: 'Nola Translator',
    webPreferences: {
      preload: resolvePreloadPath(__dirname), contextIsolation: true, sandbox: true,
      nodeIntegration: false, backgroundThrottling: false,
    },
  })
  workspaceWindow = window
  const publishMaximized = () => window.webContents.send('app:window:maximized-changed', window.isMaximized())
  window.on('maximize', publishMaximized)
  window.on('unmaximize', publishMaximized)
  window.on('close', event => {
    if (quitting) return
    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => { if (workspaceWindow === window) workspaceWindow = null })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    url.searchParams.set('workspace', '1')
    url.searchParams.set('theme', theme)
    workspaceReady = window.loadURL(url.toString())
  } else {
    workspaceReady = window.loadFile(join(__dirname, '../renderer/index.html'), { query: { workspace: '1', theme } })
  }
  void workspaceReady.catch(error => console.error('workspace load failed', error))
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
  window.webContents.once('did-finish-load', () => {
    if (!window.isDestroyed()) prepareOverlayMenu(window, theme)
  })
  suppressSystemMenuOnRightClick(window)
  window.setAlwaysOnTop(overlay.alwaysOnTop, 'screen-saver')
  window.setFocusable(true)
  window.setBounds(computeOverlayBounds('bottom', display.workArea, window.getBounds()))
  // The lock belongs to the window that carried it, so a rebuilt one starts unlocked; the reset
  // also re-applies the window flags through `applyOverlay` instead of leaving them stale.
  resetOverlayLock()
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
    if (migrationWindow && !migrationWindow.isDestroyed()) { migrationWindow.focus(); return }
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  void app.whenReady().then(async () => {
    const trustedContents = (contents: Electron.WebContents | null): boolean => {
      if (!contents || contents.isDestroyed()) return false
      const owner = BrowserWindow.fromWebContents(contents)
      return !!owner && !owner.isDestroyed() && isTrustedRendererUrl(contents.getURL(), __dirname)
    }
    configureIpcSenderValidation(event => {
      if (!trustedContents(event.sender) || event.senderFrame !== event.sender.mainFrame
        || !isTrustedRendererUrl(event.senderFrame.url, __dirname)) throw new Error('Access denied')
    })
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-navigate', (event, target) => {
        if (!isTrustedRendererUrl(target, __dirname)) event.preventDefault()
      })
      contents.on('will-redirect', (event, target) => {
        if (!isTrustedRendererUrl(target, __dirname)) event.preventDefault()
      })
    })
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
      callback(isAllowedRendererPermission(permission,
        trustedContents(contents) && details.isMainFrame && isTrustedRendererUrl(details.requestingUrl, __dirname),
        'mediaTypes' in details ? details.mediaTypes : []))
    })
    session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
      isAllowedRendererPermission(permission,
        trustedContents(contents) && details.isMainFrame && !!details.requestingUrl && isTrustedRendererUrl(details.requestingUrl, __dirname),
        details.mediaType ? [details.mediaType] : []))
    await initializeSessionLog(join(app.getPath('userData'), 'logs'), {
      version: app.getVersion(), electron: process.versions.electron, node: process.versions.node,
      platform: process.platform, architecture: process.arch, systemVersion: process.getSystemVersion(), packaged: app.isPackaged,
    })
    captureMainConsole()
    app.on('web-contents-created', (_event, contents) => {
      contents.on('did-finish-load', () => logDiagnostic('ui.window.loaded', { windowId: contents.id }))
      contents.on('destroyed', () => logDiagnostic('ui.window.closed'))
      contents.on('console-message', details => {
        if (details.level !== 'error' && details.level !== 'warning') return
        logDiagnostic('renderer.console', { level: details.level, message: details.message, messageBytes: Buffer.byteLength(details.message), source: details.sourceId, line: details.lineNumber })
      })
      contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
        if (isMainFrame) logDiagnostic('renderer.load-failed', { code, description })
      })
    })
    app.on('child-process-gone', (_event, details) => logDiagnostic('app.child-process-gone', details))
    app.on('render-process-gone', (_event, contents, details) => logDiagnostic('app.renderer-gone', { id: contents.id, ...details }))
    ipcMain.on('diagnostics:ui-activity', (event, activity: unknown) => {
      if (!BrowserWindow.fromWebContents(event.sender) || !activity || typeof activity !== 'object') return
      const item = activity as Record<string, unknown>
      if (item.type !== 'navigation' && item.type !== 'interaction') return
      logDiagnostic(`ui.${item.type}`, { windowId: event.sender.id,
        route: typeof item.route === 'string' ? item.route.slice(0, 120) : '',
        element: typeof item.element === 'string' ? item.element.slice(0, 64) : item.element })
    })
    app.on('will-quit', () => { logActivityTotals(); logDiagnostic('app.quit') })
    const healthTimer = setInterval(() => logDiagnostic('app.health', {
      uptimeSeconds: Math.round(process.uptime()), memory: process.memoryUsage(), cpu: process.getCPUUsage(),
      engineState: engine?.currentState ?? 'not-created', windows: BrowserWindow.getAllWindows().length,
    }), 30_000)
    healthTimer.unref()
    app.once('will-quit', () => clearInterval(healthTimer))
    // The app's own stores resolve from the single data root, not from `userData`, which is
    // left as Chromium's disposable state; it is still read here as the destination of the
    // FluentCaptions -> Nola rename migration. See `data-root.ts` for why the two stay apart.
    const userData = app.getPath('userData')
    await migrateLegacyUserData(app.getPath('appData'), userData)
    let dataRoot = resolveDataRoot()
    // No workers are running yet. Also discard caches left at the affected release's C: root.
    for (const root of new Set([dataRoot, legacyDefaultDataRoot()].filter((root): root is string => root !== null))) {
      await cleanupStorageCaches(root)
    }
    logDiagnostic('app.data-root', { dataRoot })
    // A data-root change runs here, before any store is constructed: this is the one moment the
    // tree has no open handles — the meeting store has not mapped an audio file and
    // `credentials.json` is untouched. A marker names the move; it never carries data itself.
    //
    // Nothing in this step may abort startup. A rejection here would abort the `whenReady`
    // chain before `createMainWindow`, and an app that never opens is a far worse outcome than
    // a data root that did not finish moving — the same trade `migrateLegacyUserData` makes.
    //
    // Both sides come out of `normalize` in `data-root.ts`; this only folds case and a trailing
    // separator, so the same folder written two ways cannot look like a move onto itself.
    const sameDirectory = (left: string, right: string): boolean =>
      left.replace(/[\\/]+$/, '').toLowerCase() === right.replace(/[\\/]+$/, '').toLowerCase()
    // Restore data from the affected fixed-location release to the actual installation's Data/.
    // A pending migration must survive retries; user-selected destinations remain authoritative.
    try {
      const legacyRoot = legacyDefaultDataRoot()
      const currentRoot = defaultDataRoot()
      const legacyEntries = legacyRoot === null ? [] : dataRootEntries(legacyRoot)
      const rootIsDefault = readDataRootPointer() === null && sameDirectory(dataRoot, currentRoot)
      const previousMigration = readPendingDataMigration()
      // Retire an interrupted automatic move in the opposite direction from the affected release.
      if (rootIsDefault && previousMigration && sameDirectory(previousMigration.from, currentRoot)) clearPendingDataMigration()
      if (legacyRoot !== null && legacyEntries.length > 0 && rootIsDefault && readPendingDataMigration() === null) {
        writePendingDataMigration(legacyRoot, [])
      }
    } catch (error) {
      console.error('the data root of an older install could not be inspected; the app starts on the current data root', error)
    }
    const pending = readPendingDataMigration()
    if (pending && sameDirectory(pending.from, dataRoot)) {
      // Logged, marker untouched: it is the record of the user's choice, and clearing it here would
      // silently drop a folder the settings page is still showing as the pending destination.
      console.warn('the pending data migration source is already the current data root; nothing to move', dataRoot)
    } else if (pending) {
      let copyCommitted = pending.copied
      /*
       * Measure the target drive first and cancel the whole move when it does not fit. A
       * half-finished copy is the worst state: part of the old root is gone, part of the new one
       * is in place, and the marker still stands, so every later launch retries from the middle.
       * Cancelling is a clean no-op — the app falls back to the old root, intact, and the user
       * re-picks after freeing space. Planning is read-only, so the extra pass is cheap.
       */
      try {
        await showDataMigrationWindow()
        // A failed automatic restoration keeps the old data usable and retries on next launch.
        const legacyRoot = legacyDefaultDataRoot()
        const carryOver = legacyRoot !== null && sameDirectory(pending.from, legacyRoot)
          && sameDirectory(dataRoot, defaultDataRoot())
        const plan = await planDataRootMigration(pending.from, dataRoot, pending.extra)
        const required = pending.copied ? 0 : plan.requiredBytes ?? 0
        const available = freeBytesForDirectory(dataRoot)
        if (available !== undefined && required > available) {
          // Cancelling only has to land the next launch on the directory that still holds the
          // data, so the pointer may only be deleted when the app would resolve back to the old
          // root by itself. A root the pointer used to point at has to be written back instead,
          // or the next launch resolves to an empty directory and the data is orphaned.
          //
          if (carryOver) {
            dataRoot = pending.from
            console.error(
              `the carry-over of the data from ${pending.from} was cancelled: `
              + `${Math.round(required / 1_048_576)} MB are needed on the new drive but only `
              + `${Math.round(available / 1_048_576)} MB are free. The app stays on ${dataRoot} and retries next launch.`,
            )
          } else {
            if (sameDirectory(fallbackDataRoot(), pending.from)) clearDataRootPointer()
            else writeDataRootPointer(pending.from)
            clearPendingDataMigration()
            console.error(
              `the data migration was cancelled: ${Math.round(required / 1_048_576)} MB are needed on the new drive but only `
              + `${Math.round(available / 1_048_576)} MB are free. The app stays on ${pending.from}.`,
            )
          }
        } else {
          // The startup dialog remains visible while models and runtimes move.
          console.log('moving app data to the chosen data root before the window opens', pending.from, '->', dataRoot)
          let report = pending.copied ? null : await migrateDataRoot(pending.from, dataRoot, pending.extra, false, false, publishMigrationProgress)
          const copyCompleted = pending.copied || report?.failed.length === 0
          if (copyCompleted) {
            // Persist this BEFORE deleting anything. A cleanup retry must not restore stale settings
            // or models over files the user has since changed at the destination.
            writePendingDataMigration(pending.from, pending.extra, true)
            copyCommitted = true
            report = await migrateDataRoot(pending.from, dataRoot, pending.extra, true, true, publishMigrationProgress)
          }
          if (!report) throw new Error('Data migration produced no result')
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
          else {
            // Copy failures retain the entire source. Removal failures already have a full copy.
            if (carryOver && !copyCompleted) dataRoot = pending.from
            console.error('the data root migration left entries at the old root; it will be retried on the next launch', report.failed)
          }
        }
      } catch (error) {
        if (!copyCommitted && sameDirectory(pending.from, legacyDefaultDataRoot() ?? '')) dataRoot = pending.from
        console.error('the data root migration could not run; the app starts on the current data root', error)
      } finally {
        if (migrationWindow && !migrationWindow.isDestroyed()) migrationWindow.destroy()
        migrationWindow = null
      }
    }
    setSessionDataRoot(dataRoot)
    logDiagnostic('app.data-root.ready', { dataRoot })
    relocateSessionLogs(join(dataRoot, 'logs'))
    const settings = new SettingsStore(join(dataRoot, 'settings.json'))
    const initialSettings = await settings.load()
    if (initialSettings.modelStoragePath) await cleanupStorageCaches(initialSettings.modelStoragePath)
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
      : join(app.getAppPath(), 'vendor', existsSync(join(app.getAppPath(), 'vendor', 'llama', 'llama-server.exe')) ? 'llama'
        : existsSync(join(app.getAppPath(), 'vendor', 'llama-vulkan', 'llama-server.exe')) ? 'llama-vulkan' : 'llama-cpu')
    const runtimes = new RuntimeManager(join(initialSettings.modelStoragePath || dataRoot, 'runtimes'),
      app.isPackaged ? join(process.resourcesPath, 'runtime-catalog.json') : join(app.getAppPath(), 'build', 'runtime-catalog.json'),
      app.isPackaged ? join(process.resourcesPath, 'runtime', 'extract-runtime.ps1') : join(app.getAppPath(), 'scripts', 'extract-runtime.ps1'),
      { baseDirectory: pythonBaseDirectory, recipesPath: app.isPackaged ? join(process.resourcesPath, 'runtime-recipes.json')
        : join(app.getAppPath(), 'build', 'runtime-recipes.json'),
      localLlamaDirectory: bundledLlamaDirectory, network: () => settings.current().network })
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
    }).catch(error => {
      logDiagnostic('runtime.initialize.failed', { error })
      throw error
    })
    const whenRuntimeReady = async (): Promise<void> => {
      await runtimeInitialization
      if (quitting) throw new Error('应用正在退出')
    }
    engine = new EngineProcess({
      resolveLaunchSpec: () => {
        const compute = launchCompute
        const { engine: engineDirectory, llama: llamaDirectory, crisp: crispDirectory } = runtimes.selectedDirectories(compute)
        return {
          ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath,
            managedEngineDirectory: engineDirectory, managedCrispDirectory: crispDirectory }),
          env: { ...resourceEnvironment,
            NOLA_TRANSLATOR_LLAMA_DIR: llamaDirectory ?? '',
            // The main logger receives structured pipeline diagnostics on stderr, keeping one
            // ordered trace without giving multiple processes ownership of file rotation.
            NOLA_TRANSLATOR_RUN_LOG_STDERR: '1',
            NOLA_TRANSLATOR_RECOGNITION_MODEL_ID: (settings.current().recognition.provider ?? 'local') === 'local' ? settings.current().recognition.modelId : '',
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
        NOLA_TRANSLATOR_RUN_LOG_STDERR: '1',
      },
    })
    let sessionActive = false
    engine.on('protocolError', (error: unknown) => console.error('engine protocol failed', error))
    engine.on('state', state => logDiagnostic('engine.state', { state }))
    engine.on('crash', error => { logDiagnostic('engine.crash', error); tray?.failure() })
    let componentInstalling = false
    let sessionStarting = false
    let preparation: Promise<void> | null = null
    const prepareEnvironment = (forStart = false, session?: SessionConfig, cancelled: () => boolean = () => false): Promise<void> => {
      const checkCancelled = () => { if (quitting || cancelled()) throw new Error('sessionStartCancelled') }
      try { checkCancelled() } catch (error) { return Promise.reject(error) }
      if (componentInstalling) return Promise.reject(new Error('组件安装中，请等待完成'))
      // The catalog classifies a cause by its spelling, so this refusal has to name itself the
      // way the catalog spells it. A Chinese sentence normalises to nothing and reads as an
      // unknown failure instead of the session conflict it is.
      if (sessionActive || (sessionStarting && !forStart)) return Promise.reject(new Error('sessionAlreadyRunning'))
      if (preparation) return preparation.catch(() => undefined).then(() => prepareEnvironment(forStart, session, cancelled))
      const compute = { ...(session?.compute ?? settings.current().compute) }
      preparation = (async () => {
        const startedAt = performance.now()
        await whenRuntimeReady()
        checkCancelled()
        const translationSettings = settings.current().translation
        const localRecognition = (session?.recognitionProvider ?? settings.current().recognition.provider ?? 'local') === 'local'
        const provider = session ? session.translationProvider ?? 'local' : translationSettings.provider
        const modelId = session?.translationModelId ?? translationSettings.localModelId
        const usesLocalTranslation = session
          ? session.targetLanguages.length > 0 && (provider === 'local' || session.fallbackTranslationProvider === 'local')
          : translationSettings.targetLanguage !== NO_TRANSLATION_LANGUAGE && (provider === 'local' || translationSettings.fallback.provider === 'local')
        let translation: 'torch' | 'llama' | 'none' = !usesLocalTranslation
          ? 'none' : modelId === 'm2m100-418m' ? 'torch' : 'llama'
        if (localRecognition || usesLocalTranslation) {
          if (engine!.currentState !== 'ready') await engine!.start()
          const resources = await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: `prepare-${randomUUID()}` }, 'resources')
          const recognitionId = session?.recognitionModelId ?? settings.current().recognition.modelId
          const recognitionModel = resources.resources.find(r => r.resourceId === recognitionId)
          const translationModel = resources.resources.find(r => r.resourceId === modelId)
          const recognitionLoader = recognitionModel ? modelEngines(recognitionModel)[0] : undefined
          const translationLoader = translationModel ? modelEngines(translationModel)[0] : undefined
          if (usesLocalTranslation && translationLoader) translation = translationLoader === 'pytorch' ? 'torch' : 'llama'
          if (localRecognition && recognitionLoader) compute.recognitionEngine = recognitionLoader
          if (usesLocalTranslation && translationLoader && translationLoader !== 'crisp') compute.translationEngine = translationLoader
          if (session) {
            if (localRecognition && (!recognitionModel || !supportsSelectedEngine(recognitionModel, compute, recognitionId))) {
              throw new Error('所选识别模型与推理引擎不兼容，请选择匹配的模型格式和引擎')
            }
            if (usesLocalTranslation && (!translationModel || !supportsSelectedEngine(translationModel, compute, modelId))) {
              throw new Error('所选翻译模型与推理引擎不兼容，请选择匹配的模型格式和引擎')
            }
          }
        }
        await runtimes.prepare(compute, translation, localRecognition)
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
        if (session && (localRecognition || translation !== 'none')) {
          const response = await engine!.request({ protocolVersion: 1, type: 'listComputeDevices', requestId: `resolve-${randomUUID()}` }, 'computeDevices', 30_000)
          const hardware = (await runtimes.snapshot()).hardware
          session.compute = { ...compute,
            recognitionDevice: localRecognition && compute.recognitionEngine !== 'crisp' ? resolveDeviceIntent(compute.recognitionDevice, hardware, response.devices, compute.recognitionEngine === 'llama' ? 'llama' : 'torch') : compute.recognitionDevice === 'cpu' ? 'cpu' : 'auto',
            translationDevice: translation === 'none' ? 'auto' : resolveDeviceIntent(compute.translationDevice, hardware, response.devices, translation),
          }
        } else if (session) {
          session.compute = { ...compute, recognitionDevice: 'auto', translationDevice: 'auto' }
        }
        logDiagnostic('runtime.prepare.complete', { durationMs: Math.round(performance.now() - startedAt), translation })
      })().finally(() => { preparation = null })
      return preparation
    }
    disposeRuntimeIpc = registerRuntimeIpc(runtimes, () => mainWindow, async components => {
      if (activity.snapshot().owner || sessionActive || sessionStarting || componentInstalling) throw new Error('sessionAlreadyRunning')
      componentInstalling = true
      try {
        currentDirectories = JSON.stringify(await recheckRuntimeEnvironment(runtimes, engine!, components))
      } finally { componentInstalling = false }
    },
      () => !!activity.snapshot().owner || sessionActive || sessionStarting || componentInstalling, whenRuntimeReady, async (id, repair) => {
        componentInstalling = true
        try {
          await engine!.stop()
          await runtimes.install(id, repair)
        } finally {
          currentDirectories = JSON.stringify(runtimes.selectedDirectories())
          try { await engine!.start() }
          catch (error) { console.error('engine restart after component install failed', error) }
          finally { componentInstalling = false }
        }
      }, async kind => {
        componentInstalling = true
        try {
          await engine!.stop()
          await runtimes.uninstall(kind)
        } finally {
          currentDirectories = JSON.stringify(runtimes.selectedDirectories())
          try { await engine!.start() }
          catch (error) { console.error('engine restart after component uninstall failed', error) }
          finally { componentInstalling = false }
        }
      })
    const getOverlayWindow = (): BrowserWindow => {
      if (!overlayWindow || overlayWindow.isDestroyed()) {
        createOverlayWindow(settings.current().theme, settings.current().overlay)
      }
      return overlayWindow!
    }
    const isOverlayVisible = (): boolean => !!overlayWindow && !overlayWindow.isDestroyed() && (overlayWindow.isVisible() || overlayWindow.isMinimized())
    const createSessionEngine = () => new EngineProcess({
      ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }),
      resolveLaunchSpec: () => {
        const directories = runtimes.selectedDirectories(settings.current().compute)
        return { ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath,
          managedEngineDirectory: directories.engine, managedCrispDirectory: directories.crisp }),
          env: { ...resourceEnvironment, ...gateway!.sessionEnvironment(), NOLA_TRANSLATOR_LLAMA_DIR: directories.llama ?? '', NOLA_TRANSLATOR_RUN_LOG_STDERR: '1' } }
      },
    })
    const desktopEngine = createSessionEngine()
    const browserEngine = createSessionEngine()
    // Business processes capture NOLA_GATEWAY_* at spawn time. Restarting the gateway replaces the
    // private listener and key, so only then does an idle process need to be replaced.
    let sessionEnvironmentKey: string | undefined
    const prepareSession = async (config: SessionConfig, cancelled: () => boolean = () => false) => {
      await whenRuntimeReady()
      if (componentInstalling) throw new Error('Runtime installation is in progress')
      await gateway!.prepareSession(config)
      if (cancelled()) throw new Error('sessionStartCancelled')
      const key = gateway!.sessionEnvironment().NOLA_GATEWAY_KEY ?? ''
      if (key !== sessionEnvironmentKey) {
        sessionEnvironmentKey = key
        // A gateway teardown already stopped both controllers, so neither process owns a session here.
        await Promise.all([desktopEngine, browserEngine].map(engine => engine.currentState === 'ready' ? engine.stop() : undefined))
      }
      if (cancelled()) throw new Error('sessionStartCancelled')
    }
    const sessions = new SessionController({ engine: desktopEngine, audioTestEngine: engine, meetings, activity, useGateway: true, getSettings: () => settings.current(), getCredential: provider => credentials.get(provider), prepare: (config, cancelled) => prepareSession(config, cancelled), whenReady: whenRuntimeReady, startingChanged: starting => { sessionStarting = starting }, showOverlay: () => getOverlayWindow().showInactive(), hideOverlay: () => { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide() }, isOverlayVisible })
    const browserSessions = new SessionController({ engine: browserEngine, meetings: null, activity, useGateway: true,
      getSettings: () => settings.current(), getCredential: provider => credentials.get(provider),
      prepare: (config, cancelled) => prepareSession(config, cancelled), whenReady: whenRuntimeReady,
      startingChanged: () => {}, showOverlay: () => {}, hideOverlay: () => {} })
    browserEngine.on('event', event => browserSessions.handleEvent(event))
    browserEngine.on('state', state => { if (state === 'failed' || state === 'recovering') browserSessions.releaseOnLoss() })
    stopSessions = async () => {
      await Promise.all([sessions.stopCurrent(), browserSessions.stopCurrent()])
      await Promise.all([desktopEngine.stop(), browserEngine.stop()])
    }
    const offline = new OfflineManager({
      python: createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath }).command,
      modelRoot: resourceEnvironment.NOLA_TRANSLATOR_MODEL_DIR,
      runtimeRoot: runtimes.directory,
      appVersion: app.getVersion(), runtimes,
      network: () => settings.current().network,
      diagnostic: logDiagnostic,
      models: (request, signal, progress) => {
        const directories = runtimes.selectedDirectories(settings.current().compute)
        const spec = createEngineLaunchSpec({
          isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath,
          managedEngineDirectory: directories.engine, managedCrispDirectory: directories.crisp,
          module: 'nola_translator_engine.offline_models',
        })
        return runOfflineModelWorker({ ...spec, env: { ...resourceEnvironment,
          NOLA_TRANSLATOR_LLAMA_DIR: directories.llama ?? bundledLlamaDirectory,
        } }, request, signal, progress)
      },
      reserve: () => {
        if (activity.snapshot().owner || sessions.busy || componentInstalling || preparation) throw new Error('sessionAlreadyRunning')
        componentInstalling = true
        return async () => {
          try {
            await runtimes.recheck()
            currentDirectories = JSON.stringify(runtimes.selectedDirectories(launchCompute))
            if (!quitting) await engine!.start()
          } finally { componentInstalling = false }
        }
      },
      beforeInstall: async () => {
        if (engine!.currentState === 'ready') {
          const resources = await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: `offline-check-${randomUUID()}` }, 'resources')
          if (resources.resources.some(resource => resource.state === 'running' || resource.state === 'paused' || resource.state === 'cancelling')) throw new Error('resourceBusy')
        }
        await engine!.stop()
      },
    })
    disposeOfflineIpc = registerOfflineIpc(offline, () => mainWindow, whenRuntimeReady)
    disposeIpc = registerEngineIpc(
      engine,
      getOverlayWindow,
      (provider) => credentials.get(provider),
      meetings,
      () => settings.current(),
      config => prepareEnvironment(true, config),
      starting => { sessionStarting = starting },
      whenRuntimeReady,
      () => { sessionActive = false },
      sessions,
      config => browserConnection!.prepareCaptionService(config),
      resourceId => gateway?.resourceInUse(resourceId) ?? false,
    )
    browserConnection = new BrowserConnection({ engine: browserEngine, sessions: browserSessions, activity, useGateway: true, integrations: new BrowserIntegrations({ localAppData: process.env.LOCALAPPDATA ?? app.getPath('userData'), userData: app.getPath('userData') }), getSettings: () => settings.current(), setEnabled: async enabled => {
      const saved = await settings.update({ browserConnection: { enabled } })
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('settings:changed', saved)
    } })
    void browserConnection.initialize(initialSettings.browserConnection.enabled).catch(error => console.error('browser connection initialization failed', error))
    closeBehavior = () => settings.current().closeBehavior
    // These handlers must be registered before the first window exists: the renderer asks for
    // both snapshots as soon as it mounts, and an invoke that wins the race against late
    // registration is rejected by Electron with "No handler registered".
    const directLaunch = async (model: string, options: { requiresImages?: boolean } = {}) => {
        await whenRuntimeReady()
        const compute = { ...settings.current().compute }
        if (model.startsWith('resource:')) {
          if (componentInstalling) throw new Error('Runtime installation is in progress')
          if (engine!.currentState !== 'ready') await engine!.start()
          const inventory = await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: randomUUID() }, 'resources')
          const resourceId = model.slice(9)
          const resource = inventory.resources.find(item => item.resourceId === resourceId)
          if (!resource) throw new Error('Selected model is not installed')
          const modelWeightBytes: Record<string, number> = {
            'index-translate-2b-q4-k-m': 1_312_164_352,
            'index-translate-9b-q4-k-m': 5_780_090_304,
            'index-translate-35b-a3b-q4-k-m': 21_713_462_400,
          }
          const legacyVisionModel = INDEX_TRANSLATE_MODEL_IDS.includes(resourceId as typeof INDEX_TRANSLATE_MODEL_IDS[number]) &&
            !resource.installed && (modelWeightBytes[resourceId] ?? Number.MAX_SAFE_INTEGER) <= resource.installedBytes
          if (legacyVisionModel && options.requiresImages) {
            if (resource.state === 'idle') {
              await engine!.request({ protocolVersion: 1, type: 'manageResource', requestId: randomUUID(), resourceId,
                action: 'install', network: await resolveModelNetwork(settings.current().network) }, 'resourceActionResult')
            }
            if (resource.state === 'failed') throw new Error('NOLA_IMAGE_PROJECTOR_DOWNLOAD_FAILED')
            throw new Error('NOLA_IMAGE_PROJECTOR_DOWNLOAD_STARTED')
          }
          if (!resource.installed && !legacyVisionModel) throw new Error('Selected model is not installed')
          const loader = modelEngines(resource)[0]
          if (resource.kind === 'translationModel' && loader !== 'crisp') compute.translationEngine = loader
          else if (loader) compute.recognitionEngine = loader
        }
        const directories = runtimes.selectedDirectories(compute)
        return { ...createEngineLaunchSpec({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath,
          managedEngineDirectory: directories.engine, managedCrispDirectory: directories.crisp, module: 'nola_translator_engine.local_call' }),
          env: { ...resourceEnvironment, NOLA_TRANSLATOR_LLAMA_DIR: directories.llama ?? '', NOLA_TRANSLATOR_RUN_LOG_STDERR: '1' } }
    }
    let gatewayLease: FeatureLease | null = null
    let gatewayStarting: Promise<unknown> | null = null
    const stopGateway = async () => {
      const pending = gatewayStarting
      if (browserSessions.usesLocalModels) await browserConnection?.stopCaptionService()
      await Promise.all([sessions, browserSessions].filter(controller => controller.usesLocalModels).map(controller => controller.stopCurrent()))
      await gateway!.stop()
      if (pending) await pending.catch(() => undefined)
      gatewayLease?.release()
      gatewayLease = null
    }
    const failedServices = new Set<string>()
    gateway = new ModelGateway({
      getSettings: () => settings.current(), directLaunch,
      listResources: async () => {
        await whenRuntimeReady()
        if (engine!.currentState !== 'ready') await engine!.start()
        return (await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: randomUUID() }, 'resources')).resources
      },
      getCredential: provider => credentials.get(provider),
      getKey: () => credentials.get('model-gateway'), setKey: value => credentials.set('model-gateway', value),
      onChanged: snapshot => {
        for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('model-gateway:changed', snapshot)
        if (snapshot.state === 'failed' || snapshot.state === 'stopped') { gatewayLease?.release(); gatewayLease = null }
        let serviceFailed = false
        for (const [kind, service] of Object.entries(snapshot.services)) {
          if (service.state === 'failed') { if (!failedServices.has(kind)) serviceFailed = true; failedServices.add(kind) }
          else failedServices.delete(kind)
        }
        if (snapshot.state === 'failed' || serviceFailed) tray?.failure()
      },
    })
    loggedHandle('feature-activity:snapshot', event => { assertFeatureSender(event); return activity.snapshot() })
    loggedHandle('feature-activity:stop', event => { assertFeatureSender(event); return activity.stop() })
    loggedHandle('model-gateway:status', () => gateway!.snapshotWithCatalog())
    loggedHandle('model-gateway:start', async event => {
      assertFeatureSender(event, true)
      if (activity.has('model-gateway') && gateway!.snapshot().state === 'running') return gateway!.snapshot()
      const lease = activity.acquire('model-gateway', stopGateway)
      gatewayLease = lease
      const task = gateway!.start()
      gatewayStarting = task
      try { const snapshot = await task; lease.running(); return snapshot }
      catch (error) { lease.release(); throw error }
      finally { if (gatewayStarting === task) gatewayStarting = null }
    })
    loggedHandle('model-gateway:stop', async event => { assertFeatureSender(event, true); await stopGateway(); return gateway!.snapshot() })
    loggedHandle('model-gateway:reveal-key', event => { assertFeatureSender(event, true); return gateway!.revealKey() })
    loggedHandle('model-gateway:rotate-key', event => { assertFeatureSender(event, true); return gateway!.rotateKey() })
    createMainWindow(initialSettings.theme)
    disposeAppIpc = registerAppIpc({
      isDevelopmentWindow: isWorkbenchWindow,
      settings,
      initialSettings,
      beforeSettingsChange: patch => gateway?.assertSettingsChange(patch),
      settingsChanged: async () => {
        tray?.refresh()
        if (!gateway) return
        if (gateway.snapshot().state === 'running') await gateway.reconfigure()
        const snapshot = await gateway.snapshotWithCatalog()
        for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send('model-gateway:changed', snapshot)
      },
      meetings,
      audioProtocol: `${MEETING_AUDIO_SCHEME}://`,
      credentials,
      engine,
      getOverlayWindow,
      getMainWindow: () => mainWindow,
      getWorkspaceWindow: () => workspaceWindow,
      showWorkspace: async () => {
        if (!workspaceWindow || workspaceWindow.isDestroyed()) createWorkspaceWindow(settings.current().theme)
        await workspaceReady
        if (workspaceWindow?.isMinimized()) workspaceWindow.restore()
        workspaceWindow?.show()
        workspaceWindow?.focus()
      },
    })
    desktopEngine.on('event', (event) => {
      if (event.type === 'sessionStarted') sessionActive = true
      if (event.type === 'sessionStopped') sessionActive = false
      if (event.type === 'caption' && event.segment.isFinal && !sessions.isBrowserEvent(event)) {
        void meetings.append(event.sessionId, event.segment).catch((error) =>
          console.error('meeting transcript write failed', error),
        )
      }
    })
    // A stopped engine owns no session, so the flag has to clear with it. Without this a
    // session that failed to stop leaves the flag set, and every later start is refused.
    desktopEngine.on('state', state => { if (state === 'failed' || state === 'recovering' || state === 'stopped') sessionActive = false })
    createWorkspaceWindow(initialSettings.theme)
    const workbench = registerWorkbench(() => settings.current().theme, __dirname, undefined, {
      getSettings: () => settings.current(), getCredential: provider => credentials.get(provider),
      workspace: new AgentWorkspace(join(dataRoot, 'local-call')),
      listDirectModels: async () => {
        const snapshot = await gateway!.snapshotWithCatalog()
        return Object.values(snapshot.availableModels ?? {}).flat().map(model => ({ model: model.binding, name: model.name, kind: model.kind }))
      },
      inferModel: (request, signal, inspect) => gateway!.infer(request, signal, inspect),
      acquireLanguageModel: binding => gateway!.acquireLanguageModel(binding),
      releaseDirectModel: async () => {},
    }, activity)
    stopWorkbench = () => workbench.stop()
    stopOnboardingCard = registerOnboardingCard(() => settings.current().theme, __dirname, () => mainWindow).stop
    requestQuit = () => {
      if (activity.snapshot().owner) { showMainWindow(); mainWindow?.webContents.send('app:quit-requested') }
      else app.quit()
    }
    loggedHandle('app:request-quit', event => { assertFeatureSender(event); requestQuit() })
    loggedHandle('app:confirm-quit', event => {
      assertFeatureSender(event, true)
      if (mainWindow && event.sender === mainWindow.webContents) app.quit()
    })
    tray = new NolaTray({ getSettings: () => settings.current(), getWindow: () => mainWindow, getActivity: () => activity.snapshot(), show: showMainWindow, stop: () => activity.stop(), quit: () => requestQuit() })
    await tray.initialize()
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
      if (!mainWindow || mainWindow.isDestroyed()) createMainWindow(settings.current().theme)
      showMainWindow()
    })
  }).catch(error => { console.error('application startup failed', error); app.quit() })
}

app.on('window-all-closed', () => { if (quitting) app.quit() })
app.on('before-quit', (event) => {
  if (quitting || !engine) return
  event.preventDefault()
  quitting = true
  disposeIpc?.()
  disposeAppIpc?.()
  disposeRuntimeIpc?.()
  tray?.dispose()
  stopOnboardingCard?.()
  void Promise.allSettled([gateway?.dispose(), stopWorkbench?.(), stopSessions?.(), browserConnection?.dispose(), disposeOfflineIpc?.()])
    .finally(() => engine!.stop())
    .catch((error) => console.error('engine shutdown failed', error))
    .finally(() => app.quit())
    .catch((error) => console.error('application quit failed', error))
})
