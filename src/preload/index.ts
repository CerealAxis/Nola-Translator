import { contextBridge, ipcRenderer } from 'electron'

import type { NolaTranslatorApi } from '../shared/bridge'
import type { EngineEvent, SessionConfig } from '../shared/contracts'
import { stripIpcErrorMessage } from '../shared/ipc-error'

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

// Electron 会把 IPC 错误包成 "Error invoking remote method '<channel>': <原错误>"，
// 这层传输细节不该出现在界面上的通知里。
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
  startSession: (config: SessionConfig) => invoke(channels.startSession, config),
  stopSession: (sessionId: string) => invoke(channels.stopSession, sessionId),
  onEngineEvent: (listener: (event: EngineEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: EngineEvent): void => listener(value)
    ipcRenderer.on(channels.event, wrapped)
    return () => ipcRenderer.off(channels.event, wrapped)
  },
  showOverlay: () => invoke(channels.showOverlay),
  hideOverlay: () => invoke(channels.hideOverlay),
  resizeOverlay: (width, height) => invoke(channels.resizeOverlay, width, height),
  openAppearance: () => invoke(channels.openAppearance),
  onOpenAppearance: (listener) => {
    const wrapped = (): void => listener()
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
  listHistory: () => invoke(channels.listHistory),
  clearHistory: () => invoke(channels.clearHistory),
  exportHistory: (format) => invoke(channels.exportHistory, format),
  getDiagnostics: () => invoke(channels.getDiagnostics),
  copyDiagnostics: () => invoke(channels.copyDiagnostics),
  hasTranslationCredential: (provider) => invoke(channels.hasTranslationCredential, provider),
  setTranslationCredential: (provider, value) => invoke(channels.setTranslationCredential, provider, value),
}

contextBridge.exposeInMainWorld('nolaTranslator', api)
