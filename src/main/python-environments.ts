import { createHash, randomUUID } from 'node:crypto'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, basename } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { runtimeRecipeSchema, type HardwareInventory, type RuntimeRecipe, type RuntimeRecipeState, type RuntimeSnapshot } from '../shared/compute'
import { compareDriverVersions } from './hardware-inventory'

const run = promisify(execFile)
const recipesSchema = z.object({ version: z.literal(1), recipes: z.array(runtimeRecipeSchema).max(16) })
const baseSchema = z.object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  pythonAbi: z.literal('cp313-win_amd64'), torchVersion: z.string() })
type Download = (recipe: RuntimeRecipe['wheel'], path: string, signal: AbortSignal, progress: (bytes: number) => void) => Promise<void>
type Verify = (path: string, signal: AbortSignal) => Promise<string>

/** Mirrors the launcher's fixed install recipes + backend precheck, using an app-owned Python. */
export class PythonEnvironments {
  recipes: RuntimeRecipe[] = []
  operation: RuntimeSnapshot['operation'] = null
  lastError: string | null = null
  private base: z.infer<typeof baseSchema> | null = null
  private installedIds = new Set<string>()
  private controller: AbortController | null = null

  constructor(private readonly directory: string, private readonly baseDirectory: string,
    private readonly recipesPath: string, readonly hardware: HardwareInventory,
    private readonly download: Download, private readonly digest: Verify) {}

  private inside(name: string): string {
    const target = resolve(this.directory, name)
    const path = relative(resolve(this.directory), target)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('推理环境路径无效')
    return target
  }

  async initialize(): Promise<void> {
    try {
      this.recipes = recipesSchema.parse(JSON.parse((await readFile(this.recipesPath, 'utf8')).replace(/^\uFEFF/, ''))).recipes
      if (new Set(this.recipes.map(r => r.id)).size !== this.recipes.length) throw new Error('依赖配方 ID 重复')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.lastError = `依赖配方无法读取：${String(error)}`
    }
    try {
      this.base = baseSchema.parse(JSON.parse(await readFile(join(this.baseDirectory, 'runtime-base.json'), 'utf8')))
      await access(join(this.baseDirectory, 'python.exe'))
    } catch { this.base = null }
    const names = await readdir(this.directory).catch(() => [] as string[])
    for (const recipe of this.recipes) {
      const destination = this.inside(recipe.id)
      if (!await access(destination).then(() => true, () => false)) {
        for (const name of names.filter(n => n.startsWith(`backup-${recipe.id}-`))) {
          try {
            const backup = this.inside(name)
            const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
            if (marker.id !== recipe.id || marker.fingerprint !== this.fingerprint(recipe)) continue
            await rename(backup, destination)
            break
          } catch { /* Preserve directories that cannot be identified. */ }
        }
      }
      try {
        const root = this.inside(recipe.id)
        const marker = JSON.parse(await readFile(join(root, 'runtime-installed.json'), 'utf8'))
        if (marker.id !== recipe.id || marker.fingerprint !== this.fingerprint(recipe)) continue
        await access(join(root, 'python.exe'))
        this.installedIds.add(recipe.id)
      } catch { /* Partial/old environments are not selected. */ }
    }
  }

  private fingerprint(recipe: RuntimeRecipe): string {
    return createHash('sha256').update(JSON.stringify({ recipe: runtimeRecipeSchema.parse(recipe), base: this.base?.fingerprint })).digest('hex')
  }

  states(): RuntimeRecipeState[] {
    return this.recipes.map(recipe => {
      let reason = ''
      if (!this.base) reason = '当前应用未包含可管理的 Python 基础环境'
      else if (this.base.torchVersion.split('+')[0] !== recipe.torchVersion.split('+')[0]) reason = '依赖配方与当前模型环境版本不匹配'
      else if (!this.hardware.nvidiaDriver) reason = '未检测到可用的 NVIDIA 驱动'
      else if (compareDriverVersions(this.hardware.nvidiaDriver, recipe.minimumDriver) < 0) reason = `本配方要求 NVIDIA 驱动 ${recipe.minimumDriver} 或更新版本`
      return { ...recipe, installed: this.installedIds.has(recipe.id), available: !reason, reason }
    })
  }

  recommendedId(): string | null { return this.states().find(r => r.available)?.id ?? null }
  has(id: string): boolean { return this.recipes.some(r => r.id === id) }
  directoryFor(id: string): string {
    if (!this.installedIds.has(id)) throw new Error('所选 Python 环境尚未准备，请先准备计算环境')
    return this.inside(id)
  }
  automaticDirectory(): string | undefined {
    const id = this.recommendedId()
    return id && this.installedIds.has(id) ? this.directoryFor(id) : undefined
  }
  cancel(): void { this.controller?.abort() }

  async importWheel(path: string, isActive: (path: string) => boolean): Promise<void> {
    if (this.operation) throw new Error('已有环境准备任务')
    const controller = new AbortController()
    this.controller = controller
    this.lastError = null
    this.operation = { id: 'offline-wheel', phase: 'verify', bytes: 0, totalBytes: 0 }
    let recipe: RuntimeRecipe | undefined
    try {
      const size = (await stat(path)).size
      this.operation.bytes = size
      this.operation.totalBytes = size
      const candidates = this.recipes.filter(r => r.wheel.bytes === size)
      if (!candidates.length) throw new Error('此 wheel 不属于当前版本的依赖配方')
      const hash = await this.digest(path, controller.signal)
      recipe = candidates.find(r => r.wheel.sha256 === hash)
      if (!recipe) throw new Error('离线 wheel 校验失败')
      const cache = this.inside('wheel-cache')
      await mkdir(cache, { recursive: true })
      const target = join(cache, recipe.wheel.filename)
      if (resolve(path).toLowerCase() !== target.toLowerCase()) {
        await cp(path, target, { filter: () => { controller.signal.throwIfAborted(); return true } })
      }
      controller.signal.throwIfAborted()
    } catch (error) {
      this.lastError = controller.signal.aborted ? '导入已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      this.operation = null
      this.controller = null
    }
    await this.install(recipe.id, false, isActive)
  }

  async install(id: string, repair: boolean, isActive: (path: string) => boolean): Promise<void> {
    if (this.operation) throw new Error('已有环境准备任务')
    const state = this.states().find(r => r.id === id)
    if (!state) throw new Error('依赖配方不存在')
    if (!state.available) throw new Error(state.reason)
    if (state.installed && !repair) return
    const destination = this.inside(id)
    if (isActive(destination)) throw new Error('该环境正在使用，请先选择随包环境并应用后再修复')
    const controller = new AbortController()
    this.controller = controller
    this.lastError = null
    this.operation = { id, phase: 'download', bytes: 0, totalBytes: state.wheel.bytes }
    const cache = this.inside('wheel-cache')
    const wheel = join(cache, state.wheel.filename)
    const staging = this.inside(`staging-${id}-${randomUUID()}`)
    const backup = this.inside(`backup-${id}-${randomUUID()}`)
    let movedOld = false
    try {
      await mkdir(cache, { recursive: true })
      await this.download(state.wheel, wheel, controller.signal, bytes => { if (this.operation) this.operation.bytes = bytes })
      this.operation.phase = 'verify'
      if (await this.digest(wheel, controller.signal) !== state.wheel.sha256) {
        await rm(wheel, { force: true })
        throw new Error('PyTorch 下载校验失败，请重新准备')
      }
      this.operation.phase = 'prepare'
      // Copy common, pinned dependencies; torch itself comes from the selected backend wheel.
      await cp(this.baseDirectory, staging, { recursive: true, dereference: false,
        filter: async source => {
          controller.signal.throwIfAborted()
          const name = basename(source)
          return !/^(torch|torchgen|functorch)$|^torch-[^\\/]+\.dist-info$|^__editable__/i.test(name)
        } })
      controller.signal.throwIfAborted()
      const python = join(staging, 'python.exe')
      await run(python, ['-I', '-m', 'pip', '--isolated', 'install', '--quiet', '--no-index', '--no-deps',
        '--disable-pip-version-check', '--no-warn-script-location', wheel], {
        cwd: staging, windowsHide: true, signal: controller.signal, timeout: 30 * 60_000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1' },
      })
      this.operation.phase = 'check'
      const probe = await run(python, ['-I', '-m', 'nola_translator_engine'], {
        cwd: staging, windowsHide: true, signal: controller.signal, timeout: 60_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1', NOLA_TRANSLATOR_RUNTIME_PROBE: '1' },
      })
      const actual = JSON.parse(probe.stdout.trim()) as { backend?: string; torch?: string; cudaAvailable?: boolean }
      if (actual.backend !== state.backend || actual.torch !== state.torchVersion || !actual.cudaAvailable) {
        throw new Error('安装后的 PyTorch 版本、后端或驱动检查未通过；请检查显卡驱动')
      }
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({
        id, kind: 'python', fingerprint: this.fingerprint(state), torch: actual.torch, backend: actual.backend,
      }), 'utf8')
      controller.signal.throwIfAborted()
      if (isActive(destination)) throw new Error('环境仍在使用，无法切换')
      try {
        await access(destination)
        const previous = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (previous.id !== id) throw new Error('目标目录不属于本应用，拒绝替换')
        await rename(destination, backup)
        movedOld = true
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try { await rename(staging, destination) }
      catch (error) { if (movedOld) await rename(backup, destination); throw error }
      this.installedIds.add(id)
      if (movedOld) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    } catch (error) {
      this.lastError = controller.signal.aborted ? '环境准备已取消；下载缓存已保留' : String(error)
      throw new Error(this.lastError)
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      this.operation = null
      this.controller = null
    }
  }
}
