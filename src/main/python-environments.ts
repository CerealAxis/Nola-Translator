import { cleanupRuntimeArtifacts, removeRuntimeArtifact, renameRuntimeDirectory } from './runtime-files'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { finished } from 'node:stream/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { z } from 'zod'
import { runtimeRecipeSchema, type RuntimeRecipe, type RuntimeRecipeState, type RuntimeSnapshot } from '../shared/compute'
import type { NetworkSettings } from '../shared/settings'
import { probeLocalEngine } from './local-runtimes'

const PYPI_INDEX = 'https://pypi.org/simple'
const PYPI_MIRROR = 'https://pypi.tuna.tsinghua.edu.cn/simple'
const recipesSchema = z.object({ version: z.literal(1), recipes: z.array(runtimeRecipeSchema).max(256) })
type Download = (wheel: RuntimeRecipe['wheel'], path: string, signal: AbortSignal, progress: (bytes: number) => void) => Promise<void>
type Verify = (path: string, signal: AbortSignal) => Promise<string>

/** Install only libraries; every combination shares the app's Python 3.12 interpreter. */
export class PythonEnvironments {
  recipes: RuntimeRecipe[] = []
  operation: RuntimeSnapshot['operation'] = null
  lastError: string | null = null
  private installedIds = new Set<string>()
  private controller: AbortController | null = null
  constructor(private readonly directory: string, private readonly baseDirectory: string,
    private readonly recipesPath: string, private readonly download: Download, private readonly digest: Verify,
    private readonly network?: () => NetworkSettings) {}
  private inside(name: string): string {
    const target = resolve(this.directory, name)
    const path = relative(resolve(this.directory), target)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('组件路径无效')
    return target
  }
  async initialize(): Promise<void> {
    this.recipes = recipesSchema.parse(JSON.parse((await readFile(this.recipesPath, 'utf8')).replace(/^\uFEFF/, ''))).recipes
    const names = await readdir(this.directory).catch(() => [] as string[])
    for (const recipe of this.recipes) {
      const destination = this.inside(recipe.id)
      if (!await access(destination).then(() => true, () => false)) {
        for (const name of names.filter(n => n.startsWith(`backup-${recipe.id}-`))) {
          try {
            const backup = this.inside(name)
            const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
            if (marker.id !== recipe.id || marker.kind !== 'python') continue
            await renameRuntimeDirectory(backup, destination)
            break
          } catch { /* Leave unrecognized legacy installations untouched. */ }
        }
      }
      try {
        const marker = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (marker.id === recipe.id && marker.kind === 'python') this.installedIds.add(recipe.id)
      } catch { /* Installation records, rather than folder names, grant repair ownership. */ }
    }
    await cleanupRuntimeArtifacts(this.directory, this.recipes.map(recipe => recipe.id), true)
  }
  states(): RuntimeRecipeState[] {
    return this.recipes.map(recipe => ({ ...recipe, installed: this.installedIds.has(recipe.id), available: true, reason: '' }))
  }
  has(id: string): boolean { return this.recipes.some(r => r.id === id) }
  directoryFor(id: string): string { return this.inside(id) }
  cancel(): void { this.controller?.abort() }
  async install(id: string, repair: boolean): Promise<void> {
    if (this.operation) throw new Error('已有组件安装任务')
    const state = this.states().find(r => r.id === id)
    if (!state) throw new Error('安装组合不存在')
    if (state.installed && !repair) return
    const destination = this.inside(id)
    const controller = new AbortController()
    this.controller = controller
    this.lastError = null
    const wheels = [state.wheel, ...state.companions]
    this.operation = { id, phase: 'download', bytes: 0, totalBytes: wheels.reduce((n, w) => n + w.bytes, 0), startedAt: Date.now() }
    const cache = this.inside('wheel-cache')
    const staging = this.inside(`staging-${id}-${randomUUID()}`)
    const backup = this.inside(`backup-${id}-${randomUUID()}`)
    let movedOld = false
    try {
      await mkdir(cache, { recursive: true })
      const paths: string[] = []
      let completed = 0
      for (const item of wheels) {
        // Different CUDA builds of xFormers may share a filename; their hashes identify the cache.
        const folder = join(cache, item.sha256)
        await mkdir(folder, { recursive: true })
        const wheel = join(folder, item.filename)
        await this.download(item, wheel, controller.signal, bytes => { if (this.operation) this.operation.bytes = completed + bytes })
        this.operation.phase = 'verify'
        if (await this.digest(wheel, controller.signal) !== item.sha256) {
          await rm(wheel, { force: true })
          throw new Error('组件下载校验失败，请重试安装')
        }
        paths.push(wheel)
        completed += item.bytes
        this.operation.phase = 'download'
      }
      await mkdir(staging, { recursive: true })
      this.operation.phase = 'prepare'
      await this.installLibraries(state, paths, staging, controller.signal)
      this.operation.phase = 'check'
      const actual = await probeLocalEngine(join(this.baseDirectory, 'python.exe'), staging)
      if (actual.status !== 'ready' || actual.backend !== state.backend || actual.version.split('+')[0] !== state.torchVersion ||
        (state.xformersVersion && actual.xformersVersion !== state.xformersVersion)) {
        throw new Error(actual.reason || '安装后的组件版本或后端与所选组合不一致')
      }
      controller.signal.throwIfAborted()
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({ id, kind: 'python', backend: state.backend,
        torch: actual.version, xformersVersion: actual.xformersVersion, pythonAbi: state.pythonAbi }), 'utf8')
      try {
        await access(destination)
        const marker = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (marker.id !== id || marker.kind !== 'python') throw new Error('目标目录不属于软件安装的组件，不能覆盖')
        await renameRuntimeDirectory(destination, backup)
        movedOld = true
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try { await renameRuntimeDirectory(staging, destination) }
      catch (error) { if (movedOld) await renameRuntimeDirectory(backup, destination); throw error }
      this.installedIds.add(id)
      if (movedOld) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    } catch (error) {
      this.lastError = controller.signal.aborted ? '安装已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      for (const artifact of [staging, cache, this.inside('pip-temp')]) {
        await removeRuntimeArtifact(this.directory, artifact).catch(error => {
          this.lastError = `${this.lastError ? `${this.lastError}；` : ''}安装临时文件清理失败：${String(error)}`
        })
      }
      this.operation = null
      this.controller = null
    }
  }

  private async installLibraries(state: RuntimeRecipe, paths: string[], staging: string, signal: AbortSignal): Promise<void> {
    const temporary = this.inside('pip-temp')
    await mkdir(temporary, { recursive: true })
    const log = createWriteStream(this.inside(`install-${state.id}.log`))
    const logDone = finished(log).catch((error: unknown) => error)
    // `--isolated` together with PIP_CONFIG_FILE=nul discards whatever pip.conf the machine
    // carries, so the flag below is the only route a configured proxy can take into pip.
    const network = this.network?.()
    const index = network?.usePypiMirror ? PYPI_MIRROR : PYPI_INDEX
    const proxy = network?.proxyForPip ? network.proxyUrl.trim() : ''
    let childClosed: Promise<void> | undefined
    try {
      await new Promise<void>((resolveInstall, reject) => {
        // Same-volume temporary files avoid copying the whole CUDA package a second time.
        // Compile only imported modules at runtime, rather than every dependency during installation.
        const child = execFile(join(this.baseDirectory, 'python.exe'), ['-I', '-u', '-m', 'pip', '--isolated', 'install',
          '--disable-pip-version-check', '--no-warn-script-location', '--no-cache-dir', '--no-compile', '--progress-bar', 'off', '--target', staging,
          '--index-url', index, '--extra-index-url', state.indexUrl,
          ...(proxy ? ['--proxy', proxy] : []),
          ...paths, ...state.requirements], {
          cwd: this.baseDirectory, windowsHide: true, signal, timeout: 30 * 60_000, maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, PYTHONUTF8: '1', PIP_CONFIG_FILE: 'nul', TEMP: temporary, TMP: temporary },
        }, error => error ? reject(error) : resolveInstall())
        childClosed = new Promise<void>(resolveClosed => { child.once('close', () => resolveClosed()) })
        for (const stream of [child.stdout, child.stderr]) {
          stream?.pipe(log, { end: false })
          stream?.setEncoding('utf8')
          stream?.on('data', (chunk: string) => {
            const line = chunk.split(/[\r\n]+/).map(value => value.trim()).filter(Boolean).at(-1)
            if (line && this.operation) this.operation.detail = line.slice(0, 512)
          })
        }
      })
    } finally {
      // Abort callbacks can run before close; cleanup must wait until pip releases its files.
      if (signal.aborted) await childClosed
      log.end()
      const error = await logDone
      if (error instanceof Error) throw error
    }
  }
}
