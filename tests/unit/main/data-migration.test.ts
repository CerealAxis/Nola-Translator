import { mkdtemp, mkdir, readFile, rm, writeFile, readdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDataRoot } from '../../../src/main/data-migration'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function dataRootPair(): Promise<{ source: string; destination: string }> {
  const root = await mkdtemp(join(tmpdir(), 'nola-data-migration-test-'))
  directories.push(root)
  const source = join(root, 'source')
  const destination = join(root, 'destination')
  await Promise.all([mkdir(source), mkdir(destination)])
  return { source, destination }
}

describe('data root migration', () => {
  it('does not overwrite destination edits when retrying deletion after a completed copy', async () => {
    const { source, destination } = await dataRootPair()
    await writeFile(join(source, 'settings.json'), '{"old":true}')
    await migrateDataRoot(source, destination, [], false)
    await writeFile(join(destination, 'settings.json'), '{"new":true}')
    const report = await migrateDataRoot(source, destination, [], true, true)
    expect(report.failed).toEqual([])
    expect(report.removed).toContain('settings.json')
    expect(await readFile(join(destination, 'settings.json'), 'utf8')).toBe('{"new":true}')
    expect(await readdir(source)).toEqual([])
  })
  it('retains the entire source if any entry cannot be copied safely', async () => {
    const { source, destination } = await dataRootPair()
    await writeFile(join(source, 'settings.json'), '{}')
    await symlink(destination, join(source, 'meetings'), 'junction')
    const report = await migrateDataRoot(source, destination)
    expect(report.failed).toContain('meetings')
    expect(report.removed).toEqual([])
    expect(await readFile(join(source, 'settings.json'), 'utf8')).toBe('{}')
  })
  it('rejects a Data junction rather than moving files outside the install root', async () => {
    const { source, destination } = await dataRootPair()
    await writeFile(join(source, 'settings.json'), '{}')
    await symlink(destination, join(source, 'Data'), 'junction')
    const report = await migrateDataRoot(source, join(source, 'Data'))
    expect(report.failed).toContain('settings.json')
    expect(await readdir(destination)).toEqual([])
  })
  it('moves the affected default install into its own Data folder and keeps the program', async () => {
    const { source } = await dataRootPair()
    await mkdir(join(source, 'App'))
    await writeFile(join(source, 'App', 'program.exe'), 'program')
    await mkdir(join(source, 'models'))
    await writeFile(join(source, 'models', 'weights.bin'), 'weights')
    const report = await migrateDataRoot(source, join(source, 'Data'))
    expect(report.failed).toEqual([])
    expect(report.removed).toContain('models')
    expect(await readFile(join(source, 'Data', 'models', 'weights.bin'), 'utf8')).toBe('weights')
    expect((await readdir(source)).sort()).toEqual(['App', 'Data'])
  })
  it('still refuses a destination inside an owned model directory', async () => {
    const { source } = await dataRootPair()
    const report = await migrateDataRoot(source, join(source, 'models', 'Data'))
    expect(report.failed).toContain('models')
  })
  it('does not treat same-size files with different content as already migrated', async () => {
    const { source, destination } = await dataRootPair()
    await mkdir(join(source, 'models'))
    await mkdir(join(destination, 'models'))
    await writeFile(join(source, 'models', 'model.bin'), 'new-data!')
    await writeFile(join(destination, 'models', 'model.bin'), 'old-data!')

    const report = await migrateDataRoot(source, destination)

    expect(report.copied).toContain('models')
    expect(report.removed).toContain('models')
    await expect(readFile(join(destination, 'models', 'model.bin'), 'utf8')).resolves.toBe('new-data!')
  })
})
