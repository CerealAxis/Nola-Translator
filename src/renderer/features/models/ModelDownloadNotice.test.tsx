import { act, cleanup, render } from '@testing-library/react'
import * as toastQueue from '@/components/ui/toast'
import { afterEach, expect, it, vi } from 'vitest'
import type { ResourceRecord } from '@/bridge'
import { actions, stores } from '@/store'
import { NOTIFY_DURATION } from '@/components/primitives/notify'
import { ModelDownloadNotice } from './ModelDownloadNotice'

const initial = stores.models.getState()
afterEach(() => { cleanup(); stores.models.setState(initial); vi.restoreAllMocks() })

const record: ResourceRecord = {
  resourceId: 'index-translate-2b-q4-k-m', kind: 'translationModel', provider: 'index-translate',
  name: 'Index-Translate 2B', description: '', languages: [], installed: false,
  installedBytes: 0, downloadBytes: 1312164352, state: 'running', phase: 'download', cancellable: true,
}

it('notifies on completion, failure with a reason, and cancellation', () => {
  const createToast = vi.spyOn(toastQueue, 'createToast').mockImplementation(() => '')
  stores.models.setState({ resources: [] })
  render(<ModelDownloadNotice />)
  const publish = (resource: ResourceRecord) => act(() => { stores.models.setState({ resources: [resource] }) })
  publish(record)
  expect(createToast).not.toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ variant: 'success' }))
  createToast.mockClear()
  publish({ ...record, state: 'failed', errorCode: 'networkUnavailable', cancellable: false })
  publish({ ...record, state: 'failed', errorCode: 'networkUnavailable', cancellable: false })
  const failureCalls = () => createToast.mock.calls.filter(([, options]) => options?.variant === 'danger')
  expect(failureCalls()).toHaveLength(1)
  expect(failureCalls()[0]?.[0]).toContain(record.name)
  expect(failureCalls()[0]?.[1]).toEqual(expect.objectContaining({
    description: expect.stringContaining('网络连接失败'),
    actionProps: expect.objectContaining({ children: '重试下载', onPress: expect.any(Function) }),
    timeout: NOTIFY_DURATION.retryable,
    variant: 'danger',
  }))
  const retry = failureCalls()[0]?.[1]?.actionProps?.onPress
  const manageResource = vi.spyOn(actions.models, 'manageResource').mockResolvedValue(record)
  act(() => retry?.())
  expect(manageResource).toHaveBeenCalledWith(record.resourceId, 'install')
  publish(record)
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  publish({ ...record, state: 'idle', installed: true, cancellable: false })
  const successCalls = () => createToast.mock.calls.filter(([, options]) => options?.variant === 'success')
  expect(successCalls()).toHaveLength(1)
  expect(successCalls()[0]?.[0]).toContain(record.name)
  expect(successCalls()[0]?.[1]).toEqual(expect.objectContaining({ timeout: NOTIFY_DURATION.success, variant: 'success' }))
  publish(record)
  publish({ ...record, state: 'cancelling', phase: 'cleanup' })
  publish({ ...record, state: 'idle', cancellable: false })
  const warningCalls = () => createToast.mock.calls.filter(([, options]) => options?.variant === 'warning')
  expect(warningCalls()).toHaveLength(1)
  expect(warningCalls()[0]?.[0]).toContain(record.name)
  expect(warningCalls()[0]?.[1]).toEqual(expect.objectContaining({ timeout: NOTIFY_DURATION.warning, variant: 'warning' }))
})

it('does not announce failed tasks already present when the app opens', () => {
  const createToast = vi.spyOn(toastQueue, 'createToast').mockImplementation(() => '')
  stores.models.setState({ resources: [{ ...record, state: 'failed' }] })
  render(<ModelDownloadNotice />)
  expect(createToast).not.toHaveBeenCalled()
})
