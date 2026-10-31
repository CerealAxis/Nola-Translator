import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { offlineArchive } from '../../../src/main/offline-archive'

const run = promisify(execFile)
const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'offline-zip-test-'))
  roots.push(root)
  const source = join(root, 'source'), destination = join(root, 'destination'), archive = join(root, 'package.zip')
  await mkdir(source)
  await mkdir(destination)
  return { root, source, destination, archive, signal: new AbortController().signal }
}

it('streams a ZIP64 round trip with Unicode paths and byte progress', async () => {
  const { source, destination, archive, signal } = await fixture()
  const data = Buffer.alloc(5 * 1024 * 1024, 13)
  await mkdir(join(source, '模型'))
  await writeFile(join(source, '模型', 'weights.gguf'), data)
  await writeFile(join(source, 'manifest.json'), '{}')
  const progress = vi.fn()
  await offlineArchive('python', 'pack', source, archive, signal, progress)
  expect(progress).toHaveBeenCalledWith('pack', data.length + 2, data.length + 2, '')
  await offlineArchive('python', 'extract', archive, destination, signal, progress)
  expect((await readFile(join(destination, '模型', 'weights.gguf'))).equals(data)).toBe(true)
  expect(progress).toHaveBeenCalledWith('extract', data.length + 2, data.length + 2, '')
}, 15000)

// Python startup needs the same integration-test budget as the round trip under parallel runs.
it.each(['../escape', '/absolute', 'C:/outside', 'a\\escape', 'x:stream', 'CON.txt', 'trailing. /file'])('rejects unsafe ZIP entry %s before extraction', async name => {
  const { archive, destination, signal } = await fixture()
  await run('python', ['-I', '-c', "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); i=zipfile.ZipInfo('safe'); i.filename=sys.argv[2]; z.writestr(i,b'bad'); z.close()", archive, name], { windowsHide: true })
  await expect(offlineArchive('python', 'extract', archive, destination, signal, vi.fn())).rejects.toMatchObject({ issue: 'invalidPackage' })
}, 15000)

it('rejects case-insensitive duplicate paths and symbolic links', async () => {
  const { archive, destination, signal } = await fixture()
  for (const script of [
    "z.writestr('model/a',b'a'); z.writestr('MODEL/A',b'b')",
    "i=zipfile.ZipInfo('link'); i.create_system=3; i.external_attr=0o120777<<16; z.writestr(i,b'../outside')",
  ]) {
    await run('python', ['-I', '-c', `import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); ${script}; z.close()`, archive], { windowsHide: true })
    await expect(offlineArchive('python', 'extract', archive, destination, signal, vi.fn())).rejects.toMatchObject({ issue: 'invalidPackage' })
  }
}, 15000)
