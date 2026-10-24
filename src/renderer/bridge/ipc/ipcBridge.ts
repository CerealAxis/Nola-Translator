/**
 * The real `NolaBridge`, a thin adapter over `window.nolaTranslator` as injected
 * by `src/preload/index.ts`. Which preload method backs each one is in
 * `BRIDGE_TIERS` / `BRIDGE_ADAPTER_NOTES`; a method with no channel rejects
 * rather than no-ops, since a search that returned `[]` reads as working.
 */

import type { NolaBridge, RouteId } from '../contract'
import type { NolaTranslatorApi } from '../../../shared/bridge'
import type {
  AppSettings,
  AppSettingsPatch,
  AudioDevice,
  CaptionSegment,
  ExportFormat,
  MeetingMeta,
  OverlayTargetPage,
  ResourceRecord,
  ResourceSnapshotWithRate,
  SessionConfig,
  SessionStartResult,
} from '../types'

/**
 * The overlay says which page it wants; the app says which route. The two
 * vocabularies do not contain each other, so the mapping is written out — a
 * `RouteId` silently cast to `undefined` leaves the window on its old page. The
 * tab travels too: a bare `settings` normalizes to `#/settings/general`.
 */
const OVERLAY_PAGE_TO_ROUTE: Record<OverlayTargetPage, { route: RouteId; path: string }> = {
  appearance: { route: 'settings', path: '#/settings/appearance' },
  captions: { route: 'overlay', path: '#/overlay' },
  resources: { route: 'models', path: '#/models' },
  translation: { route: 'settings', path: '#/settings/translation' },
  torch: { route: 'settings', path: '#/settings/compute?component=engine' },
  llama: { route: 'settings', path: '#/settings/compute?component=llama' },
  crisp: { route: 'settings', path: '#/settings/compute?component=crisp' },
}

class MissingIpcApiError extends Error {
  constructor(method: string) {
    super(`window.nolaTranslator is not available — ${method} 需要 Electron preload 注入的 IPC 桥接`)
    this.name = 'MissingIpcApiError'
  }
}

/** The only place this file reads `window.nolaTranslator`; `?? undefined` keeps one falsy check (`!injected`) sufficient below. */
function injectedApi(): NolaTranslatorApi | undefined {
  if (typeof window === 'undefined') return undefined
  return window.nolaTranslator ?? undefined
}

/**
 * Whether a bridge exists at all — the single test for "is there an engine
 * behind this". `initStores` and the banner in `main.tsx` both ask it rather
 * than reading `window` themselves, so the two cannot disagree.
 */
export function isIpcBridgeAvailable(): boolean {
  return injectedApi() !== undefined
}

/**
 * One report per method name. Several stores subscribe to the same event
 * method, so without this the console says the same sentence once per
 * subscription.
 */
const reportedMissingMethods = new Set<string>()

function reportMissingIpcApi(method: string): void {
  if (reportedMissingMethods.has(method)) return
  reportedMissingMethods.add(method)
  console.error('[nola] IPC 桥接缺失', new MissingIpcApiError(method))
}

/**
 * Reads the API at call time rather than module load, so a late preload
 * injection is not a hard failure. With no bridge, reject with the method name:
 * a bare "engine unavailable" says nothing when a dozen calls can fail.
 */
function call<T>(method: keyof NolaTranslatorApi, run: (injected: NolaTranslatorApi) => Promise<T>): Promise<T> {
  const injected = injectedApi()
  if (!injected) return Promise.reject(new MissingIpcApiError(String(method)))
  return run(injected)
}

/**
 * With no bridge, a subscription reports once and hands back an empty
 * unsubscribe, so the caller's teardown path has something to call.
 */
function subscribe<T>(method: keyof NolaTranslatorApi, run: (injected: NolaTranslatorApi) => (listener: (value: T) => void) => () => void, listener: (value: T) => void): () => void {
  const injected = injectedApi()
  if (!injected) {
    reportMissingIpcApi(String(method))
    return () => undefined
  }
  return run(injected)(listener)
}

export function createIpcBridge(): NolaBridge {
  return {
    requestQuit: () => call('requestQuit', api => api.requestQuit?.() ?? Promise.reject(new MissingIpcApiError('requestQuit'))),
    confirmQuit: () => call('confirmQuit', api => api.confirmQuit?.() ?? Promise.reject(new MissingIpcApiError('confirmQuit'))),
    onQuitRequested: cb => injectedApi()?.onQuitRequested?.(cb) ?? (() => undefined),
    gateway: {
      snapshot: () => call('gateway', api => api.gateway?.snapshot() ?? Promise.reject(new MissingIpcApiError('gateway.snapshot'))),
      start: () => call('gateway', api => api.gateway?.start() ?? Promise.reject(new MissingIpcApiError('gateway.start'))),
      stop: () => call('gateway', api => api.gateway?.stop() ?? Promise.reject(new MissingIpcApiError('gateway.stop'))),
      revealKey: () => call('gateway', api => api.gateway?.revealKey() ?? Promise.reject(new MissingIpcApiError('gateway.revealKey'))),
      rotateKey: () => call('gateway', api => api.gateway?.rotateKey() ?? Promise.reject(new MissingIpcApiError('gateway.rotateKey'))),
      onChanged: cb => subscribe('gateway', api => api.gateway?.onChanged ?? (() => () => undefined), cb),
    },
    activity: {
      snapshot: () => call('activity', api => api.activity?.snapshot() ?? Promise.reject(new MissingIpcApiError('activity.snapshot'))),
      stop: () => call('activity', api => api.activity?.stop() ?? Promise.reject(new MissingIpcApiError('activity.stop'))),
      onChanged: cb => subscribe('activity', api => api.activity?.onChanged ?? (() => () => undefined), cb),
    },
    offline: {
      selectModel: (kind, repo, path) => call('offline', api => api.offline?.selectModel(kind, repo, path) ?? Promise.reject(new MissingIpcApiError('offline.selectModel'))),
      selectDestination: path => call('offline', api => api.offline?.selectDestination(path) ?? Promise.reject(new MissingIpcApiError('offline.selectDestination'))),
      selectBundle: () => call('offline', api => api.offline?.selectBundle() ?? Promise.reject(new MissingIpcApiError('offline.selectBundle'))),
      prepare: (request, destination) => call('offline', api => api.offline?.prepare(request, destination) ?? Promise.reject(new MissingIpcApiError('offline.prepare'))),
      install: token => call('offline', api => api.offline?.install(token) ?? Promise.reject(new MissingIpcApiError('offline.install'))),
      snapshot: () => call('offline', api => api.offline?.snapshot() ?? Promise.reject(new MissingIpcApiError('offline.snapshot'))),
      cancel: () => call('offline', api => api.offline?.cancel() ?? Promise.reject(new MissingIpcApiError('offline.cancel'))),
      openOutput: () => call('offline', api => api.offline?.openOutput() ?? Promise.reject(new MissingIpcApiError('offline.openOutput'))),
    },
    runtimes: {
      openSettings: component => call('openRuntimeSettings', injected => injected.openRuntimeSettings(component)),
      list: () => call('getRuntimes', (injected) => injected.getRuntimes()),
      prepare: (components) => call('prepareRuntimes', (injected) => injected.prepareRuntimes(components)),
      install: (id, repair) => call('installRuntime', (injected) => injected.installRuntime(id, repair)),
      uninstall: (kind) => call('uninstallRuntime', (injected) => injected.uninstallRuntime(kind)),
      import: () => call('importRuntime', (injected) => injected.importRuntime()),
      cancel: () => call('cancelRuntimeInstall', (injected) => injected.cancelRuntimeInstall()),
    },
    engine: {
      listComputeDevices: () => call('listComputeDevices', (injected) => injected.listComputeDevices()),
      listDevices: () => call('listDevices', (injected) => injected.listDevices()),
      testAudio: source => call('testAudio', injected => injected.testAudio(source)),
      listResources: () => call('listResources', (injected) => injected.listResources() as Promise<ResourceSnapshotWithRate>),
      manageResource: (resourceId, action, source) => call('manageResource', (injected) => injected.manageResource(resourceId, action, source)),
      startSession: (config) => call('startSession', (injected) => injected.startSession(config)) as Promise<SessionStartResult>,
      /*
       * No payload crosses this call: the main process builds the prewarm config from
       * settings, because the engine caches loaded weights under the compute options and
       * a second copy of those options would miss that cache.
       */
      prewarmModels: () => call('prewarmModels', (injected) => injected.prewarmModels()),
      ensureEngineReady: () => call('ensureEngineReady', (injected) => injected.ensureEngineReady()),
      stopSession: (sessionId) => call('stopSession', (injected) => injected.stopSession(sessionId)),
      /**
       * Pause/resume goes through preload's `setSessionPaused` and returns a
       * synchronous void: the UI's pause means "stop the clock now", and waiting
       * for the engine makes the button look dead. A refusal arrives as an
       * `error` event.
       */
      setPaused: (sessionId, paused) => {
        const injected = injectedApi()
        if (!injected) {
          reportMissingIpcApi('setSessionPaused')
          return
        }
        void injected.setSessionPaused(sessionId, paused).catch(() => undefined)
      },
      /*
       * Read-only current state; name and semantics already match the main
       * process, so the adapter translates nothing. With no bridge this takes
       * `call()`'s `MissingIpcApiError` rather than a plausible-looking value.
       */
      getEngineState: () => call('getEngineState', (injected) => injected.getEngineState()),
    },
    overlay: {
      openMenu: request => call('openOverlayMenu', injected => injected.openOverlayMenu(request)),
      presentMenu: id => call('presentOverlayMenu', injected => injected.presentOverlayMenu(id)),
      closeMenu: id => call('closeOverlayMenu', injected => injected.closeOverlayMenu(id)),
      show: () => call('showOverlay', (injected) => injected.showOverlay()),
      hide: () => call('hideOverlay', (injected) => injected.hideOverlay()),
      close: () => call('closeOverlay', (injected) => injected.closeOverlay()),
      minimize: () => call('minimizeOverlay', (injected) => injected.minimizeOverlay()),
      resize: (width, height) => call('resizeOverlay', (injected) => injected.resizeOverlay(width, height)),
      setLocked: (locked) => call('setOverlayLocked', (injected) => injected.setOverlayLocked(locked)),
    },
    settings: {
      browserConnection: (action, enabled, browser) => call('browserConnection', api => api.browserConnection ? api.browserConnection(action, enabled, browser) : Promise.reject(new MissingIpcApiError('browserConnection'))),
      /*
       * The gate, forwarded with its argument untouched and its answer forwarded whole:
       * `BrowserConnectionStatus` is where both the gate and the live session id live, so a
       * separate boolean would be a second source of truth to drift from it.
       */
      setCaptionService: (active) => call('setCaptionService', (injected) => injected.setCaptionService(active)),
      get: () => call('getSettings', (injected) => injected.getSettings()),
      update: (patch) => call('updateSettings', (injected) => injected.updateSettings(patch)),
    },
    storage: {
      get: () => call('getModelStorage', (injected) => injected.getModelStorage()),
      choose: () => call('chooseModelStorageDirectory', (injected) => injected.chooseModelStorageDirectory()),
      restartApp: () => call('restartApp', (injected) => injected.restartApp()),
    },
    meetings: {
      list: () => call('listMeetings', (injected) => injected.listMeetings()),
      get: (id) => call('getMeeting', (injected) => injected.getMeeting(id)),
      read: (id) => call('readMeeting', (injected) => injected.readMeeting(id)),
      rename: (id, title) => call('renameMeeting', (injected) => injected.renameMeeting(id, title)),
      setNotes: (id, notes) => call('setMeetingNotes', (injected) => injected.setMeetingNotes(id, notes)),
      remove: (id) => call('deleteMeeting', (injected) => injected.deleteMeeting(id)),
      /**
       * The main process writes the file and returns its path; the UI opens it
       * from there.
       */
      export: (id, format) => call('exportMeeting', (injected) => injected.exportMeeting(id, format)),
      audioUrl: (id) => call('getMeetingAudioUrl', (injected) => injected.getMeetingAudioUrl(id)),
    },
    diagnostics: {
      get: () => call('getDiagnostics', (injected) => injected.getDiagnostics()),
      copy: (context) => call('copyDiagnostics', (injected) => injected.copyDiagnostics(context)),
      openLogs: () => call('openLogs', (injected) => injected.openLogs()),
    },
    app: {
        agentWorkspace: action => call('agentWorkspace', injected => {
          if (!injected.agentWorkspace) throw new Error('Agent workspace unavailable')
          return injected.agentWorkspace(action)
        }),
        directModel: (request, inspect) => call('directModel', injected => {
          if (!injected.directModel) throw new Error('Direct model runtime unavailable')
          return injected.directModel(request, inspect)
        }),
      cancelLanguageModel: id => call('cancelLanguageModel', injected => injected.cancelLanguageModel?.(id) ?? Promise.resolve()),
      streamLanguageModel: request => call('streamLanguageModel', injected => {
        if (!injected.streamLanguageModel) throw new Error('Language model streaming unavailable')
        return injected.streamLanguageModel(request)
      }),
      onLanguageModelStream: callback => {
        const api = injectedApi()
        if (!api?.onLanguageModelStream) throw new Error('Language model streaming unavailable')
        return api.onLanguageModelStream(callback)
      },
      openWorkbench: surface => call('openWorkbench', injected => {
        if (!injected.openWorkbench) throw new Error('Workbench is unavailable')
        return injected.openWorkbench(surface)
      }),
      showWorkspace: () => call('showWorkspace', injected => injected.showWorkspace()),
      openMainPage: path => call('openMainPage', injected => injected.openMainPage(path)),
      // No payload and no translation: the main process resolves the user's default browser
      // itself, so nothing about *which* browser crosses this boundary.
      openDefaultBrowser: () => call('openDefaultBrowser', (injected) => injected.openDefaultBrowser()),
      checkLatestRelease: (force) => call('checkLatestRelease', (injected) => injected.checkLatestRelease(force)),
      openReleasePage: (url) => call('openReleasePage', (injected) => injected.openReleasePage(url)),
    },
    translation: {
      hasCredential: (provider) => call('hasTranslationCredential', (injected) => injected.hasTranslationCredential(provider)),
      setCredential: (provider, value) => call('setTranslationCredential', (injected) => injected.setTranslationCredential(provider, value)),
    },
    events: {
      onMainPageRequested: cb => injectedApi()?.onMainPageRequested?.(cb) ?? (() => undefined),
      onOverlayMenuChanged: cb => subscribe('onOverlayMenuChanged', injected => injected.onOverlayMenuChanged, cb),
      onEngineEvent: (cb) => subscribe('onEngineEvent', (injected) => injected.onEngineEvent, cb),
      onSettingsChanged: (cb) => subscribe('onSettingsChanged', (injected) => injected.onSettingsChanged, cb),
      /**
       * Different payload: the main process sends `OverlayTargetPage`, the UI
       * uses a `RouteId` plus the target hash — a bare `settings` cannot tell
       * appearance from translation. Listened for in the main window, which is
       * the document that owns the hash router.
       */
      onOverlayRequest: (cb) => subscribe('onOpenAppearance', (injected) => injected.onOpenAppearance, (page) => {
        const target = OVERLAY_PAGE_TO_ROUTE[page]
        cb(target.route, target.path)
      }),
      onOverlayLockChanged: (cb) => subscribe('onOverlayLockChanged', (injected) => injected.onOverlayLockChanged, cb),
    },
    models: {
      configureModel: (resourceId, configuration) => call('configureModel', injected => injected.configureModel(resourceId, configuration)),
      /*
       * All three Hub methods call preload for real. The engine decides
       * `compatibility` once and the adapter forwards it untouched.
       */
      searchHuggingFace: (query, kind, cursor) =>
        call('searchHuggingFace', (injected) => injected.searchHuggingFace(query, kind, cursor)),
      inspectHuggingFace: (repo) => call('inspectHuggingFace', (injected) => injected.inspectHuggingFace(repo)),
      getHuggingFaceModelCard: (repo, revision) =>
        call('getHuggingFaceModelCard', (injected) => injected.getHuggingFaceModelCard(repo, revision)),
      installHuggingFaceModel: (repo, slot, source) =>
        call('installHuggingFaceModel', (injected) => injected.installHuggingFaceModel(repo, slot, source)),
    },
    feedback: {
      // tier 'ipc-new': the main process has no `app:feedback` channel. See BRIDGE_TIERS.
      submit: () => Promise.reject(new Error('app:feedback 通道尚未在主进程实现（ipc-new）')),
    },
  }
}
