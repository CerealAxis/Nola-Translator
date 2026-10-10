/**
 * The app's stores and the single injection point for the bridge. Each domain's
 * `state.error` is a diagnostic string (the engine's own text, possibly Chinese)
 * remains available as a concrete reason alongside translated error actions.
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
/** Whether the engine is there. `initStores` records it so the UI can read an empty state or say it is not connected. */
let engineConnected = true

export interface InitStoresOptions {
  /**
   * Whether the engine is there — `main.tsx` passes `isIpcBridgeAvailable()`.
   * When false, no subscription is attached and no first-screen fetch is sent,
   * so each domain sits empty and renders its own empty state. Defaults to
   * `true`: a test's fake bridge has no engine behind it and is not degraded.
   */
  engineConnected?: boolean
  /** Only the main window needs settings diagnostics; the caption overlay reuses engine events. */
  backgroundChecks?: boolean
}

/**
 * Injects the bridge, attaches the event subscriptions and fires the three
 * first-screen fetches in parallel; a failure lands in that domain's own
 * `error`. With `engineConnected: false` not one call is sent — each would
 * reject into an `error` that the pages render as some unrelated code.
 */
export function initStores(bridge: NolaBridge, options: InitStoresOptions = {}): void {
  injected = bridge
  engineConnected = options.engineConnected ?? true
  if (!engineConnected) return

  attachSettingsStore(bridge, options.backgroundChecks ?? true)
  attachMeetingsStore(bridge)
  attachModelsStore(bridge)
  attachSessionStore(bridge)

  void actions.settings.loadSettings().catch(() => undefined)
  if (options.backgroundChecks !== false) {
    void actions.settings.loadRuntimeComponents().catch(() => undefined)
    void actions.settings.refreshComputeDevices().catch(() => undefined)
    void actions.settings.refreshStorage().catch(() => undefined)
  }
  void actions.meetings.loadMeetings().catch(() => undefined)
  void actions.models.loadModels().catch(() => undefined)
}

/** The injected bridge, or null before `initStores`; a component reads its cache or its empty state. */
export function getBridge(): NolaBridge | null {
  return injected
}

/**
 * Whether the engine is there. When it is not, the domains sit empty and the UI
 * should say "not connected", not "loading".
 */
export function isEngineConnected(): boolean {
  return engineConnected
}

/** Last flush before the window unloads: settings still sitting in the debounce window. */
export async function disposeStores(): Promise<void> {
  await flushPendingSettings()
  detachSettingsStore()
  detachMeetingsStore()
  detachModelsStore()
  detachSessionStore()
  injected = null
  // Back to the default: the next `initStores` that passes no option means connected.
  engineConnected = true
}

export { createStore, useStore } from './createStore'
export type { Store, StoreListener, StorePatch, StoreUpdater } from './createStore'

export { settingsStore } from './settingsStore'
export type { CaptionServiceState, SettingsState } from './settingsStore'
export { meetingsStore } from './meetingStore'
export type { MeetingsState, MeetingDetail, BatchRemoveResult } from './meetingStore'
export { modelsStore } from './modelStore'
export type { ModelsState, HubSearchState, HubKind } from './modelStore'
export { sessionStore, findMissingResource, MAX_FINALIZED_SEGMENTS, ENGINE_LOST_CODE } from './sessionStore'
export type { SessionState, EngineStatus, MissingResource } from './sessionStore'

export {
  loadSettings,
  updateSettings,
  chooseStorageDirectory,
  restartAppForStorage,
  clearSettingsError,
  enableCaptionService,
  resetCaptionService,
  browserConnectionAction,
} from './settingsStore'
export {
  loadMeetings,
  loadMeetingDetail,
  renameMeeting,
  setMeetingNotes,
  removeMeeting,
  removeMeetings,
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
