import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { actions } from '@/store'
import type { HubModelSummary, HubSearchResult } from '@/bridge'
import { HubSearchTab } from './HubSearchTab'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

function result(name: string): HubSearchResult {
  const summary: HubModelSummary = {
    repo: `test/${name}`, resourceId: `hub:test/${name}`, author: 'test',
    formats: ['pytorch'], libraryName: 'transformers', fileCount: 2,
    hasGguf: false, installed: false,
  }
  return { query: name, models: [summary], candidates: 80, rateLimited: false }
}

it('shows metadata before README loading finishes and ignores responses from older queries', async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  const computedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = computedStyle(element, pseudo)
    if (element.classList.contains('models-grid')) {
      Object.defineProperty(style, 'gridTemplateColumns', { value: '300px 300px 300px' })
    }
    return style
  })
  const initial = deferred<HubSearchResult>()
  const older = deferred<HubSearchResult>()
  const newer = deferred<HubSearchResult>()
  const introduction = deferred<string>()
  const search = vi.spyOn(actions.models, 'searchHub').mockImplementation((query) =>
    query === 'older' ? older.promise : query === 'newer' ? newer.promise : initial.promise)
  vi.spyOn(actions.models, 'loadHubModelCard').mockReturnValue(introduction.promise)
  const { container } = render(<HubSearchTab onGoRecommended={vi.fn()} />)
  expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  expect(container.querySelectorAll('.models-card--hub').length).toBeGreaterThan(4)
  await waitFor(() => expect(search).toHaveBeenCalledWith('', 'all'))
  await act(async () => { initial.resolve(result('initial-model')) })
  expect(await screen.findByText('initial-model')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '安装' })).toBeEnabled()
  expect(container.querySelector('.models-card__description-loading')).toBeInTheDocument()
  expect(screen.queryByText(/逐个检查|当前版本能安装|判定原因/)).not.toBeInTheDocument()
  await act(async () => { introduction.resolve('The model card introduction is shown here.') })
  expect(await screen.findByText('The model card introduction is shown here.')).toBeInTheDocument()

  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'older' } })
  await waitFor(() => expect(search).toHaveBeenCalledWith('older', 'all'))
  fireEvent.change(input, { target: { value: 'newer' } })
  await waitFor(() => expect(search).toHaveBeenCalledWith('newer', 'all'))
  await act(async () => { newer.resolve(result('newer-model')) })
  expect(await screen.findByText('newer-model')).toBeInTheDocument()
  await act(async () => { older.resolve(result('older-model')) })
  expect(screen.queryByText('older-model')).not.toBeInTheDocument()
  expect(screen.getByText('newer-model')).toBeInTheDocument()

  fireEvent.click(screen.getByText('量化'))
  await waitFor(() => expect(search).toHaveBeenCalledWith('newer', 'quant'))
})
