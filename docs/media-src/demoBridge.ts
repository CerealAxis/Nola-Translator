import type { AppSettings, AppSettingsPatch, CredentialProvider, EngineChannelEvent, MeetingMeta, NolaBridge, ResourceRecord } from '@/bridge'
import { initStores, stores } from '@/store'
import { mergeSettings } from '@/store/settingsStore'
import type { ModelGatewaySnapshot } from '../../src/shared/model-gateway'
import type { BrowserConnectionStatus } from '../../src/shared/browser'
import { CRISP_RUNTIME_ID } from '../../src/shared/compute'
import { createDemoRuntime, DEMO_COMPUTE } from './demoRuntime'

const noop = () => undefined
const done = async () => undefined

/** All desktop actions stay in memory. No IPC, captures, model downloads, or credentials exist here. */
export function connectDemo(initial: AppSettings, onOverlay: (open: boolean) => void, onWorkspace: () => void = noop) {
  let settings = initial
  const gatewaySnapshot = (): ModelGatewaySnapshot => ({
    state: 'running', port: 8717, address: 'http://127.0.0.1:8717/v1', connections: 0, activeRequests: 0, requests: [],
    services: {
      asr: { state: 'ready', model: `resource:${settings.recognition.modelId}`, name: 'Demo ASR' },
      mt: { state: 'ready', model: `resource:${settings.translation.localModelId}`, name: 'Demo MT' },
      tts: { state: 'stopped', model: '', name: '' }, llm: { state: 'stopped', model: '', name: '' },
    },
  })
  const credentials = new Set<CredentialProvider>()
  const transcript = [...stores.session.getState().segments]
  const settingListeners = new Set<(settings: AppSettings) => void>()
  const engineListeners = new Set<(event: EngineChannelEvent) => void>()
  const lockListeners = new Set<(locked: boolean) => void>()
  const overlayVisibilityListeners = new Set<(visible: boolean) => void>()
  let overlayLock = false
  let overlayVisible = false
  const publish = (event: EngineChannelEvent) => {
    engineListeners.forEach(listener => listener(event))
  }
  const openOverlay = async () => {
    overlayVisible = true
    onOverlay(true)
    overlayVisibilityListeners.forEach(listener => listener(true))
    return true
  }
  const closeOverlay = () => {
    overlayVisible = false
    onOverlay(false)
    overlayVisibilityListeners.forEach(listener => listener(false))
  }
  const subscribe = <T,>(listeners: Set<(value: T) => void>, listener: (value: T) => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const browser: BrowserConnectionStatus = {
    enabled: true, registered: true, connections: 1, captionServiceActive: false, sessionActive: false,
    browsers: ['chrome', 'edge'].map(browser => ({ browser: browser as 'chrome' | 'edge', available: true, extensionStatus: 'installed', connected: true, enabled: true })),
  }
  const runtimes = createDemoRuntime()
  const update = async (patch: AppSettingsPatch) => {
    settings = mergeSettings(settings, patch)
    settingListeners.forEach(listener => listener(settings))
    return settings
  }
  const meeting = (id: string): MeetingMeta => {
    const result = stores.meetings.getState().meetings.find(item => item.meetingId === id)
    if (!result) throw new Error('Demo meeting unavailable')
    return result
  }
  const updateMeeting = async (id: string, patch: Partial<MeetingMeta>) => {
    const updated = { ...meeting(id), ...patch }
    stores.meetings.setState(state => ({ meetings: state.meetings.map(item => item.meetingId === id ? updated : item) }))
    return updated
  }
  const bridge: NolaBridge = {
    engine: {
      listComputeDevices: async () => ({ ...DEMO_COMPUTE, torchVersion: runtimes.local.engine.version }),
      listDevices: async () => stores.models.getState().devices,
      testAudio: async () => { throw new Error('Audio capture is not part of the website demo') },
      listResources: async () => ({ storagePath: '', resources: stores.models.getState().resources }),
      manageResource: async (id, action) => {
        const existing = stores.models.getState().resources.find(item => item.resourceId === id)
        if (!existing) throw new Error('Unknown demo model')
        const installed = action === 'cancel' ? existing.installed : action === 'install'
        const resource: ResourceRecord = { ...existing, installed, installedBytes: installed ? existing.downloadBytes ?? 0 : 0, state: 'idle', cancellable: false }
        publish({ type: 'resourceChanged', protocolVersion: 1, requestId: 'demo', resource })
        return resource
      },
      startSession: async () => ({ sessionId: 'docs-demo', meetingId: 'docs-demo' }),
      stopSession: done,
      prewarmModels: async () => ({ state: 'ready' }),
      ensureEngineReady: async () => 'ready',
      setPaused: noop,
      getEngineState: async () => 'ready',
    },
    settings: {
      get: async () => settings, update,
      browserConnection: async (_action, enabled, kind) => {
        if (enabled !== undefined && kind) browser.browsers = browser.browsers?.map(item => item.browser === kind ? { ...item, enabled } : item)
        return { ...browser }
      },
      setCaptionService: async active => { browser.captionServiceActive = active; return { ...browser } },
    },
    overlay: {
      show: openOverlay, hide: async () => closeOverlay(), getVisibility: async () => overlayVisible,
      close: async () => closeOverlay(), minimize: async () => closeOverlay(), resize: done,
      onVisibilityChanged: listener => subscribe(overlayVisibilityListeners, listener),
      // Session-scoped like the desktop: the demo keeps it in memory for the lifetime of the scene.
      setLocked: async (locked: boolean) => {
        const changed = locked !== overlayLock
        overlayLock = locked
        if (changed) lockListeners.forEach(listener => listener(locked))
        return overlayLock
      },
    },
    runtimes: {
      list: async () => runtimes, prepare: async () => runtimes,
      openSettings: async component => { location.hash = `#/settings/compute?component=${component}` },
      install: async id => {
        const recipe = runtimes.recipes.find(item => item.id === id)
        const pkg = runtimes.packages.find(item => item.id === id)
        if (recipe) {
          recipe.installed = true
          runtimes.local = { ...runtimes.local, engine: { id, path: 'Demo', status: 'ready', backend: recipe.backend, version: recipe.torchVersion, gpuAvailable: recipe.backend !== 'cpu', reason: '' } }
        } else if (pkg) {
          pkg.installed = true
          runtimes.local = { ...runtimes.local, llama: { id, path: 'Demo', status: 'ready', backend: pkg.backend, version: pkg.version, gpuAvailable: pkg.backend !== 'cpu', reason: '' } }
        } else if (id === CRISP_RUNTIME_ID) {
          runtimes.local = { ...runtimes.local, crisp: { id, path: 'Demo', status: 'ready', backend: 'vulkan', version: '0.8.43', gpuAvailable: true, reason: '', managed: true } }
        }
        stores.settings.setState({ runtimes: { ...runtimes } })
      },
      uninstall: async kind => {
        const current = runtimes.local[kind]
        if (current) runtimes.local = { ...runtimes.local, [kind]: { ...current, path: '', status: 'missing', version: '', id: undefined, managed: false, reason: '' } }
        stores.settings.setState({ runtimes: { ...runtimes } })
      },
      import: async () => false, cancel: done,
    },
    storage: { get: async () => ({ activePath: '', configuredPath: '', restartRequired: false }), choose: async () => null, restartApp: done },
    meetings: {
      list: async () => stores.meetings.getState().meetings,
      get: async id => meeting(id),
      read: async () => transcript,
      rename: async (id, title) => updateMeeting(id, { title, titleIsCustom: true }),
      setNotes: async (id, notes) => updateMeeting(id, { notes }),
      remove: async id => { stores.meetings.setState(state => ({ meetings: state.meetings.filter(item => item.meetingId !== id) })); return true },
      export: async (id, format) => {
        const stamp = (milliseconds: number, separator: string) => {
          const seconds = Math.floor(milliseconds / 1000)
          return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}${separator}${String(milliseconds % 1000).padStart(3, '0')}`
        }
        const content = transcript.map((segment, index) => {
          const text = [segment.sourceText, segment.translations[0]?.text].filter(Boolean).join('\n')
          return format === 'txt' ? text : `${format === 'srt' ? `${index + 1}\n` : ''}${stamp(segment.startedAtMs, format === 'srt' ? ',' : '.')} --> ${stamp(segment.endedAtMs ?? segment.startedAtMs + 5000, format === 'srt' ? ',' : '.')}\n${text}`
        }).join('\n\n')
        const url = URL.createObjectURL(new Blob([`${format === 'vtt' ? 'WEBVTT\n\n' : ''}${content}\n`], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = `${meeting(id).title}.${format}`
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        return link.download
      }, audioUrl: async () => null,
    },
    diagnostics: { get: async () => ({ demo: 1 }), copy: done, openLogs: done },
    gateway: { snapshot: async () => gatewaySnapshot(), start: async () => gatewaySnapshot(), stop: async () => gatewaySnapshot(), onChanged: () => noop, revealKey: async () => 'demo-only', rotateKey: async () => 'demo-only' },
    app: {
      showWorkspace: async () => onWorkspace(),
      openDefaultBrowser: async () => { location.hash = '#/video-captions' },
      checkLatestRelease: async () => ({ currentVersion: 'Demo', latestVersion: null, updateAvailable: false, releaseName: null, releaseNotes: '', releaseUrl: null }),
      openReleasePage: done,
    },
    translation: {
      hasCredential: async provider => credentials.has(provider),
      // Only remember presence, never the entered secret, even within the demo tab.
      setCredential: async (provider, value) => { if (value) credentials.add(provider); else credentials.delete(provider) },
    },
    models: {
      configureModel: async (id, configuration) => {
        const existing = stores.models.getState().resources.find(item => item.resourceId === id)
        if (!existing) throw new Error('Unknown demo model')
        return { ...existing, configuration }
      },
      searchHuggingFace: async query => ({ query, models: [], candidates: 0, rateLimited: false }),
      inspectHuggingFace: async () => { throw new Error('External model search is unavailable in the demo') },
      getHuggingFaceModelCard: async () => '',
      installHuggingFaceModel: async () => { throw new Error('External downloads are unavailable in the demo') },
    },
    feedback: { submit: done },
    events: {
      onEngineEvent: listener => subscribe(engineListeners, listener),
      onSettingsChanged: listener => subscribe(settingListeners, listener),
      onOverlayRequest: () => noop,
      onOverlayLockChanged: listener => subscribe(lockListeners, listener),
      onOverlayVisibilityChanged: listener => subscribe(overlayVisibilityListeners, listener),
    },
  }
  // The title bar and locale provider use this limited facade; stores use the typed bridge above.
  Object.defineProperty(window, 'nolaTranslator', { configurable: true, value: {
    getSettings: bridge.settings.get, updateSettings: update, onSettingsChanged: bridge.events.onSettingsChanged,
    isWindows: true, onMainWindowMaximizedChanged: () => noop, isMainWindowMaximized: async () => false,
    toggleMainWindowMaximize: async () => false, minimizeMainWindow: done, closeMainWindow: done,
    openAppearance: async () => { closeOverlay(); location.hash = '#/settings/appearance' },
  } })
  initStores(bridge, { backgroundChecks: false })
  stores.settings.setState({ browser, runtimes, computeSnapshot: { ...DEMO_COMPUTE, torchVersion: runtimes.local.engine.version } })
  return { publish, closeOverlay }
}
