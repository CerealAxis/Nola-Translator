import { mkdir, mkdtemp, readdir, rm, symlink, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupRuntimeArtifacts, removeRuntimeArtifact } from '../../../src/main/runtime-files'

it('cleans known archives and stale staging while retaining backups without a replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-runtime-cleanup-'))
  const id = 'llama-cpu'
  const uuid = '12345678-1234-1234-1234-123456789abc'
  const backup = `backup-${id}-${uuid}`
  try {
    await mkdir(join(root, backup))
    await writeFile(join(root, backup, 'runtime-installed.json'), JSON.stringify({ id, kind: 'llama' }))
    await mkdir(join(root, `staging-${id}-${uuid}`))
    await mkdir(join(root, 'staging-user-model'))
    await writeFile(join(root, `${id}-0.zip.partial`), 'partial')
    await cleanupRuntimeArtifacts(root, [id])
    expect((await readdir(root)).sort()).toEqual([backup, 'staging-user-model'].sort())
    await mkdir(join(root, id))
    await writeFile(join(root, id, 'runtime-installed.json'), JSON.stringify({ id, kind: 'llama' }))
    await cleanupRuntimeArtifacts(root, [id])
    expect((await readdir(root)).sort()).toEqual([id, 'staging-user-model'].sort())
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects out-of-root cleanup and skips a cache junction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-runtime-path-'))
  const external = await mkdtemp(join(tmpdir(), 'nola-runtime-external-'))
  try {
    await writeFile(join(external, 'keep.txt'), 'user files')
    await symlink(external, join(root, 'wheel-cache'), 'junction')
    await expect(removeRuntimeArtifact(root, external)).rejects.toThrow('路径无效')
    await expect(removeRuntimeArtifact(root, root)).rejects.toThrow('路径无效')
    await cleanupRuntimeArtifacts(root, [], true)
    expect(await readFile(join(external, 'keep.txt'), 'utf8')).toBe('user files')
    expect(await readdir(root)).toEqual(['wheel-cache'])
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
})

it('cleans old staging using an app installation marker even after its catalog entry is removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nola-legacy-cleanup-'))
  const id = 'torch-cuda-cu126'
  const stage = `staging-${id}-12345678-1234-1234-1234-123456789abc`
  try {
    await mkdir(join(root, id))
    await writeFile(join(root, id, 'runtime-installed.json'), JSON.stringify({ id, kind: 'python' }))
    await mkdir(join(root, stage))
    await cleanupRuntimeArtifacts(root, [], true)
    expect(await readdir(root)).toEqual([id])
  } finally { await rm(root, { recursive: true, force: true }) }
})
