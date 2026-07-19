import type { AudioDevice, EngineEvent, SessionConfig } from './contracts'
import type { AppSettings, AppSettingsPatch } from './settings'

export type SessionStartResult = { sessionId: string }

export type FluentCaptionsApi = {
  listDevices(): Promise<AudioDevice[]>
  startSession(config: SessionConfig): Promise<SessionStartResult>
  stopSession(sessionId: string): Promise<void>
  onEngineEvent(listener: (event: EngineEvent) => void): () => void
  showOverlay(): Promise<void>
  hideOverlay(): Promise<void>
  getSettings(): Promise<AppSettings>
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
