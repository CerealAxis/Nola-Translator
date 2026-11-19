import { dialog, ipcMain, nativeImage, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { mkdtemp, mkdir, writeFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { comicExportSchema, comicImportSchema, comicMutationSchema, comicRunSchema, comicProjectSchema, comicProjectSummarySchema, comicTaskSchema, type ComicProject, type ComicProjectSummary, type ComicTask, type ComicFont } from '../shared/comic'
import { isTrustedRendererUrl } from './window-options'
import { ComicTaskRunner, type ComicRequest } from './comic-jobs'
import type { ComicModelInput } from './comic-model'
import type { GlossaryDocument } from '../shared/glossary'
import type { WordRulesDocument } from '../shared/word-rules'
import type { FeatureActivity, FeatureLease } from './feature-activity'
import { normalizeThrownError } from '../shared/ipc-error'
import { logDiagnostic } from './session-log'

interface Connection { baseUrl: string; authorizationHeader(): Record<string, string> }
export interface ComicTranslationOptions {
  mainDir: string; backend(): Promise<Connection>; getMainWindow(): BrowserWindow | null;
  translate(input: ComicModelInput, signal: AbortSignal): Promise<{ id: string; text: string }[]>;
  glossary(): Promise<GlossaryDocument>; wordRules(): Promise<WordRulesDocument>;
  activity?: FeatureActivity;
  modelConfigSignature?(): string;
  publish(event: { projectId?: string; sequence?: number }): void;
}
const idSchema = z.string().uuid()
export class ComicTranslation {
  private readonly channels: string[] = []
  private sequence = 0
  private closed = false
  private rendererReady = false
  private pendingFlush?: { token: string; resolve(): void; reject(error: Error): void }
  private readonly runner: ComicTaskRunner
  private activityLease?: FeatureLease
  constructor(private readonly options: ComicTranslationOptions) {
    this.runner = new ComicTaskRunner(this.request, options.translate, () => this.publish(), running => {
      if (running && !this.activityLease) { this.activityLease = options.activity?.acquire('comic-translation', () => this.stop()); this.activityLease?.running() }
      else if (!running) { this.activityLease?.release(); this.activityLease = undefined }
    })
    const handle = (channel: string, action: (raw: unknown) => unknown) => {
      this.channels.push(channel)
      const recordFailure = (error: unknown): never => {
        logDiagnostic('comic.request.failed', { channel, classification: normalizeThrownError(error), error })
        throw error
      }
      ipcMain.handle(channel, (event: IpcMainInvokeEvent, raw: unknown) => {
        const main = options.getMainWindow()
        if (this.closed || !main || event.sender !== main.webContents || event.senderFrame !== event.sender.mainFrame || !isTrustedRendererUrl(event.senderFrame.url, options.mainDir)) throw new Error('Access denied')
        try {
          const result = action(raw)
          return result instanceof Promise ? result.catch(recordFailure) : result
        } catch (error) { return recordFailure(error) }
      })
    }
    handle('comic:list', () => this.listProjects())
    handle('comic:flush-ready', raw => { this.rendererReady = raw === undefined || z.boolean().parse(raw) })
    handle('comic:flush-result', raw => {
      const result = z.object({ token: z.string().uuid(), ok: z.boolean() }).strict().parse(raw)
      if (this.pendingFlush?.token === result.token) {
        if (result.ok) this.pendingFlush.resolve()
        else this.pendingFlush.reject(new Error('comicSaveFailed'))
      }
    })
    handle('comic:open', raw => this.openProject(idSchema.parse(raw)))
    handle('comic:quick', () => this.request<ComicProject>('/workspaces/quick', {}))
    handle('comic:save-quick', async raw => { const book = await this.request<ComicProject>(`/books/${idSchema.parse(raw)}/save`, {}); this.publish(book.id); return book })
    for (const action of ['delete', 'restore'] as const) handle(`comic:${action}`, async raw => {
      const projectIds = z.array(idSchema).min(1).max(1000).parse(raw)
      await this.request(`/books/${action}`, { projectIds }); this.publish()
    })
    handle('comic:edit', async raw => {
      const request = comicMutationSchema.parse(raw)
      const { projectId, ...mutation } = request
      const book = await this.request<ComicProject>(`/books/${projectId}/document`, mutation)
      this.publish(book.id); return book
    })
    handle('comic:run', async raw => {
      const request = comicRunSchema.parse(raw)
      const [glossaryDocument, wordRulesDocument] = await Promise.all([options.glossary(), options.wordRules()])
      const task = await this.request<ComicTask>('/jobs', { ...request, glossaryDocument, wordRulesDocument, modelConfigSignature: options.modelConfigSignature?.() ?? '' })
      this.publish(request.projectId); this.runner.wake(); return task
    })
    handle('comic:tasks', async () => {
      const tasks = await this.request<ComicTask[]>('/jobs')
      if (tasks.some(task => task.status === 'queued')) this.runner.wake()
      return tasks
    })
    handle('comic:task-control', async raw => {
      const request = z.object({ id: idSchema, action: z.enum(['pause', 'resume', 'cancel', 'retry']) }).strict().parse(raw)
      if (request.action === 'cancel') this.runner.cancel(request.id)
      const task = await this.request<ComicTask>(`/jobs/${request.id}/control`, { action: request.action })
      this.publish(task.bookId); this.runner.wake(); return task
    })
    handle('comic:image', async raw => {
      const request = z.object({ projectId: idSchema, pageId: idSchema, kind: z.enum(['source', 'clean', 'rendered']), maxPixels: z.number().int().min(10000).max(12000000).optional() }).strict().parse(raw)
      const response = await this.fetch(`/books/${request.projectId}/pages/${request.pageId}/${request.kind}${request.maxPixels ? `?max_pixels=${request.maxPixels}` : ''}`)
      return `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`
    })
    handle('comic:fonts', () => this.request<ComicFont[]>('/fonts'))
    handle('comic:read-font', async raw => {
      const family = z.string().trim().min(1).max(200).parse(raw)
      const response = await this.fetch(`/fonts/file?${new URLSearchParams({ family })}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 40 * 1024 * 1024) throw new Error('fontTooLarge')
      return `data:font/otf;base64,${bytes.toString('base64')}`
    })
    handle('comic:import', raw => this.import(raw))
    handle('comic:export', raw => this.export(raw))
  }
  private publish(projectId?: string) { this.options.publish({ projectId, sequence: ++this.sequence }) }
  private async fetch(path: string, body?: unknown, signal?: AbortSignal) {
    const connection = await this.options.backend()
    const response = await fetch(new URL('/api/v2/comics' + path, connection.baseUrl), {
      method: body === undefined ? 'GET' : 'POST', headers: { ...connection.authorizationHeader(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { code?: string; detail?: string; message?: string }
      throw new Error(data.code || data.detail || data.message || `comicHttp${response.status}`)
    }
    return response
  }
  private request: ComicRequest = async <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> => {
    const payload = z.object({ success: z.boolean(), data: z.unknown(), code: z.string().optional() }).parse(await (await this.fetch(path, body, signal)).json())
    if (payload.success !== true) throw new Error(payload.code || 'comicInvalidResponse')
    const schema = path === '/books' ? comicProjectSummarySchema.array()
      : path === '/workspaces/quick' || /^\/books\/(?!delete$|restore$)/.test(path) ? comicProjectSchema
        : path === '/jobs' ? body === undefined ? comicTaskSchema.array() : comicTaskSchema
          : /^\/jobs\/[^/]+\/(control|complete)$/.test(path) ? comicTaskSchema : undefined
    return (schema ? schema.parse(payload.data) : payload.data) as T
  }
  async listProjects() { return this.request<ComicProjectSummary[]>('/books') }
  async openProject(id: string) { return this.request<ComicProject>(`/books/${idSchema.parse(id)}`) }
  async readImage(projectId: string, pageId: string, kind: 'source' | 'clean' | 'rendered', signal: AbortSignal) {
    const book = await this.openProject(projectId), page = book.pages.find(item => item.id === pageId)
    if (!page) throw new Error('comicPageNotFound')
    const response = await this.fetch(`/books/${book.id}/pages/${idSchema.parse(pageId)}/${kind}?max_pixels=2000000`, undefined, signal)
    const bytes = Buffer.from(await response.arrayBuffer())
    const { width, height } = nativeImage.createFromBuffer(bytes).getSize()
    return { data: bytes.toString('base64'), width, height }
  }
  private async import(raw: unknown) {
    const request = comicImportSchema.parse(raw)
    let paths: string[]
    let staging: string | undefined
    try {
      if (request.files) {
        if (!request.files.length) return null
        const total = request.files.reduce((sum, file) => sum + file.data.byteLength, 0)
        if (total > 512 * 1024 * 1024) throw new Error('comicImportTooLarge')
        staging = await mkdtemp(join(tmpdir(), 'nola-comic-'))
        paths = []
        for (const [index, file] of request.files.entries()) {
          const name = basename(file.name.replace(/\\/g, '/'))
          if (!name || name === '.' || name === '..') throw new Error('invalidFile')
          const folder = join(staging, String(index)); await mkdir(folder)
          const path = join(folder, name); await writeFile(path, file.data, { flag: 'wx' }); paths.push(path)
        }
      } else {
        const result = await dialog.showOpenDialog({ properties: request.kind === 'folder' ? ['openDirectory'] : ['openFile', 'multiSelections'],
          filters: [{ name: 'Comic', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'zip', 'cbz', 'pdf', 'epub', 'mobi', 'azw', 'azw3'] }] })
        if (result.canceled || !result.filePaths.length) return null
        paths = result.filePaths
      }
      const { files: _, ...options } = request
      const book = await this.request<ComicProject>('/books/import', { ...options, paths })
      this.publish(book.id); return book
    } finally { if (staging) await rm(staging, { recursive: true, force: true }) }
  }
  private async export(raw: unknown) {
    const request = comicExportSchema.parse(raw)
    const book = await this.openProject(request.projectId)
    const extension = request.kind === 'images' ? 'zip' : request.kind === 'labelplus' ? 'txt' : request.kind
    const target = await dialog.showSaveDialog({ defaultPath: `${book.title.replace(/[<>:"/\\|?*]/g, '_')}.${extension}`, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
    if (target.canceled || !target.filePath) return false
    const temporary = `${target.filePath}.${randomUUID()}.tmp`
    try {
      const { projectId: _, ...exportOptions } = request
      const response = await this.fetch(`/books/${book.id}/export`, exportOptions)
      const stream = response.body
      if (!stream) throw new Error('comicExportFailed')
      const { open } = await import('node:fs/promises')
      const handle = await open(temporary, 'wx')
      try { for await (const chunk of stream) await handle.write(chunk); await handle.sync() } finally { await handle.close() }
      await rename(temporary, target.filePath); return true
    } finally { await rm(temporary, { force: true }).catch(() => {}) }
  }
  async stop() { await this.runner.stop() }
  rendererUnavailable() {
    this.rendererReady = false
    this.pendingFlush?.resolve()
  }
  async flushRenderer() {
    const main = this.options.getMainWindow()
    if (!this.rendererReady || !main || main.isDestroyed()) return
    const token = randomUUID()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingFlush = undefined; reject(new Error('comicSaveTimeout')) }, 15000)
      this.pendingFlush = { token, resolve: () => { clearTimeout(timer); this.pendingFlush = undefined; resolve() }, reject: error => { clearTimeout(timer); this.pendingFlush = undefined; reject(error) } }
      main.webContents.send('comic:flush', token)
    })
  }
  async dispose() { this.closed = true; this.channels.forEach(channel => ipcMain.removeHandler(channel)); await this.stop() }
}
