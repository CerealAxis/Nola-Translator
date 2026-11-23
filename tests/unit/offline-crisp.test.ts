import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { OfflineRuntimes } from '../../src/main/offline-runtimes'
import { CRISP_RUNTIME_VERSIONS, CRISP_RUNTIME_ID } from '../../src/shared/compute'

vi.mock('../../src/shared/compute', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/shared/compute')>()
  return { ...actual, CRISP_RUNTIME_VERSIONS: actual.CRISP_RUNTIME_VERSIONS.map(release => ({
    ...release, files: release.files.map((file, index) => ({
      ...file, bytes: 1, sha256: createHash('sha256').update(String(index)).digest('hex'),
    })),
  })) }
})

it.each([CRISP_RUNTIME_ID, 'crispasr-0-8-43-vulkan'])('prepares and installs both wheels for %s in order', async id => {
  const files = CRISP_RUNTIME_VERSIONS.find(item => item.id === id)!.files
  const root = await mkdtemp(join(tmpdir(), 'offline-crisp-test-'))
  const installCrisp = vi.fn()
  const otherInstaller = vi.fn()
  const download = vi.fn(async (file: { url: string }, path: string) => {
    await writeFile(path, String(files.findIndex(item => item.url === file.url)))
  })
  const service = new OfflineRuntimes({ python: 'python', recipes: [], packages: [], download, installCrisp,
    installPython: otherInstaller, installLlama: otherInstaller })
  const signal = new AbortController().signal
  try {
    await service.prepare([id], root, signal, vi.fn())
    const manifest = JSON.parse(await readFile(join(root, 'runtimes', 'runtime-resources.json'), 'utf8'))
    expect(manifest.resources[0].kind).toBe('crisp')
    expect((await service.inspect(root))[0]).toMatchObject({ id, status: 'ready', bytes: 2 })
    await service.install([id], root, signal, vi.fn())
    expect(installCrisp).toHaveBeenCalledWith(id, files.map(file => join(root, 'runtimes', id, file.name)), signal)
    expect(otherInstaller).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalledTimes(2)
    await writeFile(join(root, 'runtimes', id, files[0].name), 'corrupt')
    expect((await service.inspect(root))[0]).toMatchObject({ status: 'invalid', issue: 'invalidPackage' })
    installCrisp.mockClear()
    await expect(service.install([id], root, signal, vi.fn())).rejects.toThrow('checksum')
    expect(installCrisp).not.toHaveBeenCalled()
  } finally { await rm(root, { recursive: true, force: true }) }
})
