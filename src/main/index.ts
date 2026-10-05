import { translationEngine } from '../shared/model-engines'
import { resolveDeviceIntent } from '../shared/device-selection'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

import { app, BrowserWindow, safeStorage, screen, shell } from 'electron'

import type { AppSettings, OverlaySettings } from '../shared/settings'
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
    // The app's own stores resolve from the single data root, not from `userData`: `userData` is
    // left as Chromium's disposable state and survives here only as the destination of the
    // FluentCaptions -> Nola rename migration, which is a product rename rather than a data-root
    // change. See `data-root.ts` for why the two must stay apart.
    const userData = app.getPath('userData')
    await migrateLegacyUserData(app.getPath('appData'), userData)
    const dataRoot = resolveDataRoot()
    // A data-root change is carried out here, before a single store is constructed, because this is
    // the one moment the tree has no open handles: the meeting store has not mapped an audio file
    // yet and `credentials.json` is untouched. The marker itself was written by the settings
    // handler, which deliberately moves nothing while the app is running.
    //
    // **Nothing in this step may stop startup.** A rejection here would abort the `whenReady` chain
    // before `createMainWindow`, and an app that never opens is a far worse outcome than a data root
    // that did not finish moving — the same trade `migrateLegacyUserData` makes one line above.
    const pending = readPendingDataMigration()
    // Both sides already come out of `normalize` inside `data-root.ts`; this only folds case and a
    // trailing separator, so the same folder written two ways cannot look like a move onto itself.
    const sameDirectory = (left: string, right: string): boolean =>
      left.replace(/[\\/]+$/, '').toLowerCase() === right.replace(/[\\/]+$/, '').toLowerCase()
    if (pending && sameDirectory(pending.from, dataRoot)) {
      // Logged, marker untouched: it is the record of the user's choice, and clearing it here would
      // silently drop a folder the settings page is still showing as the pending destination.
      console.warn('the pending data migration source is already the current data root; nothing to move', dataRoot)
    } else if (pending) {
      /*
       * 先量目标盘装不装得下，**装不下就整件事撤销**，而不是搬一半。
       *
       * 半途 ENOSPC 是这一整条链上最坏的状态：旧根已被删掉一部分、新根只搬进去一部分，
       * 而标记还在，于是每次启动都重试、永远停在中间态。撤销则是一个干净的无操作 ——
       * 删掉指针，应用回到旧根，数据完整；用户腾出空间后重新选一次目录即可。
       *
       * `planDataRootMigration` 只读不写，多走一遍 stat 的代价可以忽略，而它换来的是把
       * 「永久卡住」降级成「重来一次」。
       */
      try {
        const plan = await planDataRootMigration(pending.from, dataRoot, pending.extra)
        const required = plan.requiredBytes ?? 0
        const available = freeBytesForDirectory(dataRoot)
        if (available !== undefined && required > available) {
          /*
           * 撤销的目标只有一个：**下次启动落回数据还在的那个目录**。所以能不能直接删指针，
           * 取决于"没有指针时会解析到哪"，而旧根只有三种来历：
           *
           *   1. 默认安装目录 → 删掉指针后 `fallbackDataRoot()` 还是它（`userData` 里没有应用
           *      数据）。删指针，保持"默认安装不带指针文件"这个不变式，`data-root.ts` 里的其它
           *      判断都建立在它上面。
           *   2. Electron `userData` → 删掉指针后 `existingUserDataRoot()` 认得出它，同样安全。
           *   3. **用户之前用指针自己选过的目录**（先搬到 D，后来又改选 E）→ 删掉指针后
           *      `userData` 里没有应用数据（早就搬走了）、安装目录里也没有，下次启动会解析到
           *      一个空目录，用户的设置、会议记录和 API key 留在 D 上，再没有任何东西指向它，
           *      而下面这行日志还会说"app 留在旧根"。这种来历必须把指针写回旧根。
           *
           * 撤销只负责"回到原处"，不负责腾地方，所以两种来历都照旧清标记、照旧报这一行。
           */
          if (sameDirectory(fallbackDataRoot(), pending.from)) clearDataRootPointer()
          else writeDataRootPointer(pending.from)
          clearPendingDataMigration()
          console.error(
            `the data migration was cancelled: ${Math.round(required / 1_048_576)} MB are needed on the new drive but only `
            + `${Math.round(available / 1_048_576)} MB are free. The app stays on ${pending.from}.`,
          )
        } else {
          // Expect this to take a while (the runtimes in `build/runtime-catalog.json` total roughly
          // 687 MB). There is no progress UI for it: it runs before the window exists, and a single
          // line is the whole report a user can act on.
          console.log('moving app data to the chosen data root before the window opens', pending.from, '->', dataRoot)
          const report = await migrateDataRoot(pending.from, dataRoot, pending.extra)
          const bytes = report.requiredBytes ?? 0
          console.log('data root migration finished', {
            copied: report.copied.length, skipped: report.skipped.length,
            failed: report.failed.length, removed: report.removed.length,
            bytes, megabytes: Math.round(bytes / 1_048_576),
          })
          // **The marker is cleared only when nothing failed.** A failed entry is still sitting at the
          // old root, and a cleared marker is the one outcome that strands it there for good: the next
          // launch has nothing left to retry from. Leaving the marker costs only a repeated pass, and
          // the copy is idempotent, so it is the safe direction to fail in.
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
    // Register IPC and load the windows synchronously before starting the slow child-process
    // probes. Only calls that need the environment wait for this shared initialization.
    const runtimeInitialization = Promise.resolve().then(async () => {
      await runtimes.initialize()
      // Preserve a disconnected custom drive's configured path instead of falling back to C:.
      await mkdir(resourceEnvironment.TMP, { recursive: true }).catch((error) => console.error('model storage is unavailable', error))
      try { currentDirectories = JSON.stringify(runtimes.selectedDirectories(launchCompute)) } catch { /* Settings remain accessible for repair. */ }
    })
    const whenRuntimeReady = async (): Promise<void> => {
      await runtimeInitialization
      if (quitting) throw new Error('应用正在退出')
    }
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
      },
    })
    let sessionActive = false
    let sessionStarting = false
    let preparation: Promise<void> | null = null
    const prepareEnvironment = (forStart = false, session?: SessionConfig): Promise<void> => {
      if (sessionActive || (sessionStarting && !forStart)) return Promise.reject(new Error('请先停止同传，再应用计算环境'))
      if (preparation) return preparation.then(() => prepareEnvironment(forStart, session))
      const compute = { ...(session?.compute ?? settings.current().compute) }
      preparation = (async () => {
        await whenRuntimeReady()
        const translationSettings = settings.current().translation
        const provider = session ? session.translationProvider ?? 'local' : translationSettings.provider
        const modelId = session?.translationModelId ?? translationSettings.localModelId
        let translation: 'torch' | 'llama' | 'none' = provider !== 'local' || (session && !session.targetLanguages.length)
          ? 'none' : modelId === 'm2m100-418m' ? 'torch' : 'llama'
        if (translation !== 'none' && engine!.currentState === 'ready') {
          try {
            const resources = await engine!.request({ protocolVersion: 1, type: 'listResources', requestId: `prepare-${randomUUID()}` }, 'resources')
            const model = resources.resources.find(r => r.resourceId === modelId)
            if (model) translation = model.provider === 'm2m100' ? 'torch' : 'llama'
          } catch { /* Preparation can repair a failed engine without depending on its reply. */ }
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
        const next = JSON.stringify(runtimes.selectedDirectories(compute))
        launchCompute = compute
        if (next !== currentDirectories) {
          await engine!.stop()
          await engine!.start()
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
    disposeIpc = registerEngineIpc(
      engine,
      () => overlayWindow,
      (provider) => credentials.get(provider),
      meetings,
      () => settings.current(),
      config => prepareEnvironment(true, config),
      starting => { sessionStarting = starting },
      whenRuntimeReady,
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
      if (event.type === 'sessionStarted') sessionActive = true
      if (event.type === 'sessionStopped') sessionActive = false
      if (event.type === 'caption' && event.segment.isFinal) {
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
  void engine.stop().finally(() => app.quit())
})
