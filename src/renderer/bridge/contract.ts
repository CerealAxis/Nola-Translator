/**
 * 界面上**唯一**允许谈论的数据访问接口。
 *
 * 组件只 import `NolaBridge`，不碰这个文件夹里的实现。生产构建里只有一个实现 ——
 * `createIpcBridge()`，它包在 `window.nolaTranslator` 外面。
 * 方法分组与主仓 preload 暴露的方法一一对应（`BRIDGE_TIERS` 就是让这句话保持诚实的保险丝），
 * 唯一没被界面用上的是 `overlay.hide`：它是纯隐藏（不中断同传），而界面上「收起字幕窗」
 *  走的是 `overlay.close`（连带停识别）与 `overlay.minimize`（真最小化）。
 * `BRIDGE_TIERS` 是**方法**清单，通道数会随 preload 增减，以它为准，别在注释里写死数字。
 */

import type {
  AppSettings,
  AppSettingsPatch,
  AudioDevice,
  CaptionSegment,
  CloudTranslationProvider,
  EngineEvent,
  ExportFormat,
  MeetingMeta,
  ModelStorageInfoWithTotal,
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
} from '../../shared/contracts'

/**
 * Hub 那四个类型从主仓 `src/shared/contracts` 原样透出，不在这里重抄。
 * `types.ts` 是「类型出口」，但它不在本文件的所有权内，所以转出放在这里 ——
 * 组件仍然只从 `@/bridge` 拿类型，路径写法不因为这个安排而变。
 */
export type { HubCompatibility, HubInspectResult, HubModelSummary, HubSearchResult } from '../../shared/contracts'

/** 本应用的路由 id。主仓原本是「单窗口 + 一个浮窗」，没有这套概念；新 UI 有了。 */
export type RouteId = 'home' | 'workspace' | 'overlay' | 'records' | 'record' | 'models' | 'settings'

export interface NolaBridge {
  engine: {
    listDevices(): Promise<AudioDevice[]>
    listResources(): Promise<ResourceSnapshotWithRate>
    manageResource(resourceId: string, action: 'install' | 'remove' | 'cancel'): Promise<ResourceRecord>
    startSession(config: SessionConfig): Promise<SessionStartResult>
    stopSession(sessionId: string): Promise<void>
    /**
     * 暂停/恢复。**同步返回**：界面在按下那一刻就停表并把状态画成暂停，不等引擎往返。
     * 引擎拒绝时照样会有 `error` 事件把状态打回 error，那条路径负责如实报错。
     */
    setPaused(sessionId: string, paused: boolean): void
  }
  /*
   * 字幕窗的窗口级动作。
   *
   * `minimize` 是**真最小化**到任务栏，不是把卡片折起来。恢复靠用户点任务栏图标，
   * 所以主进程那边字幕窗是 `skipTaskbar: false`。
   *
   * `close` 会**连带停掉识别服务**再关窗：用户说「关闭」时指的是「这场同传结束了」，
   * 只关窗留着服务在跑，用户会以为它还在录。主仓的 `hideOverlay` 是不停识别的
   * （`src/main/ipc.ts` 只有一行 `.hide()`），这里是有意偏离，因为按钮语义不同。
   */
  overlay: {
    show(): Promise<void>
    hide(): Promise<void>
    close(): Promise<void>
    minimize(): Promise<void>
    resize(width: number, height: number): Promise<void>
  }
  settings: { get(): Promise<AppSettings>; update(patch: AppSettingsPatch): Promise<AppSettings> }
  storage: { get(): Promise<ModelStorageInfoWithTotal>; choose(): Promise<ModelStorageInfoWithTotal | null>; restartApp(): Promise<void> }
  meetings: {
    list(): Promise<MeetingMeta[]>
    get(id: string): Promise<MeetingMeta | null>
    read(id: string): Promise<CaptionSegment[]>
    rename(id: string, title: string): Promise<MeetingMeta>
    /** 会议笔记。写盘在主进程，导出时不带笔记（TXT/SRT/VTT 仍是纯字幕）。 */
    setNotes(id: string, notes: string): Promise<MeetingMeta>
    remove(id: string): Promise<boolean>
    /** 返回主进程写好的文件路径，不是文本 —— 文件是主进程写的。 */
    export(id: string, format: ExportFormat): Promise<string | null>
    audioUrl(id: string): Promise<string | null>
  }
  diagnostics: { get(): Promise<Record<string, string | number>>; copy(): Promise<void> }
  translation: { hasCredential(p: CloudTranslationProvider): Promise<boolean>; setCredential(p: CloudTranslationProvider, v: string): Promise<void> }
  events: {
    onEngineEvent(cb: (e: EngineEvent) => void): () => void
    onSettingsChanged(cb: (s: AppSettings) => void): () => void
    /**
     * 浮窗请求主窗跳转。**两个参数**：`route` 用来高亮导航项，
     * `path` 用来真的改 hash —— 只给 `route: 'settings'` 分不出 appearance 与 translation 两个 tab。
     */
    onOverlayRequest(cb: (route: RouteId, path: string) => void): () => void
  }
  /**
   * Hugging Face 元数据搜索，按 PyTorch/GGUF 格式筛选。
   * README 异步加载，运行时适配器检查在安装时执行。
   */
  models: {
    searchHuggingFace(query: string, kind: 'all' | 'asr' | 'mt' | 'quant'): Promise<HubSearchResult>
    /** 单个仓库的运行时检查；与搜索列表独立。 */
    inspectHuggingFace(repo: string): Promise<HubInspectResult>
    getHuggingFaceModelCard(repo: string, revision?: string): Promise<string>
    /**
     * 判定 + 注册 + 起下载。引擎在**传输任何字节之前**就会拒绝跑不了的仓库，
     * 所以这里抛错时给的是兼容性理由而不是半截下载。之后的进度、取消、卸载走
     * 与内置模型完全相同的那条路（`resourceChanged` 事件 + `manageResource`）。
     */
    installHuggingFaceModel(repo: string, slot?: 'recognition' | 'translation'): Promise<ResourceRecord>
  }
  /**
   * tier:'ipc-new' — 主仓没有反馈通道。接上它意味着新增一个 `app:feedback` invoke。
   */
  feedback: { submit(text: string): Promise<void> }
}

// ---------------------------------------------------------------------------
// 能力清单 —— 防漂移的保险丝
// ---------------------------------------------------------------------------

/**
 * `'ipc'`     主仓已经有对应通道，换掉 bridge 实现就能工作，主进程零改动。
 * `'ipc-new'` 主仓**没有**对应通道。标在这里的都是主进程还没兑现的承诺，
 *              这样审阅的人不读适配器也能看出迁移代价。
 *
 * 往 `NolaBridge` 加方法却不往这张图里加，请当成 bug 处理：这张图才是清单，接口只是一半契约。
 */
export const BRIDGE_TIERS: Record<string, 'ipc' | 'ipc-new'> = {
  'engine.listDevices': 'ipc',
  'engine.listResources': 'ipc',
  'engine.manageResource': 'ipc',
  'engine.startSession': 'ipc',
  'engine.stopSession': 'ipc',
  'engine.setPaused': 'ipc',
  'overlay.show': 'ipc',
  'overlay.hide': 'ipc',
  'overlay.close': 'ipc',
  'overlay.minimize': 'ipc',
  'overlay.resize': 'ipc',
  'settings.get': 'ipc',
  'settings.update': 'ipc',
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
  'translation.hasCredential': 'ipc',
  'translation.setCredential': 'ipc',
  'events.onEngineEvent': 'ipc',
  'events.onSettingsChanged': 'ipc',
  'events.onOverlayRequest': 'ipc',
  'models.searchHuggingFace': 'ipc',
  'models.inspectHuggingFace': 'ipc',
  'models.getHuggingFaceModelCard': 'ipc',
  'models.installHuggingFaceModel': 'ipc',
  'feedback.submit': 'ipc-new',
}

/**
 * tier: 'ipc-new' — 通道是 `'ipc'`（上面 BRIDGE_TIERS 已列），缺的是主仓**类型**里要补的字段。
 * 渲染层已经用交叉类型（`ResourceRecordWithRate` / `ModelStorageInfoWithTotal`）把它们接上了，
 * 主仓补完字段后把这两个交叉类型换回裸类型即可，UI 与 store 都不用动。
 */
export const BRIDGE_MISSING_FIELDS: Record<string, string> = {
  'storage.get().totalBytes': 'ModelStorageInfo',
  'engine.listResources().bytesPerSecond': 'ResourceRecord',
}

/**
 * 界面方法名与 preload 方法名不一致的地方，以及适配器要付的代价。
 * 标成 `'ipc'` 是因为通道确实存在 —— 适配成本记在这张表里。
 */
export const BRIDGE_ADAPTER_NOTES: Record<string, string> = {
  'engine.setPaused': 'preload: setSessionPaused(sessionId, paused) · engine:set-session-paused — bridge 上是同步 void，promise 的失败走 error 事件',
  'overlay.close': 'preload: closeOverlay() · overlay:close（连带停识别，与 hideOverlay 语义不同）',
  'overlay.minimize': 'preload: minimizeOverlay() · overlay:minimize（真最小化到任务栏）',
  'meetings.remove': 'preload: deleteMeeting(meetingId) · meeting:delete（bridge 上叫 remove：delete 是保留字）',
  'meetings.export': 'preload: exportMeeting(meetingId, format) · meeting:export（返回写好的文件路径，不是文本）',
  'events.onOverlayRequest':
    'preload: onOpenAppearance(listener) · app:appearance-requested — 载荷类型不同：主仓发 OverlayTargetPage，界面用 RouteId + 目标 hash；ipcBridge 负责映射',
  'models.searchHuggingFace':
    "preload: searchHuggingFace(query, kind) · hub:search — kind 是界面词汇，'asr'→slot recognition、'mt'→slot translation，映射在主进程；返回值是 HubSearchResult 而不是 ResourceRecord[]，因为能不能装是引擎判定的，不是一条本地记录",
  'models.inspectHuggingFace': 'preload: inspectHuggingFace(repo) · hub:inspect（只读复查单个仓库，不注册不下载）',
  'models.installHuggingFaceModel':
    'preload: installHuggingFaceModel(repo, slot?) · hub:install（返回的是注册后的 ResourceRecord，之后的进度/取消/卸载与内置模型同一条路）',
  'feedback.submit': 'NO CHANNEL — 主进程必须新增 app:feedback',
}

// ---------------------------------------------------------------------------
// 共享推导
// ---------------------------------------------------------------------------

/**
 * 把引擎的 `state + phase` 压成模型列表要画的那台扁平状态机。
 *
 * 引擎对任何在途的事都只报 `running`，所以真正区分「排队中」与「校验和」的是 `phase` ——
 * 下载列表给这两种状态不同的操作入口，而这个区别住在这里，而不是散在五个组件里。
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
