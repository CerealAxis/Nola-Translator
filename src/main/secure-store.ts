import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

/**
 * 密文存在但解不开：safeStorage 的密钥绑定在应用身份与系统账号上，换电脑、
 * 换 Windows 用户、改 productName 或 Electron 版本升级都可能让旧密文失效。
 * 密钥无法找回，只能让用户重新输入一次。
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
      // 解不开的密钥在 get() 里已被剔除；对调用方来说它就是不存在。
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
      // 留着这条密文只会让每次启动会话都失败；清掉后下次按「未保存」处理。
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
