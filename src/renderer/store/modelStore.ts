/**
 * Model domain: resource snapshot + audio devices + Hub search + credentials.
 *
 * Progress arrives every 200ms, and re-running `listResources()` each time
 * jitters scroll — so a `resourceChanged` record replaces one entry in place.
 */

import type { NolaBridge } from '@/bridge'
import type {
  AudioDevice,
  CredentialProvider,
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
  /** Repo metadata already filtered down to PyTorch/GGUF formats. */
  results: HubModelSummary[]
  /** Candidates fetched before that filter and before pagination. */
  candidates: number
  /** The hub answered 429 partway through the deep check. */
  rateLimited: boolean
  loading: boolean
  /** The search itself failed. Zero results with no error means "found 0", not a failure. */
  failed: boolean
}

export interface ModelsState {
  storagePath: string
  /**
   * `ResourceRecordWithRate` rather than a bare `ResourceRecord`: the bridge's
   * `listResources()` returns a readonly array of the intersection type with the
   * optional `bytesPerSecond` (see bridge/types.ts). The store only reads, so
   * readonly is right; the upserts below build new arrays.
   */
  resources: readonly ResourceRecordWithRate[]
  devices: AudioDevice[]
  loaded: boolean
  loading: boolean
  error: string | null
  /** Resource ids with an install, remove or cancel still in flight. */
  busyIds: readonly string[]
  /** Engine handshake, populated by the `ready` event. */
  engineVersion: string | null
  credentials: Readonly<Record<CredentialProvider, boolean>>
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
  credentials: { cloud: false, microsoft: false },
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

/** Replaces one record in place, leaving list order and every other reference alone. */
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

export async function loadModels(): Promise<void> {
  if (!bridge) return
  if (modelsStore.getState().loading) return
  modelsStore.setState({ loading: true, error: null })
  try {
    // Both engine calls block until the handshake finishes, so on a cold start this
    // resolves after the engine is up rather than answering empty.
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

/** Providers that need a query, i.e. the top-level keys of `credentials.json`. */
const CREDENTIAL_PROVIDERS: readonly CredentialProvider[] = ['cloud', 'microsoft']

async function loadCredentials(target: NolaBridge): Promise<Record<CredentialProvider, boolean>> {
  const entries = await Promise.all(
    CREDENTIAL_PROVIDERS.map(async (provider) => [provider, await target.translation.hasCredential(provider)] as const),
  )
  return entries.reduce<Record<CredentialProvider, boolean>>(
    (flags, [provider, present]) => {
      flags[provider] = present
      return flags
    },
    { cloud: false, microsoft: false },
  )
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
 * Hub metadata search. Only the newest request may write the shared state, but
 * every caller still gets its own return value.
 */
export async function searchHub(query: string, kind: HubKind, cursor?: string): Promise<HubSearchResult> {
  if (!bridge) throw new Error('initStores 还没注入 bridge')
  const generation = ++searchGeneration
  modelsStore.setState((state) => ({ hub: { ...state.hub, query, kind, loading: true, failed: false } }))
  try {
    const result = await bridge.models.searchHuggingFace(query, kind, cursor)
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
    if (generation === searchGeneration) modelsStore.setState((state) => ({ hub: { ...state.hub, query, kind, loading: false, failed: true } }))
    throw error
  }
}

/**
 * Self-installed model: the engine judges it, registers it and starts the
 * download, after which progress travels on `resourceChanged`. The busy key is
 * the **repo** — the engine's id is unknown until the call returns — and a
 * failure does not write `state.error`, since this channel can refuse early.
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
 * Read-only re-check of one repo, for the detail drawer's "judge again": the
 * engine re-reads config and file list, so the answer is the fact as of now.
 * Writes no store state — the caller holds the verdict.
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
  provider: CredentialProvider,
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

export function attachModelsStore(next: NolaBridge): void {
  bridge = next
  unsubscribe?.()
  unsubscribe = next.events.onEngineEvent((event) => {
    switch (event.type) {
      case 'resources':
        // Whole-table snapshot; the 200ms download events take the branches below.
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
