import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SecureCredentialStore } from '../../../src/main/secure-store'

describe('SecureCredentialStore', () => {
  it('只把加密后的密钥写入磁盘', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    const path = join(directory, 'credentials.json')
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
      decryptString: (value: Buffer) => value.toString().replace('encrypted:', ''),
    }
    const store = new SecureCredentialStore(path, encryption)
    await store.set('openai', 'private-key')
    expect(await store.get('openai')).toBe('private-key')
    expect(await store.has('openai')).toBe(true)
    expect(await readFile(path, 'utf8')).not.toContain('private-key')
  })
})
