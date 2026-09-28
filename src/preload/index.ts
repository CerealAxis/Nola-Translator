import { contextBridge, ipcRenderer } from 'electron'

import type { NolaTranslatorApi } from '../shared/bridge'
import type { EngineEvent, SessionConfig } from '../shared/contracts'

const channels = {
  listDevices: 'engine:list-devices',
  listResources: 'engine:list-resources',
  manageResource: 'engine:manage-resource',
  startSession: 'engine:start-session',
  stopSession: 'engine:stop-session',
  event: 'engine:event',
  showOverlay: 'overlay:show',
  hideOverlay: 'overlay:hide',
  resizeOverlay: 'overlay:resize',
  openAppearance: 'app:open-appearance',
  appearanceRequested: 'app:appearance-requested',
  getSettings: 'app:get-settings', updateSettings: 'app:update-settings', settingsChanged: 'settings:changed',
  getModelStorage: 'storage:get', chooseModelStorageDirectory: 'storage:choose', restartApp: 'app:restart',
  listHistory: 'history:list', clearHistory: 'history:clear', exportHistory: 'history:export',
  getDiagnostics: 'diagnostics:get', copyDiagnostics: 'diagnostics:copy',
  hasTranslationCredential: 'translation:has-credential', setTranslationCredential: 'translation:set-credential',
} as const

const api: NolaTranslatorApi = {
  listDevices: () => ipcRenderer.invoke(channels.listDevices),
  listResources: () => ipcRenderer.invoke(channels.listResources),
  manageResource: (resourceId, action) => ipcRenderer.invoke(channels.manageResource, resourceId, action),
  startSession: (config: SessionConfig) => ipcRenderer.invoke(channels.startSession, config),
  stopSession: (sessionId: string) => ipcRenderer.invoke(channels.stopSession, sessionId),
  onEngineEvent: (listener: (event: EngineEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: EngineEvent): void => listener(value)
    ipcRenderer.on(channels.event, wrapped)
    return () => ipcRenderer.off(channels.event, wrapped)
  },
  showOverlay: () => ipcRenderer.invoke(channels.showOverlay),
  hideOverlay: () => ipcRenderer.invoke(channels.hideOverlay),
  resizeOverlay: (width, height) => ipcRenderer.invoke(channels.resizeOverlay, width, height),
  openAppearance: () => ipcRenderer.invoke(channels.openAppearance),
  onOpenAppearance: (listener) => {
    const wrapped = (): void => listener()
    ipcRenderer.on(channels.appearanceRequested, wrapped)
    return () => ipcRenderer.off(channels.appearanceRequested, wrapped)
  },
  getSettings: () => ipcRenderer.invoke(channels.getSettings),
  getModelStorage: () => ipcRenderer.invoke(channels.getModelStorage),
  chooseModelStorageDirectory: () => ipcRenderer.invoke(channels.chooseModelStorageDirectory),
  restartApp: () => ipcRenderer.invoke(channels.restartApp),
  updateSettings: (patch) => ipcRenderer.invoke(channels.updateSettings, patch),
  onSettingsChanged: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: Parameters<typeof listener>[0]): void => listener(value)
    ipcRenderer.on(channels.settingsChanged, wrapped)
    return () => ipcRenderer.off(channels.settingsChanged, wrapped)
  },
  listHistory: () => ipcRenderer.invoke(channels.listHistory),
  clearHistory: () => ipcRenderer.invoke(channels.clearHistory),
  exportHistory: (format) => ipcRenderer.invoke(channels.exportHistory, format),
  getDiagnostics: () => ipcRenderer.invoke(channels.getDiagnostics),
  copyDiagnostics: () => ipcRenderer.invoke(channels.copyDiagnostics),
  hasTranslationCredential: (provider) => ipcRenderer.invoke(channels.hasTranslationCredential, provider),
  setTranslationCredential: (provider, value) => ipcRenderer.invoke(channels.setTranslationCredential, provider, value),
}

contextBridge.exposeInMainWorld('nolaTranslator', api)
