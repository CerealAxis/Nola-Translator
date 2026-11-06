import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as store from '@/store'
import type { NolaBridge } from '@/bridge'
import { NativeComicSelector } from './NativeComicSelector'

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
it('does not authorize a comic until the user selects a real listed book', async () => {
  const onChange = vi.fn()
  const listComics = vi.fn(async () => [{ id: 'book-id', title: 'Imported comic', pageCount: 12, chapterCount: 1, revision: 1, updatedAt: '' }])
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { listComics } } as unknown as NolaBridge)
  render(<div data-testid="native-composer"><NativeComicSelector value={null} disabled={false} onChange={onChange} /></div>)
  expect(listComics).not.toHaveBeenCalled()
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '漫画只读上下文' }))
  fireEvent.click(await screen.findByRole('button', { name: /Imported comic/ }))
  expect(onChange).toHaveBeenCalledExactlyOnceWith('book-id')
})
it('lets the user revoke the selected comic without exposing another book', async () => {
  const onChange = vi.fn()
  vi.spyOn(store, 'getBridge').mockReturnValue({ app: { listComics: async () => [] } } as unknown as NolaBridge)
  render(<div data-testid="native-composer"><NativeComicSelector value="book-id" disabled={true} onChange={onChange} /></div>)
  fireEvent.click(screen.getByRole('button', { name: '漫画只读上下文' }))
  fireEvent.click(await screen.findByRole('button', { name: '不关联漫画' }))
  await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith(null))
})
