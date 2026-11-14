import { act, cleanup, configure, fireEvent, getConfig, render, screen, waitFor, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import type { ComicMutation, ComicProject } from '../../../shared/comic'
import { ComicTranslationPage, comicExportPages, comicIssueKey } from './ComicTranslationPage'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as notifications from '@/components/primitives/notify'

vi.mock('@/available-models', () => ({ useAvailableModels: () => ({ mt: [] }) }))
const defaultAsyncTimeout = getConfig().asyncUtilTimeout
beforeAll(() => configure({ asyncUtilTimeout: 3000 }))
afterAll(() => configure({ asyncUtilTimeout: defaultAsyncTimeout }))
beforeEach(() => { localStorage.clear(); vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function openRegionEditor() {
  await screen.findByRole('img', { name: '001' })
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
}
const saveEditor = () => fireEvent.keyDown(window, { key: 's', ctrlKey: true })
const editText = (element: HTMLElement, value: string) => { element.textContent = value; fireEvent.input(element) }
async function selectArtboard(number: number) {
  await userEvent.click(await screen.findByRole('treeitem', { name: `第 ${number} 页` }))
}
const project: ComicProject = { id: 'project', title: 'Book', revision: 4, updatedAt: '', pageCount: 1, chapterCount: 1, config: { sourceLanguage: 'ja', targetLanguage: 'zh', model: '', readingDirection: 'rtl', glossary: { mode: 'auto' } }, chapters: [{ id: 'chapter', title: 'Chapter' }], pages: [{ id: 'page', chapterId: 'chapter', name: '001', width: 100, height: 100, hasClean: false, hasRendered: false, status: 'recognized', regions: [{ id: 'region', sourceText: 'source', targetText: 'target', x: 10, y: 10, width: 40, height: 40, confidence: null, locked: false, ignored: false, style: { fontSize: 16, color: '#000000', direction: 'horizontal', align: 'center' }, qa: [] }] }], jobs: [], canUndo: false, canRedo: false }
it('shows editor loading and retry states without the bookshelf page', async () => {
  const openProject = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(new Promise(() => {}))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  expect(screen.queryByText('漫画翻译')).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('操作失败')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(screen.getByRole('status')).toHaveAccessibleName('加载中')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(openProject).toHaveBeenCalledTimes(2)
})
it('keeps a whole-book overview in one scene without requesting full-size inactive pages', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('comic-canvas__scroll') ? 1200 : 0 })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('comic-canvas__scroll') ? 800 : 0 })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    unobserve() {} disconnect() {}
  })
  const pages = Array.from({ length: 209 }, (_, index) => ({ ...project.pages[0], id: `page-${index}`, name: `Page ${index + 1}`, width: 2060, height: 2914, regions: [] }))
  const image = vi.fn(async (_project: string, _page: string, _kind: string, _maxPixels?: number) => 'data:image/png;base64,AA==')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pageCount: pages.length, pages }), image, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await waitFor(() => expect(new Set(image.mock.calls.map(call => call[1])).size).toBe(209))
  expect(document.querySelectorAll('[data-artboard]')).toHaveLength(209)
  for (const call of image.mock.calls.filter(call => call[1] !== 'page-0')) expect(call[3]).toBe(10000)
  expect(image).toHaveBeenCalledWith('project', 'page-0', 'source')
  expect(document.querySelectorAll('canvas.comic-canvas__overlay')).toHaveLength(0)
})
it('opens the first-page cover directly in the reader', async () => {
  const thumbnail = vi.fn(async () => 'data:image/png;base64,AA==')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => [project], openProject: async () => project, thumbnail, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage /></TooltipProvider>)
  const cover = await screen.findByRole('link', { name: 'Book' })
  expect(cover).toHaveAttribute('href', '#/comic-translation/project/reader')
  await waitFor(() => expect(thumbnail).toHaveBeenCalledWith('project', 'page'))
  const image = await within(cover).findByRole('presentation')
  expect(image).toHaveAttribute('src', 'data:image/png;base64,AA==')
  expect(image).toHaveAttribute('draggable', 'false')
  expect(cover).toHaveAttribute('draggable', 'false')
  expect(fireEvent.dragStart(image)).toBe(false)
  const importButton = screen.getByRole('button', { name: '导入漫画' })
  expect(importButton).toHaveAttribute('data-variant', 'default')
  expect(screen.queryByRole('button', { name: '导入选项' })).not.toBeInTheDocument()
  await userEvent.click(importButton)
  expect(await screen.findByRole('dialog', { name: '导入漫画' })).toBeInTheDocument()
})
it('selects several books and restores the entire deleted batch via one toast', async () => {
  const second = { ...project, id: 'second', title: 'Second' }
  let books = [project, second]
  const deleteProjects = vi.fn(async (ids: string[]) => { books = books.filter(book => !ids.includes(book.id)) })
  const restoreProjects = vi.fn(async () => { books = [project, second] })
  const notify = vi.spyOn(notifications, 'notifySuccess').mockReturnValue('toast')
  const dismiss = vi.spyOn(notifications, 'dismissNotice').mockImplementation(() => {})
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => books, openProject: async () => project, thumbnail: async () => 'data:image/png;base64,AA==', deleteProjects, restoreProjects, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage /></TooltipProvider>)
  await userEvent.click(await screen.findByRole('checkbox', { name: '选择“Book”', hidden: true }))
  const other = screen.getByRole('checkbox', { name: '选择“Second”' })
  expect(other).not.toBeChecked()
  await userEvent.click(other)
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(deleteProjects).toHaveBeenCalledWith(['project', 'second']))
  await waitFor(() => expect(notify).toHaveBeenCalled())
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify.mock.calls[0][0]).toBe('已删除 2 本作品')
  const action = notify.mock.calls[0][1]?.action
  expect(action?.label).toBe('撤回')
  act(() => action?.onPress())
  await waitFor(() => expect(restoreProjects).toHaveBeenCalledWith(['project', 'second']))
  expect(await screen.findByRole('link', { name: 'Second' })).toBeInTheDocument()
  await waitFor(() => expect(dismiss).toHaveBeenCalledExactlyOnceWith('toast'))
})
it('opens the independent editor from the reader header and retains export shortcut', async () => {
  const openEditor = vi.fn(async () => {})
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', openEditor, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
  await waitFor(() => expect(openEditor).toHaveBeenCalledWith({ projectId: 'project', pageId: 'page' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '编辑' })).toBeEnabled())
  fireEvent.keyDown(window, { key: 'e', ctrlKey: true })
  expect(await screen.findByRole('dialog', { name: '导出' })).toBeInTheDocument()
})
it('deletes a selected bookshelf book and restores it from the toast', async () => {
  let books = [project]
  const deleteProjects = vi.fn(async () => { books = [] }), restoreProjects = vi.fn(async () => { books = [project] })
  const notify = vi.spyOn(notifications, 'notifySuccess').mockReturnValue('toast')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => books, openProject: async () => project, thumbnail: async () => '', deleteProjects, restoreProjects, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage /></TooltipProvider>)
  await userEvent.click(await screen.findByRole('checkbox', { name: '选择“Book”', hidden: true }))
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(deleteProjects).toHaveBeenCalledWith(['project']))
  act(() => notify.mock.calls[0][1]?.action?.onPress())
  await waitFor(() => expect(restoreProjects).toHaveBeenCalledWith(['project']))
  expect(await screen.findByRole('link', { name: 'Book' })).toBeInTheDocument()
})
it('retains the bookshelf undo action after a failed restoration and retries', async () => {
  const notify = vi.spyOn(notifications, 'notifySuccess').mockReturnValue('undo-toast')
  const dismiss = vi.spyOn(notifications, 'dismissNotice').mockImplementation(() => {})
  const error = vi.spyOn(notifications, 'notifyError').mockReturnValue('error')
  const restoreProjects = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('comicIoFailed')).mockResolvedValueOnce(undefined)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => [project], openProject: async () => project, thumbnail: async () => '', deleteProjects: async () => {}, restoreProjects, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage /></TooltipProvider>)
  await userEvent.click(await screen.findByRole('checkbox', { name: '选择“Book”', hidden: true }))
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(notify).toHaveBeenCalled())
  const action = notify.mock.calls[0][1]?.action
  act(() => action?.onPress())
  await waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(dismiss).not.toHaveBeenCalled()
  act(() => action?.onPress())
  await waitFor(() => expect(dismiss).toHaveBeenCalledWith('undo-toast'))
  expect(restoreProjects).toHaveBeenCalledTimes(2)
})
it('keeps the bookshelf book when deletion fails', async () => {
  const error = vi.spyOn(notifications, 'notifyError').mockReturnValue('error')
  const deleteProjects = vi.fn(async () => { throw new Error('comicIoFailed') })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { listProjects: async () => [project], openProject: async () => project, thumbnail: async () => '', deleteProjects, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage /></TooltipProvider>)
  await userEvent.click(await screen.findByRole('checkbox', { name: '选择“Book”', hidden: true }))
  await userEvent.click(screen.getByRole('button', { name: '删除' }))
  await waitFor(() => expect(error).toHaveBeenCalled())
  expect(screen.getByRole('link', { name: 'Book' })).toBeInTheDocument()
})
it('keeps project management controls outside the editor', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(screen.queryByRole('button', { name: '处理设置' })).toBeNull()
  expect(screen.queryByRole('button', { name: '导入漫画' })).toBeNull()
})
it('shows the eight accessible editor tools in Lumina order', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  const tools = [...document.querySelectorAll('.comic-canvas__tools [data-slot="toggle-group-item"]')].map(node => node.getAttribute('aria-label'))
  expect(tools).toEqual(['选择', '套索选区', '矩形选区', '新增气泡框', '画笔', '橡皮', '填充', '吸管'])
})
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
  render(<ComicTranslationPage editor projectId="project" />)
  await openRegionEditor()
  const target = await screen.findByRole('textbox', { name: '译文' })
  editText(target, 'manual target')
  expect(target).toHaveTextContent('manual target')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'saveRegion', pageId: 'page', region: expect.objectContaining({ targetText: 'manual target', locked: true }) } })))
})
it('restores an unsaved draft after navigation and retains its original revision', async () => {
  let current = { ...project, id: 'draft-project', revision: 10 }
  const edit = vi.fn(async () => ({ ...current, revision: 12 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => current, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  const first = render(<ComicTranslationPage editor projectId="draft-project" />)
  await openRegionEditor()
  editText(await screen.findByRole('textbox', { name: '译文' }), 'unsaved draft')
  first.unmount()
  current = { ...current, revision: 10 }
  render(<ComicTranslationPage editor projectId="draft-project" />)
  await openRegionEditor()
  expect(await screen.findByRole('textbox', { name: '译文' })).toHaveTextContent('unsaved draft')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 10, command: expect.objectContaining({ region: expect.objectContaining({ targetText: 'unsaved draft' }) }) })))
})
it('saves brush gestures in source pixels, clamps image edges and releases pointer capture', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const image = await screen.findByRole('img', { name: '001' })
  const surface = image.parentElement!
  const capture = vi.fn(), release = vi.fn()
  Object.defineProperties(surface, { setPointerCapture: { value: capture }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: release } })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 200, height: 200, right: 210, bottom: 220, x: 10, y: 20, toJSON: () => ({}) })
  await userEvent.click(screen.getByRole('tab', { name: '蒙版' }))
  fireEvent.click(screen.getByRole('button', { name: '画笔' }))
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
  const first = render(<ComicTranslationPage editor projectId="mask-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperties(surface, { setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => true }, releasePointerCapture: { value: vi.fn() } })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  await userEvent.click(screen.getByRole('tab', { name: '蒙版' }))
  fireEvent.click(screen.getByRole('button', { name: '橡皮' }))
  for (const type of ['pointerdown', 'pointerup']) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 30 }); Object.defineProperty(event, 'pointerId', { value: 2 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledOnce())
  await waitFor(() => expect(within(document.querySelector('.comic-canvas__context')!).getByRole('button', { name: '保存' })).toBeEnabled())
  first.unmount(); current = { ...current, revision: 8 }
  render(<ComicTranslationPage editor projectId="mask-project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(within(document.querySelector('.comic-canvas__context')!).getByRole('button', { name: '保存' }))
  await waitFor(() => expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ stroke: expect.objectContaining({ mode: 'restore', points: [[20, 30]] }) }) })))
  fireEvent.click(within(document.querySelector('.comic-canvas__context')!).getByRole('button', { name: '取消' }))
})
it('renders a saved manual translation using layout without rerunning translation', async () => {
  const saved = { ...project, revision: 5, pages: [{ ...project.pages[0], hasClean: true, regions: [{ ...project.pages[0].regions[0], targetText: 'Manual correction', locked: true }] }] }
  const edit = vi.fn(async () => saved), run = vi.fn(async () => saved)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages: [{ ...project.pages[0], hasClean: true }] }), image: async () => 'data:image/png;base64,AA==', edit, run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await openRegionEditor()
  editText(await screen.findByRole('textbox', { name: '译文' }), 'Manual correction')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledOnce())
  await waitFor(() => expect(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' })).toBeEnabled())
  const editMenu = screen.getByRole('button', { name: '编辑' })
  fireEvent.keyDown(editMenu, { key: 'ArrowDown' })
  await userEvent.click(await screen.findByRole('menuitem', { name: '重新排版' }))
  await waitFor(() => expect(run).toHaveBeenCalledExactlyOnceWith({ projectId: 'project', expectedRevision: 5, pageIds: ['page'], stage: 'layout' }))
})
it('saves canvas geometry and typography without stale OCR geometry', async () => {
  const quad: [number, number][] = [[10, 10], [40, 10], [40, 40], [10, 40]]
  const book = { ...project, pages: [{ ...project.pages[0], regions: [{ ...project.pages[0].regions[0], sourceQuad: quad, sourceLines: [quad] }] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const region = await screen.findByRole('button', { name: '气泡 1' })
  Object.defineProperty(region, 'setPointerCapture', { value: vi.fn() })
  const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 8 }); fireEvent(region, event) }
  pointer('pointerdown', 10, 10); pointer('pointermove', 30, 10); pointer('pointerup', 30, 10)
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '24' } })
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ x: 30, sourceQuad: quad, sourceLines: [quad], style: expect.objectContaining({ fontSize: 24 }) }) }) })))
})

it('keeps model management and language settings outside the editor', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(screen.queryByRole('button', { name: '处理设置' })).toBeNull()
  expect(screen.queryByRole('button', { name: '模型管理' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: '源语言' })).toBeNull()
})
it('moves the active artboard using the page move contract', async () => {
  const second = { ...project.pages[0], id: 'second', name: '002' }
  const book = { ...project, pages: [...project.pages, second], pageCount: 2 }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', thumbnail: async () => '', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(document.querySelectorAll('[data-artboard]')).toHaveLength(2)
  const boards = screen.getAllByRole('treeitem').filter(item => item.dataset.kind === 'artboard')
  const transfer = { setData: vi.fn(), getData: () => 'artboard:page' }
  fireEvent.dragStart(boards[0], { dataTransfer: transfer }); fireEvent.drop(boards[1], { dataTransfer: transfer })
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: { action: 'movePage', pageId: 'page', chapterId: 'chapter', index: 1 } })))
})
it('ignores historical failures and notifies a new failed job once', async () => {
  const old = { id: 'old', state: 'failed' as const, stage: 'layout', completedPages: 0, totalPages: 1, error: 'repairRequired' }
  const book = { ...project, jobs: [old] }
  const run = vi.fn(async (): Promise<ComicProject> => ({ ...book, jobs: [{ ...old, id: 'new' }, old] }))
  const notify = vi.spyOn(notifications, 'notifyError').mockImplementation(() => '')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  const button = screen.getAllByRole('button', { name: '全部运行' })[0]
  expect(notify).not.toHaveBeenCalled()
  expect(screen.queryByText('请先修复此页底图，再重新排版。')).toBeNull()
  fireEvent.click(button)
  await waitFor(() => expect(notify).toHaveBeenCalledOnce())
  expect(notify).toHaveBeenCalledWith('请先修复此页底图，再重新排版。')
})

it('runs only the selected page and shows its active job above older failures', async () => {
  const second = { ...project.pages[0], id: 'second', name: '002' }
  const book = { ...project, pages: [...project.pages, second], pageCount: 2 }
  const run = vi.fn(async (): Promise<ComicProject> => ({ ...book, jobs: [
    { id: 'active', state: 'running', stage: 'detect', completedPages: 0, totalPages: 1, pageId: 'second' },
    { id: 'old', state: 'failed', stage: 'layout', completedPages: 0, totalPages: 1, error: 'repairRequired' },
  ] }))
  const cancel = vi.fn(async () => book)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', run, cancel, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" pageId="second" />)
  await screen.findByRole('img', { name: '002' })
  fireEvent.click(screen.getAllByRole('button', { name: '全部运行' })[0])
  await waitFor(() => expect(run).toHaveBeenCalledWith({ projectId: 'project', expectedRevision: 4, stage: 'full', pageIds: ['second'] }))
  expect(await screen.findByRole('button', { name: '取消' })).toBeInTheDocument()
  expect(screen.queryByText('请先修复此页底图，再重新排版。')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  await waitFor(() => expect(cancel).toHaveBeenCalledWith('project', 'active'))
})

it.each([false, true])('scrolls continuously and jumps by page number (reader=%s)', async reader => {
  const pages = Array.from({ length: 6 }, (_, index) => ({
    ...project.pages[0], id: String(index + 1), name: `Long imported PDF name - Page ${index + 1}`,
  }))
  const book = { ...project, pages, pageCount: pages.length }
  const image = vi.fn(async () => 'data:image/png;base64,AA==')
  const run = vi.fn(async () => book)
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: { openProject: async () => book, image, run, onChanged: () => () => {} },
  } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader={reader} />)
  const canvas = await screen.findByRole('region', { name: '漫画画布' })
  Object.defineProperties(canvas, { clientHeight: { value: 500 }, scrollHeight: { value: 3600 } })
  Array.from(canvas.querySelectorAll('[data-page-id]')).forEach((child, index) => {
    Object.defineProperty(child, 'offsetTop', { value: index * 600 })
  })
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  if (reader) {
    expect(canvas.parentElement?.querySelector('.comic-page-strip')).toBeNull()
  }
  fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100 })
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent('120%')
  expect(image).toHaveBeenCalledTimes(2)
  fireEvent.scroll(canvas, { target: { scrollTop: 600 } })
  expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('2/')
  fireEvent.click(screen.getByRole('button', { name: '跳转页码' }))
  const input = screen.getByRole('textbox', { name: '跳转页码' })
  fireEvent.change(input, { target: { value: '7' } })
  fireEvent.blur(input)
  expect(canvas.scrollTop).toBe(3000)
  expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('6/6')
  expect(await screen.findByRole('img', { name: pages[5].name })).toBeInTheDocument()
  expect(image).not.toHaveBeenCalledWith('project', '4', expect.anything())
})

it('clamps direct page and zoom entry and supports previous and next', async () => {
  const pages = Array.from({ length: 53 }, (_, index) => ({ ...project.pages[0], id: String(index + 1), name: `Page ${index + 1}` }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages, pageCount: pages.length }), image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  const pageButton = await screen.findByRole('button', { name: '跳转页码' })
  expect(pageButton).toHaveTextContent('1/53')
  expect(screen.queryByRole('textbox', { name: '跳转页码' })).toBeNull()
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
  fireEvent.click(pageButton)
  const page = screen.getByRole('textbox', { name: '跳转页码' })
  expect(page).toHaveValue('1')
  expect(page).toHaveFocus()
  fireEvent.change(page, { target: { value: '59' } }); fireEvent.keyDown(page, { key: 'Enter' })
  expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('53/53')
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '上一页' }))
  expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('52/53')
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent('100%')
  fireEvent.click(screen.getByRole('button', { name: '缩放比例' }))
  let zoom = screen.getByRole('textbox', { name: '缩放比例' })
  expect(zoom).toHaveValue('100')
  expect(zoom).toHaveFocus()
  fireEvent.change(zoom, { target: { value: '125' } }); fireEvent.keyDown(zoom, { key: 'Enter' })
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent('125%')
  fireEvent.click(screen.getByRole('button', { name: '缩放比例' }))
  zoom = screen.getByRole('textbox', { name: '缩放比例' })
  fireEvent.change(zoom, { target: { value: '9999' } }); fireEvent.blur(zoom)
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent('800%')
  expect(screen.queryByRole('dialog', { name: '跳转页码' })).toBeNull()
})

it('scales pages and does not silently substitute missing layers', async () => {
  const book = { ...project, pages: [{ ...project.pages[0], hasRendered: true }, { ...project.pages[0], id: 'second', name: '002', regions: [] }] }
  const image = vi.fn(async () => 'data:image/png;base64,AA==')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  const first = (await screen.findByRole('img', { name: '001' })).parentElement!
  expect(first).toHaveStyle({ width: '100px' })
  expect(screen.getByText('此页没有此图层')).toBeInTheDocument()
  expect(image).not.toHaveBeenCalledWith('project', 'second', 'source')
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(first).toHaveStyle({ width: '120px' })
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent('120%')
  expect(screen.queryByRole('button', { name: '适宽' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '缩放模式' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '缩小' }))
  expect(first).toHaveStyle({ width: '100px' })
})

it('keeps an explicitly selected layer when navigating to a page without it', async () => {
  const pages = [{ ...project.pages[0], hasRendered: true }, { ...project.pages[0], id: 'second', name: '002', regions: [] }]
  const image = vi.fn(async () => 'data:image/png;base64,AA==')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages }), image, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(screen.getByRole('button', { name: '原图' }))
  fireEvent.click(screen.getByRole('button', { name: '译图' }))
  const canvas = screen.getByRole('region', { name: '漫画画布' })
  Object.defineProperties(canvas, { clientHeight: { value: 100 }, scrollHeight: { value: 200 } })
  Object.defineProperty(canvas.querySelectorAll('[data-page-id]')[1], 'offsetTop', { value: 100 })
  fireEvent.scroll(canvas, { target: { scrollTop: 100 } })
  expect(screen.getByText('此页没有此图层')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '译图' })).toHaveAttribute('aria-pressed', 'true')
})

it('does not expose source language or OCR configuration in the editor', async () => {
  const edit = vi.fn(async () => project)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(screen.queryByRole('combobox', { name: '漫画文字识别' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: '源语言' })).toBeNull()
  expect(edit).not.toHaveBeenCalled()
})
it('maps OCR availability and translation failure to actionable errors', () => {
  expect(comicIssueKey('mangaOcrMissing')).toBe('suite.mangaOcrMissing')
  expect(comicIssueKey('textTooLong')).toBe('suite.textOverflow')
  expect(comicIssueKey('translationFailed')).toBe('suite.comicTranslationFailed')
  expect(comicIssueKey('translationNeedsReview')).toBe('suite.comicTranslationNeedsReview')
})

it.each([false, true])('fits page height by default in editor and reader (reader=%s)', async reader => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  try {
    render(<ComicTranslationPage projectId="project" reader={reader} />)
    const canvas = await screen.findByRole('region', { name: '漫画画布' })
    await waitFor(() => expect(canvas.querySelectorAll('[data-page-id]')[0]).toHaveStyle({ width: '200px' }))
    expect(screen.queryByRole('button', { name: '适宽' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '缩放模式' })).toBeInTheDocument()
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100 })
    expect(canvas.querySelectorAll('[data-page-id]')[0]).toHaveStyle({ width: '240px' })
  } finally { globalThis.ResizeObserver = original }
})

it('keeps reader controls stable during wheel and touch scrolling', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  const canvas = await screen.findByRole('region', { name: '漫画画布' })
  const edit = screen.getByRole('button', { name: '编辑' })
  const pageControl = screen.getByRole('button', { name: '跳转页码' })
  fireEvent.wheel(canvas, { deltaY: 100 })
  fireEvent.touchStart(canvas, { touches: [{ clientY: 100 }] })
  fireEvent.touchMove(canvas, { touches: [{ clientY: 50 }] })
  expect(edit).toBeVisible()
  expect(pageControl).toBeVisible()
  expect(canvas.closest('.comic-page--workspace')).not.toHaveAttribute('data-reader-immersive')
})

it('tracks pages using the outer page scroller in reader mode', async () => {
  const pages = [project.pages[0], { ...project.pages[0], id: 'second', name: '002', regions: [] }]
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages }), image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<main className="nola-main"><ComicTranslationPage projectId="project" reader /></main>)
  const canvas = await screen.findByRole('region', { name: '漫画画布' })
  const host = canvas.closest('.nola-main') as HTMLElement
  Object.defineProperties(host, { clientHeight: { value: 100 }, scrollHeight: { value: 400 } })
  Object.defineProperty(canvas.querySelectorAll('[data-page-id]')[1], 'offsetTop', { value: 100 })
  vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => ({ top: 100 - host.scrollTop, left: 0, right: 100, bottom: 300 - host.scrollTop, width: 100, height: 200, x: 0, y: 100 - host.scrollTop, toJSON: () => ({}) }))
  fireEvent.scroll(host, { target: { scrollTop: 200 } })
  expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('2/')
  expect(canvas).toHaveAttribute('data-reader', 'true')
})

it('fits mixed page sizes without changing scale while reading', async () => {
  const pages = [project.pages[0], { ...project.pages[0], id: 'spread', name: 'spread', width: 200, height: 100, regions: [] }]
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => ({ ...project, pages }), image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500)
  const original = globalThis.ResizeObserver
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} }
  try {
    render(<ComicTranslationPage projectId="project" reader />)
    const canvas = await screen.findByRole('region', { name: '漫画画布' })
    await waitFor(() => expect(canvas.querySelectorAll('[data-page-id]')[1]).toHaveStyle({ width: '500px' }))
    expect(canvas.querySelectorAll('[data-page-id]')[0]).toHaveStyle({ width: '250px' })
    Object.defineProperty(canvas, 'scrollHeight', { value: 1000 })
    Object.defineProperty(canvas.querySelectorAll('[data-page-id]')[1], 'offsetTop', { value: 500 })
    fireEvent.scroll(canvas, { target: { scrollTop: 500 } })
    expect(screen.getByRole('button', { name: '跳转页码' })).toHaveTextContent('2/')
    expect(canvas.querySelectorAll('[data-page-id]')[1]).toHaveStyle({ width: '500px' })
    expect(canvas.querySelectorAll('[data-page-id]')[0]).toHaveStyle({ width: '250px' })
  } finally { globalThis.ResizeObserver = original }
})

it('keeps source images on revision changes but reloads rendered images', async () => {
  let current = { ...project, pages: [{ ...project.pages[0], hasRendered: true }] }
  let changed = (_event: { projectId: string }) => {}
  const image = vi.fn(async () => 'data:image/png;base64,AA==')
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: {
    openProject: async () => current, image, onChanged: (callback: typeof changed) => { changed = callback; return () => {} },
  } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" reader />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(screen.getByRole('button', { name: '原图' }))
  await waitFor(() => expect(image).toHaveBeenCalledWith('project', 'page', 'source'))
  image.mockClear()
  current = { ...current, revision: 5 }
  await act(async () => { changed({ projectId: 'project' }) })
  expect(image).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '译图' }))
  await waitFor(() => expect(image).toHaveBeenCalledWith('project', 'page', 'rendered'))
  image.mockClear()
  current = { ...current, revision: 6 }
  await act(async () => { changed({ projectId: 'project' }) })
  await waitFor(() => expect(image).toHaveBeenCalledWith('project', 'page', 'rendered'))
})

it('saves layer visibility and editing lock independently of translation protection', async () => {
  let book: ComicProject = { ...project, id: 'layer-visibility-project' }
  const edit = vi.fn(async (request: ComicMutation) => {
    if (request.command.action === 'saveRegion') book = { ...book, revision: book.revision + 1, pages: [{ ...book.pages[0], regions: [request.command.region] }] }
    return book
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="layer-visibility-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '隐藏图层 target' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ visible: false, locked: false }) }) })))
  await waitFor(() => expect(screen.queryByRole('button', { name: '气泡 1' })).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '锁定图层 target' }))
  await waitFor(() => expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ visible: false, editLocked: true, locked: false }) }) })))
})

it('saves a brush stroke to the selected drawing layer in source coordinates', async () => {
  const layer = { id: 'layer', name: 'Drawing', visible: true, locked: false, opacity: 1, strokes: [] }
  const book = { ...project, pages: [{ ...project.pages[0], drawingLayers: [layer] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const image = await screen.findByRole('img', { name: '001' })
  const surface = image.parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('treeitem', { name: 'Drawing' }))
  const context = within(document.querySelector('.comic-canvas__context')!)
  fireEvent.change(context.getByRole('spinbutton', { name: '不透明度（%）' }), { target: { value: '60' } })
  fireEvent.change(context.getByRole('spinbutton', { name: '硬度（%）' }), { target: { value: '40' } })
  for (const type of ['pointerdown', 'pointerup']) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 100, clientY: 100 }); Object.defineProperty(event, 'pointerId', { value: 1 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveDrawingLayer', layer: expect.objectContaining({ id: 'layer', strokes: [expect.objectContaining({ mode: 'brush', opacity: 0.6, hardness: 0.4, points: [[50, 50]] })] }) }) })))
})

it('parses ordered export page ranges and rejects invalid pages', () => {
  expect(comicExportPages('3, 1-2, 3', 5)).toEqual([3, 1, 2])
  expect(comicExportPages('', 5)).toEqual([])
  expect(comicExportPages('2-6', 5)).toBeNull()
  expect(comicExportPages('3-1', 5)).toBeNull()
})

it('moves a text region in source pixels and saves its geometry', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const surface = await screen.findByRole('button', { name: '气泡 1' })
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 2 }); fireEvent(surface, event) }
  pointer('pointerdown', 10, 10); pointer('pointermove', 30, 25); pointer('pointerup', 30, 25)
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ x: 30, y: 25 }) }) })))
})



it('edits translated text directly on the canvas and persists the same draft', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  const inline = await screen.findByRole('textbox', { name: '译文' })
  editText(inline, 'canvas edit')
  expect(inline).toHaveTextContent('canvas edit')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ targetText: 'canvas edit', locked: true }) }) })))
})

it('applies Type controls to selected canvas characters and saves Unicode text runs', async () => {
  const book = { ...project, id: 'canvas-runs-project', pages: [{ ...project.pages[0], regions: [{ ...project.pages[0].regions[0], targetText: 'A😀文' }] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="canvas-runs-project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  const input = await screen.findByRole('textbox', { name: '译文' }), node = input.querySelector('span')!.firstChild!
  const range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 3)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(input)
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '24' } })
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({
    targetText: 'A😀文', textRuns: [expect.objectContaining({ start: 1, end: 2, style: expect.objectContaining({ fontSize: 24 }) })],
  }) }) })))
})

it('freezes the fitted base before applying an explicit selected-character size', async () => {
  const base = project.pages[0].regions[0]
  const layout = { text: 'A😀文', x: 10, y: 10, width: 40, height: 40, fontSize: 27, lineHeight: 33, lines: ['A😀文'], direction: 'horizontal' as const, angle: 0 }
  const book = { ...project, id: 'canvas-autofit-project', pages: [{ ...project.pages[0], regions: [{ ...base, targetText: 'A😀文', style: { ...base.style, fontSize: 48, autoFontSize: true }, resolvedLayout: layout }] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="canvas-autofit-project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  const input = await screen.findByRole('textbox', { name: '译文' }), node = input.querySelector('span')!.firstChild!
  const range = document.createRange(); range.setStart(node, 1); range.setEnd(node, 3)
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); fireEvent.pointerUp(input)
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '64' } })
  expect([...input.querySelectorAll('span')].find(span => span.textContent === '😀')?.style.fontSize).toBe('64px')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({
    style: expect.objectContaining({ fontSize: 27, autoFontSize: false }), textRuns: [expect.objectContaining({ start: 1, end: 2, style: expect.objectContaining({ fontSize: 64 }) })],
  }) }) })))
})

it('refreshes canvas line breaks from the current draft without interrupting IME input', async () => {
  const base = project.pages[0].regions[0], initial = { text: 'A😀中文', x: 10, y: 10, width: 40, height: 40, fontSize: 16, lineHeight: 20, lines: ['A😀', '中文'], direction: 'horizontal' as const, angle: 0 }
  const book = { ...project, id: 'inline-layout-project', pages: [{ ...project.pages[0], regions: [{ ...base, targetText: initial.text, resolvedLayout: initial }] }] }
  const previewRegion = vi.fn(async (_p: string, _page: string, candidate: typeof base) => ({ image: '', layout: { ...initial, text: candidate.targetText!, lines: ['A', '😀中文'] } }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', previewRegion, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="inline-layout-project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  const input = await screen.findByRole('textbox', { name: '译文' })
  await waitFor(() => expect([...input.childNodes].map(node => node.nodeName === 'BR' ? '|' : node.textContent).join('')).toBe('A|😀中文'))
  const calls = previewRegion.mock.calls.length
  fireEvent.compositionStart(input); input.textContent = '編集中'; fireEvent.input(input)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)) })
  expect(input.textContent).toBe('編集中'); expect(previewRegion).toHaveBeenCalledTimes(calls)
  fireEvent.compositionEnd(input)
})

it('cancels an unchanged canvas session without locking or saving its source layer', async () => {
  let close: (() => Promise<void>) | undefined
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit,
    onEditorCloseRequested: (callback: () => Promise<void>) => { close = callback; return () => {} }, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  fireEvent.keyDown(await screen.findByRole('textbox', { name: '译文' }), { key: 'Escape' })
  await act(async () => { await close!() })
  expect(edit).not.toHaveBeenCalled()
})

it('cancels a canvas edit while retaining the earlier layer draft and its unlocked state', async () => {
  const book = { ...project, id: 'cancel-existing-draft' }, edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="cancel-existing-draft" />)
  const box = await screen.findByRole('button', { name: '气泡 1' }); fireEvent.click(box)
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '24' } })
  fireEvent.doubleClick(box); const input = await screen.findByRole('textbox', { name: '译文' })
  editText(input, 'discard this'); fireEvent.keyDown(input, { key: 'Escape' }); saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({
    targetText: 'target', locked: false, style: expect.objectContaining({ fontSize: 24 }),
  }) }) })))
})

it('moves selected text layers together and saves both against advancing revisions', async () => {
  const regions = [{ ...project.pages[0].regions[0], width: 20, height: 20 }, { ...project.pages[0].regions[0], id: 'second-region', x: 40, y: 40, width: 20, height: 20 }]
  const book = { ...project, pages: [{ ...project.pages[0], regions }] }
  let revision = 4
  const edit = vi.fn(async (_request: ComicMutation) => ({ ...book, revision: ++revision }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const image = await screen.findByRole('img', { name: '001' }), surface = image.parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  const pointer = (target: Element, type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 9 }); fireEvent(target, event) }
  fireEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  pointer(surface, 'pointerdown', 0, 0); pointer(surface, 'pointerup', 80, 80)
  await userEvent.click(screen.getByRole('button', { name: '选择' }))
  const region = screen.getByRole('button', { name: '气泡 1' })
  Object.defineProperty(region, 'setPointerCapture', { value: vi.fn() })
  pointer(region, 'pointerdown', 10, 10); pointer(region, 'pointermove', 20, 20); pointer(region, 'pointerup', 20, 20)
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledTimes(2))
  expect(edit.mock.calls[0][0]).toEqual(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ region: expect.objectContaining({ x: 20, y: 20 }) }) }))
  expect(edit.mock.calls[1][0]).toEqual(expect.objectContaining({ expectedRevision: 5, command: expect.objectContaining({ region: expect.objectContaining({ x: 50, y: 50 }) }) }))
})

it('persists the selected fill tolerance with the drawing stroke', async () => {
  const layer = { id: 'layer', name: 'Drawing', visible: true, locked: false, opacity: 1, strokes: [] }
  const book = { ...project, id: 'fill-tolerance-project', pages: [{ ...project.pages[0], drawingLayers: [layer] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="fill-tolerance-project" />)
  const surface = (await screen.findByRole('img', { name: '001' }, { timeout: 3000 })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('treeitem', { name: 'Drawing' }))
  fireEvent.click(screen.getByRole('button', { name: '填充' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '容差' }), { target: { value: '45' } })
  fireEvent.click(screen.getByRole('switch', { name: '连续区域' }))
  for (const type of ['pointerdown', 'pointerup']) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 30 }); Object.defineProperty(event, 'pointerId', { value: 3 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ layer: expect.objectContaining({ strokes: [expect.objectContaining({ mode: 'fill', tolerance: 45, contiguous: false })] }) }) })))
})

it.each(['repair', 'erase', 'text'] as const)('runs %s on the exact selected polygon', async action => {
  const repair = { id: 'repair', name: 'Repair', x: 0, y: 0, width: 80, height: 80, visible: true, opacity: 1 }
  const book = { ...project, pages: [{ ...project.pages[0], repairLayers: [repair] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 })), run = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  for (const [type, x, y] of [['pointerdown', 10, 10], ['pointerup', 50, 60]] as const) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 7 }); fireEvent(surface, event) }
  const polygon = [{ op: 'add', points: [[10, 10], [50, 10], [50, 60], [10, 60]] }]
  fireEvent.click(screen.getByRole('button', { name: action === 'repair' ? '修复选区' : action === 'erase' ? '清除选区修复' : '选区转文字框' }))
  if (action === 'repair') await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ stage: 'repair', pageIds: ['page'], selection: polygon })))
  else if (action === 'erase') await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: { action: 'eraseRepairArea', pageId: 'page', polygon } })))
  else await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ x: 10, y: 10, width: 40, height: 50 }) }) })))
})

it('rotates a text layer through the canvas handle and persists the angle', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const region = await screen.findByRole('button', { name: '气泡 1' })
  Object.defineProperty(region, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(region)
  const handle = region.querySelector('.comic-canvas__rotate')!
  const pointer = (target: Element, type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 8 }); fireEvent(target, event) }
  pointer(handle, 'pointerdown', 50, 0); pointer(region, 'pointermove', 100, 50); pointer(region, 'pointerup', 100, 50)
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ style: expect.objectContaining({ angle: 90 }) }) }) })))
})

it('combines and subtracts selection shapes and undoes them locally', async () => {
  const run = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  const rect = (x: number, y: number, endX: number, endY: number, modifier: 'shiftKey' | 'altKey' | undefined) => {
    for (const [type, px, py] of [['pointerdown', x, y], ['pointerup', endX, endY]] as const) {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: px, clientY: py, ...(modifier ? { [modifier]: true } : {}) })
      Object.defineProperty(event, 'pointerId', { value: 3 }); fireEvent(surface, event)
    }
  }
  rect(5, 5, 35, 35, undefined); rect(50, 50, 90, 90, 'shiftKey'); rect(15, 15, 25, 25, 'altKey')
  const canvas = screen.getByRole('region', { name: '漫画画布' })
  expect(surface.querySelectorAll('svg polygon')).toHaveLength(3)
  fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
  expect(surface.querySelectorAll('svg polygon')).toHaveLength(2)
  fireEvent.keyDown(canvas, { key: 'y', ctrlKey: true })
  expect(surface.querySelectorAll('svg polygon')).toHaveLength(3)
  await userEvent.click(screen.getByRole('button', { name: '修复选区' }))
  await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ selection: [
    { op: 'add', points: [[5, 5], [35, 5], [35, 35], [5, 35]] },
    { op: 'add', points: [[50, 50], [90, 50], [90, 90], [50, 90]] },
    { op: 'subtract', points: [[15, 15], [25, 15], [25, 25], [15, 25]] },
  ] })))
})

it.each(['resize', 'rotate'] as const)('%s transforms selected text layers while retaining OCR geometry', async mode => {
  const quad: [number, number][] = [[10, 10], [30, 10], [30, 30], [10, 30]]
  const regions = [{ ...project.pages[0].regions[0], width: 20, height: 20, sourceQuad: quad }, { ...project.pages[0].regions[0], id: 'second-region', x: 40, y: 40, width: 20, height: 20, sourceQuad: quad }]
  const book = { ...project, pages: [{ ...project.pages[0], regions }] }
  let revision = 4
  const edit = vi.fn(async (_request: ComicMutation) => ({ ...book, revision: ++revision }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  const pointer = (target: Element, type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 9 }); fireEvent(target, event) }
  fireEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  pointer(surface, 'pointerdown', 0, 0); pointer(surface, 'pointerup', 80, 80)
  await userEvent.click(screen.getByRole('button', { name: '选择' }))
  const handle = screen.getByRole('button', { name: mode === 'resize' ? '缩放所选图层' : '旋转所选图层' })
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(handle.parentElement!, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 50, height: 50, right: 60, bottom: 60, x: 10, y: 10, toJSON: () => ({}) })
  if (mode === 'resize') { pointer(handle, 'pointerdown', 60, 60); pointer(handle, 'pointermove', 85, 85); pointer(handle, 'pointerup', 85, 85) }
  else { pointer(handle, 'pointerdown', 35, 0); pointer(handle, 'pointermove', 70, 35); pointer(handle, 'pointerup', 70, 35) }
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledTimes(2))
  const expected = mode === 'resize' ? { x: 10, y: 10, width: 30, height: 30 } : { x: 40, y: 10, style: expect.objectContaining({ angle: 90 }) }
  expect(edit.mock.calls[0][0]).toEqual(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ ...expected, sourceQuad: quad }) }) }))
})

it.each([
  [{ key: 'e', ctrlKey: true }, '当前页 PNG'],
  [{ key: 'e', ctrlKey: true, shiftKey: true }, 'PSD（预览）'],
  [{ key: 's', ctrlKey: true, shiftKey: true }, '工程文件'],
])('opens the expected export format from its shortcut', async (key, label) => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.keyDown(window, key)
  expect(await screen.findByRole('combobox', { name: '导出格式' })).toHaveTextContent(label)
})

it('does not import books from the editor shortcut', async () => {
  const importProject = vi.fn(async () => null)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', importProject, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.keyDown(window, { key: 'o', ctrlKey: true })
  expect(importProject).not.toHaveBeenCalled()
})

it('reports missing OCR as an actionable issue without a model installer in the editor', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(comicIssueKey('ocrMissing')).toBe('suite.ocrNeeded')
  expect(screen.queryByRole('button', { name: '安装' })).toBeNull()
})
it('does not offer model downloads from the standalone editor', async () => {
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(screen.queryByRole('button', { name: '模型管理' })).toBeNull()
  expect(screen.queryByRole('button', { name: '安装' })).toBeNull()
})
it('confirms repair layer deletion against the original page revision', async () => {
  const repair = { id: 'repair', name: 'Patch', x: 0, y: 0, width: 80, height: 80, visible: true, opacity: 1 }
  const book = { ...project, pages: [{ ...project.pages[0], repairLayers: [repair] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(screen.getByRole('treeitem', { name: 'Patch' }))
  fireEvent.click(within(document.querySelector('.comic-layer-tree__footer')!).getByRole('button', { name: '删除' }))
  expect(edit).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'deleteRepairLayer', pageId: 'page', layerId: 'repair' } })))
})

it('does not expose execution provider configuration in the editor', async () => {
  const edit = vi.fn(async () => project)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  expect(screen.queryByRole('combobox', { name: /执行设备/ })).toBeNull()
  expect(edit).not.toHaveBeenCalled()
})
it('stops runtime polling when the document becomes hidden and on unmount', async () => {
  const status = { availableProviders: ['cpu'], activeModels: [], cpuPercent: null, memoryUsed: 0, memoryTotal: 0, gpuMemoryUsed: null, gpuMemoryTotal: null }
  const runtimeStatus = vi.fn(async () => status)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', runtimeStatus, onChanged: () => () => {} } } as unknown as NolaBridge)
  const timer = vi.spyOn(window, 'setInterval'), clear = vi.spyOn(window, 'clearInterval')
  const visibility = vi.spyOn(document, 'visibilityState', 'get')
  visibility.mockReturnValue('visible')
  const view = render(<ComicTranslationPage editor projectId="project" />)
  await waitFor(() => expect(runtimeStatus).toHaveBeenCalledOnce())
  const poll = timer.mock.calls.map((args, index) => args[1] === 3000 ? timer.mock.results[index]?.value : undefined).find(Boolean)
  visibility.mockReturnValue('hidden')
  fireEvent(document, new Event('visibilitychange'))
  expect(clear).toHaveBeenCalledWith(poll)
  visibility.mockReturnValue('visible')
  fireEvent(document, new Event('visibilitychange'))
  await waitFor(() => expect(runtimeStatus).toHaveBeenCalledTimes(2))
  const resumed = timer.mock.calls.map((args, index) => args[1] === 3000 ? timer.mock.results[index]?.value : undefined).filter(Boolean).at(-1)
  view.unmount()
  expect(clear).toHaveBeenCalledWith(resumed)
})

it('shows actual runtime providers without inventing GPU memory', async () => {
  const runtimeStatus = async () => ({ availableProviders: ['cpu'], activeModels: [], cpuPercent: 25, memoryUsed: 1024, memoryTotal: 2048, gpuMemoryUsed: null, gpuMemoryTotal: null })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', runtimeStatus, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  expect(await screen.findByText('CPU 25%')).toBeInTheDocument()
  expect(screen.queryByText(/VRAM/)).toBeNull()
})
it('opens the independent editor from the project preview', async () => {
  const openEditor = vi.fn(async () => {})
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', openEditor, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  await waitFor(() => expect(openEditor).toHaveBeenCalledWith({ projectId: 'project', pageId: 'page' }))
  expect(screen.queryByRole('navigation', { name: '全部图层' })).toBeNull()
})

it('shows the eight editing tools and creates text with the default style', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  expect(document.querySelectorAll('.comic-canvas__tools [data-slot="toggle-group-item"]')).toHaveLength(8)
  expect(screen.queryByRole('button', { name: '处理设置' })).toBeNull()
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(within(document.querySelector('.comic-canvas__tools')!).getByRole('button', { name: '新增气泡框' }))
  for (const [type, x, y] of [['pointerdown', 10, 10], ['pointerup', 50, 60]] as const) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 8 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ x: 10, y: 10, width: 40, height: 50, style: expect.objectContaining({ fontSize: expect.any(Number) }) }) }) })))
})

it('flushes an edited text draft before the editor window closes', async () => {
  let close: (() => Promise<void>) | undefined
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onEditorCloseRequested: (callback: () => Promise<void>) => { close = callback; return () => {} }, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'closing draft')
  await act(async () => { await close!() })
  expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ targetText: 'closing draft' }) }) }))
})

it('does not auto-save during inline editing and saves after the editing session ends', async () => {
  const edit = vi.fn(async () => ({ ...project, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await openRegionEditor()
  const input = screen.getByRole('textbox', { name: '译文' })
  editText(input, 'autosaved text')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)) })
  expect(edit).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ targetText: 'autosaved text' }) }) })), { timeout: 3000 })
})

it('saves a draft before an existing editor switches to a requested page', async () => {
  let requestPage: ((id: string) => void) | undefined
  const second = { ...project.pages[0], id: 'second', name: '002', regions: [] }
  const book = { ...project, id: 'request-project', pages: [...project.pages, second], pageCount: 2 }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onEditorPageRequested: (callback: (id: string) => void) => { requestPage = callback; return () => {} }, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="request-project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'before switching')
  act(() => requestPage!('second'))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ targetText: 'before switching' }) }) })))
  expect(await screen.findByRole('img', { name: '002' })).toBeInTheDocument()
})

it('runs detection from the floating processing bar without changing configuration', async () => {
  const edit = vi.fn(async () => project), run = vi.fn(async () => project)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => project, image: async () => 'data:image/png;base64,AA==', edit, run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="project" />)
  await screen.findByRole('img', { name: '001' })
  await userEvent.click(screen.getByRole('button', { name: '处理' }))
  fireEvent.click(await screen.findByRole('button', { name: '检测文字区域' }))
  await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ stage: 'detect', pageIds: ['page'] })))
  expect(edit).not.toHaveBeenCalled()
})

it('preserves an unsaved draft and rejects a stale revision on editor close', async () => {
  let current = { ...project, id: 'conflict-project', revision: 10 }
  let close: (() => Promise<void>) | undefined
  const edit = vi.fn(async () => ({ ...current, revision: 12 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => current, image: async () => 'data:image/png;base64,AA==', edit, onEditorCloseRequested: (callback: () => Promise<void>) => { close = callback; return () => {} }, onChanged: () => () => {} } } as unknown as NolaBridge)
  const first = render(<ComicTranslationPage editor projectId="conflict-project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'keep this draft')
  first.unmount()
  current = { ...current, revision: 11 }
  const second = render(<ComicTranslationPage editor projectId="conflict-project" />)
  await openRegionEditor()
  expect(screen.getByRole('textbox', { name: '译文' })).toHaveTextContent('keep this draft')
  await expect(close!()).rejects.toThrow('conflict')
  expect(edit).not.toHaveBeenCalled()
  second.unmount()
  current = { ...current, revision: 10 }
  render(<ComicTranslationPage editor projectId="conflict-project" />)
  await openRegionEditor()
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 10 })))
})


it('creates a drawing layer on the first brush stroke', async () => {
  const book = { ...project, id: 'new-drawing-project', pages: [{ ...project.pages[0], drawingLayers: [] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="new-drawing-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '画笔' }))
  for (const type of ['pointerdown', 'pointerup']) { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 30 }); Object.defineProperty(event, 'pointerId', { value: 6 }); fireEvent(surface, event) }
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ action: 'saveDrawingLayer', pageId: 'page', layer: expect.objectContaining({ strokes: [expect.objectContaining({ mode: 'brush', points: [[20, 30]] })] }) }) })))
})

it('keeps canvas typing, shortcuts and IME composition in the text editor', async () => {
  const book = { ...project, id: 'typing-project', canUndo: true }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="typing-project" />)
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  const input = await screen.findByRole('textbox', { name: '译文' })
  const selected = () => document.querySelector('.comic-canvas__tools [aria-pressed="true"]')?.getAttribute('aria-label')
  const before = selected()
  fireEvent.keyDown(input, { key: ' ' }); fireEvent.keyDown(input, { key: 'b' }); fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })
  expect(selected()).toBe(before)
  expect(input).toBeInTheDocument()
  expect(edit).not.toHaveBeenCalled()
})

it('rebases the remaining draft after a partial save failure and retries', async () => {
  const second = { ...project.pages[0].regions[0], id: 'region-b', x: 50 }
  const book = { ...project, id: 'partial-project', pages: [{ ...project.pages[0], regions: [...project.pages[0].regions, second] }] }
  let close: (() => Promise<void>) | undefined
  const edit = vi.fn().mockResolvedValueOnce({ ...book, revision: 5 }).mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValueOnce({ ...book, revision: 6 })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onEditorCloseRequested: (callback: () => Promise<void>) => { close = callback; return () => {} }, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="partial-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '气泡 1' }))
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '20' } })
  fireEvent.click(screen.getByRole('button', { name: '气泡 2' }))
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '22' } })
  await act(async () => { await expect(close!()).rejects.toThrow('temporary failure') })
  expect(edit).toHaveBeenCalledTimes(2)
  expect(edit.mock.calls[1][0]).toEqual(expect.objectContaining({ expectedRevision: 5, command: expect.objectContaining({ region: expect.objectContaining({ id: 'region-b' }) }) }))
  await act(async () => { await close!() })
  expect(edit.mock.calls[2][0]).toEqual(expect.objectContaining({ expectedRevision: 5, command: expect.objectContaining({ region: expect.objectContaining({ id: 'region-b' }) }) }))
})

it('waits for a drag gesture to end before auto-saving its draft', async () => {
  const book = { ...project, id: 'gesture-project' }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="gesture-project" />)
  const region = await screen.findByRole('button', { name: '气泡 1' })
  Object.defineProperty(region, 'setPointerCapture', { value: vi.fn() })
  const pointer = (type: string, x: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 10 }); Object.defineProperty(event, 'pointerId', { value: 7 }); fireEvent(region, event) }
  pointer('pointerdown', 10); pointer('pointermove', 25)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)) })
  expect(edit).not.toHaveBeenCalled()
  pointer('pointerup', 25)
  await waitFor(() => expect(edit).toHaveBeenCalledOnce(), { timeout: 3000 })
})

it('does not allow changing visibility of an editing-locked layer', async () => {
  const book = { ...project, id: 'locked-project', pages: [{ ...project.pages[0], regions: [{ ...project.pages[0].regions[0], editLocked: true }] }] }
  const edit = vi.fn(async () => book)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="locked-project" />)
  expect(await screen.findByRole('button', { name: '隐藏图层 target' })).toBeDisabled()
  expect(edit).not.toHaveBeenCalled()
})

it('shows the selection polygon while dragging before it is committed', async () => {
  const book = { ...project, id: 'selection-preview-project' }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="selection-preview-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  await userEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  const pointer = (type: string, x: number, y: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }); Object.defineProperty(event, 'pointerId', { value: 3 }); fireEvent(surface, event) }
  pointer('pointerdown', 10, 10); pointer('pointermove', 50, 60)
  expect(surface.querySelector('.comic-canvas__selection-preview polygon')).toHaveAttribute('points', '10,10 50,10 50,60 10,60')
  pointer('pointerup', 50, 60)
  expect(surface.querySelector('.comic-canvas__selection-preview')).toBeNull()
})

it('shows the first brush stroke before its new layer is saved', async () => {
  const book = { ...project, id: 'brush-preview-project', pages: [{ ...project.pages[0], drawingLayers: [] }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="brush-preview-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  await userEvent.click(screen.getByRole('button', { name: '画笔' }))
  const pointer = (type: string) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 20, clientY: 30 }); Object.defineProperty(event, 'pointerId', { value: 5 }); fireEvent(surface, event) }
  pointer('pointerdown')
  expect(surface.querySelector('.comic-canvas__overlay')).toBeInTheDocument()
  expect(edit).not.toHaveBeenCalled()
  pointer('pointerup')
  await waitFor(() => expect(edit).toHaveBeenCalledOnce())
})


it('searches installed fonts and applies the choice to the selected text layer', async () => {
  const book = { ...project, id: 'font-search-project' }
  const fonts = [{ family: 'AlphaSans', weight: 400, italic: false }, { family: 'BetaSerif', weight: 400, italic: false }]
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', listFonts: async () => fonts, edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="font-search-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '气泡 1' }))
  const fontTrigger = within(document.querySelector('.comic-type-options')!).getByLabelText('字体')
  fontTrigger.focus()
  fireEvent.keyDown(fontTrigger, { key: 'ArrowDown' })
  const search = await screen.findByLabelText('搜索')
  expect(fontTrigger).toHaveFocus()
  expect(search.closest('[data-slot="input-group"]')).toBeNull()
  await userEvent.tab()
  expect(search).toHaveFocus()
  await userEvent.type(search, 'Beta')
  expect(search).toHaveFocus()
  expect(await screen.findByRole('option', { name: 'BetaSerif' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'AlphaSans' })).toBeNull()
  await userEvent.click(screen.getByRole('option', { name: 'BetaSerif' }))
  await waitFor(() => expect(fontTrigger).toHaveFocus())
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ style: expect.objectContaining({ fontFamily: 'BetaSerif' }) }) }) })))
})

it('generates font previews in the background and replaces labels when ready', async () => {
  const fonts = ['First Preview', 'Broken Preview', 'Visible Preview', 'Symbol Preview'].map(family => ({ family, weight: 400, italic: false }))
  const book = { ...project, id: 'font-preview-project' }
  let resolveFirst!: (value: { image: string; width: number; height: number }) => void
  const fontPreview = vi.fn(async (family: string) => {
    if (family === 'First Preview') return new Promise<{ image: string; width: number; height: number }>(resolve => { resolveFirst = resolve })
    if (family === 'Broken Preview') throw new Error('fontMissing')
    if (family === 'Symbol Preview') return null
    return { image: 'data:image/png;base64,AA==', width: 120, height: 60 }
  })
  const readFont = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      if (target.textContent === 'Visible Preview') this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
    }
    disconnect() {}
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', listFonts: async () => fonts, fontPreview, readFont, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="font-preview-project" />)
  await screen.findByRole('img', { name: '001' })
  fireEvent.click(screen.getByRole('button', { name: '气泡 1' }))
  await waitFor(() => expect(fontPreview).toHaveBeenCalledWith('First Preview'))
  fireEvent.keyDown(within(document.querySelector('.comic-type-options')!).getByLabelText('字体'), { key: 'ArrowDown' })
  const visible = await screen.findByRole('option', { name: 'Visible Preview' })
  expect(visible.querySelector('.comic-font-preview')).toBeNull()
  act(() => resolveFirst({ image: 'data:image/png;base64,AA==', width: 100, height: 50 }))
  await waitFor(() => expect(visible.querySelector('.comic-font-preview')).toBeInTheDocument())
  expect(visible.querySelector('.comic-font-preview')).toHaveStyle({ width: '2em' })
  await waitFor(() => expect(fontPreview).toHaveBeenCalledWith('Symbol Preview'))
  expect(fontPreview.mock.calls.map(([family]) => family)).toEqual(['First Preview', 'Visible Preview', 'Broken Preview', 'Symbol Preview'])
  expect(screen.getByRole('option', { name: 'Broken Preview' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Symbol Preview' }).querySelector('.comic-font-preview')).toBeNull()
  expect(readFont).not.toHaveBeenCalled()
})

it('handles tool shortcuts from a focused button but not from a text input', async () => {
  const book = { ...project, id: 'shortcut-focus-project' }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="shortcut-focus-project" />)
  await screen.findByRole('img', { name: '001' })
  const focusButton = screen.getByRole('button', { name: '文件操作' })
  focusButton.focus()
  fireEvent.keyDown(focusButton, { key: 'b' })
  expect(screen.getByRole('button', { name: '画笔' })).toHaveAttribute('aria-pressed', 'true')
  const size = screen.getByRole('spinbutton', { name: '笔刷大小' })
  const initial = Number((size as HTMLInputElement).value)
  fireEvent.keyDown(focusButton, { key: ']' })
  expect(Number((size as HTMLInputElement).value)).toBeGreaterThan(initial)
  fireEvent.keyDown(size, { key: '[' })
  expect(Number((size as HTMLInputElement).value)).toBeGreaterThan(initial)
  expect(screen.getByRole('button', { name: '画笔' })).toHaveAttribute('aria-pressed', 'true')
})

it('reorders text layers using the moveRegion mutation', async () => {
  const regions = [project.pages[0].regions[0], { ...project.pages[0].regions[0], id: 'region-b', x: 50 }]
  const book = { ...project, id: 'layer-order-project', pages: [{ ...project.pages[0], regions }] }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="layer-order-project" />)
  await screen.findByRole('img', { name: '001' })
  const transfer = { setData: vi.fn(), getData: () => 'text:page:region' }
  fireEvent.dragStart(document.querySelector('[data-key="text:page:region"]')!, { dataTransfer: transfer }); fireEvent.drop(document.querySelector('[data-key="text:page:region-b"]')!, { dataTransfer: transfer })
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'moveRegion', pageId: 'page', regionId: 'region', index: 1 } })))
})

it('confirms page deletion before issuing the revisioned mutation', async () => {
  const book = { ...project, id: 'page-delete-project' }
  const edit = vi.fn(async () => ({ ...book, revision: 5, pages: [], pageCount: 0 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="page-delete-project" />)
  await screen.findByRole('img', { name: '001' })
  await selectArtboard(1)
  await userEvent.click(within(document.querySelector('.comic-layer-tree__footer')!).getByRole('button', { name: '删除' }))
  expect(edit).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'deletePage', pageId: 'page' } })))
})

it('runs the clean-only preset on the current page', async () => {
  const book = { ...project, id: 'clean-preset-project' }
  const run = vi.fn(async () => book)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', run, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="clean-preset-project" />)
  await screen.findByRole('img', { name: '001' })
  await userEvent.click(screen.getByRole('button', { name: '处理' }))
  await userEvent.click(await screen.findByRole('button', { name: '仅抹字' }))
  await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'clean-preset-project', stage: 'clean', pageIds: ['page'], expectedRevision: 4 })))
})

it('saves the selected regular and italic text styles through the Type selector', async () => {
  let book: ComicProject = { ...project, id: 'font-style-project' }
  const edit = vi.fn(async (request: ComicMutation) => {
    if (request.command.action === 'saveRegion') {
      const region = request.command.region
      book = { ...book, revision: book.revision + 1, pages: [{ ...book.pages[0], regions: [region] }] }
    }
    return book
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="font-style-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '气泡 1' }))
  expect(within(document.querySelector('.comic-type-options')!).getByLabelText('样式')).toHaveTextContent('常规')
  for (const [label, fontStyle, expectedRevision] of [['斜体', 'italic', 4], ['常规', 'normal', 5]] as const) {
    fireEvent.keyDown(within(document.querySelector('.comic-type-options')!).getByLabelText('样式'), { key: 'ArrowDown' })
    await userEvent.click(await screen.findByRole('option', { name: label }))
    expect(within(document.querySelector('.comic-type-options')!).getByLabelText('样式')).toHaveTextContent(label)
    saveEditor()
    await waitFor(() => expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: 'font-style-project', expectedRevision,
      command: expect.objectContaining({ action: 'saveRegion', region: expect.objectContaining({ style: expect.objectContaining({ fontStyle, fontSize: 16, color: '#000000' }) }) }),
    })))
    await waitFor(() => expect(within(document.querySelector('.comic-type-options')!).getByLabelText('样式')).toBeEnabled())
  }
  expect(edit).toHaveBeenCalledTimes(2)
})

it('closes and reopens the Type panel without discarding a selected layer draft', async () => {
  let book: ComicProject = { ...project, id: 'close-type-draft-project' }
  const edit = vi.fn(async (request: ComicMutation) => {
    if (request.command.action === 'saveRegion') book = { ...book, revision: book.revision + 1, pages: [{ ...book.pages[0], regions: [request.command.region] }] }
    return book
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="close-type-draft-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '气泡 1' }))
  fireEvent.change(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' }), { target: { value: '24' } })
  await userEvent.click(screen.getByRole('button', { name: '关闭属性面板' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
  const type = await screen.findByRole('menuitemcheckbox', { name: '属性' })
  expect(type).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(type)
  fireEvent.keyDown(type, { key: 'Escape' })
  expect(await within(document.querySelector('.comic-type-options')!).findByRole('spinbutton', { name: '字号' })).toHaveValue(24)
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ style: expect.objectContaining({ fontSize: 24 }) }) }) })))
})

it('toggles each editor panel and page tabs from Window and shows all panels again', async () => {
  const book = { ...project, id: 'window-panels-project' }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="window-panels-project" />)
  await screen.findByRole('img', { name: '001' })
  for (const name of ['属性', '图层']) {
    fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
    const item = await screen.findByRole('menuitemcheckbox', { name })
    expect(item).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(item)
    fireEvent.keyDown(item, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menuitemcheckbox', { name })).toBeNull())
  }
  expect(screen.queryByRole('button', { name: '关闭属性面板' })).toBeNull()
  expect(screen.queryByRole('button', { name: '关闭图层面板' })).toBeNull()
  expect(screen.queryByRole('combobox', { name: '画板' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '漫画画布' })).toBeVisible()
  fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
  await userEvent.click(await screen.findByRole('menuitem', { name: '显示所有面板' }))
  expect(await screen.findByRole('button', { name: '关闭属性面板' })).toBeVisible()
  expect(screen.getByRole('button', { name: '关闭图层面板' })).toBeVisible()
  expect(screen.getByRole('tree', { name: '图层' })).toBeVisible()
})

it('keeps layer text drafts when the Layers panel is closed and reopened', async () => {
  let book: ComicProject = { ...project, id: 'close-layers-draft-project' }
  const edit = vi.fn(async (request: ComicMutation) => {
    if (request.command.action === 'saveRegion') book = { ...book, revision: book.revision + 1, pages: [{ ...book.pages[0], regions: [request.command.region] }] }
    return book
  })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="close-layers-draft-project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'retained layer draft')
  await userEvent.click(screen.getByRole('button', { name: '关闭图层面板' }))
  expect(screen.getByRole('textbox', { name: '译文' })).toHaveTextContent('retained layer draft')
  fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
  const layers = await screen.findByRole('menuitemcheckbox', { name: '图层' })
  await userEvent.click(layers)
  fireEvent.keyDown(layers, { key: 'Escape' })
  fireEvent.doubleClick(await screen.findByRole('button', { name: '气泡 1' }))
  expect(await screen.findByRole('textbox', { name: '译文' })).toHaveTextContent('retained layer draft')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ command: expect.objectContaining({ region: expect.objectContaining({ targetText: 'retained layer draft' }) }) })))
})

it('keeps a saved drawing visible when switching back to the select tool', async () => {
  const layer = { id: 'drawing', name: 'Drawing', visible: true, locked: false, opacity: 1, strokes: [{ id: 'stroke', mode: 'brush' as const, color: '#000000', size: 10, points: [[20, 30] as [number, number]] }] }
  const book = { ...project, id: 'drawing-visible-project', pages: [{ ...project.pages[0], drawingLayers: [layer] }] }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="drawing-visible-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  await userEvent.click(screen.getByRole('button', { name: '画笔' }))
  expect(surface.querySelector('.comic-canvas__overlay')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '选择' }))
  expect(surface.querySelector('.comic-canvas__overlay')).toBeInTheDocument()
})


it('keeps a dirty text draft and zoom when selecting another artboard', async () => {
  const second = { ...project.pages[0], id: 'second', name: '002', regions: [] }
  const book = { ...project, id: 'tree-draft-project', pages: [...project.pages, second], pageCount: 2 }
  const edit = vi.fn(async () => ({ ...book, revision: 5 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="tree-draft-project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'draft across boards')
  const zoom = screen.getByRole('button', { name: '缩放比例' }).textContent
  await selectArtboard(2)
  expect(document.querySelector('[data-page-id="second"]')).toHaveAttribute('data-active')
  expect(screen.getByRole('button', { name: '缩放比例' })).toHaveTextContent(zoom!)
  expect(screen.queryByRole('combobox', { name: '画板' })).not.toBeInTheDocument()
  expect(edit).not.toHaveBeenCalled()
  await selectArtboard(1)
  await openRegionEditor()
  expect(screen.getByRole('textbox', { name: '译文' })).toHaveTextContent('draft across boards')
})

it('retains a failed text draft across tree selection and retries the original revision', async () => {
  const second = { ...project.pages[0], id: 'second', name: '002', regions: [] }
  const book = { ...project, id: 'tree-save-failure-project', pages: [...project.pages, second], pageCount: 2 }
  const error = vi.spyOn(notifications, 'notifyError').mockReturnValue('error')
  const edit = vi.fn<(request: ComicMutation) => Promise<ComicProject>>().mockRejectedValueOnce(new Error('comicIoFailed')).mockResolvedValueOnce({ ...book, revision: 5 })
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="tree-save-failure-project" />)
  await openRegionEditor()
  editText(screen.getByRole('textbox', { name: '译文' }), 'retry this draft')
  saveEditor()
  await waitFor(() => expect(error).toHaveBeenCalled())
  await selectArtboard(2)
  expect(document.querySelector('[data-page-id="second"]')).toHaveAttribute('data-active')
  await selectArtboard(1)
  await openRegionEditor()
  expect(screen.getByRole('textbox', { name: '译文' })).toHaveTextContent('retry this draft')
  saveEditor()
  await waitFor(() => expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({ expectedRevision: 4, command: expect.objectContaining({ region: expect.objectContaining({ targetText: 'retry this draft' }) }) })))
})

it('deletes the active artboard, clears its selection and activates its neighbor', async () => {
  const second = { ...project.pages[0], id: 'second', name: '002', regions: [] }
  const book = { ...project, id: 'delete-active-tab-project', pages: [...project.pages, second], pageCount: 2 }
  const edit = vi.fn(async () => ({ ...book, revision: 5, pages: [second], pageCount: 1 }))
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="delete-active-tab-project" />)
  const surface = (await screen.findByRole('img', { name: '001' })).parentElement!
  Object.defineProperty(surface, 'setPointerCapture', { value: vi.fn() })
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '矩形选区' }))
  for (const [type, x, y] of [['pointerdown', 5, 5], ['pointerup', 80, 80]] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
    Object.defineProperty(event, 'pointerId', { value: 21 }); fireEvent(surface, event)
  }
  expect(surface.querySelector('svg polygon')).toBeInTheDocument()
  await selectArtboard(1)
  await userEvent.click(within(document.querySelector('.comic-layer-tree__footer')!).getByRole('button', { name: '删除' }))
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '删除' }))
  await waitFor(() => expect(edit).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, command: { action: 'deletePage', pageId: 'page' } })))
  const next = await screen.findByRole('img', { name: '002' })
  expect(document.querySelector('[data-page-id="page"]')).toBeNull()
  expect(document.querySelector('[data-page-id="second"]')).toHaveAttribute('data-active')
  expect(next.parentElement!.querySelector('svg polygon')).toBeNull()
})


it('shows Type content without a collapse control when Layers is closed, then restores the control with Layers', async () => {
  const book = { ...project, id: 'type-only-panel-project' }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="type-only-panel-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '气泡 1' }))
  await userEvent.click(screen.getByRole('button', { name: '属性' }))
  expect(screen.getByRole('button', { name: '属性' })).toHaveAttribute('aria-expanded', 'false')
  await userEvent.click(screen.getByRole('button', { name: '关闭图层面板' }))
  expect(await within(document.querySelector('.comic-type-options')!).findByRole('spinbutton', { name: '字号' })).toBeVisible()
  expect(within(document.querySelector('.comic-type-options')!).getByRole('spinbutton', { name: '字号' })).toHaveValue(16)
  expect(screen.queryByRole('button', { name: '属性' })).toBeNull()
  fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
  const layers = await screen.findByRole('menuitemcheckbox', { name: '图层' })
  expect(layers).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(layers)
  fireEvent.keyDown(layers, { key: 'Escape' })
  expect(await screen.findByRole('button', { name: '关闭图层面板' })).toBeVisible()
  expect(screen.getByRole('button', { name: '属性' })).toBeVisible()
})

it('opens Type expanded after closing a collapsed Type panel and enabling it from Window', async () => {
  const book = { ...project, id: 'reopen-collapsed-type-project' }
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="reopen-collapsed-type-project" />)
  fireEvent.click(await screen.findByRole('button', { name: '气泡 1' }))
  await userEvent.click(screen.getByRole('button', { name: '属性' }))
  await userEvent.click(screen.getByRole('button', { name: '关闭属性面板' }))
  fireEvent.keyDown(screen.getByRole('button', { name: '窗口' }), { key: 'ArrowDown' })
  const type = await screen.findByRole('menuitemcheckbox', { name: '属性' })
  expect(type).toHaveAttribute('aria-checked', 'false')
  await userEvent.click(type)
  fireEvent.keyDown(type, { key: 'Escape' })
  expect(await within(document.querySelector('.comic-type-options')!).findByRole('spinbutton', { name: '字号' })).toHaveValue(16)
  expect(screen.getByRole('button', { name: '属性' })).toHaveAttribute('aria-expanded', 'true')
})

it('does not add text to a locked artboard from the global layer tree', async () => {
  const book = { ...project, id: 'locked-board-project', pages: [{ ...project.pages[0], artboard: { x: 0, y: 0, locked: true } }] }
  const edit = vi.fn(async () => book)
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: { openProject: async () => book, image: async () => 'data:image/png;base64,AA==', edit, onChanged: () => () => {} } } as unknown as NolaBridge)
  render(<ComicTranslationPage editor projectId="locked-board-project" />)
  await selectArtboard(1)
  expect(within(document.querySelector('.comic-layer-tree__footer')!).queryByRole('button', { name: '新增气泡框' })).not.toBeInTheDocument()
  expect(edit).not.toHaveBeenCalled()
})
