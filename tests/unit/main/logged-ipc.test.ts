import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const { handle } = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle } }))
import { configureIpcSenderValidation, loggedHandle } from '../../../src/main/logged-ipc'
import { initializeSessionLog, sessionLogPath } from '../../../src/main/session-log'

afterEach(() => { handle.mockClear() })

it('records glossary and game operations without persisting their source, translation or import payloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nola-private-ipc-'))
  try {
    await initializeSessionLog(directory, {})
    configureIpcSenderValidation(() => {})
    for (const channel of ['glossary:command', 'glossary:snapshot', 'game:command', 'game:snapshot']) {
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
