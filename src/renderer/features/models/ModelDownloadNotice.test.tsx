import { act, cleanup, render } from '@testing-library/react'
import * as toastQueue from '@/components/ui/toast'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { NOTIFY_DURATION } from '@/components/primitives/notify'
import { ModelDownloadNotice } from './ModelDownloadNotice'

const initial = stores.models.getState()
afterEach(() => { cleanup(); stores.models.setState(initial); window.history.replaceState({}, '', '/'); vi.restoreAllMocks() })

const record: ResourceRecord = {
  resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
  name: 'Index-Translate 2B', description: '', languages: [], installed: false,
  installedBytes: 0, downloadBytes: 1312164352, state: 'running', phase: 'download', cancellable: true,
}

it('notifies on completion, failure with a reason, and cancellation', () => {
  const showToast = vi.spyOn(toastQueue, 'showToast').mockImplementation(() => '')
  stores.models.setState({ resources: [] })
  render(<ModelDownloadNotice />)
  const publish = (resource: ResourceRecord) => act(() => { stores.models.setState({ resources: [resource] }) })
  publish(record)
  expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  showToast.mockClear()
  publish({ ...record, state: 'failed', errorCode: 'networkUnavailable', cancellable: false })
  publish({ ...record, state: 'failed', errorCode: 'networkUnavailable', cancellable: false })
  const failureCalls = () => showToast.mock.calls.filter(([payload]) => payload.type === 'error' && 'actionProps' in payload)
  expect(failureCalls()).toHaveLength(1)
  expect(failureCalls()[0]?.[0]).toEqual(expect.objectContaining({
    title: expect.stringContaining(record.name),
    description: expect.stringContaining('网络连接失败'),
    actionProps: expect.objectContaining({ children: '重试下载', onClick: expect.any(Function) }),
    duration: NOTIFY_DURATION.retryable,
    type: 'error',
  }))
  const failurePayload = failureCalls()[0]?.[0]
  const retry = failurePayload && 'actionProps' in failurePayload ? failurePayload.actionProps.onClick : undefined
  const manageResource = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(record)
  act(() => retry?.())
  expect(manageResource).toHaveBeenCalledWith(record.resourceId, 'install')
  publish(record)
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  const successCalls = () => showToast.mock.calls.filter(([payload]) => payload.type === 'success')
  expect(successCalls()).toHaveLength(1)
  expect(successCalls()[0]?.[0].description).toContain(record.name)
  expect(successCalls()[0]?.[0]).toEqual(expect.objectContaining({ duration: NOTIFY_DURATION.success, type: 'success' }))
  publish(record)
  publish({ ...record, state: 'cancelling', phase: 'cleanup' })
  publish({ ...record, state: 'idle', cancellable: false })
  const warningCalls = () => showToast.mock.calls.filter(([payload]) => payload.type === 'warning')
  expect(warningCalls()).toHaveLength(1)
  expect(warningCalls()[0]?.[0].description).toContain(record.name)
  expect(warningCalls()[0]?.[0]).toEqual(expect.objectContaining({ duration: NOTIFY_DURATION.warning, type: 'warning' }))
})

it('does not announce failed tasks already present when the app opens', () => {
  const showToast = vi.spyOn(toastQueue, 'showToast').mockImplementation(() => '')
  stores.models.setState({ resources: [{ ...record, state: 'failed' }] })
  render(<ModelDownloadNotice />)
  expect(showToast).not.toHaveBeenCalled()
})

it('routes disk-full download failures to storage settings', () => {
  const showToast = vi.spyOn(toastQueue, 'showToast').mockImplementation(() => '')
  stores.models.setState({ resources: [] })
  render(<ModelDownloadNotice />)
  act(() => { stores.models.setState({ resources: [record] }) })
  act(() => { stores.models.setState({ resources: [{ ...record, state: 'failed', errorCode: 'diskSpaceInsufficient' }] }) })
  const failure = showToast.mock.calls.find(([payload]) => payload.type === 'error')?.[0]
  expect(failure).toEqual(expect.objectContaining({
    title: '磁盘空间不足',
    description: '请清理存储空间后重新下载模型。',
  }))
  if (!failure || !('actionProps' in failure)) throw new Error('Expected a storage settings action')
  act(() => failure.actionProps.onClick())
  expect(window.location.hash).toBe('#/settings/storage')
})
