import { recognitionLanguages } from '../../shared/model-capabilities'
import { modelsStore } from './modelStore'
/**
 * Settings domain: optimistic update + rollback + 180ms debounce + write queue.
 * A rollback returns to "the snapshot the engine confirmed + the patches still
 * in flight", not to the snapshot from the click, which would let an earlier
 * failed write erase a later one. Slider changes collapse into one write.
 */

import type { NolaBridge } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ModelStorageInfo } from '@/bridge'
import { createStore, createWriteQueue } from './createStore'

export interface SettingsState {
  settings: AppSettings | null
  loaded: boolean
  loading: boolean
  /** At least one write in flight; buttons read it for their pending state. */
  pending: boolean
  error: string | null
  storage: ModelStorageInfo | null
  storageBusy: boolean
}

const initialState: SettingsState = {
  settings: null,
  loaded: false,
  loading: false,
  pending: false,
  error: null,
  storage: null,
  storageBusy: false,
}

export const settingsStore = createStore<SettingsState>(initialState)

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
])

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null

/** The last full snapshot the engine confirmed. The rollback baseline. */
let confirmed: AppSettings | null = null
/** Optimistic but unconfirmed patches, in submission order. */
let inFlight: PendingWrite[] = []
/** Debounced patches not yet flushed, merged into one. */
let debouncePatch: AppSettingsPatch | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let debounceWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []

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
    translation: { ...base.translation, ...patch.translation },
    compute: { ...base.compute, ...patch.compute },
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
    ...(a.translation || b.translation ? { translation: { ...a.translation, ...b.translation } } : {}),
    ...(a.compute || b.compute ? { compute: { ...a.compute, ...b.compute } } : {}),
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
    const [settings, storage] = await Promise.all([bridge.settings.get(), bridge.storage.get()])
    confirmed = settings
    publish(confirmed)
    settingsStore.setState({ loaded: true, loading: false, storage })
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
 * Re-reads disk usage in the background when the storage tab opens: those
 * numbers only change once models are installed or removed, and `loadSettings`
 * read them once at startup. Touches neither `storageBusy` nor `loaded`, and a
 * failure keeps the previous `storage` — stale numbers beat an empty row.
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

export function attachSettingsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onSettingsChanged((settings) => {
    // An external change converges by advancing the confirmed snapshot, patches still in flight stay on top.
    confirmed = settings
    publish(confirmed)
  })
}

export function detachSettingsStore(): void {
  unsubscribe?.()
  unsubscribe = null
  bridge = null
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
