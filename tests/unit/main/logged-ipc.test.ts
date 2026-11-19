import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle } }))
import { configureIpcSenderValidation, drainLoggedIpc, loggedHandle } from '../../../src/main/logged-ipc'
import { initializeSessionLog, sessionLogPath } from '../../../src/main/session-log'
import { restoreIpcError } from '../../../src/shared/ipc-error'
import { backendFailure } from '../../../src/main/backend-error'

afterEach(() => { handle.mockClear() })

it('waits for an admitted write to finish before allowing an offline snapshot', async () => {
  configureIpcSenderValidation(() => {})
  let release!: () => void
  loggedHandle('app:update-settings', () => new Promise<void>(resolve => { release = resolve }))
  const invocation = handle.mock.calls.at(-1)![1]({ sender: { id: 7 } }, {})
  let idle = false
  const drained = drainLoggedIpc().then(() => { idle = true })
  await Promise.resolve()
  expect(idle).toBe(false)
  release()
  await invocation; await drained
  expect(idle).toBe(true)
})

it.each(['realtimeGlossarySavedSyncFailed', 'REALTIMEGLOSSARYSAVEDSYNCFAILED'])('preserves retryable MT-026 for a committed glossary write reported as %s', async reason => {
  configureIpcSenderValidation(() => {})
  loggedHandle('glossary:command', async () => { throw new Error(reason) })
  const invoke = handle.mock.calls.at(-1)![1]
  const error = await invoke({ sender: { id: 7 } }, {}).catch((failure: Error) =>
    restoreIpcError(new Error(`Error invoking remote method 'glossary:command': Error: ${failure.message}`)))
  expect(error).toMatchObject({ message: reason, code: reason, supportCode: 'MT-026',
    retryable: true, correlationId: expect.any(String) })
})

it('keeps the same backend correlation ID in the IPC failure and renderer error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-ipc-correlation-'))
  try {
    await initializeSessionLog(directory, {})
    configureIpcSenderValidation(() => {})
    loggedHandle('test:start', () => {
      throw backendFailure({ code: 'MODEL_NOT_READY', stage: 'vad', scope: 'session', retryable: false,
        fatal: false, message_key: 'gateway.LOAD_FAILED', correlation_id: 'backend-correlation' })
    })
    const invoke = handle.mock.calls.at(-1)![1]
    const failure = await invoke({ sender: { id: 7 } }).catch((error: Error) =>
      restoreIpcError(Object.freeze(new Error(error.message))))
    expect(failure).toMatchObject({ message: 'vadUnavailable', supportCode: 'ASR-009', correlationId: 'backend-correlation' })
    const log = await readFile(sessionLogPath(), 'utf8')
    expect(JSON.parse(log.trim().split('\n').at(-1)!).data).toMatchObject({
      correlationId: 'backend-correlation',
      error: { correlationId: 'backend-correlation', backendCode: 'MODEL_NOT_READY', stage: 'vad' },
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('records glossary and game operations without persisting their source, translation or import payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-private-ipc-'))
  try {
    await initializeSessionLog(directory, {})
    configureIpcSenderValidation(() => {})
    for (const channel of ['glossary:command', 'glossary:snapshot', 'game:command', 'game:snapshot', 'meeting:read', 'meeting:get', 'meeting:list', 'desktop-data:backup', 'desktop-data:restore']) {
      const result = { source: 'private-original', target: 'private-translation', name: 'private-library' }
      loggedHandle(channel, async () => result)
      const listener = handle.mock.calls.at(-1)![1]
      expect(await listener({ sender: { id: 7 } }, { csv: 'private-import' })).toEqual(result)
    }
    const contents = await readFile(sessionLogPath(), 'utf8')
    expect(contents).toContain('glossary:command')
    expect(contents).toContain('game:snapshot')
    expect(contents).toContain('durationMs')
    for (const value of ['private-original', 'private-translation', 'private-library', 'private-import']) expect(contents).not.toContain(value)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
