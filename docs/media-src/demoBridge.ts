import type { AppSettings, AppSettingsPatch, CaptionSegment, EngineChannelEvent, MeetingMeta, NolaBridge, ResourceRecord } from '@/bridge'
import { initStores, stores } from '@/store'
import { mergeSettings } from '@/store/settingsStore'
import type { BrowserConnectionStatus } from '../../src/shared/browser'
import type { RuntimeSnapshot } from '../../src/shared/compute'

const noop = () => undefined
const done = async () => undefined

/** All desktop actions stay in memory. No IPC, captures, model downloads, or credentials exist here. */
export function connectDemo(initial: AppSettings, onOverlay: (open: boolean) => void) {
  let settings = initial
  const transcript = [...stores.session.getState().segments]
  let overlayTranscript: { segments: readonly CaptionSegment[]; interim: CaptionSegment | null } | null = null
  const settingListeners = new Set<(settings: AppSettings) => void>()
  const engineListeners = new Set<(event: EngineChannelEvent) => void>()
  const publish = (event: EngineChannelEvent) => {
    // The website plays one utterance at a time; the workspace retains its complete sample transcript.
    if (overlayTranscript && event.type === 'caption') {
      stores.session.setState({ segments: [event.segment], interim: null })
      return
    }
    engineListeners.forEach(listener => listener(event))
  }
  const openOverlay = async () => {
    if (!overlayTranscript) {
      const session = stores.session.getState()
      overlayTranscript = { segments: session.segments, interim: session.interim }
      const current = session.interim ?? session.segments.at(-1) ?? transcript[0]
      stores.session.setState({ segments: current ? [current] : [], interim: null })
    }
    onOverlay(true)
  }
  const closeOverlay = () => {
    if (overlayTranscript) stores.session.setState(overlayTranscript)
    overlayTranscript = null
    onOverlay(false)
  }
  const subscribe = <T,>(listeners: Set<(value: T) => void>, listener: (value: T) => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const browser: BrowserConnectionStatus = {
    enabled: true, registered: true, connections: 1, captionServiceActive: true, sessionActive: false,
    browsers: ['chrome', 'edge'].map(browser => ({ browser: browser as 'chrome' | 'edge', available: true, extensionStatus: 'installed', connected: true, enabled: true })),
  }
  const runtimes: RuntimeSnapshot = {
    packages: [], recipes: [], hardware: { adapters: [], nvidiaDriver: null, notes: [] },
    recommendation: { engineId: null, llamaId: null, reasons: [] },
    local: {
      engine: { path: 'Demo', status: 'ready', backend: 'cpu', version: '2.8', gpuAvailable: false, reason: '' },
      llama: { path: 'Demo', status: 'ready', backend: 'cpu', version: 'demo', gpuAvailable: false, reason: '' },
    }, operation: null, lastError: null, directory: '',
  }
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
      listComputeDevices: async () => ({ devices: [], notes: [], torchVersion: 'Demo', activePlan: null }),
      listDevices: async () => stores.models.getState().devices,
      testAudio: async () => { throw new Error('Audio capture is not part of the website demo') },
      listResources: async () => ({ storagePath: '', resources: stores.models.getState().resources }),
      manageResource: async (id, action) => {
        const existing = stores.models.getState().resources.find(item => item.resourceId === id)
        if (!existing) throw new Error('Unknown demo model')
        const resource: ResourceRecord = { ...existing, installed: action === 'install', installedBytes: action === 'install' ? existing.downloadBytes ?? 0 : 0 }
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
    overlay: { show: openOverlay, hide: async () => closeOverlay(), close: async () => closeOverlay(), minimize: async () => closeOverlay(), resize: done },
    runtimes: { list: async () => runtimes, prepare: async () => runtimes, openSettings: done, install: done, import: async () => false, cancel: done },
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
    app: {
      openDefaultBrowser: async () => { location.hash = '#/video-captions' },
      checkLatestRelease: async () => ({ currentVersion: 'Demo', latestVersion: null, updateAvailable: false, releaseName: null, releaseNotes: '', releaseUrl: null }),
      openReleasePage: done,
    },
    translation: { hasCredential: async () => false, setCredential: done },
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
  stores.settings.setState({ browser, runtimes })
  return { publish, closeOverlay }
}
