import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

export class SecureCredentialStore {
  constructor(private readonly path: string, private readonly encryption: EncryptionAdapter) {}

  async has(key: string): Promise<boolean> {
    const values = await this.read()
    return Boolean(values[key])
  }

  async get(key: string): Promise<string> {
    const values = await this.read()
    if (!values[key]) return ''
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows 凭据加密当前不可用')
    return this.encryption.decryptString(Buffer.from(values[key], 'base64'))
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.encryption.isEncryptionAvailable()) throw new Error('Windows 凭据加密当前不可用')
    const values = await this.read()
    if (value) values[key] = this.encryption.encryptString(value).toString('base64')
    else delete values[key]
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
