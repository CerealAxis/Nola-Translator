import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

/**
 * New key -> legacy key, the direction both `read()`'s aliasing and `secretKeyCluster` walk.
 * Kept as a table so the same lookup can also drive a whole-group delete: clearing a secret has
 * to drop its legacy key too (see `dropSecrets`).
 */
const LEGACY_SECRET_KEYS: Record<string, string> = { cloud: 'openai' }

/**
 * One secret can occupy both a new and a legacy key in the file, because `read()` patches the
 * alias in memory. Clear and prune have to take the whole group: leave the legacy key behind and
 * `read()` puts the alias straight back, so the stale-ciphertext drop in `get()` never sticks.
 */
function secretKeyCluster(key: string): string[] {
  const cluster = [key]
  const legacy = LEGACY_SECRET_KEYS[key]
  if (legacy) cluster.push(legacy)
  for (const [current, previous] of Object.entries(LEGACY_SECRET_KEYS)) {
    if (previous === key) cluster.push(current)
  }
  return cluster
}

function dropSecrets(values: StoredSecrets, key: string): void {
  for (const name of secretKeyCluster(key)) delete values[name]
}

/**
 * The ciphertext is there but no longer decrypts. On Windows safeStorage is DPAPI, keyed to the
 * logon credential rather than to the app path, so another user, another machine, or a restored
 * profile cannot read it — and `get()` has already deleted the ciphertext by the time this throws.
 */
export class StaleCredentialError extends Error {
  constructor(public readonly provider: string) {
    super('已保存的 API 密钥无法解密，它可能是在其他用户、其他电脑或更早的版本中保存的。请在“翻译”页面重新输入密钥。')
    this.name = 'StaleCredentialError'
  }
}

export class SecureCredentialStore {
  constructor(private readonly path: string, private readonly encryption: EncryptionAdapter) {}

  async has(key: string): Promise<boolean> {
    try {
      return Boolean(await this.get(key))
    } catch {
      // get() drops every key it cannot decrypt, so to the caller it is simply absent.
      return false
    }
  }

  async get(key: string): Promise<string> {
    const values = await this.read()
    const stored = values[key]
    if (!stored) return ''
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows 凭据加密当前不可用')
    try {
      return this.encryption.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      // The ciphertext is unrecoverable, so it is deleted rather than left to fail every read.
      await this.remove(key)
      throw new StaleCredentialError(key)
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows 凭据加密当前不可用')
    const values = await this.read()
    if (value) values[key] = this.encryption.encryptString(value).toString('base64')
    else dropSecrets(values, key)
    await this.write(values)
  }

  async remove(key: string): Promise<void> {
    const values = await this.read()
    if (!secretKeyCluster(key).some((name) => name in values)) return
    dropSecrets(values, key)
    await this.write(values)
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
      // Legacy aliases are patched in memory on read and never written back: a failed write would
      // lose the user's key, and a read-only alias costs at most one more attempt. New key wins.
      for (const [key, legacy] of Object.entries(LEGACY_SECRET_KEYS)) {
        if (!values[key] && values[legacy]) values[key] = values[legacy]
      }
      return values
    } catch {
      return {}
    }
  }
}
