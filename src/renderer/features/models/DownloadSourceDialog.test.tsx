import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { DownloadSourceDialog } from './DownloadSourceDialog'

afterEach(cleanup)

it('shows the model and all available sources as tabs and waits for confirmation', () => {
  const onSelect = vi.fn()
  render(<DownloadSourceDialog record={{ resourceId: 'index-translate-2b-q4-k-m', name: 'Index-Translate 2B' }} onClose={vi.fn()} onSelect={onSelect} />)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Index-Translate 2B')).toBeInTheDocument()
  const options = within(dialog).getAllByRole('tab')
  expect(options).toHaveLength(3)
  fireEvent.click(options[0])
  expect(onSelect).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: '重试' }))
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('huggingface')
})

it('omits unavailable sources and keeps the close action separate', () => {
  const onClose = vi.fn()
  const onSelect = vi.fn()
  render(<DownloadSourceDialog record={{ resourceId: 'hub:owner/model', name: 'Custom model' }} onClose={onClose} onSelect={onSelect} />)
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(screen.queryByText('ModelScope')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  expect(onClose).toHaveBeenCalledOnce()
  expect(onSelect).not.toHaveBeenCalled()
})

it('renders no overlay without a target', () => {
  render(<DownloadSourceDialog record={null} onClose={vi.fn()} onSelect={vi.fn()} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('supports keyboard source selection without starting a download', async () => {
  const user = userEvent.setup()
  const onSelect = vi.fn()
  render(<DownloadSourceDialog record={{ resourceId: 'index-translate-2b-q4-k-m', name: 'Index-Translate 2B' }} onClose={vi.fn()} onSelect={onSelect} />)
  const official = screen.getByRole('tab', { name: 'Hugging Face' })
  const mirror = screen.getByRole('tab', { name: 'HF-Mirror 镜像站' })
  await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  official.focus()
  await user.keyboard('{ArrowRight}')
  await waitFor(() => expect(mirror).toHaveFocus())
  await user.keyboard('{Enter}')
  expect(mirror).toHaveAttribute('aria-selected', 'true')
  expect(onSelect).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('hf-mirror')
})
