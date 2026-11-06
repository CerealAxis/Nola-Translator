import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { comicReadTools, type ComicReaderService } from '../../../src/main/comic-reader'
import type { ComicProject } from '../../../src/shared/comic'

const book = randomUUID(), pageId = randomUUID()
const project: ComicProject = { id: book, title: 'Book', revision: 3, updatedAt: '', pageCount: 1, chapterCount: 1,
  config: { sourceLanguage: 'en', targetLanguage: 'zh', model: '', readingDirection: 'rtl', glossary: { mode: 'off' } },
  chapters: [{ id: randomUUID(), title: 'Chapter' }], pages: [{ id: pageId, chapterId: '', name: '001.png', width: 100, height: 100, regions: [], status: 'imported', hasClean: false, hasRendered: false }],
  jobs: [], canUndo: false, canRedo: false }
const reader = (): ComicReaderService => ({ listProjects: vi.fn(async () => []), openProject: vi.fn(async () => structuredClone(project)), readImage: vi.fn(async () => ({ data: 'aW1hZ2U=', width: 100, height: 100 })) })
const options = { toolCallId: 'test', messages: [], context: undefined }

it('exposes only the explicitly scoped book and never reads another book', async () => {
  const service = reader()
  const tools = comicReadTools(service, { projectId: book, ownerId: 7, signal: new AbortController().signal, images: false })
  expect(Object.keys(tools)).not.toContain('read_comic_image')
  await expect(tools.read_comic_page.execute!({ projectId: randomUUID(), pageId, expectedRevision: null, offset: 0, limit: 20 } as never, options)).rejects.toThrow('comicNotAuthorized')
  expect(service.openProject).not.toHaveBeenCalled()
  expect(await tools.list_comic_projects.execute!({} as never, options)).toEqual([{ id: book, title: 'Book', revision: 3, updatedAt: '', pageCount: 1, chapterCount: 1 }])
  expect(service.listProjects).not.toHaveBeenCalled()
})

it('checks cancellation again after repository access and produces real model image content', async () => {
  const controller = new AbortController(), service = reader()
  service.openProject = vi.fn(async () => { controller.abort(); return structuredClone(project) })
  const tools = comicReadTools(service, { projectId: book, ownerId: 7, signal: controller.signal, images: true })
  await expect(tools.list_comic_projects.execute!({} as never, options)).rejects.toThrow()
  const imageTools = comicReadTools(reader(), { projectId: book, ownerId: 7, signal: new AbortController().signal, images: true })
  const input = { projectId: book, pageId, kind: 'source' }
  const output = await imageTools.read_comic_image.execute!(input as never, options)
  const modelOutput = await imageTools.read_comic_image.toModelOutput!({ toolCallId: 'test', input, output })
  expect(modelOutput).toMatchObject({ type: 'content', value: [{ type: 'text' }, { type: 'file', mediaType: 'image/png', data: { type: 'data', data: 'aW1hZ2U=' } }] })
})
