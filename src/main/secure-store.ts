import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

/**
 * The ciphertext is there but no longer decrypts: safeStorage binds its key to
 * the app identity and the OS account, so a new machine, a different Windows
 * user, a renamed productName, or an Electron upgrade can all invalidate it.
 * The key is unrecoverable, so the secret has to be entered again.
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
      // Keeping the ciphertext would fail every later session start; dropping it makes the next read treat the key as unset.
      await this.remove(key)
      throw new StaleCredentialError(key)
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows 凭据加密当前不可用')
    const values = await this.read()
    if (value) values[key] = this.encryption.encryptString(value).toString('base64')
    else delete values[key]
    await this.write(values)
  }

  async remove(key: string): Promise<void> {
    const values = await this.read()
    if (!(key in values)) return
    delete values[key]
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
      return JSON.parse(await readFile(this.path, 'utf8')) as StoredSecrets
    } catch {
      return {}
    }
  }
}
