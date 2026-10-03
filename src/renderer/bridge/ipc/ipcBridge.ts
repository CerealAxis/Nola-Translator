/**
 * `NolaBridge` 的真实实现：一层很薄的适配器，包在 `window.nolaTranslator` 外面 ——
 * 也就是 `src/preload/index.ts` 通过 `contextBridge` 注入的那个对象。
 *
 * 方法名逐个抄自 preload API；每个方法对应哪个通道、哪几个还没有通道，见
 * `../contract.ts` 里的 `BRIDGE_TIERS` 与 `BRIDGE_ADAPTER_NOTES`。
 *
 * 下面这一组方法**没有通道**，所以实现成显式 reject 而不是静默 no-op：
 * 一个搜索静悄悄返回 `[]` 的原型，看起来就是一个能用的搜索页。
 */

import type { NolaBridge, RouteId } from '../contract'
import type { NolaTranslatorApi } from '../../../shared/bridge'
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
  OverlayTargetPage,
  ResourceRecord,
  ResourceSnapshotWithRate,
  SessionConfig,
  SessionStartResult,
} from '../types'

/**
 * 浮窗说「我想让主窗打开哪个页面」，本应用说「路由 id」。两套名字互不包含，
 * 所以映射是写出来的而不是 cast 出来的 —— 一个 `RouteId` 被静默 cast 成 `undefined`，
 * 窗口就会留在原来那一页不动。
 *
 * **带 tab 一起给**：`appearance` / `translation` 落在设置页的对应 tab 上。
 * 只写 `settings` 的话两者都会落到 `#/settings/general`，用户点「字幕外观」却看到通用设置页。
 * （`demoBridge` 里那份是带 tab 的正确版本，这里曾经抄错了那一份。）
 */
const OVERLAY_PAGE_TO_ROUTE: Record<OverlayTargetPage, { route: RouteId; path: string }> = {
  appearance: { route: 'settings', path: '#/settings/appearance' },
  captions: { route: 'overlay', path: '#/overlay' },
  resources: { route: 'models', path: '#/models' },
  translation: { route: 'settings', path: '#/settings/translation' },
}

class MissingIpcApiError extends Error {
  constructor(method: string) {
    super(`window.nolaTranslator is not available — ${method} 需要 Electron preload 注入的 IPC 桥接`)
    this.name = 'MissingIpcApiError'
  }
}

/** 整个文件里唯一读 `window.nolaTranslator` 的地方。`?? undefined` 是为了和下面的 `!injected` 判断对齐。 */
function injectedApi(): NolaTranslatorApi | undefined {
  if (typeof window === 'undefined') return undefined
  return window.nolaTranslator ?? undefined
}

/**
 * 桥接在不在，也就是"背后有没有引擎"的**唯一**判据。
 *
 * `initStores` 与 `main.tsx` 的降级横幅都问它，谁也不自己去读 `window`。
 * 组件不 import `bridge/ipc/*`（见 `main.tsx` 顶部），所以页面层没有第二个问法。
 */
export function isIpcBridgeAvailable(): boolean {
  return injectedApi() !== undefined
}

/**
 * 同一个方法名只报一次。缺桥时全应用有五处订阅点（四个域各一处 + `useOverlayNavigation`），
 * 但只落在三个方法名上；不按方法名去重的话 console 里就是同一句话说三遍。
 */
const reportedMissingMethods = new Set<string>()

/**
 * 缺桥的"响亮"出口。
 *
 * 以前这里是**同步 throw**，理由是"空 unsubscribe 会让界面看起来健康地订阅着永远不会来的事件"。
 * 那个理由本身没错，错的是 throw 的**后果**：`main.tsx` 在模块顶层调 `initStores`，throw 会中断整个
 * 模块求值，`createRoot().render()` 那一行根本执行不到 —— 界面永远停在启动画面，
 * `npm run test:ui` 于是每次都截到一张只有 logo 的图还退出码 0。
 *
 * 所以"响亮"改由两处承担：这里按方法名报一次 console，界面上由 `main.tsx` 的横幅说人话。
 * 静默的那一半被去掉了，代价（渲染不崩）换来的是截图里能看见真实界面。
 */
function reportMissingIpcApi(method: string): void {
  if (reportedMissingMethods.has(method)) return
  reportedMissingMethods.add(method)
  console.error('[nola] IPC 桥接缺失', new MissingIpcApiError(method))
}

/**
 * 调用时才去读 API，而不是模块加载时，这样 preload 晚一点注入也不会变成硬失败。
 * 桥接缺失时 reject 一个点名的 `MissingIpcApiError`：有十几个调用都可能失败时，
 * 一句不带方法名的「引擎不可用」几乎等于没说。
 */
function call<T>(method: keyof NolaTranslatorApi, run: (injected: NolaTranslatorApi) => Promise<T>): Promise<T> {
  const injected = injectedApi()
  if (!injected) return Promise.reject(new MissingIpcApiError(String(method)))
  return run(injected)
}

/**
 * 事件订阅与 `call()` 同一套失败时机：缺桥时**在调用时**报一个带方法名的错，并交回一个空 unsubscribe。
 *
 * 不再同步 throw。订阅点全是 `useEffect` / store attach 这种"只要有人写一行就炸"的位置
 * （`initStores` 挂四处，`useOverlayNavigation` 一处），把一个只有 e2e/浏览器环境会遇到的故障
 * 做成 throw，等于让它在**模块求值期**炸掉整个应用。空 unsubscribe 本身也不需要被当成健康信号：
 * 界面能不能用由横幅讲，不由 unsubscribe 讲。
 */
function subscribe<T>(method: keyof NolaTranslatorApi, run: (injected: NolaTranslatorApi) => (listener: (value: T) => void) => () => void, listener: (value: T) => void): () => void {
  const injected = injectedApi()
  if (!injected) {
    reportMissingIpcApi(String(method))
    return () => undefined
  }
  return run(injected)(listener)
}

export function createIpcBridge(): NolaBridge {
  return {
    engine: {
      listDevices: () => call('listDevices', (injected) => injected.listDevices()),
      listResources: () => call('listResources', (injected) => injected.listResources() as Promise<ResourceSnapshotWithRate>),
      manageResource: (resourceId, action) => call('manageResource', (injected) => injected.manageResource(resourceId, action)),
      startSession: (config) => call('startSession', (injected) => injected.startSession(config)) as Promise<SessionStartResult>,
      stopSession: (sessionId) => call('stopSession', (injected) => injected.stopSession(sessionId)),
      /**
       * 暂停/恢复走 preload 新加的 `setSessionPaused`。这里返回同步 void 是有意的：
       * UI 的暂停语义是「立刻停表并把状态画成暂停」，引擎回不回 `status` 事件不参与这件事，
       * 等引擎会让按钮看起来没反应。引擎真拒绝时，`error` 事件照样会把界面打回 error。
       */
      setPaused: (sessionId, paused) => {
        const injected = injectedApi()
        if (!injected) {
          // 同步 void 的 API 不能 reject，没桥时只能报一次。throw 在这里是错的：它从点击
          // 处理函数里抛出去，崩的是用户正在看的那一页，而不是缺桥这件事本身。
          reportMissingIpcApi('setSessionPaused')
          return
        }
        void injected.setSessionPaused(sessionId, paused).catch(() => undefined)
      },
    },
    overlay: {
      show: () => call('showOverlay', (injected) => injected.showOverlay()),
      hide: () => call('hideOverlay', (injected) => injected.hideOverlay()),
      // 主进程已经提供 `overlay:close`（连带停识别）与 `overlay:overlay-minimize`（真最小化），
      // 所以这里没有原型阶段的 `?? hideOverlay()` 降级：降级会让「关闭」静默退化成「隐藏」，
      // 用户以为这场同传结束了，其实识别还在跑。
      close: () => call('closeOverlay', (injected) => injected.closeOverlay()),
      minimize: () => call('minimizeOverlay', (injected) => injected.minimizeOverlay()),
      resize: (width, height) => call('resizeOverlay', (injected) => injected.resizeOverlay(width, height)),
    },
    settings: {
      get: () => call('getSettings', (injected) => injected.getSettings()),
      update: (patch) => call('updateSettings', (injected) => injected.updateSettings(patch)),
    },
    storage: {
      get: () => call('getModelStorage', (injected) => injected.getModelStorage() as Promise<ModelStorageInfoWithTotal>),
      choose: () => call('chooseModelStorageDirectory', (injected) => injected.chooseModelStorageDirectory()),
      restartApp: () => call('restartApp', (injected) => injected.restartApp()),
    },
    meetings: {
      list: () => call('listMeetings', (injected) => injected.listMeetings()),
      get: (id) => call('getMeeting', (injected) => injected.getMeeting(id)),
      read: (id) => call('readMeeting', (injected) => injected.readMeeting(id)),
      rename: (id, title) => call('renameMeeting', (injected) => injected.renameMeeting(id, title)),
      setNotes: (id, notes) => call('setMeetingNotes', (injected) => injected.setMeetingNotes(id, notes)),
      remove: (id) => call('deleteMeeting', (injected) => injected.deleteMeeting(id)),
      /**
       * 主进程写盘并回传文件路径，界面用 `shell.showItemInFolder` 之类的动作去打开它。
       * 原型那份 mock 直接返回文本，纯粹是为了让下载按钮在浏览器里能测。
       */
      export: (id, format) => call('exportMeeting', (injected) => injected.exportMeeting(id, format)),
      audioUrl: (id) => call('getMeetingAudioUrl', (injected) => injected.getMeetingAudioUrl(id)),
    },
    diagnostics: {
      get: () => call('getDiagnostics', (injected) => injected.getDiagnostics()),
      copy: () => call('copyDiagnostics', (injected) => injected.copyDiagnostics()),
    },
    translation: {
      hasCredential: (provider) => call('hasTranslationCredential', (injected) => injected.hasTranslationCredential(provider)),
      setCredential: (provider, value) => call('setTranslationCredential', (injected) => injected.setTranslationCredential(provider, value)),
    },
    events: {
      onEngineEvent: (cb) => subscribe('onEngineEvent', (injected) => injected.onEngineEvent, cb),
      onSettingsChanged: (cb) => subscribe('onSettingsChanged', (injected) => injected.onSettingsChanged, cb),
      /**
       * 载荷类型不同：主进程发的是 `OverlayTargetPage`，界面用的是 `RouteId`。
       * 除了路由 id 还带上目标 hash —— 光有 `route: 'settings'` 分不出 appearance 与 translation。
       * 界面在**主窗**里监听它：主窗才是那个有 hash 路由的文档，浮窗自己发给自己没有意义。
       */
      onOverlayRequest: (cb) => subscribe('onOpenAppearance', (injected) => injected.onOpenAppearance, (page) => {
        const target = OVERLAY_PAGE_TO_ROUTE[page]
        cb(target.route, target.path)
      }),
    },
    models: {
      /*
       * 三个 Hub 方法都真调 preload。判定（`compatibility`）在引擎里发生一次，
       * 这里是原样透传：适配器一旦替引擎"再解释"一遍，可安装性就会有两个来源。
       */
      searchHuggingFace: (query, kind) =>
        call('searchHuggingFace', (injected) => injected.searchHuggingFace(query, kind)),
      inspectHuggingFace: (repo) => call('inspectHuggingFace', (injected) => injected.inspectHuggingFace(repo)),
      getHuggingFaceModelCard: (repo, revision) =>
        call('getHuggingFaceModelCard', (injected) => injected.getHuggingFaceModelCard(repo, revision)),
      installHuggingFaceModel: (repo, slot) =>
        call('installHuggingFaceModel', (injected) => injected.installHuggingFaceModel(repo, slot)),
    },
    feedback: {
      // tier:'ipc-new' — 主进程没有 `app:feedback` 通道。见 BRIDGE_TIERS。
      submit: () => Promise.reject(new Error('app:feedback 通道尚未在主进程实现（ipc-new）')),
    },
  }
}
