import { dialog, ipcMain, nativeImage, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { open, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, parse } from 'node:path'
import { cpus, freemem, totalmem } from 'node:os'
import { z } from 'zod'
import { comicImportSchema, comicMutationSchema, comicRunSchema, comicExportSchema, comicRegionSchema,
  type ComicFont, type ComicRuntimeStatus,
  type ComicProject, type ComicRunRequest, type ComicProjectSummary } from '../shared/comic'
import type { GlossaryDocument } from '../shared/glossary'
import { isTrustedRendererUrl } from './window-options'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { exportComicPsd, rgbaFromBgra } from './comic-psd'
import fontkit from '@pdf-lib/fontkit'

interface ComicConnection { baseUrl: string; authorizationHeader(): Record<string, string> }
export interface ComicTranslationOptions {
  mainDir: string
  backend(): Promise<ComicConnection>
  prepareRun(request: ComicRunRequest, project: ComicProject): Promise<{ model: string; headers: Record<string, string>; ocrResourceId?: string; release?: () => void | Promise<void> }>
  glossary?(): Promise<GlossaryDocument>
  getMainWindow(): BrowserWindow | null
  isEditorSender?(event: IpcMainInvokeEvent, projectId?: string): boolean
  publish(event: { projectId: string }): void
  activity?: FeatureActivity
}

const maxPixelsSchema = z.number().int().min(10_000).max(4_000_000).optional()
const projectIdSchema = z.string().uuid()
const editorGlobalChannels = new Set(['comic:runtime', 'comic:fonts', 'comic:font-preview', 'comic:read-font', 'comic:import-fonts'])
const editorProjectChannels = new Set(['comic:open', 'comic:layer-image', 'comic:preview-region', 'comic:thumbnail',
  'comic:edit', 'comic:run', 'comic:cancel', 'comic:image', 'comic:export'])
export class ComicTranslation {
  private readonly channels: string[] = []
  private readonly leases = new Map<string, { projectId: string; release: () => void | Promise<void> }>()
  private poll?: ReturnType<typeof setTimeout>
  private disposed = false
  private stopping?: Promise<void>
  private featureLease?: FeatureLease
  private pendingStarts = 0
  private readonly thumbnails = new Map<string, string>()
  private cpuSample?: { idle: number; total: number }
  private draining?: Promise<void>
  constructor(private readonly options: ComicTranslationOptions) {
    const handle = (channel: string, action: (raw: unknown) => unknown) => {
      this.channels.push(channel)
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) => {
        if (this.stopping) throw new Error('comicUnavailable')
        const main = this.options.getMainWindow()
        if (event.senderFrame !== event.sender.mainFrame) throw new Error('Access denied')
        const mainSender = !!main && event.sender === main.webContents && isTrustedRendererUrl(event.senderFrame.url, this.options.mainDir)
        if (!mainSender) {
          const target = channel === 'comic:open' ? raw : raw && typeof raw === 'object' && 'projectId' in raw ? raw.projectId : undefined
          const editorSender = editorGlobalChannels.has(channel)
            ? this.options.isEditorSender?.(event)
            : editorProjectChannels.has(channel) && typeof target === 'string' && this.options.isEditorSender?.(event, target)
          if (!editorSender) throw new Error('Access denied')
          if (channel === 'comic:edit') {
            const { command } = comicMutationSchema.parse(raw)
            if (['configure', 'rename', 'addChapter'].includes(command.action)) throw new Error('Access denied')
          }
        }
        return action(raw)
      })
    }
    handle('comic:list', () => this.listProjects())
    handle('comic:runtime', async () => {
      const status = await this.request<Pick<ComicRuntimeStatus, 'availableProviders' | 'activeModels' | 'gpuMemoryUsed' | 'gpuMemoryTotal'>>('/runtime')
      const sample = cpus().reduce((sum, cpu) => ({ idle: sum.idle + cpu.times.idle,
        total: sum.total + Object.values(cpu.times).reduce((total, time) => total + time, 0) }), { idle: 0, total: 0 })
      const elapsed = this.cpuSample ? sample.total - this.cpuSample.total : 0
      const cpuPercent = elapsed > 0 ? Math.max(0, Math.min(100, 100 * (1 - (sample.idle - this.cpuSample!.idle) / elapsed))) : null
      this.cpuSample = sample
      const memoryTotal = totalmem()
      return { ...status, cpuPercent, memoryTotal, memoryUsed: memoryTotal - freemem() } satisfies ComicRuntimeStatus
    })
    handle('comic:purge-runtime', async () => { await this.request('/runtime/purge', {}) })
    handle('comic:fonts', () => this.request<ComicFont[]>('/fonts'))
    handle('comic:font-preview', async raw => {
      const family = z.string().trim().min(1).max(200).parse(raw)
      const response = await this.fetch(`/fonts/preview?${new URLSearchParams({ family })}`)
      if (response.status === 204) return null
      const data = Buffer.from(await response.arrayBuffer())
      const { width, height } = nativeImage.createFromBuffer(data).getSize()
      if (!width || !height) throw new Error('invalidFont')
      return { image: `data:image/png;base64,${data.toString('base64')}`, width, height }
    })
    handle('comic:import-fonts', async () => {
      const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Fonts', extensions: ['ttf', 'otf', 'ttc'] }] })
      if (result.canceled || !result.filePaths.length) return this.request<ComicFont[]>('/fonts')
      return this.request<ComicFont[]>('/fonts/import', { paths: result.filePaths })
    })
    handle('comic:read-font', async raw => {
      const input = z.object({ family: z.string().trim().min(1).max(200), weight: z.number().int().min(100).max(900).default(400),
        italic: z.boolean().default(false) }).strict().parse(typeof raw === 'string' ? { family: raw } : raw)
      const query = new URLSearchParams({ family: input.family, weight: String(input.weight), italic: String(input.italic) })
      const response = await this.fetch(`/fonts/file?${query}`)
      const data = Buffer.from(await response.arrayBuffer())
      if (data.length > 32 * 1024 * 1024) throw new Error('invalidFont')
      return `data:font/otf;base64,${data.toString('base64')}`
    })
    handle('comic:layer-image', async raw => {
      const input = z.object({ projectId: projectIdSchema, pageId: projectIdSchema,
        kind: z.enum(['repair', 'drawing', 'text']), layerId: projectIdSchema, maxPixels: maxPixelsSchema }).strict().parse(raw)
      const response = await this.fetch(`/projects/${input.projectId}/pages/${input.pageId}/layers/${input.kind}/${input.layerId}${input.maxPixels === undefined ? '' : `?max_pixels=${input.maxPixels}`}`)
      return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    })
    handle('comic:thumbnail', async raw => {
      const input = z.object({ projectId: projectIdSchema, pageId: projectIdSchema }).strict().parse(raw)
      const key = `${input.projectId}/${input.pageId}`
      const cached = this.thumbnails.get(key)
      if (cached) return cached
      const response = await this.fetch(`/projects/${input.projectId}/pages/${input.pageId}/source?max_pixels=40000`)
      const data = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
      this.thumbnails.set(key, data)
      if (this.thumbnails.size > 100) this.thumbnails.delete(this.thumbnails.keys().next().value!)
      return data
    })
    handle('comic:preview-region', raw => {
      const input = z.object({ projectId: projectIdSchema, pageId: projectIdSchema, region: comicRegionSchema }).strict().parse(raw)
      return this.request(`/projects/${input.projectId}/pages/${input.pageId}/preview-region`, { region: input.region })
    })
    handle('comic:open', raw => this.openProject(projectIdSchema.parse(raw)))
    handle('comic:delete', async raw => {
      const id = projectIdSchema.parse(raw)
      await this.request(`/projects/${id}/delete`, {})
      for (const key of this.thumbnails.keys()) if (key.startsWith(`${id}/`)) this.thumbnails.delete(key)
      this.options.publish({ projectId: id })
    })
    handle('comic:restore', async raw => {
      const id = projectIdSchema.parse(raw)
      await this.request(`/projects/${id}/restore`, {})
      this.options.publish({ projectId: id })
    })
    const batchIds = z.array(projectIdSchema).min(1).max(1000).refine(ids => new Set(ids).size === ids.length)
    handle('comic:delete-many', async raw => {
      const projectIds = batchIds.parse(raw)
      await this.request('/projects/batch/delete', { projectIds })
      for (const key of this.thumbnails.keys()) if (projectIds.some(id => key.startsWith(`${id}/`))) this.thumbnails.delete(key)
      projectIds.forEach(id => this.options.publish({ projectId: id }))
    })
    handle('comic:restore-many', async raw => {
      const projectIds = batchIds.parse(raw)
      await this.request('/projects/batch/restore', { projectIds })
      projectIds.forEach(id => this.options.publish({ projectId: id }))
    })
    handle('comic:import', async raw => {
      const input = comicImportSchema.parse(raw)
      const formats = { images: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'],
        archive: ['zip', 'cbz', 'nola-comic'], pdf: ['pdf'], ebook: ['epub', 'mobi', 'azw', 'azw3'] }
      const extensions = input.kind === 'folder' ? [] : input.kind === 'auto' ? Object.values(formats).flat() : formats[input.kind]
      const result = await dialog.showOpenDialog({ properties: input.kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
        ...(extensions.length ? { filters: [{ name: extensions.join(', ').toUpperCase(), extensions }] } : {}) })
      if (result.canceled || !result.filePaths.length) return null
      const { kind: _kind, ...body } = input
      const first = result.filePaths[0]
      const title = body.title ?? (input.kind === 'folder' ? basename(first) : parse(first).name).trim().slice(0, 200)
      const project = await this.request<ComicProject>('/import', { ...body, title: title || basename(first).slice(0, 200), paths: result.filePaths })
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
      const input = z.object({ projectId: projectIdSchema, pageId: projectIdSchema, kind: z.enum(['source', 'clean', 'rendered']), maxPixels: maxPixelsSchema }).strict().parse(raw)
      const response = await this.fetch(`/projects/${input.projectId}/pages/${input.pageId}/${input.kind}${input.maxPixels === undefined ? '' : `?max_pixels=${input.maxPixels}`}`)
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
      const project = await this.openProject(input.projectId)
      const pages = input.pageIds ? input.pageIds.map(id => project.pages.find(page => page.id === id)!) : project.pages
      if (!pages.length || pages.some(page => !page) || new Set(pages.map(page => page.id)).size !== pages.length) throw new Error('pageNotFound')
      const extension = input.kind === 'project' ? 'nola-comic' : ['images', 'labelplus'].includes(input.kind)
        || input.kind === 'jpg' && pages.length > 1 ? 'zip' : input.kind
      const safeTitle = project.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100).replace(/[. ]+$/, '') || 'comic'
      const result = await dialog.showSaveDialog({ defaultPath: `${safeTitle}.${extension}`, filters: [{ name: 'Comic', extensions: [extension] }] })
      if (result.canceled || !result.filePath) return false
      const { projectId, ...body } = input
      let response: Response
      if (input.kind === 'psd') {
        if (pages.some(page => !page.hasRendered)) throw new Error('pageNotRendered')
        const decode = async (path: string) => {
          const reply = await this.fetch(path)
          const image = nativeImage.createFromBuffer(Buffer.from(await reply.arrayBuffer()))
          if (image.isEmpty()) throw new Error('comicImageUnavailable')
          const size = image.getSize()
          if (size.width * size.height > 40_000_000) throw new Error('exportTooLarge')
          return { ...size, data: rgbaFromBgra(image.toBitmap()),
            ...(reply.headers.has('x-font-size') ? { fontSize: Number(reply.headers.get('x-font-size')) } : {}),
            ...(reply.headers.has('x-text-base64') ? { text: Buffer.from(reply.headers.get('x-text-base64')!, 'base64').toString('utf8') } : {}) }
        }
        const fonts = new Map<string, string>()
        const bytes = await exportComicPsd(project, pages, {
          image: (pageId, kind) => decode(`/projects/${projectId}/pages/${pageId}/${kind}`),
          layer: (pageId, kind, layerId) => decode(`/projects/${projectId}/pages/${pageId}/layers/${kind}/${layerId}`),
          font: async region => {
            const style = region.style
            const family = style.fontFamily ?? 'Noto Sans SC'
            const query = new URLSearchParams({ family, weight: String(style.fontWeight ?? 400), italic: String(style.fontStyle === 'italic') })
            const key = query.toString()
            const cached = fonts.get(key)
            if (cached) return cached
            const reply = await this.fetch(`/fonts/file?${query}`)
            const metadata = fontkit.create(new Uint8Array(await reply.arrayBuffer()))
            let name = metadata.postscriptName || family
            const variable = metadata as typeof metadata & { variationAxes?: { wght?: { default: number } }; namedVariations?: Record<string, { wght: number }> }
            const weightAxis = variable.variationAxes?.wght
            if (weightAxis) {
              const variations = Object.entries(variable.namedVariations ?? {})
              const base = variations.find(([, axes]) => axes.wght === weightAxis.default)
              const closest = variations.filter(([, axes]) => typeof axes.wght === 'number')
                .sort((a, b) => Math.abs(a[1].wght - (style.fontWeight ?? 400)) - Math.abs(b[1].wght - (style.fontWeight ?? 400)))[0]
              if (base && closest && name.endsWith(`-${base[0]}`)) name = name.slice(0, -base[0].length) + closest[0]
            }
            fonts.set(key, name)
            return name
          },
        })
        if ((await this.openProject(projectId)).revision !== project.revision) throw new Error('conflict')
        response = new Response(new Uint8Array(bytes))
      } else response = await this.fetch(`/projects/${projectId}/export`, body)
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
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path === '/import' ? 15 * 60_000 : 120_000),
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
