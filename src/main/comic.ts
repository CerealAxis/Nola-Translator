import { dialog, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { comicImportSchema, comicMutationSchema, comicRunSchema, comicExportSchema,
  type ComicProject, type ComicRunRequest, type ComicProjectSummary } from '../shared/comic'
import type { GlossaryDocument } from '../shared/glossary'
import { isTrustedRendererUrl } from './window-options'
import type { FeatureActivity, FeatureLease } from './feature-activity'

interface ComicConnection { baseUrl: string; authorizationHeader(): Record<string, string> }
export interface ComicTranslationOptions {
  mainDir: string
  backend(): Promise<ComicConnection>
  prepareRun(request: ComicRunRequest, project: ComicProject): Promise<{ model: string; headers: Record<string, string>; ocrResourceId?: string; release?: () => void | Promise<void> }>
  glossary?(): Promise<GlossaryDocument>
  getMainWindow(): BrowserWindow | null
  publish(event: { projectId: string }): void
  activity?: FeatureActivity
}

const projectIdSchema = z.string().uuid()
export class ComicTranslation {
  private readonly channels: string[] = []
  private readonly leases = new Map<string, { projectId: string; release: () => void | Promise<void> }>()
  private poll?: ReturnType<typeof setTimeout>
  private disposed = false
  private stopping?: Promise<void>
  private featureLease?: FeatureLease
  private pendingStarts = 0
  private draining?: Promise<void>
  constructor(private readonly options: ComicTranslationOptions) {
    const handle = (channel: string, action: (raw: unknown) => unknown) => {
      this.channels.push(channel)
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) => {
        if (this.stopping) throw new Error('comicUnavailable')
        const main = this.options.getMainWindow()
        if (!main || event.sender !== main.webContents || event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url, this.options.mainDir)) throw new Error('Access denied')
        return action(raw)
      })
    }
    handle('comic:list', () => this.listProjects())
    handle('comic:open', raw => this.openProject(projectIdSchema.parse(raw)))
    handle('comic:import', async raw => {
      const input = comicImportSchema.parse(raw)
      const formats = { images: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'],
        archive: ['zip', 'cbz', 'nola-comic'], pdf: ['pdf'], ebook: ['epub', 'mobi', 'azw', 'azw3'] }
      const result = await dialog.showOpenDialog({ properties: input.kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
        ...(input.kind !== 'folder' ? { filters: [{ name: formats[input.kind].join(', ').toUpperCase(), extensions: formats[input.kind] }] } : {}) })
      if (result.canceled || !result.filePaths.length) return null
      const { kind: _kind, ...body } = input
      const project = await this.request<ComicProject>('/import', { ...body, paths: result.filePaths })
      this.options.publish({ projectId: project.id })
      return project
    })
    handle('comic:edit', async raw => {
      const input = comicMutationSchema.parse(raw)
      const project = await this.request<ComicProject>('/edit', input)
      this.options.publish({ projectId: project.id })
      return project
    })
    handle('comic:run', raw => this.run(comicRunSchema.parse(raw)))
    handle('comic:cancel', async raw => {
      const input = z.object({ projectId: projectIdSchema, jobId: projectIdSchema }).strict().parse(raw)
      return this.request<ComicProject>(`/projects/${input.projectId}/jobs/${input.jobId}/cancel`, {})
    })
    handle('comic:image', async raw => {
      const input = z.object({ projectId: projectIdSchema, pageId: projectIdSchema, kind: z.enum(['source', 'clean', 'rendered']) }).strict().parse(raw)
      const response = await this.fetch(`/projects/${input.projectId}/pages/${input.pageId}/${input.kind}`)
      return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    })
    handle('comic:export', async raw => {
      const input = comicExportSchema.parse(raw)
      if (input.kind === 'directory') {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
        if (result.canceled || !result.filePaths.length) return false
        await this.request(`/projects/${input.projectId}/export-directory`, { directory: result.filePaths[0], pageIds: input.pageIds, layer: input.layer })
        return true
      }
      const extension = input.kind === 'project' ? 'nola-comic' : ['images', 'labelplus'].includes(input.kind) ? 'zip' : input.kind
      const result = await dialog.showSaveDialog({ defaultPath: `comic.${extension}`, filters: [{ name: 'Comic', extensions: [extension] }] })
      if (result.canceled || !result.filePath) return false
      const { projectId, ...body } = input
      const response = await this.fetch(`/projects/${projectId}/export`, body)
      if (!response.body) throw new Error('exportFailed')
      const temporary = `${result.filePath}.${randomUUID()}.tmp`
      try {
        const file = await open(temporary, 'wx')
        try {
          let size = 0
          for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
            size += chunk.byteLength
            if (size > 1024 * 1024 * 1024) throw new Error('exportTooLarge')
            await file.writeFile(chunk)
          }
          await file.sync()
        } finally { await file.close() }
        await rename(temporary, result.filePath)
      } finally { await rm(temporary, { force: true }).catch(() => {}) }
      return true
    })
  }

  private async fetch(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response> {
    if (this.disposed) throw new Error('comicUnavailable')
    const backend = await this.options.backend()
    const response = await fetch(new URL(`/api/v2/comics${path}`, backend.baseUrl), {
      method: body === undefined ? 'GET' : 'POST', headers: { ...backend.authorizationHeader(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { detail?: unknown }
      throw new Error(typeof error.detail === 'string' && /^[A-Za-z]{1,60}$/.test(error.detail) ? error.detail : 'comicRequestFailed')
    }
    return response
  }
  private async request<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    return (await this.fetch(path, body, headers)).json() as Promise<T>
  }
  listProjects(): Promise<ComicProjectSummary[]> { return this.request('/projects') }
  openProject(id: string): Promise<ComicProject> { return this.request(`/projects/${projectIdSchema.parse(id)}`) }
  async readImage(projectId: string, pageId: string, kind: 'source' | 'clean' | 'rendered', signal: AbortSignal): Promise<{ data: string; width: number; height: number }> {
    signal.throwIfAborted()
    const backend = await this.options.backend()
    const response = await fetch(new URL(`/api/v2/comics/projects/${projectIdSchema.parse(projectId)}/pages/${projectIdSchema.parse(pageId)}/${kind}?max_pixels=2000000`, backend.baseUrl), { headers: backend.authorizationHeader(), signal })
    if (!response.ok) throw new Error('comicImageUnavailable')
    const data = Buffer.from(await response.arrayBuffer())
    signal.throwIfAborted()
    if (data.length > 12 * 1024 * 1024) throw new Error('comicImageTooLarge')
    return { data: data.toString('base64'), width: Number(response.headers.get('x-image-width')), height: Number(response.headers.get('x-image-height')) }
  }

  async run(request: ComicRunRequest): Promise<ComicProject> {
    if (this.draining || this.stopping) throw new Error('comicUnavailable')
    const project = await this.openProject(request.projectId)
    if (this.draining || this.stopping) throw new Error('comicUnavailable')
    if (project.revision !== request.expectedRevision) throw new Error('conflict')
    if (!this.featureLease) this.featureLease = this.options.activity?.acquire('comic-translation', () => this.cancelAndDrain())
    this.pendingStarts++
    let prepared: Awaited<ReturnType<ComicTranslationOptions['prepareRun']>>
    try { prepared = await this.options.prepareRun(request, project) }
    catch (error) { this.pendingStarts--; this.releaseIdleFeature(); throw error }
    if (this.draining || this.stopping) {
      try { await prepared.release?.() }
      finally { this.pendingStarts--; this.releaseIdleFeature() }
      throw new Error('comicUnavailable')
    }
    const submittedJobId = randomUUID()
    try {
      const { projectId, ...body } = request
      const result = await this.request<ComicProject>(`/projects/${projectId}/run`, { ...body, jobId: submittedJobId, model: prepared.model,
        ocrResourceId: prepared.ocrResourceId, glossary: await this.options.glossary?.() ?? {} }, prepared.headers)
      const job = result.jobs.find(item => item.state === 'running')
      if (job) {
        this.leases.set(job.id, { projectId, release: prepared.release ?? (() => {}) })
        this.schedulePoll()
      } else await prepared.release?.()
      this.options.publish({ projectId })
      this.featureLease?.running()
      return result
    } catch (error) {
      let running = true
      try { running = (await this.openProject(request.projectId)).jobs.some(job => job.id === submittedJobId && job.state === 'running') } catch { /* A lost acknowledgement is not proof that native inference stopped. */ }
      if (running) {
        this.leases.set(submittedJobId, { projectId: request.projectId, release: prepared.release ?? (() => {}) })
        this.schedulePoll()
      } else await prepared.release?.()
      throw error
    } finally {
      this.pendingStarts--
      this.releaseIdleFeature()
    }
  }

  private releaseIdleFeature() {
    if (!this.pendingStarts && !this.leases.size) { this.featureLease?.release(); this.featureLease = undefined }
  }

  stop(): Promise<void> { return this.cancelAndDrain() }

  private cancelAndDrain(): Promise<void> {
    if (this.draining) return this.draining
    this.featureLease?.stopping()
    this.draining = (async () => {
      while (this.pendingStarts) await new Promise(resolve => setTimeout(resolve, 50))
      for (const [jobId, lease] of this.leases) await this.request(`/projects/${lease.projectId}/jobs/${jobId}/cancel`, {})
      while (this.leases.size) {
        for (const [id, lease] of this.leases) {
          const project = await this.openProject(lease.projectId)
          if (project.jobs.some(job => job.id === id && job.state === 'running')) continue
          if (this.leases.delete(id)) await lease.release()
        }
        if (this.leases.size) await new Promise(resolve => setTimeout(resolve, 200))
      }
      this.releaseIdleFeature()
    })().finally(() => { this.draining = undefined })
    return this.draining
  }

  private schedulePoll() {
    if (this.poll || this.disposed || this.stopping) return
    this.poll = setTimeout(async () => {
      this.poll = undefined
      for (const [id, lease] of this.leases) {
        try {
          const project = await this.openProject(lease.projectId)
          const job = project.jobs.find(item => item.id === id)
          this.options.publish({ projectId: lease.projectId })
          if (!job || job.state !== 'running') {
            if (this.leases.delete(id)) await lease.release()
          }
        } catch { /* Keep the lease while backend completion is unknown. */ }
      }
      if (this.leases.size) this.schedulePoll()
      else this.releaseIdleFeature()
    }, 800)
  }
  dispose(): Promise<void> {
    if (this.stopping) return this.stopping
    this.stopping = (async () => {
      if (this.poll) clearTimeout(this.poll)
      for (const channel of this.channels) ipcMain.removeHandler(channel)
      await this.cancelAndDrain()
      this.disposed = true
    })()
    return this.stopping
  }
}
