import { contextBridge, ipcRenderer } from 'electron'

import type { NolaTranslatorApi, EngineChannelEvent, OverlayTargetPage } from '../shared/bridge'
import type { EngineProcessState, HubInspectResult, HubSearchResult, PrewarmResult, ResourceRecord, SessionConfig } from '../shared/contracts'
import { stripIpcErrorMessage } from '../shared/ipc-error'

// Observe structural UI activity in the isolated world; never read labels or form values.
window.addEventListener('DOMContentLoaded', () => {
  const navigation = () => ipcRenderer.send('diagnostics:ui-activity', { type: 'navigation', route: location.hash })
  navigation()
  window.addEventListener('hashchange', navigation)
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button,a,[role="button"]') : null
    if (target) ipcRenderer.send('diagnostics:ui-activity', { type: 'interaction', route: location.hash, element: target.tagName.toLowerCase() })
  }, true)
})

const channels = {
  listComputeDevices: 'engine:list-compute-devices',
  getRuntimes: 'runtime:list', installRuntime: 'runtime:install', importRuntime: 'runtime:import', cancelRuntimeInstall: 'runtime:cancel',
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
  prewarmModels: 'engine:prewarm-models',
  ensureEngineReady: 'engine:ensure-ready',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  event: 'engine:event',
  getEngineState: 'engine:get-state',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
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
  importRuntime: () => invoke(channels.importRuntime),
  cancelRuntimeInstall: () => invoke(channels.cancelRuntimeInstall),
  listDevices: () => invoke(channels.listDevices),
  listResources: () => invoke(channels.listResources),
  manageResource: (resourceId, action) => invoke(channels.manageResource, resourceId, action),
  searchHuggingFace: (query, kind, cursor): Promise<HubSearchResult> =>
    invoke(channels.searchHuggingFace, query, kind, cursor),
  inspectHuggingFace: (repo): Promise<HubInspectResult> => invoke(channels.inspectHuggingFace, repo),
  getHuggingFaceModelCard: (repo, revision) => invoke(channels.getHuggingFaceModelCard, repo, revision),
  installHuggingFaceModel: (repo, slot): Promise<ResourceRecord> =>
    invoke(channels.installHuggingFaceModel, repo, slot),
  configureModel: (resourceId, configuration) => invoke(channels.configureModel, resourceId, configuration),
  startSession: (config: SessionConfig) => invoke(channels.startSession, config),
  prewarmModels: (): Promise<PrewarmResult> => invoke(channels.prewarmModels),
  ensureEngineReady: () => invoke<EngineProcessState>(channels.ensureEngineReady),
  stopSession: (sessionId: string) => invoke(channels.stopSession, sessionId),
  setSessionPaused: (sessionId: string, paused: boolean) =>
    invoke(channels.setSessionPaused, sessionId, paused),
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
  showOverlay: () => invoke(channels.showOverlay),
  hideOverlay: () => invoke(channels.hideOverlay),
  closeOverlay: () => invoke(channels.closeOverlay),
  minimizeOverlay: () => invoke(channels.minimizeOverlay),
  resizeOverlay: (width, height) => invoke(channels.resizeOverlay, width, height),
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
  copyDiagnostics: () => invoke(channels.copyDiagnostics),
  openLogs: () => invoke(channels.openLogs),
  hasTranslationCredential: (provider) => invoke(channels.hasTranslationCredential, provider),
  setTranslationCredential: (provider, value) => invoke(channels.setTranslationCredential, provider, value),
  setCaptionService: (active) => invoke(channels.setCaptionService, active),
  openDefaultBrowser: () => invoke(channels.openDefaultBrowser),
  checkLatestRelease: (force?: boolean) => invoke(channels.checkLatestRelease, force),
  openReleasePage: (url: string) => invoke(channels.openReleasePage, url),
}

contextBridge.exposeInMainWorld('nolaTranslator', api)
