import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { NolaBridge } from '@/bridge'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as store from '@/store'
import { ComicTranslationPage } from './ComicTranslationPage'
import { createComicTestBridge } from './comic-test-fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('preserves the page frame from project loading through image loading and retry', async () => {
  const { api, book } = createComicTestBridge(1)
  const project = book()
  let openProject!: (value: typeof project) => void
  vi.mocked(api.openProject).mockImplementation(
    () => new Promise((resolve) => { openProject = resolve }),
  )
  vi.spyOn(store, 'getBridge').mockReturnValue({ comic: api } as unknown as NolaBridge)
  render(<TooltipProvider><ComicTranslationPage api={api} projectId={project.id} /></TooltipProvider>)

  expect(screen.getByRole('status', { name: '加载中' }).querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
  await act(async () => openProject(project))

  const frame = screen.getByRole('region', { name: '漫画画布' }).querySelector('[data-page-id]')!
  const image = frame.querySelector('img')!
  const presentation = image.parentElement!
  expect(frame).toHaveStyle({ aspectRatio: '600 / 850' })
  expect(presentation).toHaveAttribute('aria-busy', 'true')
  expect(presentation.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()

  fireEvent.error(image)
  fireEvent.click(within(presentation).getByRole('button', { name: '重试' }))
  expect(presentation).toHaveAttribute('aria-busy', 'true')
  const freshImage = await within(presentation).findByRole('img')
  fireEvent.load(freshImage)
  expect(presentation).toHaveAttribute('data-state', 'ready')
  expect(presentation).not.toHaveAttribute('aria-busy')
  expect(api.image).toHaveBeenCalledTimes(2)
})

it('uses placeholders for the bookshelf and each cover until its image is ready', async () => {
  const { api, book } = createComicTestBridge(1)
  render(<TooltipProvider><ComicTranslationPage api={api} /></TooltipProvider>)
  expect(screen.getByRole('status', { name: '加载中' }).querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(1)
  const cover = await screen.findByRole('link', { name: book().title })
  const image = await within(cover).findByRole('img')
  expect(image.parentElement).toHaveAttribute('aria-busy', 'true')
  fireEvent.load(image)
  expect(image.parentElement).toHaveAttribute('data-state', 'ready')
})
