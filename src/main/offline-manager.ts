import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, statfs, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { offlineArchive } from './offline-archive'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { offlinePrepareSchema, type OfflineItem, type OfflineIssue, type OfflinePrepareRequest, type OfflinePreview, type OfflineTask } from '../shared/offline'
import { modelImportEntry } from '../shared/model-import-catalog'
import type { NetworkSettings } from '../shared/settings'
import { resolveModelNetwork } from './network-region'

const prepareDestinationSchema = z.object({ kind: z.enum(['package', 'model']).default('package'), token: z.string().min(1).max(128).optional() }).strict()
const manifestSchema = z.object({
  format: z.literal('nola-offline'), version: z.literal(1), platform: z.literal('win32-x64'),
  appVersion: z.string().min(1).max(64),
  modelIds: z.array(z.string().min(1).max(256)).max(16),
  runtimeIds: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)).max(4),
}).strict()
const issues = ['missingFiles', 'checksumMismatch', 'unsupportedModel', 'incompatible', 'insufficientSpace', 'invalidPackage', 'busy', 'failed'] as const
export const modelInspectionSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string(), kind: z.literal('model'), bytes: z.number().nonnegative(),
    status: z.enum(['ready', 'installed', 'invalid']), issue: z.enum(issues).optional(), files: z.array(z.string()).optional(), reason: z.string().max(2048).optional() })).max(16),
  totalBytes: z.number().nonnegative(), issues: z.array(z.enum(issues)), compatible: z.boolean(),
})
export type ModelInspection = z.infer<typeof modelInspectionSchema>
export type OfflineProgress = (phase: OfflineTask['phase'], current: number, total: number, detail?: string) => void
export interface ModelWorkerRequest {
  operation: 'inspect' | 'prepare' | 'install'
  source?: string
  destination?: string
  modelRoot: string
  modelIds?: string[]
  network?: Partial<NetworkSettings>
  modelSource?: 'huggingface' | 'hf-mirror' | 'modelscope'
  exportModel?: boolean
  localImport?: boolean
  repo?: string
}
interface RuntimeFiles {
  prepareOffline(ids: string[], directory: string, signal: AbortSignal, progress: OfflineProgress): Promise<void>
  inspectOffline(directory: string, signal?: AbortSignal): Promise<OfflineItem[]>
  installOffline(ids: string[], directory: string, signal: AbortSignal, progress: OfflineProgress): Promise<void>
}
export class OfflineError extends Error {
  constructor(readonly issue: OfflineIssue, readonly reason?: string) { super(reason ?? issue) }
}
interface Options {
  python?: string
  modelRoot: string
  runtimeRoot: string
  appVersion: string
  runtimes: RuntimeFiles
  models(request: ModelWorkerRequest, signal: AbortSignal, progress: OfflineProgress): Promise<unknown>
  /** Acquired synchronously before a task can yield to session startup. */
  reserve(): () => Promise<void>
  beforeInstall?(): Promise<void>
  network(): Partial<NetworkSettings>
  diagnostic?(event: string, fields: Record<string, unknown>): void
}
interface Selection {
  source: string
  kind: 'model' | 'bundle'
  preview: OfflinePreview
  repo?: string
}
const idle = (): OfflineTask => ({ state: 'idle', phase: 'check', current: 0, total: 0 })

/** Native paths stay behind short-lived selection tokens; package metadata never grants file access. */
export class OfflineManager {
  private task: OfflineTask = idle()
  private controller: AbortController | null = null
  private pending: Promise<void> | null = null
  private inspection: AbortController | null = null
  private inspectionPending: Promise<unknown> | null = null
  private temporary = new Set<string>()
  private selections = new Map<string, Selection>()
  constructor(private readonly options: Options) {}
  snapshot(): OfflineTask { return { ...this.task } }
  get busy(): boolean { return this.controller !== null || this.inspection !== null }
  cancel(): void { this.controller?.abort(); this.inspection?.abort() }
  async dispose(): Promise<void> { this.cancel(); await Promise.allSettled([this.pending, this.inspectionPending]); await this.clearSelections() }
  private assertIdle(): void { if (this.busy) throw new OfflineError('busy') }
  private readonly progress: OfflineProgress = (phase, current, total, detail) => {
    this.task = { ...this.task, phase, current: Math.max(0, current), total: Math.max(0, total), detail, unit: undefined }
  }
  private readonly archiveProgress: OfflineProgress = (phase, current, total, detail) => {
    this.progress(phase, current, total, detail)
    this.task.unit = 'bytes'
  }
  private async inspectModels(source: string, signal: AbortSignal, localImport = false, repo?: string): Promise<ModelInspection> {
    return modelInspectionSchema.parse(await this.options.models({ operation: 'inspect', source, modelRoot: this.options.modelRoot, localImport, repo, network: await resolveModelNetwork(this.options.network()) }, signal, () => {}))
  }
  async inspectModel(source: string, repo?: string): Promise<OfflinePreview> {
    return this.inspect(async signal => {
      await this.clearSelections()
      signal.throwIfAborted()
      const result = await this.inspectModels(source, signal, true, repo)
      signal.throwIfAborted()
      const preview = await this.remember(source, 'model', result.items, result.issues)
      const selection = this.selections.get(preview.token)
      if (selection) selection.repo = repo
      return preview
    })
  }
  async inspectBundle(archivePath: string): Promise<OfflinePreview> {
    return this.inspect(async signal => {
      await this.clearSelections()
      signal.throwIfAborted()
      const source = await mkdtemp(join(tmpdir(), 'nola-offline-bundle-'))
      this.temporary.add(source)
      this.task = { ...idle(), state: 'running', phase: 'extract' }
      try {
        await offlineArchive(this.options.python ?? 'python', 'extract', archivePath, source, signal, this.archiveProgress)
        this.progress('check', 0, 0)
        const { items, problems } = await this.checkBundle(source, signal)
        signal.throwIfAborted()
        return await this.remember(source, 'bundle', items, problems)
      } catch (error) {
        await this.removeTemporary(source)
        if (error && typeof error === 'object' && 'issue' in error && error.issue === 'insufficientSpace') throw new OfflineError('insufficientSpace')
        throw error
      } finally { this.task = idle() }
    })
  }
  private async removeTemporary(path: string): Promise<void> {
    // Only directories allocated by this manager are eligible for recursive removal.
    if (this.temporary.has(path) && dirname(path) === tmpdir() && path.startsWith(join(tmpdir(), 'nola-offline-bundle-'))) {
      await rm(path, { recursive: true, force: true })
      this.temporary.delete(path)
    }
  }
  private async clearSelections(): Promise<void> {
    this.selections.clear()
    for (const path of this.temporary) await this.removeTemporary(path)
  }
  private inspect(action: (signal: AbortSignal) => Promise<OfflinePreview>): Promise<OfflinePreview> {
    this.assertIdle()
    const controller = new AbortController()
    this.inspection = controller
    const task = action(controller.signal).finally(() => { this.inspection = null; this.inspectionPending = null })
    this.inspectionPending = task
    return task
  }
  private async manifest(source: string) {
    const path = join(source, 'manifest.json')
    const info = await lstat(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new OfflineError('invalidPackage')
    const parsed = manifestSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
    if (!parsed.success) throw new OfflineError('invalidPackage')
    if (parsed.data.appVersion !== this.options.appVersion) throw new OfflineError('incompatible')
    if (!parsed.data.modelIds.length && !parsed.data.runtimeIds.length) throw new OfflineError('invalidPackage')
    return parsed.data
  }
  private async checkBundle(source: string, signal: AbortSignal) {
    const manifest = await this.manifest(source)
    const models = manifest.modelIds.length ? await this.inspectModels(source, signal) : { items: [], issues: [] }
    signal.throwIfAborted()
    const runtimes = manifest.runtimeIds.length ? await this.options.runtimes.inspectOffline(source, signal) : []
    const sameIds = (actual: readonly { id: string }[], expected: readonly string[]) =>
      actual.length === expected.length && new Set(expected).size === expected.length && actual.every(item => expected.includes(item.id))
    if (!sameIds(models.items, manifest.modelIds) || !sameIds(runtimes, manifest.runtimeIds)) throw new OfflineError('invalidPackage')
    const items = [...models.items, ...runtimes]
    const problems: OfflineIssue[] = [...models.issues, ...items.flatMap(item => item.issue ? [item.issue] : [])]
    return { manifest, items, problems }
  }
  private async remember(source: string, kind: Selection['kind'], items: OfflineItem[], problems: OfflineIssue[]) {
    const totalBytes = items.filter(item => item.status !== 'installed').reduce((sum, item) => sum + item.bytes, 0)
    const roots = new Set(items.filter(item => item.status !== 'installed').map(item => item.kind === 'model' ? this.options.modelRoot : this.options.runtimeRoot))
    let availableBytes: number | undefined
    for (const root of roots) {
      const free = await this.freeSpace(root)
      if (free !== undefined) availableBytes = Math.min(availableBytes ?? free, free)
    }
    // Wheels expand during installation, and replacements keep the previous installation until commit.
    if (availableBytes !== undefined && availableBytes < totalBytes * 3) problems.push('insufficientSpace')
    const preview: OfflinePreview = { token: randomUUID(), items, totalBytes, availableBytes,
      issues: [...new Set(problems)], compatible: !problems.length && items.length > 0 && items.every(item => item.status !== 'invalid') }
    this.selections.clear()
    this.selections.set(preview.token, { source, kind, preview })
    return preview
  }
  private async freeSpace(path: string): Promise<number | undefined> {
    let target = resolve(path)
    for (;;) {
      try { const info = await statfs(target); return info.bavail * info.bsize }
      catch { const parent = dirname(target); if (target === parent) return undefined; target = parent }
    }
  }
  /**
   * A model export stages into a directory whose name is derived from the model id, so a
   * directory left behind by a crashed export would make every later export of that model fail
   * with EEXIST. A stale one is removed and the directory is created again.
   */
  private async createStaging(staging: string, parent: string): Promise<void> {
    try {
      await mkdir(staging, { recursive: false })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || dirname(staging) !== resolve(parent)) throw error
      this.options.diagnostic?.('offline.staleStagingRemoved', { path: staging })
      await rm(staging, { recursive: true, force: true })
      await mkdir(staging, { recursive: false })
    }
  }
  prepare(raw: OfflinePrepareRequest, parent: string, destination: 'package' | 'model' = 'package'): OfflineTask {
    this.assertIdle()
    const request = offlinePrepareSchema.parse(raw)
    const modelId = destination === 'model' ? request.modelIds[0] : undefined
    if (destination === 'model' && (request.modelIds.length !== 1 || request.runtimeIds.length !== 0 || !modelId || !modelImportEntry(modelId))) throw new OfflineError('unsupportedModel')
    const name = destination === 'model' ? modelId! : `Nola-offline-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`
    const staging = join(resolve(parent), destination === 'model' ? `.${name}.partial` : `${name}.partial`)
    const output = join(resolve(parent), destination === 'model' ? name : `${name}.zip`)
    const archive = `${output}.partial`
    return this.start(async signal => {
      try {
        await this.createStaging(staging, parent)
        if (request.modelIds.length) await this.options.models({ operation: 'prepare', destination: staging,
          modelIds: request.modelIds, modelRoot: this.options.modelRoot, network: await resolveModelNetwork(this.options.network()),
          modelSource: request.modelSource, exportModel: destination === 'model' }, signal, this.progress)
        signal.throwIfAborted()
        if (request.runtimeIds.length) await this.options.runtimes.prepareOffline(request.runtimeIds, staging, signal, this.progress)
        signal.throwIfAborted()
        this.progress('pack', 0, 1)
        if (destination === 'model') {
          const modelDirectory = join(staging, 'models')
          const entries = await readdir(modelDirectory)
          if (entries.length !== 1) throw new OfflineError('invalidPackage')
          const [modelEntry] = entries
          await rename(join(modelDirectory, modelEntry), join(staging, modelEntry))
          await rm(modelDirectory, { recursive: true, force: true })
          this.task.detail = modelEntry
        }
        if (destination !== 'model') await writeFile(join(staging, 'manifest.json'), JSON.stringify({ format: 'nola-offline', version: 1,
          platform: 'win32-x64', appVersion: this.options.appVersion, modelIds: request.modelIds, runtimeIds: request.runtimeIds }, null, 2), { flag: 'wx' })
        signal.throwIfAborted()
        if (destination === 'model') await rename(staging, output)
        else {
          await offlineArchive(this.options.python ?? 'python', 'pack', staging, archive, signal, this.archiveProgress)
          signal.throwIfAborted()
          await rename(archive, output)
        }
        if (destination !== 'model') this.task.outputPath = output
        else this.task.outputPath = join(output, this.task.detail ?? modelId!)
      } finally {
        if (destination !== 'model' && dirname(archive) === resolve(parent)) await rm(archive, { force: true })
        // The staging name is built here from the model id and sits directly in the folder the
        // user chose, so those two conditions are what bound this removal.
        if (dirname(staging) === resolve(parent) && (await lstat(staging).catch(() => null))?.isDirectory())
          await rm(staging, { recursive: true, force: true })
      }
    })
  }
  install(token: string): OfflineTask {
    this.assertIdle()
    const selected = this.selections.get(token)
    if (!selected?.preview.compatible) throw new OfflineError('invalidPackage')
    const release = this.options.reserve()
    this.selections.delete(token)
    return this.start(async signal => {
      try {
        await this.options.beforeInstall?.()
        signal.throwIfAborted()
        if (selected.kind === 'model') {
          const inspected = await this.inspectModels(selected.source, signal, true, selected.repo)
          if (!inspected.compatible || inspected.issues.length) throw new OfflineError(inspected.issues[0] ?? 'invalidPackage', inspected.items.find(item => item.reason)?.reason)
          await this.options.models({ operation: 'install', source: selected.source, modelRoot: this.options.modelRoot, localImport: true, repo: selected.repo, network: await resolveModelNetwork(this.options.network()) }, signal, this.progress)
        } else {
          const checked = await this.checkBundle(selected.source, signal)
          if (checked.problems.length) throw new OfflineError(checked.problems[0])
          if (checked.manifest.modelIds.length) await this.options.models({ operation: 'install', source: selected.source,
            modelRoot: this.options.modelRoot, modelIds: checked.manifest.modelIds }, signal, this.progress)
          signal.throwIfAborted()
          if (checked.manifest.runtimeIds.length) await this.options.runtimes.installOffline(checked.manifest.runtimeIds, selected.source, signal, this.progress)
        }
      } finally {
        try { if (selected.kind === 'bundle') await this.removeTemporary(selected.source) }
        finally { await release() }
      }
    })
  }
  private start(action: (signal: AbortSignal) => Promise<void>): OfflineTask {
    const controller = new AbortController()
    this.controller = controller
    this.task = { ...idle(), state: 'running' }
    this.options.diagnostic?.('offline.started', {})
    this.pending = Promise.resolve().then(() => action(controller.signal)).then(() => {
      this.task = { ...this.task, state: 'completed' }
    }, (error: unknown) => {
      const issue = error instanceof OfflineError ? error.issue
        : typeof error === 'object' && error && 'issue' in error && issues.includes(error.issue as OfflineIssue) ? error.issue as OfflineIssue : 'failed'
      this.options.diagnostic?.('offline.failed', { issue, error: String(error), cancelled: controller.signal.aborted })
      this.task = { ...this.task, state: controller.signal.aborted ? 'cancelled' : 'failed', issue, reason: error instanceof OfflineError ? error.reason : undefined }
    }).finally(() => { this.controller = null })
    return this.snapshot()
  }
}
