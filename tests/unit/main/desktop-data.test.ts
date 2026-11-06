import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { DesktopDataManager } from '../../../src/main/desktop-data'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
function encryption(prefix = 'old:') {
  return { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from(prefix + text),
    decryptString: (buffer: Buffer) => { const text = buffer.toString(); if (!text.startsWith(prefix)) throw new Error('invalid'); return text.slice(prefix.length) } }
}
async function fixture() {
  const base = await mkdtemp(join(tmpdir(), 'nola-desktop-data-test-')); roots.push(base)
  const root = join(base, 'data'), backups = join(base, 'backups')
  await mkdir(root); await mkdir(backups)
  await writeFile(join(root, 'settings.json'), JSON.stringify({ version: 3, modelStoragePath: 'D:/old' }))
  await writeFile(join(root, 'glossary.json'), JSON.stringify({ revision: 9 }))
  const manager = new DesktopDataManager(root, encryption(), '1.2.2')
  return { base, root, backups, manager }
}
async function makeBackup(f: Awaited<ReturnType<typeof fixture>>, keys = false) {
  await f.manager.queueBackup(f.backups, { audio: false, models: true, ...(keys ? { password: 'correct-password' } : {}) })
  await f.manager.execute()
  const result = (await f.manager.snapshot()).lastResult!
  expect(result.state).toBe('completed')
  return result.path!
}

describe('desktop data lifecycle', () => {
  it('round trips content, SQLite WAL, managed models and portable keys without changing the old root', async () => {
    const f = await fixture()
    await mkdir(join(f.root, 'comics')); await mkdir(join(f.root, 'meetings', 'one'), { recursive: true }); await mkdir(join(f.root, 'models'))
    await writeFile(join(f.root, 'meetings', 'one', 'segments.jsonl'), '{"line":"hello"}\n')
    await writeFile(join(f.root, 'meetings', 'one', 'audio.mp3'), 'audio')
    await writeFile(join(f.root, 'models', 'model.gguf'), 'model')
    const database = new DatabaseSync(join(f.root, 'comics', 'comic.sqlite3'))
    database.exec('PRAGMA journal_mode=WAL; CREATE TABLE projects(id TEXT); INSERT INTO projects VALUES (\'book\');')
    const encrypted = encryption().encryptString('sk-private').toString('base64')
    await writeFile(join(f.root, 'credentials.json'), JSON.stringify({ cloud: encrypted }))
    let backup: string
    try { backup = await makeBackup(f, true) } finally { database.close() }
    expect(await readFile(join(backup!, 'vault.json'), 'utf8')).not.toContain('sk-private')
    expect(await readdir(join(backup!, 'meetings', 'one'))).toEqual(['segments.jsonl'])
    expect(await readdir(join(backup!, 'comics'))).toEqual(['comic.sqlite3'])
    const destination = join(f.base, 'restored')
    const otherDevice = new DesktopDataManager(f.root, encryption('new:'), '1.2.2')
    let selected = ''
    await otherDevice.queueRestore(backup!, destination, 'correct-password', root => { selected = root })
    await otherDevice.execute()
    expect(selected).toBe(destination)
    expect(JSON.parse(await readFile(join(destination, 'settings.json'), 'utf8')).modelStoragePath).toBe('')
    expect(JSON.parse(await readFile(join(f.root, 'settings.json'), 'utf8')).modelStoragePath).toBe('D:/old')
    const restored = JSON.parse(await readFile(join(destination, 'credentials.json'), 'utf8'))
    expect(encryption('new:').decryptString(Buffer.from(restored.cloud, 'base64'))).toBe('sk-private')
    const db = new DatabaseSync(join(destination, 'comics', 'comic.sqlite3'), { readOnly: true })
    try { expect(db.prepare('SELECT id FROM projects').get()?.id).toBe('book') } finally { db.close() }
    expect(await readFile(join(destination, 'models', 'model.gguf'), 'utf8')).toBe('model')
  })

  it('rejects a changed backup before queuing a restore', async () => {
    const f = await fixture(), backup = await makeBackup(f)
    await writeFile(join(backup, 'glossary.json'), '{}')
    await expect(f.manager.queueRestore(backup, join(f.base, 'restored'), undefined, () => {})).rejects.toThrow('DATA_BACKUP_INVALID')
    expect(f.manager.pending).toBe(false)
  })

  it('reports a corrupt SQLite file and removes only its incomplete backup', async () => {
    const f = await fixture()
    await mkdir(join(f.root, 'comics'))
    await writeFile(join(f.root, 'comics', 'comic.sqlite3'), 'broken database')
    await f.manager.queueBackup(f.backups, { audio: false, models: false })
    await f.manager.execute()
    expect((await f.manager.snapshot()).lastResult).toMatchObject({ state: 'failed', error: 'DATA_BACKUP_INVALID' })
    expect(await readdir(f.backups)).toEqual([])
    expect(await readFile(join(f.root, 'comics', 'comic.sqlite3'), 'utf8')).toBe('broken database')
  })

  it('rejects wrong passwords without changing the selected data root', async () => {
    const f = await fixture()
    await writeFile(join(f.root, 'credentials.json'), JSON.stringify({ cloud: encryption().encryptString('key').toString('base64') }))
    const backup = await makeBackup(f, true)
    await expect(f.manager.queueRestore(backup, join(f.base, 'restored'), 'wrong-password', () => { throw new Error('must not select') })).rejects.toThrow('DATA_PASSWORD_INVALID')
    expect(f.manager.pending).toBe(false)
  })

  it('rejects path traversal and case-insensitive duplicate paths', async () => {
    const f = await fixture(), backup = await makeBackup(f)
    const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'))
    for (const path of ['../escape', 'SETTINGS.JSON']) {
      await writeFile(join(backup, 'manifest.json'), JSON.stringify({ ...manifest, files: [...manifest.files, { ...manifest.files[0], path }] }))
      await expect(f.manager.queueRestore(backup, join(f.base, 'restored'), undefined, () => {})).rejects.toThrow('DATA_BACKUP_INVALID')
    }
  })

  it('rejects a junction that places the backup inside the data root', async () => {
    const f = await fixture(), alias = join(f.base, 'alias')
    await symlink(f.root, alias, 'junction')
    await expect(f.manager.queueBackup(alias, { audio: true, models: false })).rejects.toThrow('DATA_BACKUP_LOCATION')
  })

  it('does not queue a restore if a task starts during validation', async () => {
    const f = await fixture(), backup = await makeBackup(f)
    await expect(f.manager.queueRestore(backup, join(f.base, 'restored'), undefined, () => {}, () => false)).rejects.toThrow('DATA_OPERATION_BUSY')
    expect(f.manager.pending).toBe(false)
  })

  it('records aborted shutdown and leaves the source and backup directory alone', async () => {
    const f = await fixture()
    await f.manager.queueBackup(f.backups, { audio: true, models: false })
    await f.manager.failPending()
    await f.manager.execute()
    expect((await f.manager.snapshot()).lastResult?.error).toBe('DATA_WRITERS_NOT_CLOSED')
    expect(await readdir(f.backups)).toEqual([])
    expect(await readFile(join(f.root, 'glossary.json'), 'utf8')).toContain('9')
  })

  it('does not export credentials, caches, logs or runtime queues by default', async () => {
    const f = await fixture()
    for (const folder of ['cache', 'logs', 'session-journal']) { await mkdir(join(f.root, folder)); await writeFile(join(f.root, folder, 'file'), 'data') }
    await writeFile(join(f.root, 'credentials.json'), '{}')
    const backup = await makeBackup(f)
    expect((await readdir(backup)).sort()).toEqual(['glossary.json', 'manifest.json', 'settings.json'])
    expect((await f.manager.snapshot()).usage.logs).toBe(4)
  })
})
