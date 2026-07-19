import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SettingsStore } from '../../../src/main/settings-store'

describe('设置存储', () => {
  it('损坏文件恢复默认值并原子保存更新', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluentcaptions-settings-'))
    const path = join(directory, 'settings.json')
    try {
      await writeFile(path, '{broken', 'utf8')
      const store = new SettingsStore(path)
      expect((await store.load()).overlay.mode).toBe('bottom')
      const updated = await store.update({ historyEnabled: true })
      expect(updated.historyEnabled).toBe(true)
      expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
