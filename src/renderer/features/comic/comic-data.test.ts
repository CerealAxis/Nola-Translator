import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { createComicTestBridge } from './comic-test-fixture'
import {
  failedComicPages,
  processingComicPages,
  flushComicSaves,
  discardComicSaves,
  importComicFiles,
  loadComicBook,
  parseComicPageNumbers,
  saveComicBook,
  useComicBooks,
  useComicImage,
  prefetchComicImage,
  comicRegionStyle,
  comicTextQuad,
  comicWithTextQuad,
} from './comic-data'
import * as notices from '@/components/primitives/notify'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('includes every claimed image while leaving queued and non-image jobs out', async () => {
  const { api, book } = createComicTestBridge(3)
  const project = book()
  const [first, second, third] = project.pages
  const task = await api.run({
    projectId: project.id,
    expectedRevision: project.revision,
    kind: 'normal',
    pageIds: [first.id, second.id, third.id],
  })
  expect(processingComicPages(project.id, [
    { ...task, status: 'running', activePageId: first.id },
    { ...task, status: 'pausing', activePageId: second.id },
    { ...task, status: 'running', activePageId: third.id, kind: 'ocr' },
    { ...task, status: 'queued', activePageId: third.id },
    { ...task, status: 'running', activePageId: third.id, bookId: crypto.randomUUID() },
  ])).toEqual(new Set([first.id, second.id]))
})

it('shares pending preview requests and ignores an old page resolving after navigation', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const book = fixture.book()
  let finishFirst!: (src: string) => void
  let finishSecond!: (src: string) => void
  vi.mocked(fixture.api.image)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve
        }),
    )
  const { result, rerender } = renderHook(
    ({ page }) => useComicImage(book.id, page, 'source'),
    { initialProps: { page: book.pages[0] } },
  )
  const prefetched = prefetchComicImage(book.id, book.pages[0], 'source')
  expect(fixture.api.image).toHaveBeenCalledTimes(1)
  rerender({ page: book.pages[1] })
  expect(result.current.src).toBeUndefined()
  await act(async () => {
    finishFirst('first-page')
    await prefetched
  })
  expect(result.current.src).toBeUndefined()
  await act(async () => {
    finishSecond('second-page')
  })
  await waitFor(() => expect(result.current.src).toBe('second-page'))
})
it('maps all four perspective corners and preserves the original repair geometry', () => {
  const { pages } = createComicTestBridge().book()
  const original = pages[0].regions[0]
  const before = comicTextQuad(original)
  const quad: [number, number][] = [
    [40, 35],
    [135, 55],
    [125, 155],
    [25, 135],
  ]
  const changed = comicWithTextQuad(original, quad)
  expect(changed.sourceQuad).toEqual(before)
  const style = comicRegionStyle(pages[0], changed, 600)
  const m = String(style.transform).slice(9, -1).split(',').map(Number)
  for (const [index, [x, y]] of [
    [0, 0],
    [Number(style.width), 0],
    [Number(style.width), Number(style.height)],
    [0, Number(style.height)],
  ].entries()) {
    const denominator = m[3] * x + m[7] * y + m[15]
    expect((m[0] * x + m[4] * y + m[12]) / denominator).toBeCloseTo(
      quad[index][0],
    )
    expect((m[1] * x + m[5] * y + m[13]) / denominator).toBeCloseTo(
      quad[index][1],
    )
  }
})
it('offers failed image loading retry through a Toast', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const notify = vi.spyOn(notices, 'notifyError').mockReturnValue('image-error')
  vi.mocked(fixture.api.image).mockRejectedValueOnce(new Error('imageMissing'))
  const { result } = renderHook(() =>
    useComicImage(fixture.book().id, fixture.book().pages[0], 'source'),
  )
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(notify).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      action: expect.objectContaining({ label: '重试' }),
    }),
  )
  await act(async () => {
    notify.mock.calls[0][1]?.action?.onPress()
  })
  await waitFor(() =>
    expect(result.current.src).toBe('data:image/png;base64,AA=='),
  )
})
it('flushes unsaved edits before appending imported pages and cancels an empty import', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const initial = await loadComicBook(fixture.book().id)
  const edit = vi.mocked(fixture.api.edit)
  const original = edit.getMockImplementation()!
  let release!: () => void
  edit.mockImplementationOnce(async (request) => {
    await new Promise<void>((resolve) => {
      release = resolve
    })
    return original(request)
  })
  saveComicBook({
    ...initial,
    config: { ...initial.config, rounds: initial.config.rounds === 3 ? 1 : 3 },
  })
  const file = new File(['page'], 'page.png')
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array([1, 2]).buffer,
  })
  const importing = importComicFiles([file], { projectId: initial.id })
  expect(fixture.api.importProject).not.toHaveBeenCalled()
  release()
  await importing
  expect(fixture.api.importProject).toHaveBeenCalledOnce()
  await expect(importComicFiles([])).resolves.toBeNull()
  expect(fixture.api.importProject).toHaveBeenCalledOnce()
})
it('serializes rapid changes without losing or repeating queued mutations', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const initial = await loadComicBook(fixture.book().id)
  const edit = vi.mocked(fixture.api.edit)
  const original = edit.getMockImplementation()!
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.mocked(fixture.api.edit).mockImplementationOnce(async (request) => {
    await barrier
    return original(request)
  })
  const first = { ...initial, config: { ...initial.config, rounds: 1 } }
  saveComicBook(first)
  saveComicBook({ ...first, config: { ...first.config, rounds: 3 } })
  release()
  await flushComicSaves(initial.id)
  expect(fixture.book().config.rounds).toBe(3)
  expect(edit).toHaveBeenCalledTimes(2)
  expect(edit).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ expectedRevision: 1 }),
  )
})
it('refreshes loaded documents on a global task change', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const { result } = renderHook(() => useComicBooks(fixture.book().id))
  await waitFor(() =>
    expect(result.current.some((book) => book.id === fixture.book().id)).toBe(
      true,
    ),
  )
  act(() => {
    fixture.book().title = 'Completed'
    fixture.emit({})
  })
  await waitFor(() =>
    expect(
      result.current.find((book) => book.id === fixture.book().id)?.title,
    ).toBe('Completed'),
  )
})
it('keeps failures separate by operation and validates page numbers', () => {
  const fixture = createComicTestBridge()
  const book = fixture.book(),
    page = book.pages[0].id
  const common = {
    bookId: book.id,
    pages: [page],
    progress: 100,
    createdAt: new Date().toISOString(),
  }
  expect(
    failedComicPages(book.id, [
      { ...common, id: 'a', kind: 'normal', status: 'failed' },
      { ...common, id: 'b', kind: 'repair', status: 'completed' },
    ]),
  ).toEqual([page])
  expect(parseComicPageNumbers('2, 1, 2', book.pages)).toEqual([
    book.pages[1].id,
    page,
  ])
  for (const value of ['', '0', '3', '1-a'])
    expect(() => parseComicPageNumbers(value, book.pages)).toThrow(
      'invalidPageRange',
    )
})
it('restores unsaved operations as a draft and preserves them on revision conflict', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  const book = fixture.book(),
    page = book.pages[0]
  const request = {
    projectId: book.id,
    operationId: crypto.randomUUID(),
    expectedRevision: book.revision + 2,
    command: {
      action: 'savePages',
      pages: [
        {
          id: page.id,
          regions: [{ ...page.regions[0], targetText: '未提交的草稿' }],
        },
      ],
    },
  }
  sessionStorage.setItem(
    `nola-comic-pending:${book.id}`,
    JSON.stringify([request]),
  )
  const { result } = renderHook(() => useComicBooks(book.id))
  await waitFor(() =>
    expect(
      result.current.find((item) => item.id === book.id)?.pages[0].regions[0]
        .targetText,
    ).toBe('未提交的草稿'),
  )
  await expect(flushComicSaves(book.id)).rejects.toThrow('conflict')
  expect(fixture.book().pages[0].regions[0].targetText).toBe('Translation')
  expect(
    JSON.parse(sessionStorage.getItem(`nola-comic-pending:${book.id}`)!)[0]
      .operationId,
  ).toBe(request.operationId)
  await act(async () => { await discardComicSaves(book.id) })
  expect(sessionStorage.getItem(`nola-comic-pending:${book.id}`)).toBeNull()
  const restored = result.current.find(item => item.id === book.id)!
  expect(restored.pages[0].regions[0].targetText).toBe('Translation')
  act(() => saveComicBook({ ...restored, config: { ...restored.config, rounds: 1 } }))
  await act(async () => { await flushComicSaves(book.id) })
  expect(fixture.book().config.rounds).toBe(1)
})
