/**
 * 应用级 store 集合与唯一的注入点。
 *
 * 关键约定：**模块顶层不允许碰 bridge**。四个域的 store 在模块作用域创建（这样 React 组件
 * 可以直接 import 并订阅），但 bridge 是 `initStores(bridge)` 传进来的。原因有两个：
 * 单测要能先构造 store 再塞一个假 bridge；Electron 侧也必须在 preload 之后才拿到通道。
 * 任何在模块顶层调用 bridge 的写法都会让这两件事做不到。
 *
 * 用法：
 * ```ts
 * // main.tsx
 * initStores(createIpcBridge())
 * ```
 * ```ts
 * // 任意组件
 * const settings = useStore(settingsStore, (s) => s.settings)
 * ```
 *
 * 每个域的 `state.error` 都是**诊断串**（引擎抛的原文，可能是中文），不经过 i18n。
 * 界面要显示错误时必须用 `errorCode` / `errors.*` 这类大写下划线码去 `t()` 里查，
 * 不要把 `state.error` 直接渲染到屏幕上。`state.error` 只用来写 console 与"复制诊断"。
 */

import type { NolaBridge } from '@/bridge'

import { attachSettingsStore, detachSettingsStore, settingsStore, flushPendingSettings } from './settingsStore'
import { attachMeetingsStore, detachMeetingsStore, meetingsStore } from './meetingStore'
import { attachModelsStore, detachModelsStore, modelsStore } from './modelStore'
import { attachSessionStore, detachSessionStore, sessionStore } from './sessionStore'

import * as settingsActions from './settingsStore'
import * as meetingsActions from './meetingStore'
import * as modelsActions from './modelStore'
import * as sessionActions from './sessionStore'

export const stores = {
  settings: settingsStore,
  meetings: meetingsStore,
  models: modelsStore,
  session: sessionStore,
} as const

export const actions = {
  settings: settingsActions,
  meetings: meetingsActions,
  models: modelsActions,
  session: sessionActions,
} as const

export type AppStores = typeof stores

let injected: NolaBridge | null = null
/** 引擎在不在。由 `initStores` 记下，界面据此决定"读空态"还是"提示没连上"。 */
let engineConnected = true

export interface InitStoresOptions {
  /**
   * 引擎在不在。`false`（`main.tsx` 问 `isIpcBridgeAvailable()` 拿到的值）时不挂订阅、
   * 也不发首屏三个拉取：四个域停在初始空态，页面照常渲染自己的空态。
   *
   * **默认 `true`**：单测注入的是假 bridge，没有"引擎"可言，不该被判成降级。
   */
  engineConnected?: boolean
}

/**
 * 注入 bridge，挂上事件订阅，并触发首屏需要的三个拉取。
 *
 * `meetings` / `models` / `settings` 都并行拉，失败只写进各自的 `error`，
 * 不会让另外两个域的界面也进不了。
 *
 * `engineConnected: false` 走另一条路：一次调用都不发。这是本文件里唯一"什么都不做"的分支，
 * 理由是**失败的诚实性**—— 每个调用都会 reject，reject 会被写进 `state.error`，而页面拿
 * `state.error` 去渲染的是 `errors.*` 里**别的**错误码：模型页会因此显示"模型下载中断，已保留
 * 部分文件。NET-006"。引擎根本没连上却报下载失败，比不报更糟。所以让 store 保持干净，
 * 由 `main.tsx` 的横幅把"没连上引擎"这句话讲出来。
 */
export function initStores(bridge: NolaBridge, options: InitStoresOptions = {}): void {
  injected = bridge
  engineConnected = options.engineConnected ?? true
  if (!engineConnected) return

  attachSettingsStore(bridge)
  attachMeetingsStore(bridge)
  attachModelsStore(bridge)
  attachSessionStore(bridge)

  void actions.settings.loadSettings().catch(() => undefined)
  void actions.meetings.loadMeetings().catch(() => undefined)
  void actions.models.loadModels().catch(() => undefined)
}

/** 已经注入的 bridge；没注入时返回 null，组件据此决定是读缓存还是读空态。 */
export function getBridge(): NolaBridge | null {
  return injected
}

/**
 * 引擎在不在。没连上时四个域停在空态，界面应当显示"没连上"，**不要**显示"加载中"。
 *
 * 读法与 `getBridge()` 一样是普通函数而不是订阅：preload 在 document-start 注入，
 * 这个值在文档生命周期内不会变，订阅它只会多一次无意义的重渲染。
 */
export function isEngineConnected(): boolean {
  return engineConnected
}

/** 窗口卸载前的收尾：把还在防抖窗口里的设置写出去。 */
export async function disposeStores(): Promise<void> {
  await flushPendingSettings()
  detachSettingsStore()
  detachMeetingsStore()
  detachModelsStore()
  detachSessionStore()
  injected = null
  // 回到默认值：下次 initStores 没显式传就是 true。
  engineConnected = true
}

export { createStore, useStore } from './createStore'
export type { Store, StoreListener, StorePatch, StoreUpdater } from './createStore'

export { settingsStore } from './settingsStore'
export type { SettingsState } from './settingsStore'
export { meetingsStore } from './meetingStore'
export type { MeetingsState, MeetingDetail } from './meetingStore'
export { modelsStore } from './modelStore'
export type { ModelsState, HubSearchState, HubKind } from './modelStore'
export { sessionStore, findMissingResource, MAX_FINALIZED_SEGMENTS } from './sessionStore'
export type { SessionState, MissingResource } from './sessionStore'

export {
  loadSettings,
  updateSettings,
  chooseStorageDirectory,
  restartAppForStorage,
  clearSettingsError,
} from './settingsStore'
export {
  loadMeetings,
  loadMeetingDetail,
  renameMeeting,
  setMeetingNotes,
  removeMeeting,
  exportMeeting,
  clearMeetingsError,
} from './meetingStore'
export {
  loadModels,
  manageResource,
  searchHub,
  clearHubSearch,
  setTranslationCredential,
  clearModelsError,
} from './modelStore'
export {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  resetSessionError,
  clearSessionTranscript,
} from './sessionStore'
