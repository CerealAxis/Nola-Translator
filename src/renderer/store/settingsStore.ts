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
import type { OverlayMenuRequest, OverlayMenuPresentation } from '../../shared/overlay-menu'
import type { BrowserConnectionAction, BrowserConnectionStatus, BrowserKind } from '../../shared/browser'
import { createStore, createWriteQueue } from './createStore'
import { isSessionAlreadyRunningError } from '../../shared/ipc-error'
import type { ComputeSnapshot, RuntimeSnapshot } from '../../shared/compute'

/**
 * What the caption service is doing, as the engine reports it. `loading` rides the
 * event channel because reading several GB off disk takes long enough that a button
 * left in its idle state looks dead.
 */
export type CaptionServiceState = 'idle' | 'loading' | 'ready' | 'failed'

/**
 * The commands that share the settings failure channel. The name travels with the
 * failure so the notice can say which action failed instead of calling every failure
 * a change that was not saved. A load failure is reported through `loadError` and
 * never reaches this channel.
 */
export type SettingsCommand =
  | 'load' | 'update' | 'storage' | 'chooseStorage' | 'restartStorage' | 'stopCaption' | 'openLogs' | 'captionService' | 'prewarm'

export interface SettingsState {
  overlayMenuOpen: boolean
  overlayMenu: OverlayMenuPresentation | null
  onboardingActive: boolean
  onboardingWelcome: boolean
  onboardingRun: number
  onboardingAutoAttempted: boolean
  audioTestState: 'idle' | 'capturing' | 'playing'
  settings: AppSettings | null
  loaded: boolean
  loading: boolean
  /** At least one write in flight; buttons read it for their pending state. */
  pending: boolean
  /** The failure of the command named in `errorOperation`. */
  error: string | null
  /** The command that failed, so the notice can name the action the user took. */
  errorOperation: SettingsCommand | null
  /** The settings could not be read. Separate from `error`, so a background refresh cannot erase it. */
  loadError: string | null
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
  runtimeAction: 'install' | 'uninstall' | null
  runtimeChecking: boolean
  runtimeError: string | null
  runtimeNoticeDismissed: boolean
  appUpdate: AppUpdateCheckResult | null
  appUpdateChecking: boolean
  appUpdateError: boolean
}

const initialState: SettingsState = {
  overlayMenuOpen: false,
  overlayMenu: null,
  onboardingActive: false,
  onboardingWelcome: false,
  onboardingRun: 0,
  onboardingAutoAttempted: false,
  audioTestState: 'idle',
  settings: null,
  loaded: false,
  loading: false,
  pending: false,
  error: null,
  errorOperation: null,
  loadError: null,
  storage: null,
  storageBusy: false,
  browser: null,
  browserBusy: false,
  browserError: null,
  captionService: 'idle',
  captionServiceCode: null,
  captionServiceBusy: false,
  runtimes: null, computeSnapshot: null, computeChecking: false, computeError: null,
  runtimeBusy: false, runtimeAction: null, runtimeChecking: false, runtimeError: null, runtimeNoticeDismissed: false,
  appUpdate: null, appUpdateChecking: false, appUpdateError: false,
}

export const settingsStore = createStore<SettingsState>(initialState)

/** Automatic presentation is attempted once per launch, even before its disk write settles. */
export function startOnboarding(mode: 'automatic' | 'welcome' | 'tour' = 'tour'): boolean {
  const state = settingsStore.getState()
  if (state.onboardingActive || !state.settings) return false
  if (mode === 'automatic' && (state.settings.onboardingSeen || state.onboardingAutoAttempted)) return false
  settingsStore.setState({ onboardingActive: true, onboardingWelcome: mode !== 'tour', onboardingRun: state.onboardingRun + 1, onboardingAutoAttempted: true })
  return true
}

export function stopOnboarding(): void {
  settingsStore.setState({ onboardingActive: false, onboardingWelcome: false })
}

export function beginOnboarding(): void {
  if (settingsStore.getState().onboardingActive) settingsStore.setState({ onboardingWelcome: false })
}

export async function markOnboardingSeen(): Promise<void> {
  if (!settingsStore.getState().settings?.onboardingSeen) await updateSettings({ onboardingSeen: true })
}

let audioTestGeneration = 0
let audioTestPlayback: HTMLAudioElement | null = null
let audioTestUrl: string | null = null
let finishAudioPlayback: (() => void) | null = null

export function cancelAudioTest(): void {
  audioTestGeneration++
  if (audioTestPlayback) {
    audioTestPlayback.onended = null
    audioTestPlayback.onerror = null
    audioTestPlayback.pause()
    audioTestPlayback.src = ''
    audioTestPlayback = null
  }
  finishAudioPlayback?.()
  finishAudioPlayback = null
  if (audioTestUrl) URL.revokeObjectURL(audioTestUrl)
  audioTestUrl = null
  settingsStore.setState({ audioTestState: 'idle' })
}

export async function testAudio(source: string): Promise<boolean> {
  cancelAudioTest()
  const generation = audioTestGeneration
  settingsStore.setState({ audioTestState: 'capturing' })
  try {
    if (!bridge) throw new Error('engineNotReady')
    const selected = modelsStore.getState().devices.find(device => device.deviceId === source)
    if (source !== 'defaultOutput' && !selected) throw new Error('audioDeviceUnavailable')
    const result = await bridge.engine.testAudio(source === 'defaultOutput' ? { kind: 'defaultOutput' }
      : { kind: selected!.kind, deviceId: selected!.deviceId })
    if (generation !== audioTestGeneration) return false
    const decoded = atob(result.audioBase64)
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index)
    audioTestUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
    audioTestPlayback = new Audio(audioTestUrl)
    settingsStore.setState({ audioTestState: 'playing' })
    await new Promise<void>((resolve, reject) => {
      finishAudioPlayback = resolve
      const playback = audioTestPlayback!
      playback.onended = () => resolve()
      playback.onerror = () => reject(new Error('audioPlaybackFailed'))
      void playback.play().catch(reject)
    })
    if (generation === audioTestGeneration) {
      cancelAudioTest()
      settingsStore.setState({ audioTestState: 'idle' })
    }
    return result.hasSignal
  } catch (error) {
    if (generation !== audioTestGeneration) return false
    cancelAudioTest()
    settingsStore.setState({ audioTestState: 'idle' })
    throw error
  }
}

export async function loadRuntimeComponents(recheck = false, components?: readonly ('engine' | 'llama' | 'crisp')[]): Promise<RuntimeSnapshot> {
  if (!bridge) throw new Error('IPC bridge unavailable')
  if (recheck) settingsStore.setState({ runtimeChecking: true, runtimeError: null })
  try {
    const runtimes = await (recheck && components?.length !== 0 ? bridge.runtimes.prepare(components) : bridge.runtimes.list())
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
  settingsStore.setState({ runtimeBusy: true, runtimeAction: 'install', runtimeError: null })
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

export async function uninstallRuntimeComponent(kind: 'engine' | 'llama' | 'crisp'): Promise<void> {
  if (!bridge) throw new Error('IPC bridge unavailable')
  if (settingsStore.getState().runtimeBusy) return
  settingsStore.setState({ runtimeBusy: true, runtimeAction: 'uninstall', runtimeError: null })
  try {
    await bridge.runtimes.uninstall(kind)
    await loadRuntimeComponents()
    await refreshComputeDevices()
  } catch (error) {
    settingsStore.setState({ runtimeError: errorMessage(error) })
  } finally {
    settingsStore.setState({ runtimeBusy: false })
    await loadRuntimeComponents().catch(() => undefined)
  }
}

export async function cancelRuntimeInstallation(): Promise<void> { await bridge?.runtimes.cancel() }
export function dismissRuntimeNotice(): void { settingsStore.setState({ runtimeNoticeDismissed: true }) }
export async function openRuntimeSettings(component: 'engine' | 'llama' | 'crisp'): Promise<void> {
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
  'browserCaptions.sourceFontSize',
  'browserCaptions.translationFontSize',
  'browserCaptions.lineHeight',
  'browserCaptions.bottomOffset',
  'browserCaptions.backgroundOpacity',
])

let bridge: NolaBridge | null = null
let overlayMenuRequest = 0

/** Resolve after dismissal so the caption keeps its controls visible while the native menu owns focus. */
export async function openOverlayMenu(request: Omit<OverlayMenuRequest, 'settings' | 'resources'>): Promise<boolean> {
  const owner = bridge
  if (!owner?.overlay.openMenu) return false
  const settings = settingsStore.getState().settings
  if (!settings) return true
  const version = ++overlayMenuRequest
  settingsStore.setState({ overlayMenuOpen: true })
  try {
    await owner.overlay.openMenu({ ...request, settings, resources: modelsStore.getState().resources })
    return true
  } finally {
    if (bridge === owner && version === overlayMenuRequest) settingsStore.setState({ overlayMenuOpen: false })
  }
}

export async function presentOverlayMenu(id: number): Promise<void> {
  await bridge?.overlay.presentMenu?.(id)
}

export async function closeOverlayMenu(id: number): Promise<void> {
  await bridge?.overlay.closeMenu?.(id)
}
let appUpdateCheck: Promise<AppUpdateCheckResult | null> | null = null
let unsubscribe: (() => void) | null = null
let unsubscribeOverlayMenu: (() => void) | null = null
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

/** Fetches release metadata for previews without changing the app's update-notice state. */
export async function fetchLatestRelease(force = false): Promise<AppUpdateCheckResult | null> {
  if (!bridge) return null
  return bridge.app.checkLatestRelease(force)
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
    ...(patch.onboardingSeen !== undefined ? { onboardingSeen: patch.onboardingSeen } : {}),
    recognition: { ...base.recognition, ...patch.recognition },
    overlay: { ...base.overlay, ...patch.overlay },
    videoCaptions: { ...base.videoCaptions, ...patch.videoCaptions },
    browserCaptions: { ...base.browserCaptions, ...patch.browserCaptions },
    translation: {
      ...base.translation, ...patch.translation,
      fallback: { ...base.translation.fallback, ...(patch.translation?.fallback ?? {}) },
    },
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
    ...(a.browserCaptions || b.browserCaptions ? { browserCaptions: { ...a.browserCaptions, ...b.browserCaptions } } : {}),
    ...(a.translation || b.translation ? { translation: { ...a.translation, ...b.translation } } : {}),
    ...(a.compute || b.compute ? { compute: { ...a.compute, ...b.compute } } : {}),
    ...(a.network || b.network ? { network: { ...a.network, ...b.network } } : {}),
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * A command clears the shared failure when it starts: a new action replaces the
 * failure of the last one. The extra fields ride along, so a command that also raises
 * a busy flag changes the state in one step.
 */
function clearCommandFailure(extra?: Partial<SettingsState>): void {
  settingsStore.setState({ ...extra, error: null, errorOperation: null })
}

/**
 * A command that succeeds clears only the failure it owns. Another command's failure
 * is still true, and erasing it would hide a problem the user has not read yet.
 */
function clearOwnFailure(operation: SettingsCommand): void {
  if (settingsStore.getState().errorOperation !== operation) return
  settingsStore.setState({ error: null, errorOperation: null })
}

/** Records which command failed, so the notice can name the action the user took. */
function recordCommandFailure(operation: SettingsCommand, error: unknown): void {
  settingsStore.setState({ error: errorMessage(error), errorOperation: operation })
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
  // Settings that were read once are not read again; settings that never arrived are,
  // because that is the one failure a retry can still fix.
  if (settingsStore.getState().loaded && !settingsStore.getState().loadError) return
  settingsStore.setState({ loading: true, loadError: null })
  try {
    confirmed = await bridge.settings.get()
    publish(confirmed)
    settingsStore.setState({ loaded: true, loading: false })
  } catch (error) {
    // The load failure has its own channel: a background refresh that succeeds must not
    // erase the fact that the settings were never read.
    settingsStore.setState({ loading: false, loadError: errorMessage(error) })
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
  if (patch.recognition?.modelId && (patch.recognition.provider ?? base.recognition.provider ?? 'local') === 'local') {
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
  clearCommandFailure()
  try {
    await write(record)
  } catch (error) {
    recordCommandFailure('update', error)
    throw error
  }
}

/** Sliders and colours: applied locally at once (a drag must track the hand), written 180ms later. */
function enqueueDebounced(patch: AppSettingsPatch): Promise<void> {
  debouncePatch = debouncePatch ? mergePatches(debouncePatch, patch) : patch
  // Render the new value now without writing it; publish folds debouncePatch in.
  clearCommandFailure()
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
    recordCommandFailure('update', error)
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
  clearCommandFailure()
  try {
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage })
    // The refresh worked; a failure another command recorded is still true.
    clearOwnFailure('storage')
  } catch (error) {
    recordCommandFailure('storage', error)
  }
}

export async function chooseStorageDirectory(): Promise<ModelStorageInfo | null> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  clearCommandFailure({ storageBusy: true })
  try {
    const chosen = await bridge.storage.choose()
    // Cancelled in the system dialog: null is not an error, so the state goes back to what
    // it was before the dialog opened.
    if (!chosen) { settingsStore.setState({ storageBusy: false }); return null }
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage, storageBusy: false })
    clearOwnFailure('chooseStorage')
    return storage
  } catch (error) {
    settingsStore.setState({ storageBusy: false, error: errorMessage(error), errorOperation: 'chooseStorage' })
    throw error
  }
}

export async function restartAppForStorage(): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  clearCommandFailure({ storageBusy: true })
  try {
    await bridge.storage.restartApp()
    const storage = await bridge.storage.get()
    settingsStore.setState({ storage, storageBusy: false })
    clearOwnFailure('restartStorage')
  } catch (error) {
    settingsStore.setState({ storageBusy: false, error: errorMessage(error), errorOperation: 'restartStorage' })
    throw error
  }
}

/**
 * Clears the failure of a settings command. The load failure stays: it describes settings
 * that were never read, and only a successful read takes that away.
 */
export function clearSettingsError(): void {
  settingsStore.setState({ error: null, errorOperation: null })
}

/** False means browser captions reserve the service; no window was opened. */
export async function openMainPage(path: string): Promise<void> {
  if (!bridge?.app.openMainPage) throw new Error('Main window unavailable')
  await bridge.app.openMainPage(path)
}

export async function showWorkspace(): Promise<void> {
  if (!bridge?.app.showWorkspace) throw new Error('Workspace window unavailable')
  await bridge.app.showWorkspace()
}

export async function showOverlay(): Promise<boolean> {
  if (!bridge) throw new Error('Bridge unavailable')
  if (!await canStartDesktopCaptions()) return false
  try {
    return await bridge.overlay.show()
  } catch (error) {
    // A reservation can change after the status query. Main-process rejection is
    // the same expected conflict as a false result, including older running IPC handlers.
    if (isSessionAlreadyRunningError(error)) return false
    throw error
  }
}

/** Read the main process reservation before opening setup or inspecting local weights. */
export async function canStartDesktopCaptions(): Promise<boolean> {
  if (!bridge) throw new Error('Bridge unavailable')
  const status = await bridge.settings.browserConnection?.('status')
  if (status) settingsStore.setState({ browser: status })
  return !status?.captionServiceActive && !status?.sessionStarting
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
    // The page names the reason — a missing runtime, a device that does not match — so the
    // failure belongs to the command channel. The runtime components panel would announce
    // it as a failed install, which is not what happened.
    settingsStore.setState({ captionService: 'failed', error: errorMessage(error), errorOperation: 'prewarm' })
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
  // The switch reports its own failure, with copy that names the switch, so the store
  // records it on the command channel and the page claims it.
  clearCommandFailure({ captionServiceBusy: true })
  try {
    const status = await bridge.settings.setCaptionService(active)
    settingsStore.setState({ browser: status })
    return status
  } catch (error) {
    recordCommandFailure('captionService', error)
    throw error
  } finally {
    settingsStore.setState({ captionServiceBusy: false })
  }
}

/**
 * Ends one browser session while keeping the enabled service's models resident.
 * Closing the service also stops its browser session and releases those models.
 */
export async function stopCaptionSession(sessionId: string): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  clearCommandFailure()
  try {
    await bridge.engine.stopSession(sessionId)
  } catch (error) {
    recordCommandFailure('stopCaption', error)
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
  unsubscribeOverlayMenu?.()
  unsubscribeOverlayMenu = next.events.onOverlayMenuChanged?.(menu => {
    if (menu) {
      confirmed = menu.settings
      publish(confirmed)
      modelsStore.setState({ resources: menu.resources, loaded: true, loading: false })
      settingsStore.setState({ overlayMenu: menu, loaded: true, loading: false })
    } else settingsStore.setState({ overlayMenu: null })
  }) ?? null
  unsubscribeCaptionService?.()
  unsubscribeCaptionService = next.events.onEngineEvent((event) => {
    if (event.type === 'computeDevices') {
      const { devices, notes, torchVersion, activePlan } = event
      settingsStore.setState({ computeSnapshot: { devices, notes, torchVersion, activePlan } })
      return
    }
    if (event.type === 'modelsReleased') {
      resetCaptionService()
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

export async function readDiagnostics(): Promise<Record<string, string | number>> {
  if (!bridge) throw new Error('diagnosticsUnavailable')
  return bridge.diagnostics.get()
}

export async function copyDiagnostics(): Promise<void> {
  if (!bridge) throw new Error('diagnosticsUnavailable')
  await bridge.diagnostics.copy()
}

export async function openLogs(): Promise<void> {
  clearCommandFailure()
  try {
    if (!bridge?.diagnostics.openLogs) throw new Error('diagnosticsUnavailable')
    await bridge.diagnostics.openLogs()
  } catch (error) { recordCommandFailure('openLogs', error) }
}

export function detachSettingsStore(): void {
  overlayMenuRequest++
  cancelAudioTest()
  unsubscribe?.()
  unsubscribe = null
  unsubscribeCaptionService?.()
  unsubscribeCaptionService = null
  unsubscribeOverlayMenu?.()
  unsubscribeOverlayMenu = null
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
