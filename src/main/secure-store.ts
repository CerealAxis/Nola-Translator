import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type EncryptionAdapter = {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

type StoredSecrets = Record<string, string>

/**
 * 旧键 → 新键。
 *
 * OpenAI 单独成一个 provider 之前，云端密钥存在 `openai` 下；现在这个密钥位归 `cloud`
 * （Ollama 也走这个位，只是通常不填）。记成一张表而不是一处 `if`，是因为清空密钥时必须
 * 连旧键一起删 —— 见 `dropSecret`。
 */
const LEGACY_SECRET_KEYS: Record<string, string> = { cloud: 'openai' }

/**
 * 一个密钥位在文件里可能占两个键：旧键和新键（别名在 `read()` 里补上）。
 *
 * 清除与剔除都必须按整组来做 —— 只删其中一个，另一个会被 `read()` 的别名补回来，
 * 于是「解不开的密文被剔除」这件事永远不生效：文件里那份密文还在，每次读都再抛一次
 * `StaleCredentialError`。
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
      // A corrupt file can parse into `null` or an array; both would throw on the first index
      // below, and `read()`'s job is to degrade to "nothing stored" rather than take down the
      // caller that was only asking whether a key exists.
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const values = parsed as StoredSecrets
      // 旧键 → 新键只在读的时候补一个别名，**不改写文件**：改写要一次成功的写盘才能落定，
      // 写失败就等于把用户的密钥弄丢了，而只读别名最坏只是下次再补一次。
      // 新键优先，所以用户换过密钥后旧密文不会盖回来。
      for (const [key, legacy] of Object.entries(LEGACY_SECRET_KEYS)) {
        if (!values[key] && values[legacy]) values[key] = values[legacy]
      }
      return values
    } catch {
      return {}
    }
  }
}
