import type { ModelConfiguration } from '../../shared/model-capabilities'
import type { BrowserConnectionAction, BrowserConnectionStatus, BrowserKind } from '../../shared/browser'
/**
 * The renderer's data-access interface: the method and type surface every
 * component reads through. The production implementation is `createIpcBridge()`,
 * which wraps `window.nolaTranslator`. `BRIDGE_TIERS` below keeps the groups
 * above honest: it lists methods, and the channel count moves with preload.
 */

import type { ComputeSnapshot, RuntimeSnapshot } from '../../shared/compute'
import type {
  AppSettings,
  AppSettingsPatch,
  AudioDevice,
  CaptionSegment,
  CredentialProvider,
  EngineChannelEvent,
  EngineEvent,
  EngineProcessState,
  ExportFormat,
  MeetingMeta,
  ModelStorageInfo,
  ResourceRecord,
  ResourceSnapshotWithRate,
  ResourceState,
  SessionConfig,
  SessionStartResult,
} from './types'
import type {
  HubCompatibility,
  HubInspectResult,
  HubModelSummary,
  HubSearchResult,
  PrewarmResult,
} from '../../shared/contracts'

/**
 * These four come straight from `src/shared/contracts` rather than being copied.
 * Re-exported here so every type a component needs still arrives via `@/bridge`.
 */
export type { HubCompatibility, HubInspectResult, HubModelSummary, HubSearchResult } from '../../shared/contracts'
export type { PrewarmErrorCode, PrewarmResult } from '../../shared/contracts'

/** Route id for this app's multi-window UI; `routes.tsx` holds the hash mapping. */
export type RouteId = 'home' | 'workspace' | 'overlay' | 'video-captions' | 'records' | 'record' | 'models' | 'settings'

export interface NolaBridge {
  engine: {
    listComputeDevices(): Promise<ComputeSnapshot>
    listDevices(): Promise<AudioDevice[]>
    listResources(): Promise<ResourceSnapshotWithRate>
    manageResource(resourceId: string, action: 'install' | 'remove' | 'cancel'): Promise<ResourceRecord>
    startSession(config: SessionConfig): Promise<SessionStartResult>
    stopSession(sessionId: string): Promise<void>
    /**
     * Loads the configured recognition and translation weights and answers once
     * they are resident. Progress arrives as `type: 'modelsPrewarmed'` events with
     * `state: 'loading'`; only `ready` and `failed` settle the call. A refusal is
     * a `PrewarmResult` with `state: 'failed'`, not a rejection, so a missing model
     * stays distinguishable from a transport failure.
     */
    prewarmModels(): Promise<PrewarmResult>
    /**
     * Starts the engine process and completes the handshake, loading no weights.
     * The returned state says the process is up, never that captions can run.
     */
    ensureEngineReady(): Promise<EngineProcessState>
    /**
     * Pause/resume, returned synchronously: the UI stops the clock on the
     * press and paints the pause without waiting for the engine. A refusal
     * still arrives as an `error` event that puts the state back to error.
     */
    setPaused(sessionId: string, paused: boolean): void
    /**
     * The engine subprocess state (`stopped | starting | ready | stopping |
     * recovering | failed`). Read-only, and it does not start the engine: it is
     * the level to `events.onEngineEvent`'s edge, so call it once after
     * subscribing to catch an already-ready engine, then keep listening.
     */
    getEngineState(): Promise<EngineProcessState>
  }
  /*
   * Window-level actions for the caption window. `minimize` is a real taskbar
   * minimize, which is why the main process keeps `skipTaskbar: false` so the
   * taskbar icon can bring it back. `close` stops recognition first and then
   * hides the window: hiding alone would leave the engine recording behind it.
   */
  overlay: {
    show(): Promise<void>
    hide(): Promise<void>
    close(): Promise<void>
    minimize(): Promise<void>
    resize(width: number, height: number): Promise<void>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: AppSettingsPatch): Promise<AppSettings>
    browserConnection?(action: BrowserConnectionAction, enabled?: boolean, browser?: BrowserKind): Promise<BrowserConnectionStatus>
    /**
     * Opens or closes the desktop's caption-service gate. Answered with the
     * status in force afterwards, so the page reads the gate from the same
     * answer it paints — the value asked for and the value in force can differ.
     */
    setCaptionService(active: boolean): Promise<BrowserConnectionStatus>
  }
  runtimes: {
    list(): Promise<RuntimeSnapshot>
    prepare(): Promise<RuntimeSnapshot>
    install(id: string, repair?: boolean): Promise<void>
    import(): Promise<boolean>
    cancel(): Promise<void>
  }
  storage: { get(): Promise<ModelStorageInfo>; choose(): Promise<ModelStorageInfo | null>; restartApp(): Promise<void> }
  meetings: {
    list(): Promise<MeetingMeta[]>
    get(id: string): Promise<MeetingMeta | null>
    read(id: string): Promise<CaptionSegment[]>
    rename(id: string, title: string): Promise<MeetingMeta>
    /** Meeting notes. Written by the main process; exports stay caption-only (TXT/SRT/VTT). */
    setNotes(id: string, notes: string): Promise<MeetingMeta>
    remove(id: string): Promise<boolean>
    /** The path of the file the main process wrote, not its text. */
    export(id: string, format: ExportFormat): Promise<string | null>
    audioUrl(id: string): Promise<string | null>
  }
  diagnostics: { get(): Promise<Record<string, string | number>>; copy(): Promise<void> }
  /**
   * Opens the user's default browser with **no URL** — the video-captions page's "open browser"
   * button, which must not invent a start page to satisfy `shell.openExternal`.
   */
  app: { openDefaultBrowser(): Promise<void> }
  translation: { hasCredential(p: CredentialProvider): Promise<boolean>; setCredential(p: CredentialProvider, v: string): Promise<void> }
  events: {
    /**
     * Engine events. The payload is `EngineChannelEvent` = the engine's
     * protocol events union the main process's lifecycle `engineStateChanged`,
     * forwarded on one channel so the UI can tell "never started" from
     * "cannot start" from "reconnecting" without inferring any of it.
     */
    onEngineEvent(cb: (e: EngineChannelEvent) => void): () => void
    onSettingsChanged(cb: (s: AppSettings) => void): () => void
    /**
     * The overlay asking the main window to navigate. Two arguments: `route`
     * highlights the nav item, `path` is what actually changes the hash — a bare
     * `route: 'settings'` cannot tell the appearance tab from translation.
     */
    onOverlayRequest(cb: (route: RouteId, path: string) => void): () => void
  }
  /**
   * Hugging Face metadata search, filtered by PyTorch/GGUF. The README loads
   * asynchronously; the runtime adapter check happens at install time.
   */
  models: {
    configureModel(resourceId: string, configuration: ModelConfiguration): Promise<ResourceRecord>
    searchHuggingFace(query: string, kind: 'all' | 'asr' | 'mt' | 'quant', cursor?: string): Promise<HubSearchResult>
    /** Read-only re-check of one repo, independent of the search list. */
    inspectHuggingFace(repo: string): Promise<HubInspectResult>
    getHuggingFaceModelCard(repo: string, revision?: string): Promise<string>
    /**
     * Verdict, registration, then the download. The engine refuses a repo it
     * cannot run before transferring a byte, so a rejection here carries a
     * compatibility reason, not a half-finished download. Progress, cancel and
     * removal afterwards take the built-in model's route (`resourceChanged`).
     */
    installHuggingFaceModel(repo: string, slot?: 'recognition' | 'translation'): Promise<ResourceRecord>
  }
  /**
   * tier 'ipc-new': the main process has no feedback channel.
   */
  feedback: { submit(text: string): Promise<void> }
}

/**
 * `'ipc'` means the main process has the channel, `'ipc-new'` that it does not.
 * Two methods have no UI caller: `overlay.hide` and `overlay.resize`.
 */
export const BRIDGE_TIERS: Record<string, 'ipc' | 'ipc-new'> = {
  'engine.listDevices': 'ipc',
  'engine.listResources': 'ipc',
  'engine.manageResource': 'ipc',
  'engine.startSession': 'ipc',
  'engine.prewarmModels': 'ipc',
  'engine.ensureEngineReady': 'ipc',
  'engine.stopSession': 'ipc',
  'engine.setPaused': 'ipc',
  'engine.getEngineState': 'ipc',
  'overlay.show': 'ipc',
  'overlay.hide': 'ipc',
  'overlay.close': 'ipc',
  'overlay.minimize': 'ipc',
  'overlay.resize': 'ipc',
  'settings.get': 'ipc',
  'settings.update': 'ipc',
  'settings.setCaptionService': 'ipc',
  'storage.get': 'ipc',
  'storage.choose': 'ipc',
  'storage.restartApp': 'ipc',
  'meetings.list': 'ipc',
  'meetings.get': 'ipc',
  'meetings.read': 'ipc',
  'meetings.rename': 'ipc',
  'meetings.remove': 'ipc',
  'meetings.export': 'ipc',
  'meetings.audioUrl': 'ipc',
  'diagnostics.get': 'ipc',
  'diagnostics.copy': 'ipc',
  'app.openDefaultBrowser': 'ipc',
  'translation.hasCredential': 'ipc',
  'translation.setCredential': 'ipc',
  'events.onEngineEvent': 'ipc',
  'events.onSettingsChanged': 'ipc',
  'events.onOverlayRequest': 'ipc',
  'models.searchHuggingFace': 'ipc',
  'models.configureModel': 'ipc',
  'models.inspectHuggingFace': 'ipc',
  'models.getHuggingFaceModelCard': 'ipc',
  'models.installHuggingFaceModel': 'ipc',
  'feedback.submit': 'ipc-new',
}

/**
 * The channel exists (it is listed in `BRIDGE_TIERS` above); what is missing is
 * a field in the main process's types. The renderer already bridges it with the
 * `ResourceRecordWithRate` intersection type.
 */
export const BRIDGE_MISSING_FIELDS: Record<string, string> = {
  'engine.listResources().bytesPerSecond': 'ResourceRecord',
}

/**
 * Where a UI method name differs from the preload method name, and what the
 * adapter has to do about it. Tiered `'ipc'` because the channel does exist;
 * the adaptation cost is what this table records.
 */
export const BRIDGE_ADAPTER_NOTES: Record<string, string> = {
  'engine.prewarmModels': 'preload: prewarmModels() · engine:prewarm-models — 无参数，载荷由主进程从设置读出（引擎按 compute 键缓存已加载权重，调用方再传一份就会缓存不命中）；loading 态走事件通道，返回值只可能是 ready / failed',
  'engine.ensureEngineReady': 'preload: ensureEngineReady() · engine:ensure-ready — 只拉起进程并握手，不加载权重，返回值是进程状态而不是「字幕可用」',
  'engine.setPaused': 'preload: setSessionPaused(sessionId, paused) · engine:set-session-paused — bridge 上是同步 void，promise 的失败走 error 事件',
  'engine.getEngineState': 'preload: getEngineState() · engine:get-state — 只读，名字与语义都与主进程一致，适配器不做任何翻译（主进程那条处理器刻意不调 ensureReady，否则「问引擎在不在」会变成「启动引擎」）',
  'events.onEngineEvent':
    'preload: onEngineEvent(listener) · engine:event — 载荷是 EngineChannelEvent（协议事件 ∪ 主进程发的 engineStateChanged）。适配器原样透传，**不做**类型筛除：把生命周期事件滤掉就等于把「引擎崩了」重新变回界面看不见，而它靠推断已经猜错过三次。状态机归 sessionStore（ENGINE_PROCESS_STATE_TO_UI）',
  'overlay.close': 'preload: closeOverlay() · overlay:close（连带停识别，与 hideOverlay 语义不同）',
  'overlay.minimize': 'preload: minimizeOverlay() · overlay:minimize（真最小化到任务栏）',
  'meetings.remove': 'preload: deleteMeeting(meetingId) · meeting:delete（bridge 上叫 remove：delete 是保留字）',
  'meetings.export': 'preload: exportMeeting(meetingId, format) · meeting:export（返回写好的文件路径，不是文本）',
  'events.onOverlayRequest':
    'preload: onOpenAppearance(listener) · app:appearance-requested — 载荷类型不同：主仓发 OverlayTargetPage，界面用 RouteId + 目标 hash；ipcBridge 负责映射',
  'models.searchHuggingFace':
    "preload: searchHuggingFace(query, kind) · hub:search — kind 是界面词汇，'asr'→slot recognition、'mt'→slot translation，映射在主进程；返回值是 HubSearchResult 而不是 ResourceRecord[]，因为能不能装是引擎判定的，不是一条本地记录",
  'models.configureModel': 'preload: configureModel(resourceId, configuration)',
  'models.inspectHuggingFace': 'preload: inspectHuggingFace(repo) · hub:inspect（只读复查单个仓库，不注册不下载）',
  'models.installHuggingFaceModel':
    'preload: installHuggingFaceModel(repo, slot?) · hub:install（返回的是注册后的 ResourceRecord，之后的进度/取消/卸载与内置模型同一条路）',
  'feedback.submit': 'NO CHANNEL — 主进程必须新增 app:feedback',
  'app.openDefaultBrowser': 'preload: openDefaultBrowser() · app:open-default-browser — 不带 URL，适配器原样透传；选哪个浏览器是主进程读注册表决定的，不是这里，也不是渲染进程',
  'settings.setCaptionService':
    'preload: setCaptionService(active) · browser:caption-service — 字幕服务闸门，不是 engine:prewarm-models 的加载态；返回 BrowserConnectionStatus 而非 boolean，页面挂载时用 browserConnection(\'status\') 读初值，两者读的是同一个字段 captionServiceActive',
}

/**
 * Flattens the engine's `state + phase` into the state the model list draws.
 * The engine reports `running` for anything in flight, so `phase` is what
 * separates "queued" from "verifying" — a distinction the list acts on, and one
 * that lives here rather than in five components.
 */
export function resourceStateOf(record: ResourceRecord): ResourceState {
  if (record.state === 'failed') return 'failed'
  if (record.state === 'running') {
    if (record.phase === 'verify' || record.phase === 'install') return 'verifying'
    if (record.phase === 'resolve') return 'queued'
    return 'downloading'
  }
  return record.installed ? 'installed' : 'absent'
}
