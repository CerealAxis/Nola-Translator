import type {
  AudioDevice,
  CaptionSegment,
  EngineEvent,
  HubInspectResult,
  HubSearchResult,
  MeetingMeta,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
} from './contracts'
import type { AppSettings, AppSettingsPatch } from './settings'

export type SessionStartResult = { sessionId: string; meetingId: string | null }
export type ModelStorageInfo = { activePath: string; configuredPath: string; restartRequired: boolean }

/** Pages the caption overlay can send the main window to; must stay in sync with `OVERLAY_PAGES` in the main process. */
export type OverlayTargetPage = 'appearance' | 'captions' | 'resources' | 'translation'

export type NolaTranslatorApi = {
  listDevices(): Promise<AudioDevice[]>
  listResources(): Promise<ResourceSnapshot>
  manageResource(resourceId: string, action: 'install' | 'remove' | 'cancel'): Promise<ResourceRecord>
  /**
   * Search Hugging Face for candidate models.
   *
   * `kind` selects the slot rather than filtering the response afterwards: the engine maps it onto
   * the hub's own `pipeline_tag` filter, so the two categories are separated by the hub and not by
   * string matching on the renderer. Every returned model carries a `compatibility` verdict — read
   * it instead of deriving installability from the repo name.
   */
  searchHuggingFace(query: string, kind: 'asr' | 'mt'): Promise<HubSearchResult>
  /** What one repo declares about itself, and whether the engine can run it. Read-only. */
  inspectHuggingFace(repo: string): Promise<HubInspectResult>
  /**
   * Judge a repo, register it, and start its download.
   *
   * Refuses a repo the engine cannot run *before* transferring anything, so an error here is the
   * compatibility reason rather than a half-finished download. Progress, cancellation and the
   * `resourceChanged` events then follow the same path as any other install.
   */
  installHuggingFaceModel(
    repo: string,
    slot?: 'recognition' | 'translation'
  ): Promise<ResourceRecord>
  startSession(config: SessionConfig): Promise<SessionStartResult>
  stopSession(sessionId: string): Promise<void>
  setSessionPaused(sessionId: string, paused: boolean): Promise<void>
  onEngineEvent(listener: (event: EngineEvent) => void): () => void
  showOverlay(): Promise<void>
  hideOverlay(): Promise<void>
  /** Stops recognition and then hides the window. Distinct from hideOverlay, which only hides. */
  closeOverlay(): Promise<void>
  minimizeOverlay(): Promise<void>
  resizeOverlay(width: number, height: number): Promise<void>
  openAppearance(page?: OverlayTargetPage): Promise<void>
  onOpenAppearance(listener: (page: OverlayTargetPage) => void): () => void
  getSettings(): Promise<AppSettings>
  getModelStorage(): Promise<ModelStorageInfo>
  chooseModelStorageDirectory(): Promise<ModelStorageInfo | null>
  restartApp(): Promise<void>
  updateSettings(patch: AppSettingsPatch): Promise<AppSettings>
  onSettingsChanged(listener: (settings: AppSettings) => void): () => void
  listMeetings(): Promise<MeetingMeta[]>
  getMeeting(meetingId: string): Promise<MeetingMeta | null>
  readMeeting(meetingId: string): Promise<CaptionSegment[]>
  renameMeeting(meetingId: string, title: string): Promise<MeetingMeta>
  /** An empty string clears the note. */
  setMeetingNotes(meetingId: string, notes: string): Promise<MeetingMeta>
  deleteMeeting(meetingId: string): Promise<boolean>
  exportMeeting(meetingId: string, format: 'txt' | 'srt' | 'vtt'): Promise<string | null>
  getMeetingAudioUrl(meetingId: string): Promise<string | null>
  getDiagnostics(): Promise<Record<string, string | number>>
  copyDiagnostics(): Promise<void>
  hasTranslationCredential(provider: 'microsoft' | 'openai'): Promise<boolean>
  setTranslationCredential(provider: 'microsoft' | 'openai', value: string): Promise<void>
}
