import type {
  AudioDevice,
  CaptionSegment,
  EngineEvent,
  EngineProcessState,
  HubInspectResult,
  HubSearchResult,
  MeetingMeta,
  ResourceRecord,
  ResourceSnapshot,
  SessionConfig,
} from './contracts'
import type { AppSettings, AppSettingsPatch, CredentialProvider } from './settings'
import type { ComputeSnapshot, RuntimeSnapshot } from './compute'

export type SessionStartResult = { sessionId: string; meetingId: string | null }
export type ModelStorageInfo = { activePath: string; configuredPath: string; restartRequired: boolean }

/**
 * **主进程自己发的**引擎生命周期事件，不是引擎发的话。
 *
 * 存在的理由：渲染进程分不清「引擎从没被启动过」「引擎起不来」「引擎跑着跑着死了」，
 * 而这三件事的后果完全不同（什么都不用做 / 报错并给重试 / 正在播的会话已经没引擎了）。
 * `EngineProcess` 一直有 `state` 事件，只是从来没被转发到界面，于是界面只能靠
 * 「失败那一刻它是不是还在 booting」这种推断去猜 —— 猜错过三次。
 *
 * 刻意**不带** `protocolVersion` / `requestId` 信封：它不是协议报文，不进协议校验，
 * 也不该被误当成可以喂给 `parseEventLine` 的东西。`type` 与 `EngineEvent` 的任何一个
 * 变体都不重名，所以判别联合能正常收窄，两者在下游互不污染。
 */
export type EngineLifecycleEvent = {
  type: 'engineStateChanged'
  state: EngineProcessState
}

/**
 * 渲染进程在 `engine:event` 通道上会收到的**全部**东西。
 *
 * **这是一个取舍，不是疏漏。** 通道名与 `onEngineEvent` 这个名字都是按「引擎协议事件」
 * 起的，现在其中一支是主进程产生的、引擎根本不知道其存在。之所以合流而不是再开一条
 * 通道：每多一条通道就多一份 preload 转发、桥接签名与 dispose 清单，而生命周期事件的
 * 送达保证与协议事件**完全一致**（同一条 IPC 管道，同一个发送顺序），合并之后
 * 「引擎握手完成」与「引擎进程就绪」在渲染进程看来还是严格有序的 —— 而这正是
 * `startSession` 过去靠报文顺序做推断时依赖的性质。代价就是现在这条通道的载荷类型
 * 名不副实，`switch (event.type)` 的读者需要知道多了一个不是引擎发来的分支。
 * 替代方案是第二条通道（更诚实的名字，多约 20 行接线与一处 dispose 清单），
 * 当初选合流是因为本仓的取向是「能自我解释的最小改动」。
 */
export type EngineChannelEvent = EngineEvent | EngineLifecycleEvent

/** Pages the caption overlay can send the main window to; must stay in sync with `OVERLAY_PAGES` in the main process. */
export type OverlayTargetPage = 'appearance' | 'captions' | 'resources' | 'translation'

export type NolaTranslatorApi = {
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
   * Search Hugging Face for candidate models.
   *
   * Search filters published PyTorch/GGUF weights using metadata. Categories narrow the server
   * query; README excerpts and runtime installation checks do not block the list response.
   */
  searchHuggingFace(query: string, kind: 'all' | 'asr' | 'mt' | 'quant', cursor?: string): Promise<HubSearchResult>
  /** What one repo declares about itself, and whether the engine can run it. Read-only. */
  inspectHuggingFace(repo: string): Promise<HubInspectResult>
  /** A plain text excerpt from the repository's README, fetched separately from search. */
  getHuggingFaceModelCard(repo: string, revision?: string): Promise<string>
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
  onEngineEvent(listener: (event: EngineChannelEvent) => void): () => void
  /**
   * 读引擎子进程**当前**的状态。只读、且**绝不**去启动引擎 ——
   * 问「引擎在不在」这件事本身不能成为启动它的理由。
   *
   * 与 `onEngineEvent` 是一对：那条通道只给**变化**，本方法给**当前值**。
   * 两者缺一，界面都会长期停在错误的认知上：只订阅不查询，则引擎在订阅之前就绪的话
   * 什么都不会发来（界面永远停在「没起过」）；只查询不订阅，则崩溃这类边沿事件永远看不见。
   * 订阅之后立刻查一次，是唯一能同时拿到「起始电平」与「后续边沿」的形状。
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
}
