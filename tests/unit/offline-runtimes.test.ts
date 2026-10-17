import { describe, expect, it } from 'vitest'
import { offlinePipArguments, safeResourceName } from '../../src/main/offline-runtimes'

describe('offline runtime safety', () => {
  it('rejects manifest paths and executable artifacts', () => {
    for (const value of ['../torch.whl', 'C:\\torch.whl', 'install.exe', 'a/b.whl']) expect(() => safeResourceName(value, 'wheel')).toThrow()
    expect(safeResourceName('torch-2.0-cp312-win_amd64.whl', 'wheel')).toBe('torch-2.0-cp312-win_amd64.whl')
  })
  it('resolves only binary wheels for the target Python and installs without indexes', () => {
    const download = offlinePipArguments('download', 'wheelhouse', 'locked.txt')
    expect(download).toEqual(expect.arrayContaining(['--platform', 'win_amd64', '--python-version', '312', '--only-binary=:all:', '--no-index', '--require-hashes']))
    expect(download).not.toContain('--no-deps')
    const install = offlinePipArguments('install', 'wheelhouse', 'locked.txt', 'staging')
    expect(install).toEqual(expect.arrayContaining(['--no-index', '--require-hashes', '--find-links', 'wheelhouse', '--target', 'staging']))
    expect(install.join(' ')).not.toContain('https:')
  })
})

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { vi } from 'vitest'
import { OfflineRuntimes } from '../../src/main/offline-runtimes'
import type { RuntimePackage, RuntimeRecipe } from '../../src/shared/compute'

const processMocks = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: (...args: unknown[]) => processMocks.run(...args), default: { execFile: (...args: unknown[]) => processMocks.run(...args) } }))

it('rejects missing dependency closure during inspection without modifying input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'offline-closure-test-'))
  const content = 'test wheel'
  const sha256 = createHash('sha256').update(content).digest('hex')
  const recipe: RuntimeRecipe = { id: 'torch-test', name: 'Torch test', backend: 'cpu', pythonAbi: 'cp312-win_amd64', torchVersion: '2.0.0', indexUrl: 'https://download.pytorch.org/whl/cpu', wheel: { filename: 'torch-2.0.0-cp312-win_amd64.whl', bytes: content.length, sha256, url: 'https://example.com/torch.whl' }, companions: [], requirements: ['required-package==1.0'] }
  const directory = join(root, 'bundle', 'runtimes', recipe.id)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, recipe.wheel.filename), content)
  await writeFile(join(root, 'bundle', 'runtimes', 'runtime-resources.json'), JSON.stringify({ version: 1, platform: 'win32-x64-cp312', resources: [{ id: recipe.id, kind: 'python', files: [{ name: recipe.wheel.filename, bytes: content.length, sha256 }] }] }))
  const commands: string[][] = []
  processMocks.run.mockImplementation((_command: string, args: string[], _options: unknown, callback: (error: Error | null, value?: { stdout: string }) => void) => {
    commands.push(args)
    if (args.includes('-c')) callback(null, { stdout: JSON.stringify([{ file: recipe.wheel.filename, name: 'torch', version: '2.0.0' }]) })
    else if (commands.length === 2) callback(null, { stdout: '' })
    else callback(new Error('No matching distribution found: required-package'))
    return {}
  })
  const download = vi.fn()
  const install = vi.fn()
  try {
    const service = new OfflineRuntimes({ python: 'python.exe', temporaryDirectory: join(root, 'owned-temp'), recipes: [recipe], packages: [], download, installPython: install, installLlama: install })
    const items = await service.inspect(join(root, 'bundle'))
    expect(items[0].status).toBe('invalid')
    expect(commands.slice(1).every(args => args.includes('--no-index') && args.includes('--dry-run') && args.includes('--ignore-installed'))).toBe(true)
    expect(await readFile(join(directory, 'requirements.lock'), 'utf8').catch(() => 'absent')).toBe('absent')
    expect(download).not.toHaveBeenCalled()
    expect(install).not.toHaveBeenCalled()
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})

it('uses pinned archive filenames instead of a runtime display name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'offline-llama-archive-name-'))
  const primary = Buffer.from('llama archive')
  const companion = Buffer.from('runtime companion')
  const pkg: RuntimePackage = {
    id: 'llama-test', name: 'llama.cpp b11532 · Windows x64 (CPU)', kind: 'llama', backend: 'cpu',
    architecture: 'x64', version: 'b11532', url: 'https://example.com/releases/llama-cpu.zip',
    sha256: createHash('sha256').update(primary).digest('hex'), bytes: primary.length,
    companions: [{ url: 'https://example.com/releases/llama-companion.zip', sha256: createHash('sha256').update(companion).digest('hex'), bytes: companion.length }],
  }
  const download = vi.fn(async (artifact: { url: string }, path: string) => {
    await writeFile(path, artifact.url.endsWith('llama-cpu.zip') ? primary : companion)
  })
  const install = vi.fn()
  try {
    const service = new OfflineRuntimes({ python: 'python.exe', recipes: [], packages: [pkg], download, installPython: install, installLlama: install })
    const progress = vi.fn()
    await service.prepare([pkg.id], root, new AbortController().signal, progress)
    const bundle = join(root, 'runtimes')
    const manifest = JSON.parse(await readFile(join(bundle, 'runtime-resources.json'), 'utf8')) as { resources: { files: { name: string }[] }[] }
    expect(manifest.resources[0].files.map(file => file.name)).toEqual(['00-llama-cpu.zip', '01-llama-companion.zip'])
    expect(manifest.resources[0].files.every(file => file.name !== pkg.name)).toBe(true)
    expect((await service.inspect(root))[0]).toMatchObject({ id: pkg.id, status: 'ready' })
    expect(download).toHaveBeenCalledTimes(2)
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})


it('rejects duplicate resources and corrupt pinned archives before any installer runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'offline-manifest-test-'))
  const folder = join(root, 'runtimes', 'llama-test')
  await mkdir(folder, { recursive: true })
  const manifestPath = join(root, 'runtimes', 'runtime-resources.json')
  const resource = { id: 'llama-test', kind: 'llama', files: [{ name: '0.zip', bytes: 4, sha256: 'a'.repeat(64) }] }
  const download = vi.fn()
  const install = vi.fn()
  const service = new OfflineRuntimes({ python: 'python.exe', recipes: [], packages: [{ id: 'llama-test', name: 'Llama', kind: 'llama', backend: 'cpu', architecture: 'x64', version: '1', url: 'https://example.com/archive.zip', bytes: 4, sha256: 'a'.repeat(64) }], download, installPython: install, installLlama: install })
  try {
    await writeFile(manifestPath, JSON.stringify({ version: 1, platform: 'win32-x64-cp312', resources: [resource, resource] }))
    await expect(service.inspect(root)).rejects.toThrow()
    await writeFile(manifestPath, JSON.stringify({ version: 1, platform: 'win32-x64-cp312', resources: [resource] }))
    await writeFile(join(folder, '0.zip'), 'bad!')
    expect((await service.inspect(root))[0].status).toBe('invalid')
    await expect(service.install(['llama-test'], root, new AbortController().signal, vi.fn())).rejects.toThrow('checksum')
    expect(install).not.toHaveBeenCalled()
    expect(download).not.toHaveBeenCalled()
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('builds source-only dependencies on the preparation host and surfaces compiler failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'offline-build-test-'))
  const content = 'primary wheel'
  const recipe: RuntimeRecipe = { id: 'torch-build-test', name: 'Torch test', backend: 'cpu', pythonAbi: 'cp312-win_amd64', torchVersion: '2.0.0', indexUrl: 'https://download.pytorch.org/whl/cpu', wheel: { filename: 'torch-2.0.0-cp312-win_amd64.whl', bytes: content.length, sha256: createHash('sha256').update(content).digest('hex'), url: 'https://example.com/torch.whl' }, companions: [], requirements: ['jieba'] }
  processMocks.run.mockImplementation((_command: string, args: string[], _options: unknown, callback: (error: Error | null, value?: { stdout: string }) => void) => {
    if (args.includes('-c')) callback(null, { stdout: '' })
    else callback(Object.assign(new Error('process failed'), { stderr: 'Failed building wheel for jieba: C++ compiler unavailable' }))
    return {}
  })
  const install = vi.fn()
  const service = new OfflineRuntimes({ python: 'python.exe', recipes: [recipe], packages: [], download: async (_artifact, path) => { await writeFile(path, content) }, installPython: install, installLlama: install })
  try {
    await expect(service.prepare([recipe.id], root, new AbortController().signal, vi.fn())).rejects.toThrow('compiler unavailable')
    const args = processMocks.run.mock.calls.find(call => (call[1] as string[]).includes('wheel'))?.[1] as string[]
    expect(args).toEqual(expect.arrayContaining(['wheel', '--prefer-binary', '--wheel-dir', '--isolated', 'jieba']))
    expect(args).not.toContain('--only-binary=:all:')
    expect(args).not.toContain('--platform')
    expect(install).not.toHaveBeenCalled()
    expect(await readFile(join(root, 'runtimes', 'runtime-resources.json'), 'utf8').catch(() => 'absent')).toBe('absent')
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})

it('rejects direct URL dependencies in real wheel metadata before invoking pip', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  const root = await mkdtemp(join(tmpdir(), 'offline-url-test-'))
  const directory = join(root, 'runtimes', 'torch-url-test')
  await mkdir(directory, { recursive: true })
  const filename = 'torch-2.0.0-cp312-win_amd64.whl'
  const wheelPath = join(directory, filename)
  await new Promise<void>((resolveBuild, reject) => actual.execFile('python', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],"w"); z.writestr("torch-2.0.0.dist-info/METADATA", sys.argv[2]); z.close()', wheelPath, 'Name: torch\nVersion: 2.0.0\nRequires-Dist: injected @ https://invalid.example/remote.whl\n'], { windowsHide: true }, error => error ? reject(error) : resolveBuild()))
  const content = await readFile(wheelPath)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const recipe: RuntimeRecipe = { id: 'torch-url-test', name: 'Torch', backend: 'cpu', pythonAbi: 'cp312-win_amd64', torchVersion: '2.0.0', indexUrl: 'https://download.pytorch.org/whl/cpu', wheel: { filename, bytes: content.length, sha256, url: 'https://example.com/torch.whl' }, companions: [], requirements: [] }
  await writeFile(join(root, 'runtimes', 'runtime-resources.json'), JSON.stringify({ version: 1, platform: 'win32-x64-cp312', resources: [{ id: recipe.id, kind: 'python', files: [{ name: filename, bytes: content.length, sha256 }] }] }))
  let metadataError = ''
  processMocks.run.mockImplementation((_command: string, args: string[], options: object, callback: (error: Error | null, value?: { stdout: string; stderr: string }) => void) => actual.execFile('python', args, options, (error, stdout, stderr) => {
    metadataError = String(stderr)
    callback(error, { stdout: String(stdout), stderr: String(stderr) })
  }))
  try {
    const service = new OfflineRuntimes({ python: 'python', recipes: [recipe], packages: [], download: vi.fn(), installPython: vi.fn(), installLlama: vi.fn() })
    expect((await service.inspect(root))[0].status).toBe('invalid')
    expect(processMocks.run).toHaveBeenCalledTimes(1)
    expect(processMocks.run.mock.calls[0][1]).toContain('-c')
    expect(metadataError).toContain('Direct URL dependencies are forbidden')
  } finally { await rm(root, { recursive: true, force: true }); vi.clearAllMocks() }
})
