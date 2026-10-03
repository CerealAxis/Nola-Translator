/**
 * 模型域。资源快照 + 音频设备 + Hub 搜索 + 云端密钥。
 *
 * 这里是最依赖 `onEngineEvent` 增量更新的一个域：下载进度每 200ms 一条事件，
 * 每次都重新 `listResources()` 会把整张列表重建一遍并把滚动位置抖掉。正确的做法是
 * `resourceChanged` 事件带回来的那条记录就地替换，其余记录一个都不碰。
 *
 * `tier: 'ipc-new'` 的那个通道（`feedback.submit`）在这里只用一次，
 * 不参与任何状态机，也不假设主仓已经有它。Hub 那三个方法（`models.*`）已经接上，
 * 搜索只往 `hub` 里写一次快照，安装则并入本域既有的 busyIds / patchResource 链路。
 */

import type { NolaBridge } from '@/bridge'
import type {
  AudioDevice,
  CloudTranslationProvider,
  HubInspectResult,
  HubModelSummary,
  HubSearchResult,
  ResourceRecord,
  ResourceRecordWithRate,
} from '@/bridge'
import { createStore, createWriteQueue } from './createStore'

export type HubKind = 'all' | 'asr' | 'mt' | 'quant'

export interface HubSearchState {
  query: string
  kind: HubKind
  /** 已按 PyTorch/GGUF 格式筛选的仓库元数据。 */
  results: HubModelSummary[]
  /** 筛选和分页前拉取的候选数。 */
  candidates: number
  /** 深检途中被 429 打断。 */
  rateLimited: boolean
  loading: boolean
  /** 搜索本身失败时为 true；结果为空但没有错误是"搜到 0 条"，不是失败。 */
  failed: boolean
}

export interface ModelsState {
  storagePath: string
  /**
   * `ResourceRecordWithRate` 而不是裸的 `ResourceRecord`：
   * bridge 的 `listResources()` 返回 readonly 数组，元素是带可选 `bytesPerSecond`
   * 的交叉类型（主仓的 `ResourceRecord` 还没有这个字段，见 bridge/types.ts）。
   * store 只读不改，所以 readonly 数组是对的 —— 下面 upsert 那几处用展开造新数组。
   */
  resources: readonly ResourceRecordWithRate[]
  devices: AudioDevice[]
  loaded: boolean
  loading: boolean
  error: string | null
  /** 正在被 install / remove / cancel 的资源 id。 */
  busyIds: readonly string[]
  /** 引擎握手信息，`ready` 事件到达后才有。 */
  engineVersion: string | null
  credentials: Readonly<Record<CloudTranslationProvider, boolean>>
  hub: HubSearchState
}

const initialState: ModelsState = {
  storagePath: '',
  resources: [],
  devices: [],
  loaded: false,
  loading: false,
  error: null,
  busyIds: [],
  engineVersion: null,
  credentials: { microsoft: false, openai: false },
  hub: { query: '', kind: 'asr', results: [], candidates: 0, rateLimited: false, loading: false, failed: false },
}

export const modelsStore = createStore<ModelsState>(initialState)

let bridge: NolaBridge | null = null
let unsubscribe: (() => void) | null = null
let busy = new Set<string>()
let searchGeneration = 0

const enqueue = createWriteQueue()

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function setBusy(ids: Iterable<string>): void {
  busy = new Set(ids)
  modelsStore.setState({ busyIds: [...busy] })
}

/** 就地替换一条记录，列表顺序与其它记录的引用都不变。 */
function patchResource(resource: ResourceRecord): void {
  modelsStore.setState((state) => {
    const index = state.resources.findIndex((item) => item.resourceId === resource.resourceId)
    if (index < 0) {
      return { resources: [...state.resources, resource] }
    }
    const next = [...state.resources]
    next[index] = resource
    return { resources: next }
  })
}

// -- 公开动作 -----------------------------------------------------------------

export async function loadModels(): Promise<void> {
  if (!bridge) return
  if (modelsStore.getState().loading) return
  modelsStore.setState({ loading: true, error: null })
  try {
    const [snapshot, devices, credentials] = await Promise.all([
      bridge.engine.listResources(),
      bridge.engine.listDevices(),
      loadCredentials(bridge),
    ])
    modelsStore.setState({
      storagePath: snapshot.storagePath,
      resources: snapshot.resources,
      devices,
      credentials,
      loaded: true,
      loading: false,
    })
  } catch (error) {
    modelsStore.setState({ loading: false, error: errorMessage(error) })
    throw error
  }
}

async function loadCredentials(target: NolaBridge): Promise<Record<CloudTranslationProvider, boolean>> {
  const providers: CloudTranslationProvider[] = ['microsoft', 'openai']
  const entries = await Promise.all(
    providers.map(async (provider) => [provider, await target.translation.hasCredential(provider)] as const),
  )
  return { microsoft: entries[0][1], openai: entries[1][1] }
}

export async function manageResource(
  resourceId: string,
  action: 'install' | 'remove' | 'cancel',
): Promise<ResourceRecord> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  setBusy([...busy, resourceId])
  modelsStore.setState({ error: null })
  return enqueue(async () => {
    try {
      const resource = await bridge!.engine.manageResource(resourceId, action)
      patchResource(resource)
      return resource
    } catch (error) {
      modelsStore.setState({ error: errorMessage(error) })
      throw error
    } finally {
      const remaining = new Set(busy)
      remaining.delete(resourceId)
      setBusy(remaining)
    }
  })
}

/**
 * Hub 元数据搜索。只让最新请求更新共享状态，调用方仍能拿到自己的返回值。
 */
export async function searchHub(query: string, kind: HubKind): Promise<HubSearchResult> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const generation = ++searchGeneration
  modelsStore.setState((state) => ({ hub: { ...state.hub, query, kind, loading: true, failed: false } }))
  try {
    const result = await bridge.models.searchHuggingFace(query, kind)
    if (generation === searchGeneration) modelsStore.setState((state) => ({
      hub: {
        ...state.hub,
        query,
        kind,
        results: result.models,
        candidates: result.candidates,
        rateLimited: result.rateLimited,
        loading: false,
      },
    }))
    return result
  } catch (error) {
    // 只写 hub.failed，不写页面级的 error：那个字段是「资源安装/卸载失败」专用的，
    // 写进去会让 ModelsPage 把一次搜索失败显示成"模型下载中断"。
    if (generation === searchGeneration) modelsStore.setState((state) => ({ hub: { ...state.hub, query, kind, loading: false, failed: true } }))
    throw error
  }
}

/**
 * 自装模型：引擎判定、注册、起下载，之后的进度与取消都走 `resourceChanged` 事件。
 *
 * busy 的键是 **repo** 而不是 resourceId：请求发出时还不知道引擎会给出哪个 id
 * （`HubModelSummary.resourceId` 只是"装上之后会叫这个"），用 repo 键住请求本身，
 * 拿到 `ResourceRecord` 之后界面改用那条记录自己的 resourceId 走 cancel / remove。
 *
 * 失败**不写** `state.error`：那里是「资源安装/卸载失败」专用的页面级 Alert，
 * 而这条通道在传输之前就可能拒绝（例如字幕会话运行中），报成"下载中断"是错的。
 * 界面拿到的 reject 由调用方自己呈现。
 */
export async function installHubModel(
  repo: string,
  slot: 'recognition' | 'translation',
): Promise<ResourceRecord> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  setBusy([...busy, repo])
  return enqueue(async () => {
    try {
      const record = await bridge!.models.installHuggingFaceModel(repo, slot)
      patchResource(record)
      return record
    } finally {
      const remaining = new Set(busy)
      remaining.delete(repo)
      setBusy(remaining)
    }
  })
}

/**
 * 单个仓库的只读复查。搜索已经带判定，这条是给详情抽屉里"重新判定"用的：
 * 引擎会重新读一次 config 与文件清单，拿到的是当下的事实而不是搜索那一刻的快照。
 *
 * 不写任何 store 状态：它是只读的，判定结果由调用方（抽屉）自己持有。
 */
export async function inspectHubModel(repo: string): Promise<HubInspectResult> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  return bridge.models.inspectHuggingFace(repo)
}

export async function loadHubModelCard(repo: string, revision?: string): Promise<string> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  return bridge.models.getHuggingFaceModelCard(repo, revision)
}

export function clearHubSearch(): void {
  searchGeneration += 1
  modelsStore.setState({ hub: { ...initialState.hub } })
}

export async function setTranslationCredential(
  provider: CloudTranslationProvider,
  value: string,
): Promise<void> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  modelsStore.setState({ error: null })
  try {
    await bridge.translation.setCredential(provider, value)
    const present = await bridge.translation.hasCredential(provider)
    modelsStore.setState((state) => ({ credentials: { ...state.credentials, [provider]: present } }))
  } catch (error) {
    modelsStore.setState({ error: errorMessage(error) })
    throw error
  }
}

export function clearModelsError(): void {
  modelsStore.setState({ error: null })
}

// -- 注入 ---------------------------------------------------------------------

export function attachModelsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event) => {
    switch (event.type) {
      case 'resources':
        // 整表快照：只在引擎主动广播时替换。下载过程中的 200ms 事件走下面两条。
        modelsStore.setState({
          storagePath: event.storagePath,
          resources: event.resources,
          loaded: true,
        })
        break
      case 'resourceChanged':
      case 'resourceActionResult':
        patchResource(event.resource)
        break
      case 'devices':
        modelsStore.setState({ devices: event.devices })
        break
      case 'ready':
        modelsStore.setState({ engineVersion: event.engineVersion })
        break
      default:
        break
    }
  })
}

export function detachModelsStore(): void {
  searchGeneration += 1
  unsubscribe?.()
  unsubscribe = null
  bridge = null
  busy = new Set()
  modelsStore.setState(initialState)
}
