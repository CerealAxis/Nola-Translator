import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { WordRulesStore } from '../../../src/main/word-rules-store'

it('persists atomic writes, replays operation IDs and rejects stale writes after reload', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'nola-word-rules-'))
  try {
    const path = join(folder, 'rules.json'),
      store = new WordRulesStore(path)
    const command = {
      operationId: crypto.randomUUID(),
      expectedRevision: 0,
      command: { action: 'setEnabled' as const, kind: 'mask' as const, enabled: false },
    }
    expect(await store.command(command)).toMatchObject({ revision: 1, maskEnabled: false })
    expect(await store.command(command)).toMatchObject({ revision: 1 })
    const reopened = new WordRulesStore(path)
    expect(await reopened.snapshot()).toMatchObject({ revision: 1, maskEnabled: false })
    await expect(
      reopened.command({ ...command, operationId: crypto.randomUUID() }),
    ).rejects.toThrow('conflict')
    expect(JSON.parse(await readFile(path, 'utf8')).document.revision).toBe(1)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
