import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
