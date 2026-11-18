import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react'
import { getBridge } from '@/store'
import { useI18n } from '@/i18n'
import { dismissNotice, notifyError } from '@/components/primitives/notify'
import { comicMutationSchema } from '../../../shared/comic'
import type {
  ComicBridge,
  ComicExportRequest,
  ComicImportRequest,
  ComicMutation,
  ComicPage,
  ComicProject,
  ComicRegion,
  ComicTask,
  ComicWorkflow,
} from '../../../shared/comic'

let books: ComicProject[] = []
let tasks: ComicTask[] = []
const listeners = new Set<() => void>()
const acknowledged = new Map<string, ComicProject>()
const failures = new Map<string, unknown>()
const loads = new Map<string, Promise<ComicProject>>()
const queues = new Map<string, ComicMutation[]>()
const flushRegistered = new WeakSet<ComicBridge>()
const draftKey = (id: string) => `nola-comic-pending:${id}`
const persistQueue = (id: string) => {
  const queue = queues.get(id) ?? []
  if (queue.length) sessionStorage.setItem(draftKey(id), JSON.stringify(queue))
  else sessionStorage.removeItem(draftKey(id))
}
const flushing = new Map<string, Promise<void>>()
let disconnect: (() => void) | undefined
const publish = () => {
  books = [...books]
  tasks = [...tasks]
  listeners.forEach((listener) => listener())
}
window.addEventListener('beforeunload', (event) => {
  if ([...queues.values()].some((queue) => queue.length)) {
    event.preventDefault()
    event.returnValue = ''
  }
})
export const comicApi = (): ComicBridge => {
  const api = getBridge()?.comic
  if (!api) throw new Error('comicUnavailable')
  if (api.onFlushRequested && !flushRegistered.has(api)) {
    flushRegistered.add(api)
    api.onFlushRequested(async () => {
      for (const id of queues.keys()) await flushComicSaves(id)
    })
  }
  return api
}
const install = (book: ComicProject) => {
  acknowledged.set(book.id, book)
  if (!queues.has(book.id)) {
    const saved = sessionStorage.getItem(draftKey(book.id))
    if (saved) {
      try {
        const pending = comicMutationSchema
          .array()
          .max(10000)
          .parse(JSON.parse(saved))
        if (pending.some((operation) => operation.projectId !== book.id))
          throw new Error('invalidDraft')
        queues.set(book.id, pending)
      } catch (error) {
        failures.set(book.id, error)
      }
    }
  }
  const pending = queues.get(book.id)
  if (pending?.length) {
    let draft = structuredClone(book)
    for (const operation of pending) {
      const command = operation.command
      if (command.action === 'configure') draft.config = command.config
      if (command.action === 'savePages')
        draft.pages = draft.pages.map((page) => {
          const changed = command.pages.find((item) => item.id === page.id)
          return changed ? { ...page, ...changed } : page
        })
    }
    books = [...books.filter((item) => item.id !== book.id), draft]
    if (pending[0].expectedRevision !== book.revision)
      failures.set(book.id, new Error('revisionConflict'))
    else void flushComicSaves(book.id).catch(() => {})
  } else {
    failures.delete(book.id)
    books = [...books.filter((item) => item.id !== book.id), book]
  }
  publish()
  return book
}
export function loadComicBook(id: string) {
  const active = loads.get(id)
  if (active) return active
  const promise = comicApi()
    .openProject(id)
    .then(install)
    .catch((error) => {
      failures.set(id, error)
      publish()
      throw error
    })
    .finally(() => loads.delete(id))
  loads.set(id, promise)
  return promise
}
async function refreshTasks() {
  tasks = await comicApi().listTasks()
  publish()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (!disconnect)
    disconnect = comicApi().onChanged((event) => {
      for (const id of event.projectId
        ? [event.projectId]
        : [...acknowledged.keys()]) {
        if (acknowledged.has(id) && !queues.get(id)?.length)
          void loadComicBook(id).catch((error) => {
            failures.set(id, error)
            publish()
          })
      }
      void refreshTasks().catch(() => {})
    })
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      disconnect?.()
      disconnect = undefined
    }
  }
}
export function useComicBooks(id: string) {
  const snapshot = useSyncExternalStore(subscribe, () => books)
  useEffect(() => {
    void loadComicBook(id).catch((error) => {
      failures.set(id, error)
      publish()
    })
  }, [id])
  return snapshot
}
export function useComicTasks() {
  const snapshot = useSyncExternalStore(subscribe, () => tasks)
  useEffect(() => {
    void refreshTasks().catch(() => {})
  }, [])
  return snapshot
}
export const comicSaveError = (id: string) => failures.get(id)
export const comicSaving = (id: string) => !!queues.get(id)?.length

export async function discardComicSaves(id: string) {
  await flushing.get(id)?.catch(() => {})
  const pending = [...(queues.get(id) ?? [])]
  const book = await comicApi().openProject(id)
  const current = queues.get(id) ?? []
  if (current.length !== pending.length || current.some((operation, index) => operation !== pending[index]))
    throw new Error('revisionConflict')
  sessionStorage.removeItem(draftKey(id))
  queues.delete(id)
  failures.delete(id)
  return install(book)
}

export function flushComicSaves(id: string): Promise<void> {
  const active = flushing.get(id)
  if (active) return active
  const promise = (async () => {
    const queue = queues.get(id)
    while (queue?.length) {
      const current = acknowledged.get(id)
      if (!current) throw new Error('comicUnavailable')
      const operation = queue[0]
      const result = await comicApi().edit({
        projectId: id,
        operationId: operation.operationId,
        expectedRevision: operation.expectedRevision,
        command: operation.command,
      })
      queue.shift()
      persistQueue(id)
      acknowledged.set(id, result)
      failures.delete(id)
      if (!queue.length)
        books = books.map((book) => (book.id === id ? result : book))
      else
        books = books.map((book) =>
          book.id === id
            ? {
                ...book,
                revision: result.revision,
                canUndo: result.canUndo,
                canRedo: result.canRedo,
              }
            : book,
        )
      publish()
    }
  })()
    .catch((error) => {
      failures.set(id, error)
      publish()
      throw error
    })
    .finally(() => {
      flushing.delete(id)
      publish()
    })
  flushing.set(id, promise)
  publish()
  return promise
}

function enqueue(id: string, command: ComicMutation['command']) {
  const queue = queues.get(id) ?? []
  const base = acknowledged.get(id)
  if (!base) throw new Error('comicUnavailable')
  queue.push({
    projectId: id,
    expectedRevision: base.revision + queue.length,
    command,
    operationId: crypto.randomUUID(),
  })
  queues.set(id, queue)
  try {
    persistQueue(id)
  } catch (error) {
    failures.set(id, error)
  }
  if (!failures.has(id)) void flushComicSaves(id).catch(() => {})
  publish()
}
export function saveComicBook(next: ComicProject) {
  const previous = books.find((book) => book.id === next.id)
  if (!previous) return
  books = books.map((book) => (book.id === next.id ? next : book))
  if (JSON.stringify(previous.config) !== JSON.stringify(next.config))
    enqueue(next.id, { action: 'configure', config: next.config })
  const pages = next.pages
    .filter((page) => {
      const before = previous.pages.find((item) => item.id === page.id)
      return (
        JSON.stringify(before?.regions) !== JSON.stringify(page.regions) ||
        JSON.stringify(before?.maskStrokes) !== JSON.stringify(page.maskStrokes)
      )
    })
    .map(({ id, regions, maskStrokes }) => ({ id, regions, maskStrokes }))
  if (pages.length) enqueue(next.id, { action: 'savePages', pages })
  publish()
}
export function updateComicRegion(
  id: string,
  pageId: string,
  region: ComicRegion,
) {
  const book = books.find((item) => item.id === id)
  if (book)
    saveComicBook({
      ...book,
      pages: book.pages.map((page) =>
        page.id !== pageId
          ? page
          : {
              ...page,
              regions: page.regions.some((item) => item.id === region.id)
                ? page.regions.map((item) =>
                    item.id === region.id ? region : item,
                  )
                : [...page.regions, region],
            },
      ),
    })
}
export async function historyComicBook(id: string, action: 'undo' | 'redo') {
  await flushComicSaves(id)
  enqueue(id, { action })
  await flushComicSaves(id)
}
export async function startComicTask(
  id: string,
  kind: ComicWorkflow,
  pageIds: string[],
  regionIds?: string[],
) {
  await flushComicSaves(id)
  const current = acknowledged.get(id)
  if (!current) throw new Error('comicUnavailable')
  const task = await comicApi().run({
    projectId: id,
    expectedRevision: current.revision,
    kind,
    pageIds,
    regionIds,
  })
  await refreshTasks()
  return task
}
export async function controlComicTask(
  id: string,
  action: 'pause' | 'resume' | 'cancel' | 'retry',
) {
  await comicApi().controlTask(id, action)
  await refreshTasks()
}
export function failedComicPages(id: string, jobs: ComicTask[]) {
  const failed = new Map<string, Set<string>>()
  for (const job of jobs.filter((item) => item.bookId === id)) {
    const pages = failed.get(job.kind) ?? new Set<string>()
    if (job.status === 'failed')
      for (const page of job.failedPageIds ?? job.pages) pages.add(page)
    if (job.status === 'completed')
      for (const page of job.pages) pages.delete(page)
    failed.set(job.kind, pages)
  }
  return [...new Set([...failed.values()].flatMap((pages) => [...pages]))]
}
export async function applyComicProof(id: string, jobId: string) {
  await flushComicSaves(id)
  enqueue(id, { action: 'applyProof', jobId })
  await flushComicSaves(id)
}
export async function saveQuickComicToLibrary(id: string) {
  await flushComicSaves(id)
  return install(await comicApi().saveQuickToLibrary(id))
}
export async function importComicFiles(
  files: File[],
  request: Partial<ComicImportRequest> = {},
) {
  if (!files.length) return null
  if (request.projectId) await flushComicSaves(request.projectId)
  const payload = []
  for (const file of files)
    payload.push({
      name: file.webkitRelativePath || file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    })
  const result = await comicApi().importProject({
    kind: 'auto',
    ...request,
    files: payload,
  })
  return result ? install(result) : null
}
export async function openQuickComic() {
  return install(await comicApi().openQuickWorkspace())
}
export async function exportComicBook(request: ComicExportRequest) {
  await flushComicSaves(request.projectId)
  return comicApi().exportProject(request)
}
export function chooseComicFiles(
  kind: ComicImportRequest['kind'] = 'auto',
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.hidden = true
    input.accept = {
      pdf: '.pdf',
      archive: '.zip,.cbz',
      ebook: '.epub,.mobi,.azw,.azw3',
      images: 'image/*',
      folder: 'image/*',
      auto: '.pdf,.zip,.cbz,.epub,.mobi,.azw,.azw3,image/*',
    }[kind]
    if (kind === 'folder') input.setAttribute('webkitdirectory', '')
    document.body.append(input)
    const complete = (files: File[]) => {
      input.remove()
      resolve(files)
    }
    input.addEventListener(
      'change',
      () => complete(Array.from(input.files ?? [])),
      { once: true },
    )
    input.addEventListener('cancel', () => complete([]), { once: true })
    input.click()
  })
}
export function comicRegionStyle(
  page: ComicPage,
  region: ComicRegion,
  displayWidth?: number,
): CSSProperties {
  if (region.textQuad && displayWidth) {
    const factor = displayWidth / page.width
    const quad = region.textQuad.map(([x, y]) => [x * factor, y * factor])
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad
    const width =
      (Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x3, y2 - y3)) / 2
    const height =
      (Math.hypot(x3 - x0, y3 - y0) + Math.hypot(x2 - x1, y2 - y1)) / 2
    const dx1 = x1 - x2,
      dx2 = x3 - x2,
      sx = x0 - x1 + x2 - x3
    const dy1 = y1 - y2,
      dy2 = y3 - y2,
      sy = y0 - y1 + y2 - y3
    const denominator = dx1 * dy2 - dx2 * dy1
    const g =
      Math.abs(denominator) > 1e-8 ? (sx * dy2 - dx2 * sy) / denominator : 0
    const h =
      Math.abs(denominator) > 1e-8 ? (dx1 * sy - sx * dy1) / denominator : 0
    const matrix = [
      (x1 - x0 + g * x1) / width,
      (y1 - y0 + g * y1) / width,
      0,
      g / width,
      (x3 - x0 + h * x3) / height,
      (y3 - y0 + h * y3) / height,
      0,
      h / height,
      0,
      0,
      1,
      0,
      x0,
      y0,
      0,
      1,
    ]
    return {
      left: 0,
      top: 0,
      width,
      height,
      transformOrigin: '0 0',
      transform: `matrix3d(${matrix.join(',')})`,
    }
  }
  return {
    left: `${(region.x / page.width) * 100}%`,
    top: `${(region.y / page.height) * 100}%`,
    width: `${(region.width / page.width) * 100}%`,
    height: `${(region.height / page.height) * 100}%`,
    transform: `rotate(${region.style.angle ?? 0}deg)`,
  }
}
export function comicTextQuad(region: ComicRegion): [number, number][] {
  if (region.textQuad) return region.textQuad.map((point) => [...point])
  const { x, y, width, height } = region
  const angle = ((region.style.angle ?? 0) * Math.PI) / 180
  const cx = x + width / 2,
    cy = y + height / 2
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ].map(([px, py]) => [
    Math.max(0, cx + (px - cx) * Math.cos(angle) - (py - cy) * Math.sin(angle)),
    Math.max(0, cy + (px - cx) * Math.sin(angle) + (py - cy) * Math.cos(angle)),
  ])
}
export function comicWithTextQuad(
  region: ComicRegion,
  textQuad: [number, number][],
): ComicRegion {
  const x = Math.min(...textQuad.map((point) => point[0])),
    y = Math.min(...textQuad.map((point) => point[1]))
  const width = Math.max(...textQuad.map((point) => point[0])) - x
  const height = Math.max(...textQuad.map((point) => point[1])) - y
  const sourceQuad =
    region.sourceQuad ??
    ([
      [region.x, region.y],
      [region.x + region.width, region.y],
      [region.x + region.width, region.y + region.height],
      [region.x, region.y + region.height],
    ] as [number, number][])
  return {
    ...region,
    sourceQuad,
    x,
    y,
    width,
    height,
    textQuad,
    style: { ...region.style, angle: 0 },
  }
}
export function parseComicPageNumbers(
  value: string,
  pages: ComicPage[],
): string[] {
  const tokens = value.trim().split(/[,，\s]+/)
  if (
    !value.trim() ||
    tokens.some(
      (token) => !/^[1-9]\d*$/.test(token) || Number(token) > pages.length,
    )
  )
    throw new Error('invalidPageRange')
  return [...new Set(tokens.map((token) => pages[Number(token) - 1].id))]
}
const imageCache = new Map<string, string>()
const imageRequests = new Map<string, Promise<string>>()
function imageKey(
  projectId: string,
  page: ComicPage,
  kind: string,
  maxPixels: number,
) {
  return `${projectId}/${page.id}/${kind}/${kind === 'source' ? 0 : (page.revision ?? 0)}/${maxPixels}`
}
export function prefetchComicImage(
  projectId: string,
  page: ComicPage,
  kind: 'source' | 'clean' | 'rendered',
  maxPixels = 4_000_000,
) {
  const key = imageKey(projectId, page, kind, maxPixels)
  const cached = imageCache.get(key)
  if (cached) return Promise.resolve(cached)
  const pending = imageRequests.get(key)
  if (pending) return pending
  const request = comicApi()
    .image(projectId, page.id, kind, maxPixels)
    .then((src) => {
      imageCache.set(key, src)
      while (imageCache.size > 48)
        imageCache.delete(imageCache.keys().next().value!)
      return src
    })
    .finally(() => imageRequests.delete(key))
  imageRequests.set(key, request)
  return request
}
export function useComicImage(
  projectId: string,
  page: ComicPage,
  kind: 'source' | 'clean' | 'rendered',
  maxPixels = 4_000_000,
) {
  const { t } = useI18n()
  const key = imageKey(projectId, page, kind, maxPixels)
  const [value, setValue] = useState<{
    key: string
    src?: string
    failed?: boolean
  }>({ key })
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    imageCache.delete(key)
    setValue({ key })
    setAttempt((value) => value + 1)
  }
  useEffect(() => {
    let active = true
    let notice: string | undefined
    const cached = imageCache.get(key)
    if (cached) {
      setValue({ key, src: cached })
      return
    }
    void prefetchComicImage(projectId, page, kind, maxPixels)
      .then((src) => {
        if (active) setValue({ key, src })
      })
      .catch((error) => {
        if (!active) return
        setValue({ key, failed: true })
        notice = notifyError(`${page.name} · ${t('suite.actionFailed')}`, {
          cause: error,
          action: {
            label: t('suite.retry'),
            onPress: retry,
          },
        })
      })
    return () => {
      active = false
      if (notice) dismissNotice(notice)
    }
  }, [key, projectId, page.id, page.name, kind, maxPixels, attempt, t])
  return {
    src: value.key === key ? value.src ?? imageCache.get(key) : imageCache.get(key),
    failed: value.key === key && value.failed,
    retry,
  }
}
