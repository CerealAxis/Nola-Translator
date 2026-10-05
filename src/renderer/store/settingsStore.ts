/**
 * 设置域。乐观更新 + 失败回滚 + 180ms 防抖 + 单写队列。
 *
 * 三条硬规则：
 * 1. 组件永远不直接调 `bridge.settings`，只调这里的 `updateSettings`。
 * 2. 乐观更新的回滚基准是"引擎确认过的快照 + 仍在飞的 patch"，不是"点击那一刻的快照"。
 *    后者在并发写下是错的：先发的写失败回滚时会把后发的那次改动一起抹掉。
 * 3. 滑块与颜色类字段会连续产生几十次 onChange，逐次打盘没意义，合并成一次。
 */

import type { NolaBridge } from '@/bridge'
import type { AppSettings, AppSettingsPatch, ModelStorageInfo } from '@/bridge'
import { createStore, createWriteQueue } from './createStore'

export interface SettingsState {
  settings: AppSettings | null
  loaded: boolean
  loading: boolean
  /** 至少有一个写在飞。按钮的 pending 态读它。 */
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

/** 连续拖动会打出的字段。180ms 内的连续改动合并成一次写。 */
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

// -- 注入的运行时依赖 ---------------------------------------------------------
// bridge 是运行时注入的：模块顶层不允许碰它，否则单测和 Electron 的启动顺序都会炸。

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null

/** 引擎最后一次确认的完整快照。回滚的基准。 */
let confirmed: AppSettings | null = null
/** 乐观但还没被引擎确认的 patch，按提交顺序排队。 */
let inFlight: PendingWrite[] = []
/** 尚未 flush 的防抖 patch 合并成一个。 */
let debouncePatch: AppSettingsPatch | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let debounceWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = []

interface PendingWrite {
  patch: AppSettingsPatch
  debounced: boolean
}

// -- 纯函数 -------------------------------------------------------------------

/**
 * 与主进程 `settings-store` 的合并规则逐字段对齐。这里自己实现而不复用别处的那份，
 * 是因为 bridge 的 `update()` 返回的是合并后的完整快照，合并规则属于 UI 乐观渲染的责任。
 *
 * 刻意不处理 `modelStoragePath`：`AppSettingsPatch` 把它排除了，它只能由
 * `storage.choose()` 改动（主进程的 zod schema 也会直接拒收带它的 patch）。
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

/** 把一个 patch 摊成点号路径，用来判断它是不是"纯滑块/颜色"改动。 */
function patchPaths(patch: AppSettingsPatch): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (typeof value === 'object' && value !== null) {
      for (const [leaf, leafValue] of Object.entries(value)) {
        // 显式写成 undefined 的键等于"不改这个字段"，不能算进路径里。
        // 漏掉这一步，一个本来只动 fontSize 的 patch 会因为带了个 undefined 兄弟键
        // 被判成"非滑块改动"，于是绕开防抖立刻落盘，拖动时每一下都打一次盘。
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

// -- 写队列 -------------------------------------------------------------------

const enqueue = createWriteQueue()

/** 队列里还有多少个未落地的写。`pending` 由此推导，UI 不需要自己数。 */
function pendingCount(): number {
  return inFlight.length + (debouncePatch ? 1 : 0)
}

/**
 * 把"已确认快照 + 所有尚未落地的乐观 patch"重新合成 UI 该看到的值。
 *
 * 防抖窗口里的那个 patch **也必须算进来**。它还没进 `inFlight`，早先的版本漏了它，
 * 于是外部来一条 `onSettingsChanged`（另一个窗口改了设置）就会把用户正在拖的滑块
 * 重置回旧值——用户手还在滑，数字却跳回去了。
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

// -- 公开动作 -----------------------------------------------------------------

/** 首次加载 + 外部改动（onSettingsChanged）的入口。 */
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
 * 乐观更新。成功则收敛到引擎返回的快照，失败则回滚到"已确认快照 + 其余仍在飞的 patch"，
 * 记录 error 并**把原始错误抛给调用方**（吞掉错误等于"点了没反应"）。
 */
export async function updateSettings(patch: AppSettingsPatch): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const base = confirmed ?? settingsStore.getState().settings
  if (!base) throw new Error('设置还没有加载完成')

  if (isDebounceable(patch)) return enqueueDebounced(patch)

  // 写必须严格按用户操作的先后顺序出去。所以在做一次立即写之前，先把还挂在防抖窗口里的
  // 那次写排干：否则「拖滑块（防抖）→ 立刻切开关（立即）」之后，迟到的防抖 flush 会带着
  // 滑块的旧值落到开关后面，把用户后做的那次改动盖掉。
  // flush 自己的失败由它自己的等待者负责，这里不吞掉它要报的错。
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

/** 滑块 / 颜色：本地立刻生效（拖动必须跟手），落盘合并到 180ms 之后。 */
function enqueueDebounced(patch: AppSettingsPatch): Promise<void> {
  debouncePatch = debouncePatch ? mergePatches(debouncePatch, patch) : patch
  // 立即把新值渲染出去，但不写引擎。publish 会把 debouncePatch 一起叠上去。
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

/** 防抖窗口内被卸载时，立刻把没落地的值写出去，避免用户改完就关窗丢掉。 */
export async function flushPendingSettings(): Promise<void> {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (debouncePatch) await flushDebounced()
}

/**
 * 后台重读一次磁盘占用。「存储」tab 打开时调它：可用空间与占用大小只有装完/删掉模型之后才变，
 * 而 `loadSettings` 只在启动时取过一次，不重读就会一直显示旧数字。
 *
 * 刻意不碰 `storageBusy` / `loaded` / `loading`：这是打开 tab 时的静默刷新，不是首屏加载，
 * 不该在界面上表现成一次新的加载。失败只写 `error`，并**保留上一次的 `storage`** ——
 * 过期数字好过空行。
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
    // 用户在系统对话框里点了取消：bridge 返回 null，这不是错误，静默保持原状。
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

// -- 注入 ---------------------------------------------------------------------

export function attachSettingsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onSettingsChanged((settings) => {
    // 外部改动（另一个窗口改了设置）也要收敛，但不能覆盖本窗口仍在飞的乐观值：
    // 确认快照前移，在飞的 patch 重新叠上去。
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
