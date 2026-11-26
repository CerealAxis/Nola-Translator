import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SecureCredentialStore, StaleCredentialError } from '../../../src/main/secure-store'

const workingEncryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
  decryptString: (value: Buffer) => value.toString().replace('encrypted:', ''),
}

describe('SecureCredentialStore', () => {
  it('serializes concurrent changes without losing other provider credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-concurrent-secrets-'))
    try {
      const store = new SecureCredentialStore(join(directory, 'credentials.json'), workingEncryption)
      await Promise.all(Array.from({ length: 8 }, (_, index) => store.set(`provider-${index}`, `value-${index}`)))
      await Promise.all([store.remove('provider-0'), store.set('provider-1', 'replacement')])
      expect(await store.get('provider-0')).toBe('')
      expect(await store.get('provider-1')).toBe('replacement')
      for (let index = 2; index < 8; index++) expect(await store.get(`provider-${index}`)).toBe(`value-${index}`)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('keeps accepting writes after a failed encryption attempt', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-retry-secrets-'))
    try {
      let available = false
      const store = new SecureCredentialStore(join(directory, 'credentials.json'), {
        ...workingEncryption, isEncryptionAvailable: () => available,
      })
      await expect(store.set('provider', 'first')).rejects.toThrow()
      available = true
      await store.set('provider', 'second')
      expect(await store.get('provider')).toBe('second')
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('removes retired translator keys without decryption and preserves unrelated credentials', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-free-translators-'))
    const path = join(directory, 'credentials.json')
    try {
      await writeFile(path, JSON.stringify({ google: 'old-google', 'fallback-google': 'old-backup', microsoft: 'old-microsoft', 'mimo-tts': 'keep' }))
      const store = new SecureCredentialStore(path, { ...workingEncryption, isEncryptionAvailable: () => false })
      for (const key of ['google', 'fallback-google', 'microsoft']) await store.remove(key)
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ 'mimo-tts': 'keep' })
    } finally { await rm(directory, { recursive: true, force: true }) }
  })
  it('只把加密后的密钥写入磁盘', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    const path = join(directory, 'credentials.json')
    const store = new SecureCredentialStore(path, workingEncryption)
    await store.set('openai', 'private-key')
    expect(await store.get('openai')).toBe('private-key')
    expect(await store.has('openai')).toBe(true)
    expect(await readFile(path, 'utf8')).not.toContain('private-key')
  })

  it('preserves ciphertext byte-for-byte after decryption failure and can read it in the original context', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nola-stale-secrets-'))
    const path = join(directory, 'credentials.json')
    try {
      const original = JSON.stringify({ cloud: workingEncryption.encryptString('original-key').toString('base64'), other: 'untouched' }, null, 2)
      await writeFile(path, original)
      const store = new SecureCredentialStore(path, { ...workingEncryption, decryptString: () => { throw new Error('wrong encryption context') } })
      await expect(store.get('cloud')).rejects.toBeInstanceOf(StaleCredentialError)
      expect(await store.has('cloud')).toBe(false)
      expect(await readFile(path, 'utf8')).toBe(original)
      const restored = new SecureCredentialStore(path, workingEncryption)
      expect(await restored.get('cloud')).toBe('original-key')
      expect(await readFile(path, 'utf8')).toBe(original)
    } finally { await rm(directory, { recursive: true, force: true }) }
  })

  it('没有保存过密钥时直接返回空，不抛错', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    try {
      const store = new SecureCredentialStore(join(directory, 'credentials.json'), workingEncryption)
      expect(await store.get('openai')).toBe('')
      expect(await store.has('openai')).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('remove 删掉指定密钥但不影响其他', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    const path = join(directory, 'credentials.json')
    try {
      const store = new SecureCredentialStore(path, workingEncryption)
      await store.set('openai', 'a')
      await store.set('microsoft', 'b')
      await store.remove('openai')
      expect(await store.has('openai')).toBe(false)
      expect(await store.get('microsoft')).toBe('b')
      await store.remove('openai')
      expect(await store.get('microsoft')).toBe('b')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
