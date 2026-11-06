import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle } }))
import { configureIpcSenderValidation, drainLoggedIpc, loggedHandle } from '../../../src/main/logged-ipc'
import { initializeSessionLog, sessionLogPath } from '../../../src/main/session-log'

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
  await expect(invoke({ sender: { id: 7 } }, {})).rejects.toMatchObject({
    message: reason, code: reason, supportCode: 'MT-026', retryable: true, correlationId: expect.any(String),
  })
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
