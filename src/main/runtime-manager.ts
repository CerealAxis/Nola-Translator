import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, cp, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { net } from 'electron'
import { z } from 'zod'
import { runtimePackageSchema, type ComputeSettings, type RuntimePackage, type RuntimeSnapshot, type HardwareInventory } from '../shared/compute'
import { compareDriverVersions, probeHardware } from './hardware-inventory'
import { PythonEnvironments } from './python-environments'
import { missingLocalRuntime, probeLocalEngine, probeLocalLlama } from './local-runtimes'
import { decodeDeviceIntent, selectedLlamaBackend } from '../shared/device-selection'
import type { EngineLaunchSpec } from './engine-process'

const run = promisify(execFile)
const catalogSchema = z.object({ version: z.literal(1), packages: z.array(runtimePackageSchema).max(32) })

/** Versioned, hash-verified sidecars. Installation never edits a running environment. */
export class RuntimeManager {
  private packages: RuntimePackage[] = []
  private operation: RuntimeSnapshot['operation'] = null
  private cancellation: AbortController | null = null
  private lastError: string | null = null
  private automaticEngineId: string | null = null
  private activeDirectories: string[] = []
  private python: PythonEnvironments | null = null
  private hardware: HardwareInventory = { adapters: [], nvidiaDriver: null, notes: [] }
  private preparationCancelled = false
  private local: RuntimeSnapshot['local'] = { engine: missingLocalRuntime(), llama: missingLocalRuntime() }

  constructor(readonly directory: string, private readonly catalogPath: string, private readonly extractScript: string,
    private readonly pythonOptions?: { recipesPath: string; baseDirectory: string;
      localEngine?: EngineLaunchSpec; localLlamaDirectory?: string; source?: 'project' | 'bundled' }) {}

  async initialize(): Promise<void> {
    const source = this.pythonOptions?.source ?? 'bundled'
    const [hardware, engine, llama] = await Promise.all([probeHardware(),
      this.pythonOptions?.localEngine ? probeLocalEngine(this.pythonOptions.localEngine, source) : Promise.resolve(missingLocalRuntime()),
      this.pythonOptions?.localLlamaDirectory ? probeLocalLlama(this.pythonOptions.localLlamaDirectory, source) : Promise.resolve(missingLocalRuntime())])
    this.hardware = hardware
    this.local = { engine, llama }
    if (this.pythonOptions) {
      this.python = new PythonEnvironments(this.directory, this.pythonOptions.baseDirectory, this.pythonOptions.recipesPath,
        this.hardware, (item, path, signal, progress) => this.download(item, path, signal, progress),
        (path, signal) => this.digest(path, signal))
      await this.python.initialize()
    }
    try {
      const catalog = catalogSchema.parse(JSON.parse((await readFile(this.catalogPath, 'utf8')).replace(/^\uFEFF/, '')))
      if (new Set(catalog.packages.map(p => p.id)).size !== catalog.packages.length) throw new Error('运行包目录含重复 ID')
      this.packages = catalog.packages
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.lastError = `运行包目录无法读取：${String(error)}`
    }
    // Recover the previous directory if shutdown interrupted the two-rename repair transaction.
    const names = await readdir(this.directory).catch(() => [] as string[])
    for (const item of this.packages) {
      const destination = this.inside(item.id)
      if (await access(destination).then(() => true, () => false)) continue
      for (const name of names.filter(name => name.startsWith(`backup-${item.id}-`))) {
        try {
          const backup = this.inside(name)
          const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
          if (marker.id !== item.id || marker.sha256 !== item.sha256) continue
          await rename(backup, destination)
          break
        } catch { /* Leave unrecognized directories untouched. */ }
      }
    }
    // Only release entries are candidates; XPU/ROCm are not automatically chosen.
    let nvidia = false
    try {
      const result = await run('nvidia-smi.exe', ['--query-gpu=name', '--format=csv,noheader'], { windowsHide: true, timeout: 5000 })
      nvidia = !!result.stdout.trim()
    } catch { /* CPU/bundled remains available without NVIDIA tools. */ }
    const backend = nvidia ? 'cuda' : 'cpu'
    for (const item of this.packages.filter(p => p.kind === 'engine' && p.backend === backend)) {
      if (await this.installed(item)) { this.automaticEngineId = item.id; break }
    }
    await this.snapshot()
  }

  automaticEngineDirectory(): string | undefined {
    if (this.canReuseLocalEngine()) return undefined
    return this.python?.automaticDirectory() ?? (this.automaticEngineId ? this.packageDirectory(this.automaticEngineId, 'engine') : undefined)
  }

  recommendation(): RuntimeSnapshot['recommendation'] {
    const candidate = this.python?.recommendedId() ?? null
    const reusableEngine = this.canReuseLocalEngine()
    const engineId = reusableEngine ? null : candidate
    const llamaBackend = this.hardware.nvidiaDriver && compareDriverVersions(this.hardware.nvidiaDriver, '551.61') >= 0 ? 'cuda' : 'vulkan'
    const llamaId = this.local.llama.status === 'ready' && this.local.llama.gpuAvailable ? null : (this.hardware.nvidiaDriver || this.hardware.adapters.some(a => a.vendor !== 'other'))
      ? this.packages.find(p => p.kind === 'llama' && p.backend === llamaBackend)?.id ?? null : null
    const reasons = [reusableEngine ? `复用本地 PyTorch ${this.local.engine.version}，无需重复安装`
      : engineId ? '可按需要准备 PyTorch CUDA 加速依赖'
        : this.local.engine.status === 'ready' ? `本地 PyTorch ${this.local.engine.version} 已可用` : '本地 Python 环境检查未通过，请查看推理环境中的具体原因',
      this.local.llama.status === 'ready' && this.local.llama.gpuAvailable ? `复用本地 llama.cpp ${this.local.llama.backend.toUpperCase()}，无需重复安装`
        : llamaId ? `可按需要准备 GGUF ${llamaBackend.toUpperCase()} 加速依赖` : this.local.llama.status === 'ready' ? '本地 llama.cpp CPU 环境已可用' : '没有找到可用的本地 llama.cpp 环境']
    return { engineId, llamaId, reasons }
  }

  private canReuseLocalEngine(): boolean {
    return this.local.engine.status === 'ready' && this.local.engine.gpuAvailable
  }

  selectedDirectories(compute: ComputeSettings): { engine?: string; llama?: string } {
    return {
      engine: compute.runtimeId === 'auto' ? this.automaticEngineDirectory()
        : compute.runtimeId === 'bundled' ? undefined : this.packageDirectory(compute.runtimeId, 'engine'),
      llama: compute.llamaRuntimeId === 'auto'
        ? (() => { const id = this.llamaRecommendation(compute); return id && this.installedLlamaIds.has(id) ? this.packageDirectory(id, 'llama') : undefined })()
        : compute.llamaRuntimeId === 'bundled' ? undefined : this.packageDirectory(compute.llamaRuntimeId, 'llama'),
    }
  }
  private installedLlamaIds = new Set<string>()
  private llamaRecommendation(compute: ComputeSettings): string | null {
    const backend = selectedLlamaBackend(compute.translationDevice)
    if (this.local.llama.status === 'ready' && this.local.llama.gpuAvailable &&
      (!backend || this.local.llama.backend === backend)) return null
    if (backend) return this.packages.find(p => p.kind === 'llama' && p.backend === backend)?.id ?? null
    return this.recommendation().llamaId
  }

  async prepare(compute: ComputeSettings, translation: 'torch' | 'llama' | 'none' = 'llama'): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('已有环境安装任务，请等待完成')
    for (const value of [compute.recognitionDevice, ...(translation === 'torch' ? [compute.translationDevice] : [])]) {
      const intent = decodeDeviceIntent(value)
      if (intent && intent.backend !== 'cuda') throw new Error('当前识别与 PyTorch 翻译环境仅支持 CPU / CUDA；该设备尚无匹配的模型运行环境')
      if (intent && !this.hardware.adapters.some(a => a.hardwareId === intent.hardwareId)) throw new Error('指定显卡已断开，请重新选择')
      if (intent && compute.runtimeId !== 'auto') {
        const backend = compute.runtimeId === 'bundled' ? this.local.engine.backend
          : this.python?.states().find(p => p.id === compute.runtimeId)?.backend ?? this.packages.find(p => p.id === compute.runtimeId)?.backend
        if (backend !== intent.backend) throw new Error('指定的 PyTorch 环境与显卡后端不一致，请选择自动环境')
      }
    }
    const llamaIntent = translation === 'llama' ? decodeDeviceIntent(compute.translationDevice) : null
    if (llamaIntent) {
      if (!['cuda', 'vulkan'].includes(llamaIntent.backend)) throw new Error('当前版本没有匹配的 llama.cpp 运行环境')
      if (!this.hardware.adapters.some(a => a.hardwareId === llamaIntent.hardwareId)) throw new Error('指定显卡已断开，请重新选择')
    }
    if (llamaIntent && compute.llamaRuntimeId !== 'auto') {
      const backend = compute.llamaRuntimeId === 'bundled' ? this.local.llama.backend : this.packages.find(p => p.id === compute.llamaRuntimeId)?.backend
      if (backend !== llamaIntent.backend) throw new Error('指定的 llama.cpp 环境与显卡后端不一致，请选择自动环境')
    }
    this.preparationCancelled = false
    const recommended = this.recommendation()
    const engineId = compute.runtimeId === 'auto'
      ? (compute.recognitionDevice !== 'cpu' || (translation === 'torch' && compute.translationDevice !== 'cpu') ? recommended.engineId : null)
      : compute.runtimeId === 'bundled' ? null : compute.runtimeId
    const llamaId = compute.llamaRuntimeId === 'auto'
      ? (translation === 'llama' && compute.translationDevice !== 'cpu' && compute.gpuLayers !== 0 ? this.llamaRecommendation(compute) : null)
      : compute.llamaRuntimeId === 'bundled' ? null : compute.llamaRuntimeId
    if (engineId) await this.install(engineId)
    if (this.preparationCancelled) throw new Error('环境准备已取消')
    if (llamaId) await this.install(llamaId)
    if (this.preparationCancelled) throw new Error('环境准备已取消')
  }

  setActiveDirectories(directories: string[]): void {
    this.activeDirectories = directories.map(path => resolve(path).toLowerCase())
  }

  packageDirectory(id: string, kind: 'engine' | 'llama'): string {
    if (kind === 'engine' && this.python?.has(id)) return this.python.directoryFor(id)
    const item = this.packages.find(p => p.id === id && p.kind === kind)
    if (!item) throw new Error('未找到所选运行包，请在计算设备设置中安装或选择随包环境')
    if (this.operation?.id === id && this.operation.phase === 'extract') throw new Error('所选运行环境正在安装，请等待完成')
    return this.inside(id)
  }

  private inside(name: string): string {
    const target = resolve(this.directory, name)
    const path = relative(resolve(this.directory), target)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('运行环境路径无效')
    return target
  }

  private async installed(item: RuntimePackage): Promise<boolean> {
    try {
      const root = this.inside(item.id)
      const marker = JSON.parse(await readFile(join(root, 'runtime-installed.json'), 'utf8'))
      if (marker.sha256 !== item.sha256 || marker.kind !== item.kind) return false
      if (JSON.stringify(marker.companionHashes ?? []) !== JSON.stringify(item.companions?.map(c => c.sha256) ?? [])) return false
      await access(join(root, item.kind === 'engine' ? 'NolaTranslatorEngine.exe' : 'llama-server.exe'))
      return true
    } catch { return false }
  }

  async snapshot(): Promise<RuntimeSnapshot> {
    const packages = await Promise.all(this.packages.map(async item => ({ ...item, installed: await this.installed(item) })))
    this.installedLlamaIds = new Set(packages.filter(p => p.kind === 'llama' && p.installed).map(p => p.id))
    return {
      packages, recipes: this.python?.states() ?? [], hardware: this.hardware, recommendation: this.recommendation(), local: this.local,
      directory: this.directory, operation: this.operation ? { ...this.operation } : this.python?.operation ? { ...this.python.operation } : null,
      lastError: this.lastError ?? this.python?.lastError ?? null,
    }
  }

  cancel(): void { this.preparationCancelled = true; this.cancellation?.abort(); this.python?.cancel() }

  async install(id: string, repair = false): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('已有环境准备任务')
    this.lastError = null
    if (this.python?.has(id)) {
      await this.python.install(id, repair, path => this.activeDirectories.includes(resolve(path).toLowerCase()))
      return
    }
    const item = this.packages.find(p => p.id === id)
    if (!item) throw new Error('运行包不在本版本发布目录中')
    if (!repair && await this.installed(item)) { if (item.kind === 'llama') this.installedLlamaIds.add(id); return }
    if (this.activeDirectories.includes(this.inside(item.id).toLowerCase())) throw new Error('该环境正在使用；请切换到随包环境并应用后再修复')
    await this.perform(item, null)
    if (item.kind === 'llama') this.installedLlamaIds.add(id)
  }

  async importArchive(path: string): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('已有运行包安装任务')
    this.lastError = null
    if (extname(path).toLowerCase() === '.whl') {
      if (!this.python) throw new Error('当前应用不支持依赖配方')
      await this.python.importWheel(path, activePath => this.activeDirectories.includes(resolve(activePath).toLowerCase()))
      return
    }
    const size = (await stat(path)).size
    const candidates = this.packages.filter(p => p.bytes === size)
    const companions = this.packages.flatMap(p => (p.companions ?? []).map((part, index) => ({ part, id: p.id, index }))).filter(c => c.part.bytes === size)
    if (!candidates.length && !companions.length) throw new Error('离线包不属于当前版本的运行包目录，请下载配套运行包')
    if (this.operation || this.python?.operation) throw new Error('已有运行包安装任务')
    const controller = new AbortController()
    this.cancellation = controller
    this.operation = { id: 'offline-import', phase: 'verify', bytes: size, totalBytes: size }
    let item: RuntimePackage | undefined
    try {
      const digest = await this.digest(path, controller.signal)
      item = candidates.find(p => p.sha256 === digest)
      if (!item) {
        const companion = companions.find(c => c.part.sha256 === digest)
        if (!companion) throw new Error('离线包校验失败，文件可能不完整或不属于本版本')
        await mkdir(this.directory, { recursive: true })
        const target = this.inside(`${companion.id}-companion-${companion.index}.zip.partial`)
        if (resolve(path).toLowerCase() !== target.toLowerCase()) {
          await cp(path, target, { filter: () => { controller.signal.throwIfAborted(); return true } })
        }
        return
      }
    } catch (error) {
      this.lastError = controller.signal.aborted ? '导入已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      this.cancellation = null
      this.operation = null
    }
    if (await this.installed(item)) return
    await this.perform(item, path)
  }

  private async digest(path: string, signal?: AbortSignal): Promise<string> {
    const hash = createHash('sha256')
    for await (const block of createReadStream(path, { signal })) hash.update(block as Buffer)
    return hash.digest('hex')
  }

  private async perform(item: RuntimePackage, offlinePath: string | null): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('已有运行包安装任务')
    const controller = new AbortController()
    this.cancellation = controller
    this.lastError = null
    this.operation = { id: item.id, phase: offlinePath ? 'verify' : 'download', bytes: 0,
      totalBytes: item.bytes + (item.companions?.reduce((n, c) => n + c.bytes, 0) ?? 0) }
    const cache = this.inside(`${item.id}.zip.partial`)
    const staging = this.inside(`staging-${item.id}-${randomUUID()}`)
    const backup = this.inside(`backup-${item.id}-${randomUUID()}`)
    let movedOld = false
    try {
      await mkdir(this.directory, { recursive: true })
      const archive = offlinePath ?? cache
      if (!offlinePath) await this.download(item, cache, controller.signal)
      this.operation.phase = 'verify'
      if ((await stat(archive)).size !== item.bytes || await this.digest(archive, controller.signal) !== item.sha256) {
        if (!offlinePath) await rm(cache, { force: true })
        throw new Error('运行包校验失败，请重新下载')
      }
      this.operation.phase = 'extract'
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', this.extractScript, '-Archive', archive, '-Destination', staging],
      { windowsHide: true, signal: controller.signal, timeout: 15 * 60_000, maxBuffer: 1024 * 1024 })
      let downloaded = item.bytes
      for (const [index, companion] of (item.companions ?? []).entries()) {
        const companionCache = this.inside(`${item.id}-companion-${index}.zip.partial`)
        const companionStaging = this.inside(`staging-${item.id}-companion-${randomUUID()}`)
        try {
          this.operation.phase = 'download'
          if (offlinePath && await stat(companionCache).then(s => s.size, () => 0) !== companion.bytes) {
            throw new Error('请先导入与此运行包配套的 cudart DLL 离线包，再导入服务包')
          }
          await this.download(companion, companionCache, controller.signal, bytes => { if (this.operation) this.operation.bytes = downloaded + bytes })
          this.operation.phase = 'verify'
          if ((await stat(companionCache)).size !== companion.bytes || await this.digest(companionCache, controller.signal) !== companion.sha256) {
            await rm(companionCache, { force: true })
            throw new Error('后端 DLL 包校验失败，请重新准备')
          }
          this.operation.phase = 'extract'
          await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.extractScript,
            '-Archive', companionCache, '-Destination', companionStaging],
          { windowsHide: true, signal: controller.signal, timeout: 15 * 60_000, maxBuffer: 1024 * 1024 })
          await cp(companionStaging, staging, { recursive: true, filter: () => { controller.signal.throwIfAborted(); return true } })
          downloaded += companion.bytes
        } finally { await rm(companionStaging, { recursive: true, force: true }).catch(() => undefined) }
      }
      const executable = item.kind === 'engine' ? 'NolaTranslatorEngine.exe' : 'llama-server.exe'
      await access(join(staging, executable))
      // This is a package import probe, not a model benchmark. A broken DLL set is never activated.
      const probe = await run(join(staging, executable), item.kind === 'llama' ? ['--version'] : [], {
        cwd: staging, windowsHide: true, signal: controller.signal, timeout: 60_000, maxBuffer: 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1', NOLA_TRANSLATOR_RUNTIME_PROBE: '1' },
      })
      if (item.kind === 'engine') {
        const result = JSON.parse(probe.stdout.trim()) as { backend?: unknown }
        if (result.backend !== item.backend) throw new Error('运行包声明的后端与实际 PyTorch 环境不一致')
      }
      if (item.kind === 'llama' && item.backend !== 'cpu') {
        this.operation.phase = 'check'
        const devices = await run(join(staging, executable), ['--list-devices'], {
          cwd: staging, windowsHide: true, signal: controller.signal, timeout: 60_000, maxBuffer: 1024 * 1024,
        })
        if (!new RegExp(`\\b${item.backend}\\d+:`, 'i').test(devices.stdout + devices.stderr)) throw new Error('该后端没有发现可用显卡，请检查驱动或使用 CPU 环境')
      }
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({
        id: item.id, kind: item.kind, backend: item.backend, version: item.version, sha256: item.sha256,
        companionHashes: item.companions?.map(c => c.sha256) ?? [],
      }), 'utf8')
      controller.signal.throwIfAborted()
      const destination = this.inside(item.id)
      if (this.activeDirectories.includes(destination.toLowerCase())) throw new Error('该环境正在使用；请切换环境并重启后再修复')
      try {
        await access(destination)
        const previous = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (previous.id !== item.id) throw new Error('目标目录不是本应用管理的环境，拒绝替换')
        await rename(destination, backup)
        movedOld = true
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try { await rename(staging, destination) }
      catch (error) {
        if (movedOld) await rename(backup, destination)
        throw error
      }
      if (movedOld) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
      if (!offlinePath) await rm(cache, { force: true })
      for (const [index] of (item.companions ?? []).entries()) await rm(this.inside(`${item.id}-companion-${index}.zip.partial`), { force: true })
    } catch (error) {
      this.lastError = controller.signal.aborted ? '安装已取消；下载内容已保留，可继续安装' : String(error)
      throw new Error(this.lastError)
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => undefined)
      this.operation = null
      this.cancellation = null
    }
  }

  private async download(item: Pick<RuntimePackage, 'url' | 'bytes'>, path: string, signal: AbortSignal,
    progress: (bytes: number) => void = bytes => { if (this.operation) this.operation.bytes = bytes }): Promise<void> {
    let offset = await stat(path).then(s => s.size).catch(() => 0)
    if (offset === item.bytes) return
    if (offset > item.bytes) { await rm(path, { force: true }); offset = 0 }
    const response = await net.fetch(item.url, { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal })
    if (!response.ok || !response.body) throw new Error(`运行包下载失败：HTTP ${response.status}`)
    if (response.status === 206) {
      const range = response.headers.get('content-range')
      if (!range?.startsWith(`bytes ${offset}-`) || !range.endsWith(`/${item.bytes}`)) throw new Error('下载续传范围无效')
    } else { offset = 0 }
    const file = await open(path, offset ? 'a' : 'w')
    const reader = response.body.getReader()
    try {
      progress(offset)
      while (true) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        offset += value.byteLength
        if (offset > item.bytes) throw new Error('运行包大小超过发布目录声明')
        let written = 0
        while (written < value.byteLength) written += (await file.write(value, written, value.byteLength - written)).bytesWritten
        progress(offset)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      await file.close()
    }
  }
}
