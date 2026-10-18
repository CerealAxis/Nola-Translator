import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DownloadSourceDialog } from './DownloadSourceDialog'

afterEach(cleanup)

it('shows the model and all available sources as actions', () => {
  const onSelect = vi.fn()
  render(<DownloadSourceDialog record={{ resourceId: 'index-translate-2b-q4-k-m', name: 'Index-Translate 2B' }} onClose={vi.fn()} onSelect={onSelect} />)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Index-Translate 2B')).toBeInTheDocument()
  const options = within(dialog).getAllByRole('option')
  expect(options).toHaveLength(3)
  fireEvent.click(options[0])
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('huggingface')
})

it('omits unavailable sources and keeps the close action separate', () => {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(<DownloadSourceDialog record={{ resourceId: 'hub:owner/model', name: 'Custom model' }} onClose={onClose} onSelect={onSelect} />)
  expect(screen.getAllByRole('option')).toHaveLength(2)
  expect(screen.queryByText('ModelScope')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

it('renders no overlay without a target', () => {
  render(<DownloadSourceDialog record={null} onClose={vi.fn()} onSelect={vi.fn()} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('exposes source descriptions and shows tooltips during keyboard navigation', async () => {
  const user = userEvent.setup()
  render(<DownloadSourceDialog record={{ resourceId: 'index-translate-2b-q4-k-m', name: 'Index-Translate 2B' }} onClose={vi.fn()} onSelect={vi.fn()} />)
  const official = screen.getByRole('option', { name: 'Hugging Face' })
  const mirror = screen.getByRole('option', { name: 'HF-Mirror 镜像站' })
  expect(official).toHaveAccessibleDescription('直接从 Hugging Face 官方站下载。')
  expect(mirror).toHaveAccessibleDescription('通过 Hugging Face 镜像站下载。')
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  await user.tab()
  await user.tab()
  await user.keyboard('{Home}')
  await waitFor(() => expect(official).toHaveFocus())
  expect(await screen.findByRole('tooltip', { hidden: true })).toHaveTextContent('直接从 Hugging Face 官方站下载。')
  await user.keyboard('{ArrowDown}')
  await waitFor(() => expect(mirror).toHaveFocus())
  await waitFor(() => expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent('通过 Hugging Face 镜像站下载。'))
})

it('still opens the description when hovering over the source name', async () => {
  const user = userEvent.setup()
  render(<DownloadSourceDialog record={{ resourceId: 'hub:owner/model', name: 'Custom model' }} onClose={vi.fn()} onSelect={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  await user.click(screen.getByText('Custom model'))
  await user.hover(screen.getByText('HF-Mirror 镜像站').closest('[data-slot=tooltip-trigger]')!)
  expect(await screen.findByRole('tooltip', { hidden: true })).toHaveTextContent('通过 Hugging Face 镜像站下载。')
})
