import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { z } from 'zod'
import { CRISP_RUNTIME_ID, CRISP_RUNTIME_FILES, type RuntimePackage, type RuntimeRecipe } from '../shared/compute'
import type { NetworkSettings } from '../shared/settings'
import type { OfflineItem, OfflineTask } from '../shared/offline'
import { pypiIndexUrls } from '../shared/pypi-mirrors'
import { isMainlandChina } from './network-region'

const run = promisify(execFile)
export type OfflineRuntimeProgress = (phase: OfflineTask['phase'], current: number, total: number, detail?: string) => void
const fileSchema = z.object({ name: z.string().max(256), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const manifestSchema = z.object({ version: z.literal(1), platform: z.literal('win32-x64-cp312'), resources: z.array(z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/), kind: z.enum(['python', 'llama', 'crisp']), files: z.array(fileSchema).min(1).max(512) })).max(32) }).refine(value => new Set(value.resources.map(item => item.id)).size === value.resources.length)
type Resource = z.infer<typeof manifestSchema>['resources'][number]
type Artifact = Pick<RuntimePackage, 'url' | 'bytes' | 'sha256'>
type NamedArtifact = Artifact & { name: string }

function archiveName(artifact: Artifact, index: number): string {
  const leaf = decodeURIComponent(new URL(artifact.url).pathname.split('/').at(-1) ?? '')
  return safeResourceName(`${String(index).padStart(2, '0')}-${leaf}`, 'archive')
}

function pinnedFiles(recipe: RuntimeRecipe | undefined, pkg: RuntimePackage | undefined, crisp = false): NamedArtifact[] {
  if (crisp) return [...CRISP_RUNTIME_FILES]
  if (recipe) return [recipe.wheel, ...recipe.companions].map(item => ({ ...item, name: item.filename }))
  if (!pkg) throw new Error('Unsupported runtime combination')
  return [pkg, ...(pkg.companions ?? [])].map((item, index) => ({ ...item, name: archiveName(item, index) }))
}
interface Options {
  python: string
  temporaryDirectory?: string
  recipes: RuntimeRecipe[]
  packages: RuntimePackage[]
  network?: () => NetworkSettings
  download: (artifact: Artifact, path: string, signal: AbortSignal, progress: (bytes: number) => void) => Promise<void>
  installPython: (id: string, wheelhouse: string, requirements: string, signal: AbortSignal) => Promise<void>
  installCrisp?: (files: string[], signal: AbortSignal) => Promise<void>
  installLlama: (id: string, files: string[], signal: AbortSignal) => Promise<void>
}

export function safeResourceName(name: string, kind: 'wheel' | 'archive'): string {
  if (!/^[a-zA-Z0-9+_.-]+$/.test(name) || name.startsWith('.') || !name.endsWith(kind === 'wheel' ? '.whl' : '.zip')) throw new Error('Invalid runtime resource name')
  return name
}
export function offlinePipArguments(action: 'download' | 'install', wheelhouse: string, requirements: string, target?: string): string[] {
  return ['-I', '-u', '-m', 'pip', '--isolated', action, '--disable-pip-version-check', '--no-cache-dir', '--no-index', '--find-links', wheelhouse,
    '--require-hashes', '--only-binary=:all:', ...(action === 'download' ? ['--platform', 'win_amd64', '--python-version', '312', '--implementation', 'cp', '--abi', 'cp312', '--dest', target ?? join(wheelhouse, 'verified')] : ['--no-compile', '--target', target!]), '-r', requirements]
}
async function digest(path: string, signal?: AbortSignal): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk as Buffer)
  return hash.digest('hex')
}
async function containedFile(root: string, path: string): Promise<void> {
  for (const component of [root, join(root, relative(root, path).split(/[\\/]/)[0]), path]) {
    if ((await lstat(component)).isSymbolicLink()) throw new Error('Runtime links are not allowed')
  }
  const delta = relative(await realpath(root), await realpath(path))
  if (!delta || delta.startsWith('..') || isAbsolute(delta) || !(await stat(path)).isFile()) throw new Error('Invalid runtime resource path')
}

// Wheel metadata is data: neither preparing nor checking a package imports its code.
const METADATA_SCRIPT = `import sys,json,zipfile,email,os
from pip._vendor.packaging.requirements import Requirement
result=[]
for filename in sorted(os.listdir(sys.argv[1])):
 if not filename.endswith('.whl'): continue
 with zipfile.ZipFile(os.path.join(sys.argv[1],filename)) as archive:
  names=[n for n in archive.namelist() if n.endswith('.dist-info/METADATA')]
  assert len(names)==1, 'Ambiguous wheel metadata'
  data=email.message_from_bytes(archive.read(names[0]))
  for dependency in data.get_all('Requires-Dist',[]):
   assert Requirement(dependency).url is None, 'Direct URL dependencies are forbidden in offline packages'
  result.append({'file':filename,'name':data['Name'],'version':data['Version']})
print(json.dumps(result))`

export class OfflineRuntimes {
  constructor(private readonly options: Options) {}
  private async temporary(): Promise<string> {
    const directory = this.options.temporaryDirectory ?? tmpdir()
    await mkdir(directory, { recursive: true })
    return mkdtemp(join(directory, 'nola-offline-'))
  }
  private async manifest(root: string): Promise<z.infer<typeof manifestSchema>> {
    const path = join(root, 'runtime-resources.json')
    if ((await stat(path)).size > 4 * 1024 * 1024) throw new Error('Runtime manifest is too large')
    await containedFile(root, path)
    return manifestSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  }
  private async pip(args: string[], signal: AbortSignal): Promise<void> {
    await run(this.options.python, args, { windowsHide: true, signal, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: '1', PIP_CONFIG_FILE: 'nul' } })
  }
  private async lock(folder: string, files: Resource['files'], signal: AbortSignal): Promise<string> {
    const result = await run(this.options.python, ['-I', '-c', METADATA_SCRIPT, folder], { windowsHide: true, signal, timeout: 30_000 })
    const wheels = z.array(z.object({ file: z.string(), name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/), version: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9+_.!-]*$/) })).parse(JSON.parse(result.stdout))
    if (wheels.length !== files.length) throw new Error('Incomplete wheel metadata')
    const names = new Set<string>()
    return wheels.map(wheel => {
      const name = wheel.name.toLowerCase().replace(/[-_.]+/g, '-')
      if (names.has(name)) throw new Error('Duplicate dependency versions')
      names.add(name)
      const file = files.find(item => item.name === wheel.file)
      if (!file) throw new Error('Wheel missing from manifest')
      return `${name}==${wheel.version} --hash=sha256:${file.sha256}`
    }).join('\n') + '\n'
  }
  private async validate(root: string, resource: Resource, signal: AbortSignal): Promise<string | undefined> {
    const recipe = this.options.recipes.find(item => item.id === resource.id)
    const pkg = this.options.packages.find(item => item.id === resource.id)
    const crisp = resource.id === CRISP_RUNTIME_ID && resource.kind === 'crisp'
    if (!crisp && (resource.kind === 'python' ? !recipe : !pkg)) throw new Error('Unsupported runtime combination')
    const folder = join(root, resource.id)
    if (new Set(resource.files.map(file => file.name)).size !== resource.files.length) throw new Error('Duplicate runtime files')
    for (const file of resource.files) {
      const path = join(folder, safeResourceName(file.name, resource.kind !== 'llama' ? 'wheel' : 'archive'))
      await containedFile(root, path)
      if ((await stat(path)).size !== file.bytes || await digest(path, signal) !== file.sha256) throw new Error('Runtime checksum mismatch')
    }
    const pinned = pinnedFiles(recipe, pkg, crisp)
    for (const item of pinned) if (!resource.files.some(file => file.name === item.name && file.sha256 === item.sha256 && file.bytes === item.bytes)) throw new Error('Pinned runtime resource missing')
    if (!recipe && resource.files.length !== pinned.length) throw new Error('Unexpected runtime archive')
    if (recipe) {
      const actualFiles = (await readdir(folder)).filter(name => name.endsWith('.whl'))
      if (actualFiles.length !== resource.files.length) throw new Error('Unlisted dependency wheel')
      return this.lock(folder, resource.files, signal)
    }
  }
  async inspect(bundleDirectory: string, signal = new AbortController().signal): Promise<OfflineItem[]> {
    if ((await lstat(bundleDirectory)).isSymbolicLink()) throw new Error('Runtime links are not allowed')
    const root = join(bundleDirectory, 'runtimes')
    let manifest: z.infer<typeof manifestSchema>
    try { manifest = await this.manifest(root) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
    return Promise.all(manifest.resources.map(async resource => {
      const name = this.options.recipes.find(item => item.id === resource.id)?.name ?? this.options.packages.find(item => item.id === resource.id)?.name ?? (resource.id === CRISP_RUNTIME_ID ? 'CrispASR 0.8.43 · Vulkan' : resource.id)
      try {
        const lock = await this.validate(root, resource, signal)
        if (lock) await this.verifyClosure(join(root, resource.id), lock, signal, this.options.recipes.find(item => item.id === resource.id))
        return { id: resource.id, name, kind: 'runtime' as const, bytes: resource.files.reduce((sum, file) => sum + file.bytes, 0), status: 'ready' as const }
      } catch {
        signal.throwIfAborted()
        return { id: resource.id, name, kind: 'runtime' as const, bytes: resource.files.reduce((sum, file) => sum + file.bytes, 0), status: 'invalid' as const, issue: 'invalidPackage' as const }
      }
    }))
  }
  async prepare(ids: string[], bundleDirectory: string, signal: AbortSignal, progress: OfflineRuntimeProgress): Promise<void> {
    if (ids.some(id => this.options.recipes.some(recipe => recipe.id === id))) {
      // Source distributions build wheels for the preparing interpreter, so its ABI must match the target.
      await run(this.options.python, ['-I', '-c', 'import sys,struct; assert sys.platform == "win32" and sys.version_info[:2] == (3,12) and struct.calcsize("P") == 8, "Preparing runtime wheels requires Windows x64 Python 3.12"'], { windowsHide: true, signal, timeout: 10_000 })
    }
    const root = join(bundleDirectory, 'runtimes')
    await mkdir(root, { recursive: true })
    const resources: Resource[] = []
    for (const [position, id] of [...new Set(ids)].entries()) {
      signal.throwIfAborted()
      const recipe = this.options.recipes.find(item => item.id === id)
      const pkg = this.options.packages.find(item => item.id === id)
      const crisp = id === CRISP_RUNTIME_ID
      if (!recipe && !pkg && !crisp) throw new Error('Unknown runtime combination')
      const folder = join(root, id)
      await mkdir(folder, { recursive: true })
      const parts = pinnedFiles(recipe, pkg, crisp)
      for (const part of parts) {
        const path = join(folder, part.name)
        await this.options.download(part, path, signal, bytes => progress('download', bytes, part.bytes, id))
        if (await digest(path, signal) !== part.sha256) throw new Error('Runtime checksum mismatch')
      }
      if (recipe) {
        const network = this.options.network?.()
        const useMirrors = network?.usePypiMirror === true
          && (network.pypiMirrorUrl !== 'auto' || await isMainlandChina())
        const indexes = useMirrors ? pypiIndexUrls(network.pypiMirrorUrl) : ['https://pypi.org/simple/']
        // FunASR includes source-only packages such as jieba; build their wheels here, never on the offline computer.
        const args = ['-I', '-u', '-m', 'pip', '--isolated', 'wheel', '--disable-pip-version-check', '--no-cache-dir', '--prefer-binary', '--wheel-dir', folder, '--find-links', folder,
          '--index-url', indexes[0], ...(network?.proxyForPip ? ['--proxy', network.proxyUrl.trim()] : []), ...parts.map(part => join(folder, part.name)), ...recipe.requirements]
        let failure: unknown
        for (const [index, url] of indexes.entries()) {
          args[args.indexOf('--index-url') + 1] = url
          try { await this.pip(args, signal); failure = undefined; break }
          catch (error) {
            failure = error
            signal.throwIfAborted()
            if (index === indexes.length - 1) break
          }
        }
        if (failure !== undefined) {
          const detail = failure && typeof failure === 'object' && 'stderr' in failure ? String(failure.stderr) : String(failure)
          throw new Error(`Runtime dependency wheel preparation failed: ${detail.slice(-4096)}`, { cause: failure })
        }
      }
      const names = (await readdir(folder)).filter(name => name.endsWith(recipe || crisp ? '.whl' : '.zip')).sort()
      const files = await Promise.all(names.map(async name => ({ name, bytes: (await stat(join(folder, name))).size, sha256: await digest(join(folder, name), signal) })))
      const resource: Resource = { id, kind: crisp ? 'crisp' : recipe ? 'python' : 'llama', files }
      const lock = await this.validate(root, resource, signal)
      if (lock) await this.verifyClosure(folder, lock, signal, recipe)
      resources.push(resource)
      progress('pack', position + 1, ids.length, id)
    }
    signal.throwIfAborted()
    await writeFile(join(root, 'runtime-resources.json'), JSON.stringify({ version: 1, platform: 'win32-x64-cp312', resources }), 'utf8')
  }
  private async verifyClosure(folder: string, lock: string, signal: AbortSignal, recipe?: RuntimeRecipe): Promise<void> {
    const temporary = await this.temporary()
    const requirements = join(temporary, 'requirements.lock')
    try {
      await writeFile(requirements, lock, 'utf8')
      // Dry resolution verifies closure without copying multi-gigabyte wheels or modifying the source.
      const args = [...offlinePipArguments('install', folder, requirements, join(temporary, 'target')), '--dry-run', '--ignore-installed', '--platform', 'win_amd64', '--python-version', '312', '--implementation', 'cp', '--abi', 'cp312']
      await this.pip(args, signal)
      if (recipe) {
        const catalogRequirements = join(temporary, 'catalog.txt')
        await writeFile(catalogRequirements, [...[recipe.wheel, ...recipe.companions].map(item => join(folder, item.filename)), ...recipe.requirements].join('\n'), 'utf8')
        const catalogArgs = args.filter(arg => arg !== '--require-hashes')
        catalogArgs[catalogArgs.indexOf('-r') + 1] = catalogRequirements
        await this.pip(catalogArgs, signal)
      }
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  async install(ids: string[], bundleDirectory: string, signal: AbortSignal, progress: OfflineRuntimeProgress): Promise<void> {
    if ((await lstat(bundleDirectory)).isSymbolicLink()) throw new Error('Runtime links are not allowed')
    const root = join(bundleDirectory, 'runtimes')
    const manifest = await this.manifest(root)
    for (const [position, id] of [...new Set(ids)].entries()) {
      signal.throwIfAborted()
      const resource = manifest.resources.find(item => item.id === id)
      if (!resource) throw new Error('Runtime missing from package')
      progress('verify', position, ids.length, id)
      const lock = await this.validate(root, resource, signal)
      const folder = join(root, id)
      progress('install', position, ids.length, id)
      if (lock) {
        await this.verifyClosure(folder, lock, signal, this.options.recipes.find(item => item.id === id))
        const temporary = await this.temporary()
        try {
          const requirements = join(temporary, 'requirements.lock')
          await writeFile(requirements, lock, 'utf8')
          await this.options.installPython(id, folder, requirements, signal)
        } finally { await rm(temporary, { recursive: true, force: true }) }
      } else if (resource.kind === 'crisp') {
        if (!this.options.installCrisp) throw new Error('CrispASR installer unavailable')
        await this.options.installCrisp(CRISP_RUNTIME_FILES.map(file => join(folder, file.name)), signal)
      } else await this.options.installLlama(id, resource.files.map(file => join(folder, file.name)), signal)
      progress('install', position + 1, ids.length, id)
    }
  }
}
