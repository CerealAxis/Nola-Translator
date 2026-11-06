import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { ComicProject } from '../../../shared/comic'
import { ComicTranslationPage } from './ComicTranslationPage'
import userEvent from '@testing-library/user-event'

vi.mock('@/available-models', () => ({ useAvailableModels: () => ({ mt: [] }) }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const project: ComicProject = { id: 'project', title: 'Book', revision: 4, updatedAt: '', pageCount: 1, chapterCount: 1, config: { sourceLanguage: 'ja', targetLanguage: 'zh', model: '', readingDirection: 'rtl', glossary: { mode: 'auto' } }, chapters: [{ id: 'chapter', title: 'Chapter' }], pages: [{ id: 'page', chapterId: 'chapter', name: '001', width: 100, height: 100, hasClean: false, hasRendered: false, status: 'recognized', regions: [{ id: 'region', sourceText: 'source', targetText: 'target', x: 10, y: 10, width: 40, height: 40, confidence: null, locked: false, ignored: false, style: { fontSize: 16, color: '#000000', direction: 'horizontal', align: 'center' }, qa: [] }] }], jobs: [], canUndo: false, canRedo: false }
it('opens an empty bookshelf without invented books or model output', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => [], onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage />)
  expect(await screen.findByText('书架还是空的')).toBeInTheDocument()
  expect(screen.queryByText('Book')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '导入漫画' })).toHaveLength(2)
})
it('locks manually edited translation and saves against its original revision', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  const target = await screen.findByRole('textbox', { name: '译文' })
  fireEvent.change(target, { target: { value: 'manual target' } })
  expect(screen.getByRole('switch', { name: '保护人工译文' })).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'saveRegion', pageId: 'page', region: expect.objectContaining({ targetText: 'manual target', locked: true }) } })))
})
it('restores an unsaved draft after navigation and retains its original revision', async () => {
  let current = { ...project, id: 'draft-project', revision: 10 }
  const edit = vi.fn(async () => ({ ...current, revision: 12 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => current, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  const first = render(<ComicTranslationPage projectId="draft-project" />)
  fireEvent.change(await screen.findByRole('textbox', { name: '译文' }), { target: { value: 'unsaved draft' } })
  first.unmount()
  current = { ...current, revision: 11 }
  render(<ComicTranslationPage projectId="draft-project" />)
  expect(await screen.findByRole('textbox', { name: '译文' })).toHaveValue('unsaved draft')
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 10, command: expect.objectContaining({ region: expect.objectContaining({ targetText: 'unsaved draft' }) }) })))
})
it('saves brush gestures in source pixels, clamps image edges and releases pointer capture', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  const image = await screen.findByRole('img', { name: '001' })
  const surface = image.parentElement!
  const capture = vi.fn(), release = vi.fn()
  Object.defineProperties(surface, { setPointerCapture: { value: capture }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: release } })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 200, right: 210, bottom: 220, x: 10, y: 20, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '擦除原文' }))
  const pointer = (type: string, clientX: number, clientY: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(surface, event) }
  pointer('pointerdown', 110, 120); pointer('pointermove', 230, 240); pointer('pointerup', 230, 240)
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'paintMask', pageId: 'page', stroke: expect.objectContaining({ mode: 'erase', size: 20, points: [[50, 50], [99, 99]] }) } })))
  expect(capture).toHaveBeenCalledWith(1)
  expect(release).toHaveBeenCalledWith(1)
})
it('retains a failed brush stroke across route unmount without changing its source revision', async () => {
  let current = { ...project, id: 'mask-project' }
  const edit = vi.fn(async () => { throw new Error('Storage failure') })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => current, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  const first = render(<ComicTranslationPage projectId="mask-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperties(surface, { setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() } })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '恢复保护' }))
  for (const type of ['pointerdown', 'pointerup']) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 30 }); Object.defineProperty(event, 'pointerId', { value: 2 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledOnce())
  await waitFor(() => expect(within(document.querySelector('.comic-canvas__tools')!).getByRole('button', { name: '保存' })).toBeEnabled())
  first.unmount(); current = { ...current, revision: 8 }
  render(<ComicTranslationPage projectId="mask-project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(within(document.querySelector('.comic-canvas__tools')!).getByRole('button', { name: '保存' }))
  await waitFor(() => expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ stroke: expect.objectContaining({ mode: 'restore', points: [[20, 30]] }) }) })))
  fireEvent.click(within(document.querySelector('.comic-canvas__tools')!).getByRole('button', { name: '取消' }))
})
it('renders a saved manual translation using layout without rerunning translation', async () => {
  const saved = { ...project, revision: 5, pages: [{ ...project.pages[0], hasClean: true, regions: [{ ...project.pages[0].regions[0], targetText: 'Manual correction', locked: true }] }] }
  const edit = vi.fn(async () => saved), run = vi.fn(async () => saved)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages: [{ ...project.pages[0], hasClean: true }] }), image: async () => 'data:image/png;base64,AA==', edit, run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  fireEvent.change(await screen.findByRole('textbox', { name: '译文' }), { target: { value: 'Manual correction' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '处理此页' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '处理此页' }))
  fireEvent.click(await screen.findByRole('button', { name: '重新排版' }))
  await waitFor(() => expect(run).toHaveBeenCalledExactlyOnceWith({ projectId: 'project', expectedRevision: 5, pageIds: ['page'], stage: 'layout' }))
})
it('saves manual geometry and typography and removes stale OCR quadrilaterals', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  fireEvent.change(await screen.findByRole('spinbutton', { name: '横坐标' }), { target: { value: '30' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: '字号' }), { target: { value: '24' } })
  fireEvent.click(screen.getByRole('switch', { name: '忽略此气泡' }))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ x: 30, sourceQuad: undefined, ignored: true, style: expect.objectContaining({ fontSize: 24 }) }) }) })))
})
it('creates chapters and moves the current page through the real edit contract', async () => {
  const book = { ...project, chapters: [...project.chapters, { id: 'appendix', title: 'Appendix' }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  fireEvent.click(await screen.findByRole('button', { name: '新增章节' }))
  fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox', { name: '名称' }), { target: { value: 'New chapter' } })
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '新增章节' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: { action: 'addChapter', title: 'New chapter' } })))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: '移至章节' }))
  await user.click(await screen.findByRole('option', { name: 'Appendix' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 5, command: { action: 'movePage', pageId: 'page', chapterId: 'appendix', index: 1 } })))
})
it('explains how to recover a failed layout job without exposing the raw backend error', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, jobs: [{ id: 'job', state: 'failed', stage: 'layout', completedPages: 0, totalPages: 1, error: 'worker detail: repairRequired' }] }), image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  expect(await screen.findByText('请先修复此页底图，再重新排版。')).toBeInTheDocument()
  expect(screen.queryByText(/worker detail/)).not.toBeInTheDocument()
})
