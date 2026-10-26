import { beforeEach, expect, it, vi } from 'vitest'
const { handle, log } = vi.hoisted(() => ({ handle: vi.fn(), log: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle } }))
vi.mock('../../../src/main/session-log', () => ({ logDiagnostic: log }))
import { configureIpcSenderValidation, loggedHandle } from '../../../src/main/logged-ipc'
import { isSessionAlreadyRunningError } from '../../../src/shared/ipc-error'
import { featureConflictOwner } from '../../../src/shared/feature-activity'

beforeEach(() => { handle.mockClear(); log.mockClear(); configureIpcSenderValidation(() => undefined) })

it('rejects untrusted senders before invoking the operation', async () => {
  configureIpcSenderValidation(() => { throw new Error('Access denied') })
  const operation = vi.fn()
  loggedHandle('meeting:delete', operation)
  await expect(handle.mock.calls[0][1]({ sender: { id: 1 } }, '../outside')).rejects.toThrow()
  expect(operation).not.toHaveBeenCalled()
})

it('preserves the conflict owner across normalized IPC so the renderer can offer a switch', async () => {
  loggedHandle('model-gateway:start', async () => { throw new Error('FEATURE_CONFLICT:workbench') })
  const handler = handle.mock.calls[0][1]
  await expect(handler({ sender: { id: 1 } })).rejects.toThrow('FEATURE_CONFLICT:workbench')
  expect(log).toHaveBeenCalledWith('ipc.failed', expect.objectContaining({ channel: 'model-gateway:start' }))
})

it('keeps conflicts recoverable without classifying them as an engine failure', () => {
  const error = new Error("Error invoking remote method 'engine:start-session': Error: FEATURE_CONFLICT:model-gateway")
  expect(featureConflictOwner(error)).toBe('model-gateway')
  expect(isSessionAlreadyRunningError(error)).toBe(true)
  expect(featureConflictOwner(new Error('unsupportedFeature'))).toBeUndefined()
})
