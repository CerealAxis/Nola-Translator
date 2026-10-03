import { contextBridge, ipcRenderer } from 'electron'

import type { NolaTranslatorApi, OverlayTargetPage } from '../shared/bridge'
import type { EngineEvent, HubInspectResult, HubSearchResult, ResourceRecord, SessionConfig } from '../shared/contracts'
import { stripIpcErrorMessage } from '../shared/ipc-error'

const channels = {
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  searchHuggingFace: 'hub:search',
  inspectHuggingFace: 'hub:inspect',
  getHuggingFaceModelCard: 'hub:model-card',
  installHuggingFaceModel: 'hub:install',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  setSessionPaused: 'engine:set-session-paused',
  event: 'engine:event',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  closeOverlay: 'overlay:close',
  minimizeOverlay: 'overlay:minimize',
  resizeOverlay: 'overlay:resize',
  openAppearance: 'app:open-appearance',
  appearanceRequested: 'app:appearance-requested',
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings', settingsChanged: 'settings:changed',
  getModelStorage: 'storage:get', chooseModelStorageDirectory: 'storage:choose', restartApp: 'app:restart',
  listMeetings: 'meeting:list', getMeeting: 'meeting:get', readMeeting: 'meeting:read',
  renameMeeting: 'meeting:rename', setMeetingNotes: 'meeting:set-notes', deleteMeeting: 'meeting:delete', exportMeeting: 'meeting:export',
  meetingAudioUrl: 'meeting:audio-url',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
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
  listDevices: () => invoke(channels.listDevices),
  listResources: () => invoke(channels.listResources),
  manageResource: (resourceId, action) => invoke(channels.manageResource, resourceId, action),
  searchHuggingFace: (query, kind, cursor): Promise<HubSearchResult> =>
    invoke(channels.searchHuggingFace, query, kind, cursor),
  inspectHuggingFace: (repo): Promise<HubInspectResult> => invoke(channels.inspectHuggingFace, repo),
  getHuggingFaceModelCard: (repo, revision) => invoke(channels.getHuggingFaceModelCard, repo, revision),
  installHuggingFaceModel: (repo, slot): Promise<ResourceRecord> =>
    invoke(channels.installHuggingFaceModel, repo, slot),
  startSession: (config: SessionConfig) => invoke(channels.startSession, config),
  stopSession: (sessionId: string) => invoke(channels.stopSession, sessionId),
  setSessionPaused: (sessionId: string, paused: boolean) =>
    invoke(channels.setSessionPaused, sessionId, paused),
  onEngineEvent: (listener: (event: EngineEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: EngineEvent): void => listener(value)
    ipcRenderer.on(channels.event, wrapped)
    return () => ipcRenderer.off(channels.event, wrapped)
  },
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
  hasTranslationCredential: (provider) => invoke(channels.hasTranslationCredential, provider),
  setTranslationCredential: (provider, value) => invoke(channels.setTranslationCredential, provider, value),
}

contextBridge.exposeInMainWorld('nolaTranslator', api)
