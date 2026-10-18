import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { OfflineTaskProgress } from './OfflineTaskProgress'

afterEach(cleanup)

it('shows archive bytes while ZIP entries are streamed', () => {
  render(<OfflineTaskProgress task={{ state: 'running', phase: 'pack', unit: 'bytes', current: 1024 ** 3, total: 2 * 1024 ** 3 }} workflow="bundle-prepare" />)
  expect(screen.getByText('1.00 GB / 2.00 GB')).toBeInTheDocument()
})

it('shows indeterminate progress before the file total is known', () => {
  render(<OfflineTaskProgress task={{ state: 'running', phase: 'check', current: 0, total: 0 }} workflow="model-import" />)
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  expect(screen.queryByText('0 / 0')).not.toBeInTheDocument()
  expect(screen.getByText('0 / 2 步已完成')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step')
})

it('keeps byte progress local to copying and marks the check complete', () => {
  render(<OfflineTaskProgress task={{ state: 'running', phase: 'copy', current: 1024 ** 3, total: 2 * 1024 ** 3 }} workflow="model-import" />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0.5')
  expect(screen.getByText('1.00 GB / 2.00 GB')).toBeInTheDocument()
  expect(screen.getByText('1 / 2 步已完成')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('data-state', 'completed')
})

it('finishes every step and stops progress animation on completion', () => {
  render(<OfflineTaskProgress task={{ state: 'completed', phase: 'copy', current: 1, total: 1 }} workflow="model-import" />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
  expect(screen.getByText('2 / 2 步已完成')).toBeInTheDocument()
  expect(screen.getAllByRole('listitem').every(item => item.dataset.state === 'completed')).toBe(true)
})

it('preserves the failed stage without marking future steps complete', () => {
  render(<OfflineTaskProgress task={{ state: 'failed', phase: 'download', current: 0, total: 0, issue: 'missingFiles' }} workflow="model-download" />)
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  expect(screen.getAllByRole('listitem').map(item => item.dataset.state)).toEqual(['completed', 'failed', 'pending'])
  expect(screen.getByRole('alert')).toHaveTextContent('缺少必要文件')
})
