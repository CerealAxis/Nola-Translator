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
  it('只把加密后的密钥写入磁盘', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    const path = join(directory, 'credentials.json')
    const store = new SecureCredentialStore(path, workingEncryption)
    await store.set('openai', 'private-key')
    expect(await store.get('openai')).toBe('private-key')
    expect(await store.has('openai')).toBe(true)
    expect(await readFile(path, 'utf8')).not.toContain('private-key')
  })

  it('解不开的密文会被剔除并给出可操作的错误', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fluent-secrets-'))
    const path = join(directory, 'credentials.json')
    try {
      // After moving to another machine or Windows user, or renaming productName, old ciphertext no longer decrypts.
      await writeFile(path, JSON.stringify({ openai: Buffer.from('undecryptable').toString('base64') }), 'utf8')
      const store = new SecureCredentialStore(path, {
        ...workingEncryption,
        decryptString: () => {
          throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
        },
      })

      await expect(store.get('openai')).rejects.toBeInstanceOf(StaleCredentialError)
      expect(await store.has('openai')).toBe(false)
      // Purging matters: without it every startSession would hit the same decryption failure.
      expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({})

      // Once purged, reads treat the key as unset and return '' rather than throwing.
      expect(await store.get('openai')).toBe('')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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
