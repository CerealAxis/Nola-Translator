import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { registerLogSecret } from './session-log'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

/** Ciphertext unreadable in this encryption context remains stored for recovery. */
export class StaleCredentialError extends Error {
  constructor(public readonly provider: string) {
    super('CREDENTIAL_DECRYPT_FAILED')
    this.name = 'StaleCredentialError'
  }
}

export class SecureCredentialStore {
  private pending: Promise<unknown> = Promise.resolve()

  constructor(private readonly path: string, private readonly encryption: EncryptionAdapter) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation)
    this.pending = result.catch(() => undefined)
    return result
  }

  async flush(): Promise<void> { await this.pending }

  async has(key: string): Promise<boolean> {
    try {
      return Boolean(await this.get(key))
    } catch {
      // An unreadable credential is unavailable, but remains stored for recovery.
      return false
    }
  }

  async get(key: string): Promise<string> {
    return this.serialize(async () => {
      const values = await this.read()
      const stored = values[key]
      if (!stored) return ''
      if (!this.encryption.isEncryptionAvailable()) throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE')
      try {
        const value = this.encryption.decryptString(Buffer.from(stored, 'base64'))
        registerLogSecret(value)
        return value
      } catch {
        throw new StaleCredentialError(key)
      }
    })
  }

  async set(key: string, value: string): Promise<void> {
    return this.serialize(async () => {
      registerLogSecret(value)
      if (!this.encryption.isEncryptionAvailable()) throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE')
      const values = await this.read()
      if (value) values[key] = this.encryption.encryptString(value).toString('base64')
      else delete values[key]
      await this.write(values)
    })
  }

  async remove(key: string): Promise<void> {
    return this.serialize(async () => {
      const values = await this.read()
      if (!(key in values)) return
      delete values[key]
      await this.write(values)
    })
  }

  private async write(values: StoredSecrets): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(values, null, 2), 'utf8')
    await rename(temporary, this.path)
  }

  private async read(): Promise<StoredSecrets> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as unknown
      // A corrupt file can parse into `null` or an array; `read()` degrades to "nothing stored"
      // rather than throwing at a caller that only asked whether a key exists.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const values = parsed as StoredSecrets
      return values
    } catch {
      return {}
    }
  }
}
