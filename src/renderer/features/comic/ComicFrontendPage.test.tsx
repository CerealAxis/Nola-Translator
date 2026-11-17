import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { ComicFrontendPage } from './ComicFrontendPage'
import { createComicTestBridge } from './comic-test-fixture'
vi.mock('./ComicTranslationPage', () => ({
  ComicTranslationPage: ({ onQuick }: { onQuick: () => void }) => (
    <button onClick={onQuick}>快速翻译</button>
  ),
}))
vi.mock('./ComicTranslationWorkspace', () => ({
  ComicTranslationWorkspace: () => null,
}))
afterEach(() => {
  cleanup()
  location.hash = ''
  vi.restoreAllMocks()
})
it('uploads chosen bytes through the bridge', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  render(<ComicFrontendPage />)
  fireEvent.click(screen.getByRole('button', { name: '快速翻译' }))
  const file = new File(['%PDF'], 'chosen.pdf', { type: 'application/pdf' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode('%PDF').buffer,
  })
  fireEvent.drop(screen.getByRole('button', { name: '选择或拖入漫画文件' }), {
    dataTransfer: { files: [file] },
  })
  await waitFor(() => expect(fixture.api.importProject).toHaveBeenCalledOnce())
  const request = vi.mocked(fixture.api.importProject).mock.calls[0][0]
  expect(request.projectId).toBe(fixture.book().id)
  expect(request.files?.[0].name).toBe('chosen.pdf')
  expect(Array.from(request.files?.[0].data ?? [])).toEqual([37, 80, 68, 70])
  expect(location.hash).toBe(`#/comic-translation/${fixture.book().id}`)
})
it('closes an untouched upload dialog without creating a workspace', async () => {
  const fixture = createComicTestBridge()
  vi.spyOn(store, 'getBridge').mockReturnValue({
    comic: fixture.api,
  } as unknown as NolaBridge)
  render(<ComicFrontendPage />)
  fireEvent.click(screen.getByRole('button', { name: '快速翻译' }))
  await userEvent.keyboard('{Escape}')
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  expect(fixture.api.openQuickWorkspace).not.toHaveBeenCalled()
})
