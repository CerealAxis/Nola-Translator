import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { DownloadsTab } from './DownloadsTab'

const initial = stores.models.getState()
afterEach(() => { cleanup(); stores.models.setState(initial); vi.restoreAllMocks() })

it('keeps size numeric and offers both retry and cancel for a failed download', () => {
  const record: ResourceRecord = {
    resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
    name: 'Index-Translate 2B', description: '', languages: [], installed: false,
    installedBytes: 0, downloadBytes: 1312164352, state: 'failed', phase: 'download',
    progress: 0.25, cancellable: false, errorCode: 'networkUnavailable',
  }
  stores.models.setState({ resources: [record], error: null })
  const cancel = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(record)
  render(<DownloadsTab />)
  const row = screen.getByText(record.name).closest('tr')!
  const cells = row.querySelectorAll('td')
  expect(cells[1]).toHaveTextContent('1.2 GB')
  expect(cells[1]).not.toHaveTextContent('下载失败')
  expect(within(row).getByRole('button', { name: '重试' })).toBeEnabled()
  fireEvent.click(within(row).getByRole('button', { name: '取消任务' }))
  expect(cancel).toHaveBeenCalledWith(record.resourceId, 'cancel')
})

it('passes the chosen source when retrying a task', async () => {
  const record: ResourceRecord = {
    resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
    name: 'Index-Translate 2B', description: '', languages: [], installed: false,
    installedBytes: 0, state: 'failed', phase: 'download', cancellable: false,
  }
  stores.models.setState({ resources: [record], error: null })
  const install = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(record)
  render(<DownloadsTab />)
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  fireEvent.click(await screen.findByRole('option', { name: 'ModelScope' }))
  await waitFor(() => expect(install).toHaveBeenCalledWith(record.resourceId, 'install', 'modelscope'))
})

it('disables repeated cancellation while the engine is releasing a task', () => {
  stores.models.setState({ resources: [{
    resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
    name: 'Index-Translate 2B', description: '', languages: [], installed: false,
    installedBytes: 0, state: 'cancelling', phase: 'cleanup', cancellable: true,
  }] })
  render(<DownloadsTab />)
  expect(screen.getByText('正在取消')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '取消任务' })).toBeDisabled()
})
