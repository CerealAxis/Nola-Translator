import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MIGRATION_EXCLUDED_FILES, migrateLegacyUserData } from '../../../src/main/legacy-migration'

describe('legacy userData 迁移', () => {
  it('丢弃 credentials.json，其余文件照常搬过去', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-migration-'))
    const appData = join(root, 'appdata')
    const legacy = join(appData, 'FluentCaptions')
    const fresh = join(appData, 'Nola Translator')
    try {
      await mkdir(join(legacy, 'sub'), { recursive: true })
      await writeFile(join(legacy, 'credentials.json'), '{"openai":"stale-ciphertext"}', 'utf8')
      await writeFile(join(legacy, 'settings.json'), '{"version":1}', 'utf8')
      await writeFile(join(legacy, 'history.jsonl'), '{"segmentId":"a"}', 'utf8')
      await writeFile(join(legacy, 'sub', 'nested.json'), '{}', 'utf8')
      await mkdir(fresh, { recursive: true })
      await writeFile(join(fresh, 'settings.json'), '{"version":1,"mine":true}', 'utf8')

      await migrateLegacyUserData(appData, fresh)

      expect(MIGRATION_EXCLUDED_FILES.has('credentials.json')).toBe(true)
      // Ciphertext written under the old app identity cannot be decrypted here; carrying it over would break every startSession.
      expect(await readdir(fresh)).not.toContain('credentials.json')
      expect(await readFile(join(fresh, 'history.jsonl'), 'utf8')).toBe('{"segmentId":"a"}')
      expect(await readFile(join(legacy, 'credentials.json'), 'utf8')).toBe('{"openai":"stale-ciphertext"}')
      expect(JSON.parse(await readFile(join(fresh, 'settings.json'), 'utf8'))).toEqual({ version: 1, mine: true })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('旧目录不存在时静默跳过', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-migration-'))
    try {
      await expect(migrateLegacyUserData(join(root, 'appdata'), join(root, 'Nola Translator'))).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('目标就是旧目录时不做事', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-migration-'))
    try {
      const appData = join(root, 'appdata')
      await mkdir(join(appData, 'FluentCaptions'), { recursive: true })
      await migrateLegacyUserData(appData, join(appData, 'fluentcaptions'))
      expect(await readdir(join(appData, 'FluentCaptions'))).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
