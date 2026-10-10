import type { ModelConfiguration } from './model-capabilities'
import type {
  AudioDevice,
  CaptionSegment,
  EngineEvent,
  EngineProcessState,
  HubInspectResult,
  HubSearchResult,
  MeetingMeta,
  PrewarmResult,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
} from './contracts'
import type { AppSettings, AppSettingsPatch, CredentialProvider } from './settings'
import type { ComputeSnapshot, RuntimeSnapshot } from './compute'
import type { BrowserConnectionAction, BrowserConnectionStatus, BrowserKind } from './browser'

export type SessionStartResult = { sessionId: string; meetingId: string | null }

/**
 * Where models are stored, plus one number measured from that folder.
 * `usedBytes` is optional and absent when the folder cannot be listed — 0 would read as "nothing is
 * stored here", and an invented figure is worse than none.
 */
export type ModelStorageInfo = {
  activePath: string
  configuredPath: string
  restartRequired: boolean
  /**
   * Bytes occupied by everything under `configuredPath`, walked recursively. Absent when the
   * folder itself could not be listed; a subtree that could not be read is skipped, so the figure
   * can sit slightly under the real total.
   */
  usedBytes?: number
}

/**
 * Engine lifecycle emitted by the **main process**, not by the engine. The renderer otherwise
 * cannot tell never-started from failed-to-start from died-mid-session.
 * `type` collides with no `EngineEvent` variant, so the union still narrows.
 */
export type EngineLifecycleEvent = {
  type: 'engineStateChanged'
  state: EngineProcessState
}

/**
 * Everything the renderer receives on the `engine:event` channel, including the main process's
 * own lifecycle events — the channel name and `onEngineEvent` predate that branch. Merged rather
 * than split because one pipe keeps ordering: the protocol handshake and the process-ready state
 * stay strictly ordered, which is what `startSession` used to infer from message order.
 */
export type EngineChannelEvent = EngineEvent | EngineLifecycleEvent

/** Pages the caption overlay can send the main window to. */
export type OverlayTargetPage = 'appearance' | 'captions' | 'resources' | 'translation' | 'torch' | 'llama'

export type NolaTranslatorApi = {
  openRuntimeSettings(component: 'engine' | 'llama'): Promise<void>
  browserConnection?(action: BrowserConnectionAction, enabled?: boolean, browser?: BrowserKind): Promise<BrowserConnectionStatus>
  listDevices(): Promise<AudioDevice[]>
  listComputeDevices(): Promise<ComputeSnapshot>
  getRuntimes(): Promise<RuntimeSnapshot>
  prepareRuntimes(): Promise<RuntimeSnapshot>
  installRuntime(id: string, repair?: boolean): Promise<void>
  importRuntime(): Promise<boolean>
  cancelRuntimeInstall(): Promise<void>
  listResources(): Promise<ResourceSnapshot>
  manageResource(resourceId: string, action: 'install' | 'remove' | 'cancel'): Promise<ResourceRecord>
  /**
   * Search Hugging Face for candidate models. Filters published PyTorch/GGUF weights from one
   * metadata response; the category narrows the server query, while README reads and runtime
   * installation checks stay off this path.
   */
  searchHuggingFace(query: string, kind: 'all' | 'asr' | 'mt' | 'quant', cursor?: string): Promise<HubSearchResult>
  /** What one repo declares about itself, and whether the engine can run it. Read-only. */
  inspectHuggingFace(repo: string): Promise<HubInspectResult>
  /** A plain text excerpt from the repository's README, fetched separately from search. */
  getHuggingFaceModelCard(repo: string, revision?: string): Promise<string>
  /**
   * Judge a repo, register it, and start its download. The engine judges compatibility *before*
   * transferring anything, so a rejection here is the compatibility reason, not a partial download.
   */
  installHuggingFaceModel(
    repo: string,
    slot?: 'recognition' | 'translation'
  ): Promise<ResourceRecord>
  configureModel(resourceId: string, configuration: ModelConfiguration): Promise<ResourceRecord>
  startSession(config: SessionConfig): Promise<SessionStartResult>
  /**
   * Loads the configured recognition and translation weights and answers when they are resident,
   * which is what "enable captions" means. It takes no session slot: `ensureEngineReady` only
   * starts the engine process, and a browser session opened afterwards reuses these weights.
   * A refusal arrives as `state: 'failed'` with the engine's own `code`, never as a thrown error,
   * so the UI can tell a missing model from a language the model does not cover.
   */
  prewarmModels(): Promise<PrewarmResult>
  /**
   * Starts the engine process and completes the handshake. Weights are *not* loaded — the process
   * is up and its devices can be listed. Distinct from `getEngineState`, which starts nothing.
   */
  ensureEngineReady(): Promise<EngineProcessState>
  stopSession(sessionId: string): Promise<void>
  setSessionPaused(sessionId: string, paused: boolean): Promise<void>
  onEngineEvent(listener: (event: EngineChannelEvent) => void): () => void
  /**
   * The engine subprocess's current state. Read-only, and never starts the engine — asking whether
   * it is up must not itself be a reason to start it. Pairs with `onEngineEvent`: that channel
   * gives changes, this gives the level. Subscribe, then read once, or an engine that was already
   * up emits nothing at all.
   */
  getEngineState(): Promise<EngineProcessState>
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
  hasTranslationCredential(provider: CredentialProvider): Promise<boolean>
  setTranslationCredential(provider: CredentialProvider, value: string): Promise<void>
  /**
   * Opens or closes the desktop's caption-service gate, and answers with the connection
   * status as it stands afterwards. The status is the return value rather than a bare
   * boolean so a caller paints the value that is actually in force — another window may
   * have moved it since this page mounted.
   */
  setCaptionService(active: boolean): Promise<BrowserConnectionStatus>
  /**
   * Opens the user's default browser with no URL. `shell.openExternal` needs a protocol URL, so the
   * main process resolves the registered handler itself; see `open-default-browser.ts`.
   */
  openDefaultBrowser(): Promise<void>
}
