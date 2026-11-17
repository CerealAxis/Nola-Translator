import { vi } from 'vitest'
import {
  comicConfigSchema,
  type ComicBridge,
  type ComicProject,
  type ComicTask,
} from '../../../shared/comic'

export function createComicTestBridge(pages = 2) {
  const chapter = crypto.randomUUID()
  let book: ComicProject = {
    id: crypto.randomUUID(),
    title: 'Test comic',
    revision: 0,
    updatedAt: new Date().toISOString(),
    pageCount: pages,
    chapterCount: 1,
    quick: false,
    config: comicConfigSchema.parse({ normalModel: 'cloud:google' }),
    chapters: [{ id: chapter, title: 'Chapter 1' }],
    canUndo: false,
    canRedo: false,
    pages: Array.from({ length: pages }, (_, index) => ({
      id: crypto.randomUUID(),
      chapterId: chapter,
      name: `${index + 1}.png`,
      width: 600,
      height: 850,
      status: 'rendered',
      hasClean: true,
      hasRendered: true,
      revision: 0,
      regions: [
        {
          id: crypto.randomUUID(),
          x: 30,
          y: 30,
          width: 100,
          height: 100,
          sourceText: '原文',
          targetText: 'Translation',
          confidence: null,
          locked: false,
          ignored: false,
          style: {
            fontSize: 23,
            color: '#222222',
            align: 'center',
            direction: 'horizontal',
          },
          qa: [],
        },
      ],
    })),
  }
  book.coverPageId = book.pages[0]?.id
  const jobs: ComicTask[] = []
  const listeners = new Set<(event: { projectId?: string }) => void>()
  const changed = () =>
    listeners.forEach((listener) => listener({ projectId: book.id }))
  const api: ComicBridge = {
    listProjects: vi.fn(async () => (book.quick ? [] : [book])),
    openProject: vi.fn(async () => structuredClone(book)),
    openQuickWorkspace: vi.fn(async () => {
      book = { ...book, quick: true, pages: [], pageCount: 0 }
      return structuredClone(book)
    }),
    saveQuickToLibrary: vi.fn(async () => ({
      ...structuredClone(book),
      id: crypto.randomUUID(),
      quick: false,
    })),
    importProject: vi.fn(async (request) => {
      book = { ...book, title: request.files?.[0]?.name ?? 'Imported' }
      changed()
      return structuredClone(book)
    }),
    deleteProject: vi.fn(async () => {}),
    restoreProject: vi.fn(async () => {}),
    deleteProjects: vi.fn(async () => {}),
    restoreProjects: vi.fn(async () => {}),
    edit: vi.fn(async (request) => {
      if (request.expectedRevision !== book.revision)
        throw new Error('conflict')
      const command = request.command
      if (command.action === 'configure') book.config = command.config
      if (command.action === 'savePages')
        for (const page of command.pages)
          book.pages = book.pages.map((current) =>
            current.id === page.id
              ? { ...current, ...page, revision: (current.revision ?? 0) + 1 }
              : current,
          )
      book = { ...book, revision: book.revision + 1, canUndo: true }
      changed()
      return structuredClone(book)
    }),
    run: vi.fn(async (request) => {
      const task: ComicTask = {
        id: crypto.randomUUID(),
        bookId: book.id,
        kind: request.kind,
        pages: request.pageIds,
        status: 'queued',
        progress: 0,
        createdAt: new Date().toISOString(),
      }
      jobs.push(task)
      changed()
      return task
    }),
    listTasks: vi.fn(async () => [...jobs]),
    controlTask: vi.fn(async (id, action) => {
      const task = jobs.find((item) => item.id === id)!
      task.status =
        action === 'pause'
          ? 'paused'
          : action === 'cancel'
            ? 'cancelled'
            : 'queued'
      changed()
      return task
    }),
    image: vi.fn(async () => 'data:image/png;base64,AA=='),
    thumbnail: vi.fn(async () => 'data:image/png;base64,AA=='),
    exportProject: vi.fn(async () => true),
    listFonts: vi.fn(async () => [
      { family: 'Noto Sans SC', weight: 400, italic: false },
    ]),
    readFont: vi.fn(async () => 'data:font/otf;base64,AA=='),
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    api,
    book: () => book,
    changed,
    emit: (event: { projectId?: string }) =>
      listeners.forEach((listener) => listener(event)),
  }
}
