import type { NolaBridge } from '@/bridge'
import type { OfflinePreview, OfflinePrepareRequest, OfflineTask, OfflineWorkflow } from '../../shared/offline'
import { createStore } from './createStore'

export type OfflineMode = 'model' | 'bundle' | 'prepare'
export interface OfflineState {
  available: boolean
  mode: OfflineMode | null
  preview: OfflinePreview | null
  task: OfflineTask | null
  busy: boolean
  workflow?: OfflineWorkflow
  failed: boolean
  downloadModelId?: string
  destination: import('../../shared/offline').OfflineDestination | null
}
export const offlineStore = createStore<OfflineState>({ available: false, mode: null, preview: null, task: null, busy: false, failed: false, destination: null })
let bridge: NolaBridge | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let generation = 0
let taskRevision = 0
let completed: (() => void) | undefined

function accept(task: OfflineTask): void {
  if (task.state === 'idle') { offlineStore.setState({ task: null }); return }
  const previous = offlineStore.getState().task
  offlineStore.setState({ task })
  if (task.state === 'completed' && previous?.state !== 'completed') completed?.()
  if (task.state === 'running') schedule()
}
function schedule(): void {
  if (timer) clearTimeout(timer)
  const current = generation
  const revision = taskRevision
  timer = setTimeout(() => {
    timer = null
    void bridge?.offline?.snapshot().then(task => {
      if (current !== generation || revision !== taskRevision) return
      if (task.state === 'idle' && offlineStore.getState().busy) schedule()
      else accept(task)
    }).catch(() => {
      if (current === generation && revision === taskRevision) { offlineStore.setState({ failed: true }); schedule() }
    })
  }, 1000)
}
export function initOfflineStore(next: NolaBridge, onCompleted?: () => void): () => void {
  generation++
  if (timer) clearTimeout(timer)
  bridge = next
  completed = onCompleted
  offlineStore.setState({ available: !!next.offline })
  const current = generation
  void next.offline?.snapshot().then(task => { if (generation === current) accept(task) }).catch(() => undefined)
  return () => { generation++; if (timer) clearTimeout(timer); timer = null; bridge = null }
}
async function run<T>(operation: () => Promise<T>, success: (value: T) => void): Promise<void> {
  if (offlineStore.getState().busy) return
  offlineStore.setState({ busy: true, failed: false })
  try { success(await operation()) } catch { offlineStore.setState({ failed: true }) }
  finally { offlineStore.setState({ busy: false }) }
}
export const offlineActions = {
  open(mode: OfflineMode): void { offlineStore.setState({ mode, preview: null, failed: false, downloadModelId: undefined, destination: null }) },
  openDownloads(modelId: string): void {
    offlineActions.reset()
    offlineStore.setState({ mode: 'model', preview: null, failed: false, downloadModelId: modelId, destination: null })
  },
  close(): void { offlineStore.setState({ mode: null }) },
  clearPreview(): void { offlineStore.setState({ preview: null }) },
  selectModel(kind: 'file' | 'directory', repo?: string, path?: string): Promise<void> {
    return run(async () => bridge?.offline?.selectModel(kind, repo, path) ?? null, preview => { if (preview) offlineStore.setState({ preview }) })
  },
  selectBundle(): Promise<void> {
    return run(async () => bridge?.offline?.selectBundle() ?? null, preview => { if (preview) offlineStore.setState({ preview }) })
  },
  pickBundle(): Promise<void> {
    return (async () => {
      if (offlineStore.getState().busy || offlineStore.getState().task?.state === 'running') return
      offlineStore.setState({ busy: true, failed: false, mode: 'bundle', preview: null, workflow: 'bundle-install', task: { state: 'running', phase: 'extract', current: 0, total: 0 } })
      schedule()
      try {
        const preview = await bridge?.offline?.selectBundle() ?? null
        taskRevision++
        if (timer) clearTimeout(timer)
        offlineStore.setState({ preview, task: null, mode: preview ? 'bundle' : null })
      } catch { taskRevision++; if (timer) clearTimeout(timer); offlineStore.setState({ failed: true, task: null }) }
      finally { offlineStore.setState({ busy: false }) }
    })()
  },
  prepare(request: OfflinePrepareRequest): Promise<void> {
    return run(async () => { if (!bridge?.offline) throw new Error('Unavailable'); const task = await bridge.offline.prepare(request); if (task) offlineStore.setState({ workflow: 'bundle-prepare' }); return task }, task => { if (task) accept(task) })
  },
  install(): Promise<void> {
    return run(async () => {
      const preview = offlineStore.getState().preview
      if (!bridge?.offline || !preview?.compatible || preview.issues.length) throw new Error('Invalid preview')
      const task = await bridge.offline.install(preview.token)
      offlineStore.setState({ workflow: offlineStore.getState().mode === 'model' ? 'model-import' : 'bundle-install' })
      return task
    }, accept)
  },
  downloadModel(modelId: string, source: import('../../shared/contracts').ModelDownloadSource, path?: string): Promise<void> {
    return (async () => {
      if (offlineStore.getState().busy) return
      offlineStore.setState({ busy: true, failed: false })
      try {
        const api = bridge?.offline
        // Resolve edited paths in the main process before obtaining the preparation token.
        // A fresh token also permits retry after a previous preparation consumed one.
        const destination = path === undefined ? offlineStore.getState().destination : await api?.selectDestination(path)
        if (!api || !destination) throw new Error('Unavailable')
        offlineStore.setState({ destination })
        const task = await api.prepare({ modelIds: [modelId], runtimeIds: [], modelSource: source }, { kind: 'model', token: destination.token })
        if (task) offlineStore.setState({ workflow: 'model-download' })
        if (task) accept(task)
      } catch { offlineStore.setState({ failed: true }) }
      finally { offlineStore.setState({ busy: false }) }
    })()
  },
  selectDestination(): Promise<void> {
    return run(async () => bridge?.offline?.selectDestination() ?? null, destination => {
      if (destination) offlineStore.setState({ destination })
    })
  },
  clearDestination(): void { offlineStore.setState({ destination: null, failed: false }) },
  async cancel(): Promise<void> {
    try { await bridge?.offline?.cancel() }
    catch { offlineStore.setState({ failed: true }) }
  },
  openOutput(): Promise<void> { return run(async () => bridge?.offline?.openOutput(), () => undefined) },
  reset(): void { if (offlineStore.getState().task?.state !== 'running') offlineStore.setState({ task: null, preview: null, failed: false, workflow: undefined }) },
}
