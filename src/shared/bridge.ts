import type { AudioDevice, EngineEvent, ResourceRecord, ResourceSnapshot, SessionConfig } from './contracts'
import type { AppSettings, AppSettingsPatch } from './settings'

export type SessionStartResult = { sessionId: string }
export type ModelStorageInfo = { activePath: string; configuredPath: string; restartRequired: boolean }

/** Pages the caption overlay can send the main window to; must stay in sync with `OVERLAY_PAGES` in the main process. */
export type OverlayTargetPage = 'appearance' | 'captions' | 'resources' | 'translation'

export type NolaTranslatorApi = {
  listDevices(): Promise<AudioDevice[]>
  listResources(): Promise<ResourceSnapshot>
  manageResource(resourceId: string, action: 'install' | 'remove' | 'cancel'): Promise<ResourceRecord>
  startSession(config: SessionConfig): Promise<SessionStartResult>
  stopSession(sessionId: string): Promise<void>
  onEngineEvent(listener: (event: EngineEvent) => void): () => void
  showOverlay(): Promise<void>
  hideOverlay(): Promise<void>
  resizeOverlay(width: number, height: number): Promise<void>
  openAppearance(page?: OverlayTargetPage): Promise<void>
  onOpenAppearance(listener: (page: OverlayTargetPage) => void): () => void
  getSettings(): Promise<AppSettings>
  getModelStorage(): Promise<ModelStorageInfo>
  chooseModelStorageDirectory(): Promise<ModelStorageInfo | null>
  restartApp(): Promise<void>
  updateSettings(patch: AppSettingsPatch): Promise<AppSettings>
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void
  listHistory(): Promise<import('./contracts').CaptionSegment[]>
  clearHistory(): Promise<void>
  exportHistory(format: 'txt' | 'srt' | 'vtt'): Promise<string | null>
  getDiagnostics(): Promise<Record<string, string | number>>
  copyDiagnostics(): Promise<void>
  hasTranslationCredential(provider: 'microsoft' | 'openai'): Promise<boolean>
  setTranslationCredential(provider: 'microsoft' | 'openai', value: string): Promise<void>
}
