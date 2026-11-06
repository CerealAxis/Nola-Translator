import { contextBridge, ipcRenderer } from 'electron'
import { createScreenPreload } from './screen-translation'

import type { NolaTranslatorApi, EngineChannelEvent, OverlayTargetPage } from '../shared/bridge'
import type { EngineProcessState, HubInspectResult, HubSearchResult, PrewarmResult, ResourceRecord, SessionConfig } from '../shared/contracts'
import { stripIpcErrorMessage } from '../shared/ipc-error'
import { RealtimePlaybackOwner, type PlaybackChunk } from '../renderer/bridge/realtime-playback'
import { vbCablePair } from '../shared/virtual-audio'

let realtimePlayback: {
  token: string
  owner: RealtimePlaybackOwner
  pending: Promise<void>
  removeDeviceListener?: () => void
} | undefined

function closeRealtimePlayback(): void {
  const playback = realtimePlayback
  realtimePlayback = undefined
  if (playback) {
    playback.removeDeviceListener?.()
    void playback.owner.close().catch(() => {})
  }
}

ipcRenderer.on('realtime:playback-configure', (_event, token: string, { device, inputCable, measure }: { device?: string; inputCable?: string; measure?: boolean }) => {
  closeRealtimePlayback()
  const owner = new RealtimePlaybackOwner(ack => ipcRenderer.invoke('realtime:playback-ack', token, ack), undefined,
    measure ? (stream, generation, firstAt, points) => ipcRenderer.send('latency:output', token, { stream, generation, firstAt, points }) : undefined)
  const pending = (async () => {
    if (!device || device === 'default') return
    if (inputCable) {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const sink = devices.find(endpoint => endpoint.kind === 'audiooutput' && endpoint.deviceId === device)
      if (!sink?.label) throw new Error('audioPlaybackUnavailable')
      if (vbCablePair(sink.label, 'Input') === inputCable) throw new Error('audioRouteConflict')
    }
    await owner.setSinkId(device)
  })()
  const playback: NonNullable<typeof realtimePlayback> = { token, owner, pending }
  realtimePlayback = playback
  const report = (result: true | 'audioRouteConflict' | 'audioPlaybackUnavailable') => {
    if (realtimePlayback?.token === token) void ipcRenderer.invoke('realtime:playback-ready', token, result).catch(() => {})
  }
  void pending.then(() => {
    if (realtimePlayback !== playback) return
    report(true)
    const media = navigator.mediaDevices
    if (!device || device === 'default' || !media?.addEventListener) return
    const verifySink = () => {
      void media.enumerateDevices().then(devices => {
        if (realtimePlayback !== playback || devices.some(endpoint => endpoint.kind === 'audiooutput' && endpoint.deviceId === device)) return
        closeRealtimePlayback()
        void ipcRenderer.invoke('realtime:playback-device-lost', token).catch(() => {})
      }).catch(() => {})
    }
    media.addEventListener('devicechange', verifySink)
    playback.removeDeviceListener = () => media.removeEventListener('devicechange', verifySink)
  }, error => report(error instanceof Error && error.message === 'audioRouteConflict' ? 'audioRouteConflict' : 'audioPlaybackUnavailable'))
})
ipcRenderer.on('realtime:playback-chunk', (_event, token: string, chunk: PlaybackChunk) => {
  const playback = realtimePlayback
  if (playback?.token !== token) return
  playback.pending = playback.pending.then(async () => {
    if (realtimePlayback === playback) await playback.owner.accept(chunk)
  })
  void playback.pending.catch(() => {
    if (realtimePlayback !== playback) return
    void ipcRenderer.invoke('realtime:playback-ack', token, {
      claimId: chunk.claimId, generation: chunk.generation, audioStreamId: chunk.audioStreamId,
      state: 'unknown', chunkSeq: -1, playedSampleOffset: 0,
    }).catch(() => {})
    closeRealtimePlayback()
  })
})
ipcRenderer.on('realtime:playback-fence', (_event, token: string, generation: number) => {
  if (realtimePlayback?.token === token) realtimePlayback.owner.stop(generation)
})
ipcRenderer.on('realtime:playback-close', (_event, token: string) => {
  if (realtimePlayback?.token === token) closeRealtimePlayback()
})
window.addEventListener('unload', closeRealtimePlayback)

// Observe structural UI activity in the isolated world; never read labels, page text or form values.
window.addEventListener('DOMContentLoaded', () => {
  const navigation = () => ipcRenderer.send('diagnostics:ui-activity', { type: 'navigation', route: location.hash })
  navigation()
  window.addEventListener('hashchange', navigation)
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button,a,[role="button"]') : null
    if (target) ipcRenderer.send('diagnostics:ui-activity', { type: 'interaction', route: location.hash, element: {
      tag: target.tagName.toLowerCase(), id: target.id || undefined,
      role: target.getAttribute('role') ?? undefined, type: target.getAttribute('type') ?? undefined,
      name: target.getAttribute('name') ?? undefined, action: target.getAttribute('data-action') ?? undefined,
    } })
  }, true)
})

const channels = {
  openOverlayMenu: 'overlay:open-menu',
  presentOverlayMenu: 'overlay:present-menu',
  closeOverlayMenu: 'overlay:close-menu',
  overlayMenuChanged: 'overlay:menu-changed',
  listComputeDevices: 'engine:list-compute-devices',
  getRuntimes: 'runtime:list', installRuntime: 'runtime:install', uninstallRuntime: 'runtime:uninstall', importRuntime: 'runtime:import', cancelRuntimeInstall: 'runtime:cancel',
  prepareRuntimes: 'runtime:prepare',
  openRuntimeSettings: 'runtime:settings',
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  searchHuggingFace: 'hub:search',
  inspectHuggingFace: 'hub:inspect',
  getHuggingFaceModelCard: 'hub:model-card',
  installHuggingFaceModel: 'hub:install', configureModel: 'model:configure',
  startSession: 'engine:start-session',
  testAudio: 'engine:test-audio',
  prewarmModels: 'engine:prewarm-models',
  ensureEngineReady: 'engine:ensure-ready',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  resolvePlayback: 'engine:resolve-playback',
  event: 'engine:event',
  getEngineState: 'engine:get-state',
  showWorkspace: 'app:show-workspace',
  openMainPage: 'app:open-main-page', mainPageRequested: 'app:main-page-requested',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  getOverlayVisibility: 'overlay:is-visible',
  overlayVisibilityChanged: 'overlay:visibility-changed',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
  setOverlayLocked: 'overlay:set-locked', overlayLockChanged: 'overlay:locked-changed',
  openAppearance: 'app:open-appearance',
  appearanceRequested: 'app:appearance-requested',
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings', settingsChanged: 'settings:changed',
  minimizeMainWindow: 'app:window:minimize', toggleMainWindowMaximize: 'app:window:toggle-maximize',
  getMainWindowMaximized: 'app:window:is-maximized', mainWindowMaximizedChanged: 'app:window:maximized-changed',
  closeMainWindow: 'app:window:close',
  getModelStorage: 'storage:get', chooseModelStorageDirectory: 'storage:choose', restartApp: 'app:restart',
  listMeetings: 'meeting:list', getMeeting: 'meeting:get', readMeeting: 'meeting:read',
  renameMeeting: 'meeting:rename', setMeetingNotes: 'meeting:set-notes', deleteMeeting: 'meeting:delete', exportMeeting: 'meeting:export',
  meetingAudioUrl: 'meeting:audio-url',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy', openLogs: 'diagnostics:open-logs',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
  setCaptionService: 'browser:caption-service',
  openDefaultBrowser: 'app:open-default-browser',
  installVirtualCable: 'app:install-virtual-cable',
  getVirtualCableDriverVersion: 'app:get-virtual-cable-driver-version',
  notifyMainError: 'app:overlay-error', mainErrorNotification: 'app:main-error-notification',
  previewOverlayToast: 'app:overlay-toast-preview',
  dismissOverlayToast: 'app:overlay-toast-dismissed',
  overlayToastAction: 'app:overlay-toast-action',
  checkLatestRelease: 'app:check-latest-release', openReleasePage: 'app:open-release-page',
} as const

// Unwraps the channel prefix Electron adds to handler errors; see stripIpcErrorMessage.
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return await ipcRenderer.invoke(channel, ...args)
  } catch (error) {
    if (error instanceof Error) error.message = stripIpcErrorMessage(error.message)
    throw error
  }
}

const api: NolaTranslatorApi = {
  listComics: () => invoke('language-model:comics'),
  gameTranslation: {
    snapshot: () => invoke('game:snapshot'),
    sources: () => invoke('game:sources'),
    command: command => invoke('game:command', command),
    onChanged: listener => {
      const receive = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) => listener(value)
      ipcRenderer.on('game:changed', receive)
      return () => ipcRenderer.off('game:changed', receive)
    },
  },
  comic: {
    listProjects: () => invoke('comic:list'),
    openProject: id => invoke('comic:open', id),
    importProject: request => invoke('comic:import', request),
    edit: request => invoke('comic:edit', request),
    run: request => invoke('comic:run', request),
    cancel: (projectId, jobId) => invoke('comic:cancel', { projectId, jobId }),
    image: (projectId, pageId, kind) => invoke('comic:image', { projectId, pageId, kind }),
    exportProject: request => invoke('comic:export', request),
    onChanged: listener => {
      const receive = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) => listener(value)
      ipcRenderer.on('comic:changed', receive)
      return () => ipcRenderer.off('comic:changed', receive)
    },
  },
  desktopData: {
    snapshot: () => invoke('desktop-data:snapshot'),
    backup: options => invoke('desktop-data:backup', options),
    restore: password => invoke('desktop-data:restore', password),
  },
  glossary: {
    snapshot: () => invoke('glossary:snapshot'),
    command: request => invoke('glossary:command', request),
    testMatch: request => invoke('glossary:test', request),
    onChanged: listener => {
      const receive = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) => listener(value)
      ipcRenderer.on('glossary:changed', receive)
      return () => ipcRenderer.off('glossary:changed', receive)
    },
  },
  screenTranslation: createScreenPreload(ipcRenderer),
  workspaceView: {
    read: () => invoke('workspace:view'),
    update: patch => invoke('workspace:view', patch),
  },
  getLatencySnapshot: () => ipcRenderer.invoke('latency:snapshot'),
  openLatencyWindow: () => invoke('latency:open'),
  onLatencySnapshot: listener => {
    const receive = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]) => listener(value)
    ipcRenderer.on('latency:changed', receive)
    return () => ipcRenderer.off('latency:changed', receive)
  },
  reportLatencyPaint: (sessionId, segmentId, kind, at) => ipcRenderer.invoke('latency:paint', sessionId, { segmentId, kind, at }),
  requestQuit: () => invoke('app:request-quit'),
  confirmQuit: () => invoke('app:confirm-quit'),
  onQuitRequested: callback => {
    const listener = () => callback()
    ipcRenderer.on('app:quit-requested', listener)
    return () => ipcRenderer.off('app:quit-requested', listener)
  },
  gateway: {
    snapshot: () => invoke('model-gateway:status'),
    start: () => invoke('model-gateway:start'),
    stop: () => invoke('model-gateway:stop'),
    revealKey: () => invoke('model-gateway:reveal-key'),
    rotateKey: () => invoke('model-gateway:rotate-key'),
    onChanged: callback => {
      const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/model-gateway').ModelGatewaySnapshot) => callback(value)
      ipcRenderer.on('model-gateway:changed', listener)
      return () => ipcRenderer.off('model-gateway:changed', listener)
    },
  },
  activity: {
    snapshot: () => invoke('feature-activity:snapshot'),
    stop: () => invoke('feature-activity:stop'),
    onChanged: callback => {
      const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/feature-activity').FeatureActivitySnapshot) => callback(value)
      ipcRenderer.on('feature-activity:changed', listener)
      return () => ipcRenderer.off('feature-activity:changed', listener)
    },
  },
  meetingMode: {
    snapshot: () => invoke('meeting-mode:snapshot'),
    start: settings => invoke('meeting-mode:start', settings),
    stop: () => invoke('meeting-mode:stop'),
    setPaused: paused => invoke('meeting-mode:set-paused', paused),
    testAudio: request => invoke('meeting-mode:test-audio', request),
    cancelAudioTest: () => invoke('meeting-mode:cancel-test'),
    onChanged: callback => {
      const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) => callback(value)
      ipcRenderer.on('meeting-mode:changed', listener)
      return () => ipcRenderer.off('meeting-mode:changed', listener)
    },
  },
  onboardingCard: {
    available: () => true,
    show: () => ipcRenderer.send('onboarding-card:show'),
    hide: () => ipcRenderer.send('onboarding-card:hide'),
    sendState: (state: import('../shared/onboarding-card').OnboardingCardState) => ipcRenderer.send('onboarding-card:state', state),
    onState: (callback: (state: import('../shared/onboarding-card').OnboardingCardState & import('../shared/onboarding-card').OnboardingCardPlacement) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/onboarding-card').OnboardingCardState & import('../shared/onboarding-card').OnboardingCardPlacement) => callback(value)
      ipcRenderer.on('onboarding-card:state', listener)
      return () => ipcRenderer.off('onboarding-card:state', listener)
    },
    onPlacement: (callback: (placement: import('../shared/onboarding-card').OnboardingCardPlacement) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/onboarding-card').OnboardingCardPlacement) => callback(value)
      ipcRenderer.on('onboarding-card:placement', listener)
      return () => ipcRenderer.off('onboarding-card:placement', listener)
    },
    sendAction: (action: import('../shared/onboarding-card').OnboardingCardAction) => ipcRenderer.send('onboarding-card:action', action),
    onAction: (callback: (action: import('../shared/onboarding-card').OnboardingCardAction) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: import('../shared/onboarding-card').OnboardingCardAction) => callback(value)
      ipcRenderer.on('onboarding-tour:action', listener)
      return () => ipcRenderer.off('onboarding-tour:action', listener)
    },
    sendRect: (rect: { x: number; y: number; width: number; height: number } | null) => ipcRenderer.send('onboarding-card:rect', rect),
    onRect: (callback: (payload: { rect: { x: number; y: number; width: number; height: number } | null; mainOffset: { x: number; y: number } }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: { rect: { x: number; y: number; width: number; height: number } | null; mainOffset: { x: number; y: number } }) => callback(value)
      ipcRenderer.on('onboarding-card:rect-forward', listener)
      return () => ipcRenderer.off('onboarding-card:rect-forward', listener)
    },
    sendHit: (interactive: boolean) => ipcRenderer.send('onboarding-card:hit', interactive),
  },
  openWorkbench: surface => invoke('workbench:open', surface),
  cancelLanguageModel: id => invoke('app:language-model:cancel', id),
  releaseDirectModel: () => invoke('app:direct-model:release'),
  agentWorkspace: action => invoke('app:agent-workspace', action),
  directModel: (request, inspect) => invoke('app:direct-model', request, inspect),
  streamLanguageModel: request => invoke('app:language-model:stream', request),
  resolveLanguageModelAudio: result => invoke('app:language-model:audio-result', result),
  onLanguageModelStream: callback => {
    const listener = (_event: Electron.IpcRendererEvent, data: import('../shared/language-model').LanguageModelStreamEvent) => callback(data)
    ipcRenderer.on('app:language-model:chunk', listener)
    return () => ipcRenderer.removeListener('app:language-model:chunk', listener)
  },
  offline: {
    selectModel: (kind, repo, path) => invoke('offline:select-model', kind, repo, path),
    selectDestination: path => invoke('offline:select-destination', path),
    selectBundle: () => invoke('offline:select-bundle'),
    prepare: (request, destination) => invoke('offline:prepare', request, destination),
    install: token => invoke('offline:install', token),
    snapshot: () => invoke('offline:snapshot'),
    cancel: () => invoke('offline:cancel'),
    openOutput: () => invoke('offline:open-output'),
  },
  openOverlayMenu: request => invoke(channels.openOverlayMenu, request),
  presentOverlayMenu: id => invoke(channels.presentOverlayMenu, id),
  closeOverlayMenu: id => invoke(channels.closeOverlayMenu, id),
  onOverlayMenuChanged: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]): void => listener(value)
    ipcRenderer.on(channels.overlayMenuChanged, wrapped)
    return () => ipcRenderer.off(channels.overlayMenuChanged, wrapped)
  },
  isWindows: process.platform === 'win32',
  minimizeMainWindow: () => invoke<void>(channels.minimizeMainWindow),
  toggleMainWindowMaximize: () => invoke<boolean>(channels.toggleMainWindowMaximize),
  isMainWindowMaximized: () => invoke<boolean>(channels.getMainWindowMaximized),
  closeMainWindow: () => invoke<void>(channels.closeMainWindow),
  onMainWindowMaximizedChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, maximized: boolean): void => listener(maximized)
    ipcRenderer.on(channels.mainWindowMaximizedChanged, wrapped)
    return () => ipcRenderer.off(channels.mainWindowMaximizedChanged, wrapped)
  },
  browserConnection: (action, enabled, browser) => invoke('browser:connection', action, enabled, browser),
  listComputeDevices: () => invoke(channels.listComputeDevices),
  getRuntimes: () => invoke(channels.getRuntimes),
  prepareRuntimes: () => invoke(channels.prepareRuntimes),
  openRuntimeSettings: component => invoke(channels.openRuntimeSettings, component),
  installRuntime: (id, repair) => invoke(channels.installRuntime, id, repair),
  uninstallRuntime: (kind) => invoke(channels.uninstallRuntime, kind),
  importRuntime: () => invoke(channels.importRuntime),
  cancelRuntimeInstall: () => invoke(channels.cancelRuntimeInstall),
  listDevices: () => invoke(channels.listDevices),
  testAudio: source => invoke(channels.testAudio, source),
  listResources: () => invoke(channels.listResources),
  manageResource: (resourceId, action, source) => invoke(channels.manageResource, resourceId, action, source),
  searchHuggingFace: (query, kind, cursor): Promise<HubSearchResult> =>
    invoke(channels.searchHuggingFace, query, kind, cursor),
  inspectHuggingFace: (repo): Promise<HubInspectResult> => invoke(channels.inspectHuggingFace, repo),
  getHuggingFaceModelCard: (repo, revision) => invoke(channels.getHuggingFaceModelCard, repo, revision),
  installHuggingFaceModel: (repo, slot, source): Promise<ResourceRecord> =>
    invoke(channels.installHuggingFaceModel, repo, slot, source),
  configureModel: (resourceId, configuration) => invoke(channels.configureModel, resourceId, configuration),
  startSession: (config: SessionConfig) => invoke(channels.startSession, config),
  prewarmModels: (): Promise<PrewarmResult> => invoke(channels.prewarmModels),
  ensureEngineReady: () => invoke<EngineProcessState>(channels.ensureEngineReady),
  stopSession: (sessionId: string) => invoke(channels.stopSession, sessionId),
  setSessionPaused: (sessionId: string, paused: boolean) =>
    invoke(channels.setSessionPaused, sessionId, paused),
  resolvePlayback: (sessionId: string, jobId: string, action: 'retry' | 'skip') =>
    invoke(channels.resolvePlayback, sessionId, jobId, action),
  /*
   * The payload is `EngineChannelEvent`, not `EngineEvent`: this one channel also carries
   * `engineStateChanged` from the main process. Deliberately not split into two listeners —
   * merged, the IPC pipe guarantees delivery order; split, the UI would have to interleave two
   * streams itself and could conclude the engine is healthy when it is not.
   */
  onEngineEvent: (listener: (event: EngineChannelEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: EngineChannelEvent): void => listener(value)
    ipcRenderer.on(channels.event, wrapped)
    return () => ipcRenderer.off(channels.event, wrapped)
  },
  getEngineState: () => invoke<EngineProcessState>(channels.getEngineState),
  getSessionSnapshot: () => invoke('engine:session-snapshot'),
  onDataMigrationProgress: callback => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent)
    ipcRenderer.on('app:data-migration-progress', listener)
    return () => ipcRenderer.off('app:data-migration-progress', listener)
  },
  showWorkspace: () => invoke(channels.showWorkspace),
  openMainPage: path => invoke(channels.openMainPage, path),
  onMainPageRequested: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, path: string): void => listener(path)
    ipcRenderer.on(channels.mainPageRequested, wrapped)
    return () => ipcRenderer.off(channels.mainPageRequested, wrapped)
  },
  onMainErrorNotification: callback => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) => callback(value)
    ipcRenderer.on(channels.mainErrorNotification, listener)
    return () => ipcRenderer.off(channels.mainErrorNotification, listener)
  },
  showOverlay: (mode?: 'standalone' | 'workspace') => invoke(channels.showOverlay, mode),
  hideOverlay: () => invoke(channels.hideOverlay),
  getOverlayVisibility: () => invoke(channels.getOverlayVisibility),
  closeOverlay: () => invoke(channels.closeOverlay),
  minimizeOverlay: () => invoke(channels.minimizeOverlay),
  resizeOverlay: (width, height) => invoke(channels.resizeOverlay, width, height),
  setOverlayLocked: (locked) => invoke<boolean>(channels.setOverlayLocked, locked),
  onOverlayLockChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, locked: boolean): void => listener(locked)
    ipcRenderer.on(channels.overlayLockChanged, wrapped)
    return () => ipcRenderer.off(channels.overlayLockChanged, wrapped)
  },
  onOverlayVisibilityChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, visible: boolean): void => listener(visible)
    ipcRenderer.on(channels.overlayVisibilityChanged, wrapped)
    return () => ipcRenderer.off(channels.overlayVisibilityChanged, wrapped)
  },
  openAppearance: (page?: OverlayTargetPage) => invoke(channels.openAppearance, page),
  onOpenAppearance: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, page: OverlayTargetPage): void => listener(page)
    ipcRenderer.on(channels.appearanceRequested, wrapped)
    return () => ipcRenderer.off(channels.appearanceRequested, wrapped)
  },
  getSettings: () => invoke(channels.getSettings),
  getModelStorage: () => invoke(channels.getModelStorage),
  chooseModelStorageDirectory: () => invoke(channels.chooseModelStorageDirectory),
  restartApp: () => invoke(channels.restartApp),
  updateSettings: (patch) => invoke(channels.updateSettings, patch),
  onSettingsChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]): void => listener(value)
    ipcRenderer.on(channels.settingsChanged, wrapped)
    return () => ipcRenderer.off(channels.settingsChanged, wrapped)
  },
  listMeetings: () => invoke(channels.listMeetings),
  getMeeting: (meetingId) => invoke(channels.getMeeting, meetingId),
  readMeeting: (meetingId) => invoke(channels.readMeeting, meetingId),
  renameMeeting: (meetingId, title) => invoke(channels.renameMeeting, meetingId, title),
  setMeetingNotes: (meetingId, notes) => invoke(channels.setMeetingNotes, meetingId, notes),
  deleteMeeting: (meetingId) => invoke(channels.deleteMeeting, meetingId),
  exportMeeting: (meetingId, format) => invoke(channels.exportMeeting, meetingId, format),
  getMeetingAudioUrl: (meetingId) => invoke(channels.meetingAudioUrl, meetingId),
  getDiagnostics: () => invoke(channels.getDiagnostics),
  copyDiagnostics: (context) => invoke(channels.copyDiagnostics, context),
  openLogs: () => invoke(channels.openLogs),
  hasTranslationCredential: (provider) => invoke(channels.hasTranslationCredential, provider),
  setTranslationCredential: (provider, value) => invoke(channels.setTranslationCredential, provider, value),
  setCaptionService: (active) => invoke(channels.setCaptionService, active),
  ...(process.platform === 'win32' && process.arch === 'x64' ? { installVirtualCable: () => invoke<void>(channels.installVirtualCable) } : {}),
  ...(process.platform === 'win32' && process.arch === 'x64' ? { getVirtualCableDriverVersion: () => invoke<string | null>(channels.getVirtualCableDriverVersion) } : {}),
  openDefaultBrowser: () => invoke(channels.openDefaultBrowser),
  notifyMainError: notification => ipcRenderer.send(channels.notifyMainError, notification),
  previewOverlayToast: notification => ipcRenderer.send(channels.previewOverlayToast, notification),
  dismissOverlayToast: () => ipcRenderer.send(channels.dismissOverlayToast),
  triggerOverlayToastAction: actionId => ipcRenderer.send(channels.overlayToastAction, actionId),
  onOverlayToastAction: listener => {
    const wrapped = (_event: Electron.IpcRendererEvent, actionId: Parameters<typeof listener>[0]): void => listener(actionId)
    ipcRenderer.on(channels.overlayToastAction, wrapped)
    return () => ipcRenderer.off(channels.overlayToastAction, wrapped)
  },
  checkLatestRelease: (force?: boolean) => invoke(channels.checkLatestRelease, force),
  openReleasePage: (url: string) => invoke(channels.openReleasePage, url),
}

contextBridge.exposeInMainWorld('nolaTranslator', api)
