import { recognitionLanguages } from '../../shared/model-capabilities'
import { modelsStore } from './modelStore'
/**
 * Settings domain: optimistic update + rollback + 180ms debounce + write queue.
 * A rollback returns to "the snapshot the engine confirmed + the patches still
 * in flight", not to the snapshot from the click, which would let an earlier
 * failed write erase a later one. Slider changes collapse into one write.
 */

import type { NolaBridge } from '@/bridge'
import type { AppSettings, AppSettingsPatch, AppUpdateCheckResult, ModelStorageInfo, PrewarmErrorCode, PrewarmResult } from '@/bridge'
import type { BrowserConnectionAction, BrowserConnectionStatus, BrowserKind } from '../../shared/browser'
import { createStore, createWriteQueue } from './createStore'
import type { ComputeSnapshot, RuntimeSnapshot } from '../../shared/compute'

/**
 * What the caption service is doing, as the engine reports it. `loading` rides the
 * event channel because reading several GB off disk takes long enough that a button
 * left in its idle state looks dead.
 */
export type CaptionServiceState = 'idle' | 'loading' | 'ready' | 'failed'

export interface SettingsState {
  settings: AppSettings | null
  loaded: boolean
  loading: boolean
  /** At least one write in flight; buttons read it for their pending state. */
  pending: boolean
  error: string | null
  storage: ModelStorageInfo | null
  storageBusy: boolean
  browser: BrowserConnectionStatus | null
  browserBusy: boolean
  browserError: string | null
  captionService: CaptionServiceState
  /** The engine's own refusal reason, so the page can explain which model or language is at fault. */
  captionServiceCode: PrewarmErrorCode | null
  captionServiceBusy: boolean
  runtimes: RuntimeSnapshot | null
  computeSnapshot: ComputeSnapshot | null
  computeChecking: boolean
  computeError: string | null
  runtimeBusy: boolean
  runtimeChecking: boolean
  runtimeError: string | null
  runtimeNoticeDismissed: boolean
  appUpdate: AppUpdateCheckResult | null
  appUpdateChecking: boolean
  appUpdateError: boolean
}

const initialState: SettingsState = {
  settings: null,
  loaded: false,
  loading: false,
  pending: false,
  error: null,
  storage: null,
  storageBusy: false,
  browser: null,
  browserBusy: false,
  browserError: null,
  captionService: 'idle',
  captionServiceCode: null,
  captionServiceBusy: false,
  runtimes: null, computeSnapshot: null, computeChecking: false, computeError: null,
  runtimeBusy: false, runtimeChecking: false, runtimeError: null, runtimeNoticeDismissed: false,
  appUpdate: null, appUpdateChecking: false, appUpdateError: false,
}

export const settingsStore = createStore<SettingsState>(initialState)

export async function loadRuntimeComponents(recheck = false): Promise<RuntimeSnapshot> {
  if (!bridge) throw new Error('IPC bridge unavailable')
  if (recheck) settingsStore.setState({ runtimeChecking: true, runtimeError: null })
  try {
    const runtimes = await (recheck ? bridge.runtimes.prepare() : bridge.runtimes.list())
    settingsStore.setState({ runtimes })
    return runtimes
  } catch (error) {
    settingsStore.setState({ runtimeError: errorMessage(error) })
    throw error
  } finally { if (recheck) settingsStore.setState({ runtimeChecking: false }) }
}

let computeRefresh: Promise<void> | null = null

export function refreshComputeDevices(): Promise<void> {
  if (!bridge) return Promise.reject(new Error('IPC bridge unavailable'))
  if (computeRefresh) return computeRefresh
  const source = bridge
  settingsStore.setState({ computeChecking: true, computeError: null })
  const task = (async () => {
    try {
      const computeSnapshot = await source.engine.listComputeDevices()
      if (bridge === source) settingsStore.setState({ computeSnapshot })
    } catch (error) {
      if (bridge === source) settingsStore.setState({ computeError: errorMessage(error) })
      throw error
    }
  })().finally(() => {
    if (computeRefresh !== task) return
    computeRefresh = null
    if (bridge === source) settingsStore.setState({ computeChecking: false })
  })
  computeRefresh = task
  return task
}

export async function installRuntimeComponent(id: string, reinstall = false): Promise<void> {
  if (!bridge) throw new Error('IPC bridge unavailable')
  if (settingsStore.getState().runtimeBusy) return
  settingsStore.setState({ runtimeBusy: true, runtimeError: null })
  const poll = setInterval(() => { void loadRuntimeComponents().catch(() => undefined) }, 1000)
  try {
    await bridge.runtimes.install(id, reinstall)
    await loadRuntimeComponents()
    await refreshComputeDevices()
  } catch (error) {
    settingsStore.setState({ runtimeError: errorMessage(error) })
  } finally {
    clearInterval(poll)
    settingsStore.setState({ runtimeBusy: false })
    await loadRuntimeComponents().catch(() => undefined)
  }
}

export async function cancelRuntimeInstallation(): Promise<void> { await bridge?.runtimes.cancel() }
export function dismissRuntimeNotice(): void { settingsStore.setState({ runtimeNoticeDismissed: true }) }
export async function openRuntimeSettings(component: 'engine' | 'llama'): Promise<void> {
  settingsStore.setState({ runtimeNoticeDismissed: true })
  await bridge?.runtimes.openSettings(component)
}

/** Fields a drag emits. Changes within 180ms collapse into one write. */
const DEBOUNCE_MS = 180
const DEBOUNCED_PATHS: ReadonlySet<string> = new Set([
  'overlay.fontSize',
  'overlay.fontWeight',
  'overlay.translationFontSize',
  'overlay.translationFontWeight',
  'overlay.backgroundOpacity',
  'overlay.lineHeight',
  'overlay.translationLineHeight',
  'overlay.sourceColor',
  'overlay.translationColor',
  'overlay.backgroundColor',
  'videoCaptions.fontSize',
  'videoCaptions.position',
])

let bridge: NolaBridge | null = null
let appUpdateCheck: Promise<AppUpdateCheckResult | null> | null = null
let unsubscribe: (() => void) | null = null
let unsubscribeCaptionService: (() => void) | null = null

/** The last full snapshot the engine confirmed. The rollback baseline. */
let confirmed: AppSettings | null = null
/** Optimistic but unconfirmed patches, in submission order. */
let inFlight: PendingWrite[] = []
/** Debounced patches not yet flushed, merged into one. */
let debouncePatch: AppSettingsPatch | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let debounceWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []

/** Shares the one background release lookup across StrictMode mounts and window remounts. */
export function checkForAppUpdate(force = false): Promise<AppUpdateCheckResult | null> {
  if (!bridge) return Promise.resolve(null)
  if (appUpdateCheck && settingsStore.getState().appUpdateChecking) return appUpdateCheck
  if (appUpdateCheck && !force) return appUpdateCheck
  const source = bridge
  settingsStore.setState({ appUpdateChecking: true, appUpdateError: false })
  const task = source.app.checkLatestRelease(force).then((result) => {
    if (bridge === source) settingsStore.setState({ appUpdate: result, appUpdateError: result.latestVersion === null })
    return result
  }).catch(() => {
    if (bridge === source) settingsStore.setState({ appUpdate: null, appUpdateError: true })
    return null
  }).finally(() => {
    if (bridge === source) settingsStore.setState({ appUpdateChecking: false })
  })
  appUpdateCheck = task
  return appUpdateCheck
}

export async function openAppReleasePage(url: string): Promise<void> {
  await bridge?.app.openReleasePage(url)
}

interface PendingWrite {
  patch: AppSettingsPatch
  debounced: boolean
}

/**
 * Field-by-field with the main process's `settings-store` merge rules, done here
 * because the bridge's `update()` returns the merged snapshot and the merge is
 * the UI's optimistic-rendering job. `modelStoragePath` is left out:
 * `AppSettingsPatch` excludes it and the strict patch schema would reject it.
 */
export function mergeSettings(base: AppSettings, patch: AppSettingsPatch): AppSettings {
  return {
    ...base,
    ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
    ...(patch.uiLanguage !== undefined ? { uiLanguage: patch.uiLanguage } : {}),
    recognition: { ...base.recognition, ...patch.recognition },
    overlay: { ...base.overlay, ...patch.overlay },
    videoCaptions: { ...base.videoCaptions, ...patch.videoCaptions },
    translation: { ...base.translation, ...patch.translation },
    compute: { ...base.compute, ...patch.compute },
    network: { ...base.network, ...patch.network },
  }
}

function mergeAll(base: AppSettings, patches: AppSettingsPatch[]): AppSettings {
  return patches.reduce<AppSettings>((acc, patch) => mergeSettings(acc, patch), base)
}

/** Flattens a patch into dotted paths, to tell a pure slider/colour change from anything else. */
function patchPaths(patch: AppSettingsPatch): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (typeof value === 'object' && value !== null) {
      for (const [leaf, leafValue] of Object.entries(value)) {
        // An explicit undefined means "leave alone" and is not a path, or a fontSize patch would miss the debounce.
        if (leafValue === undefined) continue
        paths.push(`${key}.${leaf}`)
      }
    } else {
      paths.push(key)
    }
  }
  return paths
}

function isDebounceable(patch: AppSettingsPatch): boolean {
  const paths = patchPaths(patch)
  return paths.length > 0 && paths.every((path) => DEBOUNCED_PATHS.has(path))
}

function mergePatches(a: AppSettingsPatch, b: AppSettingsPatch): AppSettingsPatch {
  return {
    ...a,
    ...b,
    ...(a.recognition || b.recognition
      ? { recognition: { ...a.recognition, ...b.recognition } }
      : {}),
    ...(a.overlay || b.overlay ? { overlay: { ...a.overlay, ...b.overlay } } : {}),
    ...(a.videoCaptions || b.videoCaptions ? { videoCaptions: { ...a.videoCaptions, ...b.videoCaptions } } : {}),
    ...(a.translation || b.translation ? { translation: { ...a.translation, ...b.translation } } : {}),
    ...(a.compute || b.compute ? { compute: { ...a.compute, ...b.compute } } : {}),
    ...(a.network || b.network ? { network: { ...a.network, ...b.network } } : {}),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const enqueue = createWriteQueue()

/** Writes still waiting to land. `pending` is derived from this, so the UI need not count. */
function pendingCount(): number {
  return inFlight.length + (debouncePatch ? 1 : 0)
}

/**
 * Recomposes "the confirmed snapshot + every optimistic patch not yet written"
 * into what the UI should see. The debounced patch counts too: it is not in
 * `inFlight` yet, and leaving it out lets an external `onSettingsChanged` reset
 * the slider the user is still dragging.
 */
function publish(base: AppSettings | null): void {
  if (!base) return
  const pending = inFlight.map((item) => item.patch)
  if (debouncePatch) pending.push(debouncePatch)
  settingsStore.setState({
    settings: mergeAll(base, pending),
    pending: pendingCount() > 0,
  })
}

async function write(record: PendingWrite): Promise<AppSettings> {
  return enqueue(async () => {
    try {
      const saved = await bridgeWrite(record.patch)
      confirmed = saved
      return saved
    } finally {
      inFlight = inFlight.filter((item) => item !== record)
      publish(confirmed)
    }
  })
}

async function bridgeWrite(patch: AppSettingsPatch): Promise<AppSettings> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  return bridge.settings.update(patch)
}

/** First load, and the entry point for external changes (onSettingsChanged). */
export async function loadSettings(): Promise<void> {
  if (!bridge) return
  if (settingsStore.getState().loaded && !settingsStore.getState().error) return
  settingsStore.setState({ loading: true, error: null })
  try {
    confirmed = await bridge.settings.get()
    publish(confirmed)
    settingsStore.setState({ loaded: true, loading: false })
  } catch (error) {
    settingsStore.setState({ loading: false, error: errorMessage(error) })
    throw error
  }
}

/**
 * Optimistic update. Success converges on the snapshot the engine returns,
 * failure rolls back to "the confirmed snapshot + the patches still in flight",
 * records the error and **rethrows the original error** — swallowing it reads as
 * "nothing happened".
 */
export async function updateSettings(patch: AppSettingsPatch): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const base = confirmed ?? settingsStore.getState().settings
  if (!base) throw new Error('设置还没有加载完成')
  if (patch.recognition?.modelId) {
    const model = modelsStore.getState().resources.find(item => item.resourceId === patch.recognition?.modelId)
    const codes = recognitionLanguages(model)
    const source = patch.recognition.sourceLanguage ?? settingsStore.getState().settings?.recognition.sourceLanguage ?? base.recognition.sourceLanguage
    if (codes.length > 0 && !codes.includes(source)) patch = { ...patch, recognition: { ...patch.recognition, sourceLanguage: codes[0] } }
  }

  if (isDebounceable(patch)) return enqueueDebounced(patch)

  // Drain the debounce window first, or a late flush lands behind a later write and undoes it.
  if (debouncePatch) await flushDebounced().catch(() => undefined)

  const record: PendingWrite = { patch, debounced: false }
  inFlight = [...inFlight, record]
  publish(confirmed)
  settingsStore.setState({ error: null })
  try {
    await write(record)
  } catch (error) {
    settingsStore.setState({ error: errorMessage(error) })
    throw error
  }
}

/** Sliders and colours: applied locally at once (a drag must track the hand), written 180ms later. */
function enqueueDebounced(patch: AppSettingsPatch): Promise<void> {
  debouncePatch = debouncePatch ? mergePatches(debouncePatch, patch) : patch
  // Render the new value now without writing it; publish folds debouncePatch in.
  settingsStore.setState({ error: null })
  publish(confirmed)

  const settled = new Promise<void>((resolve, reject) => {
    debounceWaiters.push({ resolve: () => resolve(), reject })
  })
  if (debounceTimer === null) {
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void flushDebounced()
    }, DEBOUNCE_MS)
  }
  return settled
}

async function flushDebounced(): Promise<void> {
  const patch = debouncePatch
  if (!patch) return
  const waiters = debounceWaiters
  debouncePatch = null
  debounceWaiters = []

  const record: PendingWrite = { patch, debounced: true }
  inFlight = [...inFlight, record]
  publish(confirmed)
  try {
    await write(record)
    for (const waiter of waiters) waiter.resolve()
  } catch (error) {
    settingsStore.setState({ error: errorMessage(error) })
    for (const waiter of waiters) waiter.reject(error)
  }
}

/** Unload inside the debounce window: write what has not landed, so a change made just before closing is not lost. */
export async function flushPendingSettings(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (debouncePatch) await flushDebounced()
}

/**
 * Re-reads disk usage in the background: those numbers only change once models are installed or
 * removed, and the storage tab re-reads them again when it opens. Touches neither `storageBusy` nor
 * `loaded`, and a failure keeps the previous `storage` — stale numbers beat an empty row.
 */
export async function refreshStorage(): Promise<void> {
  if (!bridge) return
  try {
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage, error: null })
  } catch (error) {
    settingsStore.setState({ error: errorMessage(error) })
  }
}

export async function chooseStorageDirectory(): Promise<ModelStorageInfo | null> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  settingsStore.setState({ storageBusy: true, error: null })
  try {
    const chosen = await bridge.storage.choose()
    // Cancelled in the system dialog: null is not an error, so leave the state as it was.
    if (!chosen) return null
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage, storageBusy: false })
    return storage
  } catch (error) {
    settingsStore.setState({ storageBusy: false, error: errorMessage(error) })
    throw error
  }
}

export async function restartAppForStorage(): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  settingsStore.setState({ storageBusy: true, error: null })
  try {
    await bridge.storage.restartApp()
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage, storageBusy: false })
  } catch (error) {
    settingsStore.setState({ storageBusy: false, error: errorMessage(error) })
    throw error
  }
}

export function clearSettingsError(): void {
  settingsStore.setState({ error: null })
}

/**
 * Loads the configured recognition and translation weights, which is what "enable
 * captions" means: a browser session opened afterwards starts against memory that is
 * already warm.
 *
 * A refusal is a `state: 'failed'` answer carrying the engine's reason, not an
 * exception, so a missing model and a transport failure stay distinguishable. Only
 * the transport itself throws.
 */
export async function enableCaptionService(): Promise<PrewarmResult> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  settingsStore.setState({ captionService: 'loading', captionServiceCode: null, captionServiceBusy: true })
  try {
    const result = await bridge.engine.prewarmModels()
    settingsStore.setState({
      captionService: result.state,
      captionServiceCode: result.state === 'failed' ? result.code ?? null : null,
    })
    return result
  } catch (error) {
    settingsStore.setState({ captionService: 'failed', runtimeError: errorMessage(error) })
    throw error
  } finally {
    settingsStore.setState({ captionServiceBusy: false })
  }
}

/** Back to "not enabled" once the engine is gone, so the button cannot claim a service that stopped. */
export function resetCaptionService(): void {
  settingsStore.setState({ captionService: 'idle', captionServiceCode: null, captionServiceBusy: false })
}

/**
 * Opens or closes the gate browser captions pass through. The answer is the whole
 * connection status rather than a boolean, so the store paints the value actually in
 * force: another window may have moved the gate since this one last read it.
 */
export async function setCaptionServiceActive(active: boolean): Promise<BrowserConnectionStatus> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  settingsStore.setState({ captionServiceBusy: true, error: null })
  try {
    const status = await bridge.settings.setCaptionService(active)
    settingsStore.setState({ browser: status })
    return status
  } finally {
    settingsStore.setState({ captionServiceBusy: false })
  }
}

/**
 * Ends one browser session by its id. The gate only decides whether a session may *start*,
 * so a session already running keeps the engine recording until it is stopped here.
 */
export async function stopCaptionSession(sessionId: string): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  try {
    await bridge.engine.stopSession(sessionId)
  } catch (error) {
    settingsStore.setState({ error: errorMessage(error) })
    throw error
  }
}

export async function browserConnectionAction(action: BrowserConnectionAction, enabled?: boolean, browser?: BrowserKind): Promise<void> {
  if (action === 'status' && settingsStore.getState().browserBusy) return
  if (action !== 'status') settingsStore.setState({ browserBusy: true, browserError: null })
  try {
    if (!bridge?.settings.browserConnection) throw new Error('Browser connection is unavailable')
    const status = await bridge.settings.browserConnection(action, enabled, browser)
    settingsStore.setState({ browser: status, ...(action !== 'status' ? { browserError: null } : {}) })
  } catch (error) {
    settingsStore.setState({ browserError: errorMessage(error) })
  } finally { if (action !== 'status') settingsStore.setState({ browserBusy: false }) }
}

export function attachSettingsStore(next: NolaBridge, watchComputeChanges = true): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onSettingsChanged((settings) => {
    // An external change converges by advancing the confirmed snapshot, patches still in flight stay on top.
    confirmed = settings
    publish(confirmed)
  })
  unsubscribeCaptionService?.()
  unsubscribeCaptionService = next.events.onEngineEvent((event) => {
    if (event.type === 'computeDevices') {
      const { devices, notes, torchVersion, activePlan } = event
      settingsStore.setState({ computeSnapshot: { devices, notes, torchVersion, activePlan } })
      return
    }
    // Session changes affect residency and free memory, so refresh when they happen rather than on navigation.
    if (watchComputeChanges && (event.type === 'sessionStarted' || event.type === 'sessionStopped'
      || event.type === 'engineStateChanged' && event.state === 'ready'
      || event.type === 'modelsPrewarmed' && event.state === 'ready')) {
      void refreshComputeDevices().catch(() => undefined)
    }
    if (event.type !== 'modelsPrewarmed') return
    settingsStore.setState({ captionService: event.state, captionServiceCode: null })
  })
}

export function detachSettingsStore(): void {
  unsubscribe?.()
  unsubscribe = null
  unsubscribeCaptionService?.()
  unsubscribeCaptionService = null
  bridge = null
  appUpdateCheck = null
  computeRefresh = null
  confirmed = null
  inFlight = []
  debouncePatch = null
  debounceWaiters = []
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  settingsStore.setState(initialState)
}
