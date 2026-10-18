import { act, cleanup, render } from '@testing-library/react'
import { toast } from '@heroui/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { ModelDownloadNotice } from './ModelDownloadNotice'

const initial = stores.models.getState()
afterEach(() => { cleanup(); stores.models.setState(initial); vi.restoreAllMocks() })

const record: ResourceRecord = {
  resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
  name: 'Index-Translate 2B', description: '', languages: [], installed: false,
  installedBytes: 0, downloadBytes: 1312164352, state: 'running', phase: 'download', cancellable: true,
}

it('notifies once on completion and failure, but never on acceptance or cancellation', () => {
  const success = vi.spyOn(toast, 'success').mockImplementation(() => '')
  const danger = vi.spyOn(toast, 'danger').mockImplementation(() => '')
  stores.models.setState({ resources: [] })
  render(<ModelDownloadNotice />)
  const publish = (resource: ResourceRecord) => act(() => { stores.models.setState({ resources: [resource] }) })
  publish(record)
  expect(success).not.toHaveBeenCalled()
  publish({ ...record, state: 'failed', cancellable: false })
  publish({ ...record, state: 'failed', cancellable: false })
  expect(danger).toHaveBeenCalledTimes(1)
  expect(danger).toHaveBeenCalledWith(expect.stringContaining(record.name), expect.objectContaining({
    actionProps: expect.objectContaining({ children: '重试下载', onPress: expect.any(Function) }),
  }))
  const retry = danger.mock.calls[0]?.[1]?.actionProps?.onPress
  const manageResource = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(record)
  act(() => retry?.({} as never))
  expect(manageResource).toHaveBeenCalledWith(record.resourceId, 'install')
  publish(record)
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  expect(success).toHaveBeenCalledTimes(1)
  expect(success).toHaveBeenCalledWith(expect.stringContaining(record.name))
  publish(record)
  publish({ ...record, state: 'cancelling', phase: 'cleanup' })
  publish({ ...record, state: 'idle', cancellable: false })
  expect(success).toHaveBeenCalledTimes(1)
  expect(danger).toHaveBeenCalledTimes(1)
})

it('does not announce failed tasks already present when the app opens', () => {
  const danger = vi.spyOn(toast, 'danger').mockImplementation(() => '')
  stores.models.setState({ resources: [{ ...record, state: 'failed' }] })
  render(<ModelDownloadNotice />)
  expect(danger).not.toHaveBeenCalled()
})
