import { createHash, randomBytes, randomUUID, scrypt as derive, createCipheriv, createDecipheriv } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'
import { DESKTOP_DATA_ENTRIES, type DesktopBackupOptions, type DesktopDataResult, type DesktopDataSnapshot } from '../shared/desktop-data'
import type { EncryptionAdapter } from './secure-store'
import { freeBytesForDirectory } from './disk-usage'

const scrypt = promisify(derive)
const manifestSchema = z.object({ version: z.literal(1), createdAt: z.string(), applicationVersion: z.string(),
  files: z.array(z.object({ path: z.string().min(1).max(4096), size: z.number().int().nonnegative(), hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).max(200_000),
  credentials: z.boolean() }).strict()
const vaultSchema = z.object({ salt: z.string().length(32), iv: z.string().length(24), tag: z.string().length(32), data: z.string().max(4_000_000) }).strict()
const STATE = 'desktop-data-state.json'
const resultSchema = z.object({ action: z.enum(['backup', 'restore']), state: z.enum(['completed', 'failed']), path: z.string().optional(), error: z.string().optional(), at: z.string() }).strict()

// Keep synchronous SQLite page checks off the Electron main thread.
async function sqliteSnapshot(source: string, destination?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let failure = 'DATA_BACKUP_INVALID'
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { DatabaseSync, backup } = require('node:sqlite');
      (async () => {
        const database = new DatabaseSync(workerData.source, { readOnly: true });
        try {
          const result = database.prepare('PRAGMA quick_check').all();
          if (result.length !== 1 || Object.values(result[0])[0] !== 'ok') throw new Error('DATA_BACKUP_INVALID');
          if (workerData.destination) await backup(database, workerData.destination);
        } finally { database.close(); }
      })().catch(error => { parentPort.postMessage({ code: error.code, sqliteCode: error.errcode }); process.exitCode = 1; });
    `, { eval: true, workerData: { source, destination } })
    worker.once('message', (error: { code?: string; sqliteCode?: number }) => {
      if (error.sqliteCode === 13 || error.code === 'ENOSPC') failure = 'DISK_SPACE_INSUFFICIENT'
      else if ([8, 14].includes(error.sqliteCode ?? 0) || ['EACCES', 'EPERM'].includes(error.code ?? '')) failure = 'FILE_NOT_ACCESSIBLE'
      else if ([5, 6].includes(error.sqliteCode ?? 0)) failure = 'DATA_OPERATION_BUSY'
    })
    worker.once('error', reject)
    worker.once('exit', code => code === 0 ? resolve() : reject(new Error(failure)))
  })
}

function inside(parent: string, child: string): boolean {
  const value = relative(resolve(parent), resolve(child))
  return !value || (value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value))
}

async function hash(path: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}

async function json(path: string, limit: number): Promise<unknown> {
  if ((await stat(path)).size > limit) throw new Error('DATA_BACKUP_INVALID')
  try { return JSON.parse(await readFile(path, 'utf8')) } catch (error) { if (error instanceof SyntaxError) throw new Error('DATA_BACKUP_INVALID'); throw error }
}

async function files(root: string, prefix = ''): Promise<Array<{ path: string; size: number }>> {
  const info = await lstat(root)
  if (info.isSymbolicLink()) throw new Error('DATA_LINK_UNSUPPORTED')
  if (info.isFile()) return [{ path: prefix, size: info.size }]
  if (!info.isDirectory()) throw new Error('DATA_LINK_UNSUPPORTED')
  const result: Array<{ path: string; size: number }> = []
  for (const entry of await readdir(root)) result.push(...await files(join(root, entry), prefix ? `${prefix}/${entry}` : entry))
  return result
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}

async function durableJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  const handle = await open(temporary, 'wx', 0o600)
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync() } finally { await handle.close() }
  try { await rename(temporary, path) } finally { await rm(temporary, { force: true }) }
}

/** Coordinates desktop data. Snapshot operations run only after all domain writers have stopped. */
export class DesktopDataManager {
  private operation?: () => Promise<void>
  private executing = false
  private action: 'backup' | 'restore' = 'backup'
  constructor(readonly root: string, private readonly encryption: EncryptionAdapter, private readonly version: string,
    private readonly modelRoot: () => string = () => root) {
    if (!isAbsolute(root)) throw new Error('DATA_BACKUP_LOCATION')
  }

  async snapshot(): Promise<DesktopDataSnapshot> {
    const usage: DesktopDataSnapshot['usage'] = {}
    for (const entry of DESKTOP_DATA_ENTRIES) {
      const path = join(entry.kind === 'models' ? this.modelRoot() : this.root, entry.name)
      if (!await exists(path)) continue
      for (const file of await files(path, entry.name)) {
        const kind = entry.name === 'meetings' && /\.(?:wav|mp3)$/i.test(file.path) ? 'audio' : entry.kind
        usage[kind] = (usage[kind] ?? 0) + file.size
      }
    }
    let lastResult: DesktopDataResult | undefined
    try { lastResult = resultSchema.parse(await json(join(this.root, STATE), 8192)) } catch { /* A missing report does not hide usage. */ }
    return { root: this.root, usage, lastResult }
  }

  get pending(): boolean { return !!this.operation || this.executing }

  async queueBackup(parent: string, options: DesktopBackupOptions, ready: () => boolean = () => true): Promise<void> {
    if (!isAbsolute(parent)) throw new Error('DATA_BACKUP_LOCATION')
    if (this.pending || !ready()) throw new Error('DATA_OPERATION_BUSY')
    if (options.password !== undefined && options.password.length < 12) throw new Error('DATA_PASSWORD_REQUIRED')
    if (inside(this.root, parent) || inside(this.modelRoot(), parent)) throw new Error('DATA_BACKUP_LOCATION')
    const resolvedParent = await realpath(parent)
    const models = await realpath(this.modelRoot()).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(this.modelRoot()); throw error })
    if (inside(await realpath(this.root), resolvedParent) || inside(models, resolvedParent)) throw new Error('DATA_BACKUP_LOCATION')
    if (this.pending || !ready()) throw new Error('DATA_OPERATION_BUSY')
    const target = join(parent, `Nola-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.nola-backup`)
    this.action = 'backup'
    this.operation = () => this.report('backup', target, () => this.backup(target, options))
  }

  async queueRestore(source: string, destination: string, password: string | undefined, selectRoot: (root: string) => void, ready: () => boolean = () => true): Promise<void> {
    if (!isAbsolute(source) || !isAbsolute(destination) || inside(source, destination) || inside(this.root, destination)) throw new Error('DATA_BACKUP_LOCATION')
    if (this.pending) throw new Error('DATA_OPERATION_BUSY')
    // Validate before asking the application to shut down, then revalidate at execution.
    await this.inspect(source, password)
    if (await exists(destination)) throw new Error('DATA_BACKUP_LOCATION')
    if (!ready()) throw new Error('DATA_OPERATION_BUSY')
    this.action = 'restore'
    this.operation = () => this.report('restore', destination, async () => {
      await this.restore(source, destination, password)
      selectRoot(destination)
    })
  }

  async execute(): Promise<void> {
    const operation = this.operation
    this.operation = undefined
    this.executing = !!operation
    try { await operation?.() } finally { this.executing = false }
  }

  async failPending(): Promise<void> {
    if (!this.operation) return
    this.operation = undefined
    await durableJson(join(this.root, STATE), { action: this.action, state: 'failed', error: 'DATA_WRITERS_NOT_CLOSED', at: new Date().toISOString() })
  }

  private async report(action: DesktopDataResult['action'], path: string, operation: () => Promise<void>): Promise<void> {
    let result: DesktopDataResult
    try { await operation(); result = { action, path, state: 'completed', at: new Date().toISOString() } }
    catch (error) { result = { action, state: 'failed', error: error instanceof Error ? (error as NodeJS.ErrnoException).code ?? error.message : 'DATA_BACKUP_INVALID', at: new Date().toISOString() } }
    await durableJson(join(action === 'restore' && result.state === 'completed' ? path : this.root, STATE), result)
  }

  private async backup(target: string, options: DesktopBackupOptions): Promise<void> {
    const staging = `${target}.partial`
    await mkdir(staging, { recursive: false })
    try {
      const candidates: Array<{ path: string; size: number; source: string }> = []
      for (const entry of DESKTOP_DATA_ENTRIES) {
        if (['runtime', 'cache', 'logs', 'credentials'].includes(entry.kind) || entry.kind === 'models' && !options.models) continue
        const source = join(entry.kind === 'models' ? this.modelRoot() : this.root, entry.name)
        if (!await exists(source)) continue
        for (const file of await files(source, entry.name)) {
          if (/\.sqlite3-(?:wal|shm)$/.test(file.path)) continue
          if (!options.audio && entry.name === 'meetings' && /\.(?:wav|mp3)$/i.test(file.path)) continue
          candidates.push({ ...file, source: join(entry.kind === 'models' ? this.modelRoot() : this.root, file.path) })
        }
      }
      if (candidates.length > 200_000) throw new Error('DATA_BACKUP_INVALID')
      this.checkSpace(staging, candidates.reduce((sum, file) => sum + file.size, 0))
      const published: z.infer<typeof manifestSchema>['files'] = []
      for (const file of candidates) {
        const destination = join(staging, file.path)
        await mkdir(dirname(destination), { recursive: true })
        const database = file.path.endsWith('.sqlite3')
        if (database) await sqliteSnapshot(file.source, destination)
        else await copyFile(file.source, destination)
        const checksum = await hash(destination)
        if (!database && await hash(file.source) !== checksum) throw new Error('DATA_BACKUP_CHANGED')
        published.push({ path: file.path, size: (await stat(destination)).size, hash: checksum })
      }
      const credentials = options.password !== undefined && await exists(join(this.root, 'credentials.json'))
      if (credentials) {
        if (!this.encryption.isEncryptionAvailable()) throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE')
        const encrypted = z.record(z.string(), z.string()).parse(await json(join(this.root, 'credentials.json'), 1_000_000))
        const secrets: Record<string, string> = {}
        try { for (const [key, value] of Object.entries(encrypted)) secrets[key] = this.encryption.decryptString(Buffer.from(value, 'base64')) }
        catch { throw new Error('CREDENTIAL_DECRYPT_FAILED') }
        const salt = randomBytes(16), iv = randomBytes(12)
        const key = await scrypt(options.password!, salt, 32) as Buffer
        try {
          const cipher = createCipheriv('aes-256-gcm', key, iv)
          const data = Buffer.concat([cipher.update(JSON.stringify(secrets), 'utf8'), cipher.final()])
          await durableJson(join(staging, 'vault.json'), { salt: salt.toString('hex'), iv: iv.toString('hex'), tag: cipher.getAuthTag().toString('hex'), data: data.toString('base64') })
        } finally { key.fill(0) }
        published.push({ path: 'vault.json', size: (await stat(join(staging, 'vault.json'))).size, hash: await hash(join(staging, 'vault.json')) })
      }
      await durableJson(join(staging, 'manifest.json'), { version: 1, applicationVersion: this.version, createdAt: new Date().toISOString(), files: published, credentials })
      await rename(staging, target)
    } finally { await rm(staging, { recursive: true, force: true }) }
  }

  private async inspect(source: string, password?: string) {
    if ((await lstat(source)).isSymbolicLink()) throw new Error('DATA_BACKUP_INVALID')
    const parsed = manifestSchema.safeParse(await json(join(source, 'manifest.json'), 40 * 1024 * 1024))
    if (!parsed.success) throw new Error('DATA_BACKUP_INVALID')
    const manifest = parsed.data
    const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.applicationVersion)
    const current = /^(\d+)\.(\d+)\.(\d+)$/.exec(this.version)
    if (!version || !current) throw new Error('DATA_BACKUP_INVALID')
    for (let index = 1; index <= 3; index++) {
      if (Number(version[index]) > Number(current[index])) throw new Error('DATA_BACKUP_INVALID')
      if (Number(version[index]) < Number(current[index])) break
    }
    const names = new Set<string>()
    for (const file of manifest.files) {
      const parts = file.path.split('/')
      if (parts.some(part => !part || part === '.' || part === '..' || /[\\:\x00-\x1f<>"|?*]/.test(part) || /[. ]$/.test(part)
        || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) || names.has(file.path.toLowerCase())) throw new Error('DATA_BACKUP_INVALID')
      const entry = DESKTOP_DATA_ENTRIES.find(entry => entry.name === parts[0])
      if (file.path !== 'vault.json' && (!entry || ['credentials', 'cache', 'logs', 'runtime'].includes(entry.kind))) throw new Error('DATA_BACKUP_INVALID')
      names.add(file.path.toLowerCase())
      let path = source
      for (const part of parts) { path = join(path, part); if ((await lstat(path)).isSymbolicLink()) throw new Error('DATA_BACKUP_INVALID') }
      if (!(await stat(path)).isFile() || (await stat(path)).size !== file.size || await hash(path) !== file.hash) throw new Error('DATA_BACKUP_INVALID')
      if (file.path.endsWith('.sqlite3')) await sqliteSnapshot(path)
    }
    if (manifest.credentials !== names.has('vault.json')) throw new Error('DATA_BACKUP_INVALID')
    let secrets: Record<string, string> | undefined
    if (manifest.credentials) {
      if (!password) throw new Error('DATA_PASSWORD_REQUIRED')
      const vault = vaultSchema.parse(await json(join(source, 'vault.json'), 5_000_000))
      const key = await scrypt(password, Buffer.from(vault.salt, 'hex'), 32) as Buffer
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(vault.iv, 'hex'))
        decipher.setAuthTag(Buffer.from(vault.tag, 'hex'))
        secrets = z.record(z.string(), z.string()).parse(JSON.parse(Buffer.concat([decipher.update(Buffer.from(vault.data, 'base64')), decipher.final()]).toString('utf8')))
      } catch { throw new Error('DATA_PASSWORD_INVALID') } finally { key.fill(0) }
    }
    return { manifest, secrets }
  }

  private checkSpace(path: string, size: number) {
    const available = freeBytesForDirectory(path)
    if (available === undefined) throw new Error('FILE_NOT_ACCESSIBLE')
    if (available < size + 16 * 1024 * 1024) throw new Error('DISK_SPACE_INSUFFICIENT')
  }

  private async restore(source: string, destination: string, password?: string): Promise<void> {
    const { manifest, secrets } = await this.inspect(source, password)
    this.checkSpace(dirname(destination), manifest.files.reduce((sum, file) => sum + file.size, 0))
    await mkdir(destination, { recursive: false })
    try {
      for (const file of manifest.files) {
        if (file.path === 'vault.json') continue
        const target = join(destination, file.path)
        await mkdir(dirname(target), { recursive: true })
        await copyFile(join(source, file.path), target)
        if (await hash(target) !== file.hash) throw new Error('DATA_BACKUP_INVALID')
      }
      if (secrets) {
        if (!this.encryption.isEncryptionAvailable()) throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE')
        await durableJson(join(destination, 'credentials.json'), Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, this.encryption.encryptString(value).toString('base64')])))
      }
      const settings = join(destination, 'settings.json')
      if (await exists(settings)) {
        const value = z.record(z.string(), z.unknown()).parse(await json(settings, 10 * 1024 * 1024))
        value.modelStoragePath = ''
        await durableJson(settings, value)
      }
    } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  }
}
