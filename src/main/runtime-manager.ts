import { cleanupRuntimeArtifacts, removeRuntimeArtifact, renameRuntimeDirectory } from './runtime-files'
import { logDiagnostic, processFailure } from './session-log'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { net, session } from 'electron'
import { z } from 'zod'
import { runtimePackageSchema, type ComputeSettings, type LocalRuntime, type RuntimePackage, type RuntimeSnapshot, type HardwareInventory } from '../shared/compute'
import type { NetworkSettings } from '../shared/settings'
import { probeHardware } from './hardware-inventory'
import { PythonEnvironments } from './python-environments'
import { localCandidates, missingLocalRuntime, probeLocalEngine, probeLocalLlama } from './local-runtimes'
import { decodeDeviceIntent } from '../shared/device-selection'

const run = promisify(execFile)
const catalogSchema = z.object({ version: z.literal(1), packages: z.array(runtimePackageSchema).max(32) })
const GITHUB_ASSET_HOSTS = new Set(['github.com', 'objects.githubusercontent.com'])
type Options = { recipesPath: string; baseDirectory: string; localLlamaDirectory?: string; network?: () => NetworkSettings }

/**
 * Chromium resolves every `net.fetch` through one session-wide proxy setting, so the rules are
 * installed for the length of a single request and cleared afterwards: a runtime download that
 * outlived its lease would otherwise have its next redirect resolved by another channel's rules.
 */
export async function withSessionProxy<T>(proxyRules: string, action: () => Promise<T>): Promise<T> {
  await session.defaultSession.setProxy(proxyRules ? { mode: 'fixed_servers', proxyRules } : { mode: 'direct' })
  try { return await action() }
  finally { await session.defaultSession.setProxy({ mode: 'direct' }) }
}

/** Checks never install. A successful explicit install is the only action that switches components. */
export class RuntimeManager {
  private packages: RuntimePackage[] = []
  private operation: RuntimeSnapshot['operation'] = null
  private cancellation: AbortController | null = null
  private lastError: string | null = null
  private python: PythonEnvironments | null = null
  private hardware: HardwareInventory = { adapters: [], nvidiaDriver: null, notes: [] }
  private local: RuntimeSnapshot['local'] = { engine: missingLocalRuntime(), llama: missingLocalRuntime() }
  private pythonState: NonNullable<RuntimeSnapshot['python']> = { path: '', version: '', ready: false, reason: '' }
  private checking: Promise<void> | null = null
  constructor(readonly directory: string, private readonly catalogPath: string, private readonly extractScript: string,
    private readonly options: Options) {}

  async initialize(): Promise<void> {
    this.hardware = await probeHardware()
    logDiagnostic('runtime.hardware', this.hardware)
    this.packages = catalogSchema.parse(JSON.parse((await readFile(this.catalogPath, 'utf8')).replace(/^\uFEFF/, ''))).packages
    this.python = new PythonEnvironments(this.directory, this.options.baseDirectory, this.options.recipesPath,
      (item, path, signal, progress) => this.download(item, path, signal, progress), (path, signal) => this.digest(path, signal),
      this.options.network)
    await this.python.initialize()
    const names = await readdir(this.directory).catch(() => [] as string[])
    for (const item of this.packages) {
      const destination = this.inside(item.id)
      if (await access(destination).then(() => true, () => false)) continue
      for (const name of names.filter(n => n.startsWith(`backup-${item.id}-`))) {
        try {
          const backup = this.inside(name)
          const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
          if (marker.id !== item.id || marker.kind !== 'llama') continue
          await renameRuntimeDirectory(backup, destination)
          break
        } catch { /* Unrecognized directories never grant permission to replace files. */ }
      }
    }
    await cleanupRuntimeArtifacts(this.directory, this.packages.map(item => item.id))
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'current-components.json'), 'utf8')) as RuntimeSnapshot['local']
      for (const kind of ['engine', 'llama'] as const) if (typeof saved[kind]?.path === 'string') this.local[kind] = { ...missingLocalRuntime(saved[kind].path), id: saved[kind].id }
    } catch { /* First launch discovers existing installations. */ }
    await this.recheck()
  }

  async recheck(): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('组件安装中，请等待完成')
    if (this.checking) return this.checking
    this.checking = this.checkComponents().finally(() => { this.checking = null })
    return this.checking
  }
  private async checkComponents(): Promise<void> {
    const python = join(this.options.baseDirectory, 'python.exe')
    try {
      const result = await run(python, ['-I', '-c', 'import sys,struct; assert sys.version_info[:2] == (3,12) and struct.calcsize("P") == 8, "Windows x64 Python 3.12 required"; print(sys.version.split()[0])'],
        { windowsHide: true, timeout: 10_000 })
      this.pythonState = { path: python, version: result.stdout.trim(), ready: true, reason: '' }
    } catch (error) {
      this.pythonState = { path: python, version: '', ready: false, reason: String(error) }
      logDiagnostic('runtime.python-base.failed', { python, ...processFailure(error) })
    }
    const candidates = await localCandidates(this.options.baseDirectory, this.directory, this.options.localLlamaDirectory)
    const inspect = async (kind: 'engine' | 'llama', paths: string[]): Promise<LocalRuntime> => {
      let failure: LocalRuntime | null = null
      const previous = this.local[kind]
      const unique = [...new Set([previous.path, ...paths].filter(Boolean))]
      for (const path of unique) {
        const actual = kind === 'engine'
          ? this.pythonState.ready ? await probeLocalEngine(python, path) : { ...missingLocalRuntime(path), status: 'failed' as const, reason: this.pythonState.reason }
          : await probeLocalLlama(path)
        let id: string | undefined
        try {
          const marker = JSON.parse(await readFile(join(path, 'runtime-installed.json'), 'utf8'))
          if (typeof marker.id === 'string' && resolve(path).toLowerCase() === this.inside(marker.id).toLowerCase() &&
            (kind === 'engine' ? this.python?.has(marker.id) && marker.kind === 'python' : this.packages.some(p => p.id === marker.id) && marker.kind === 'llama')) id = marker.id
        } catch { /* External and older installations are reused without repair ownership. */ }
        const managed = !!id
        if (!id && kind === 'engine' && actual.status === 'ready') {
          id = this.python?.recipes.find(recipe => recipe.backend === actual.backend && recipe.torchVersion === actual.version.split('+')[0] &&
            (recipe.xformersVersion ?? '') === (actual.xformersVersion ?? '') &&
            (recipe.backend !== 'cuda' || recipe.wheel.filename.includes(`+${actual.version.split('+')[1]}-`)))?.id
        }
        if (!id && kind === 'llama' && actual.status === 'ready') {
          id = this.packages.find(item => item.backend === actual.backend && item.version === actual.version &&
            (item.backend !== 'cuda' || !!actual.cudaVersion && item.name.includes(`CUDA ${actual.cudaVersion}`)))?.id
        }
        const found = { ...actual, id, managed }
        if (actual.status === 'ready') return found
        if (actual.status !== 'missing' && !failure) failure = found
      }
      return failure ?? missingLocalRuntime()
    }
    const [engine, llama] = await Promise.all([inspect('engine', candidates.torch), inspect('llama', candidates.llama)])
    this.local = { engine, llama }
    await this.saveSelection()
  }
  private async saveSelection(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, 'current-components.json.tmp')
    await writeFile(temporary, JSON.stringify(this.local), 'utf8')
    await rename(temporary, join(this.directory, 'current-components.json'))
  }
  selectedDirectories(_compute?: ComputeSettings): { engine?: string; llama?: string } {
    return { engine: this.local.engine.status === 'ready' ? this.local.engine.path : undefined,
      llama: this.local.llama.status === 'ready' ? this.local.llama.path : undefined }
  }
  async prepare(compute: ComputeSettings, translation: 'torch' | 'llama' | 'none' = 'llama'): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('组件安装中，请等待完成')
    for (const kind of ['engine', ...(translation === 'llama' ? ['llama'] as const : [])] as const) {
      const component = this.local[kind]
      if (component.status !== 'ready') throw new Error(`RUNTIME_${kind === 'engine' ? 'TORCH' : 'LLAMA'}: ${component.reason || (kind === 'engine' ? '尚未安装 PyTorch' : '尚未安装 llama.cpp')}；请前往设置 → 计算设备选择组合${component.managed ? '重新安装／修复' : '安装'}`)
    }
    for (const [value, kind] of [[compute.recognitionDevice, 'engine'], ...(translation !== 'none' ? [[compute.translationDevice, translation === 'torch' ? 'engine' : 'llama']] : [])]) {
      const intent = decodeDeviceIntent(value)
      if (!intent) continue
      if (!this.hardware.adapters.some(a => a.hardwareId === intent.hardwareId)) throw new Error('指定显卡已断开，请重新选择计算设备')
      if (this.local[kind as 'engine' | 'llama'].backend !== intent.backend) throw new Error(`所选 ${intent.backend} 设备与已安装组件后端不匹配，请到设置选择对应组合`)
    }
  }
  private inside(name: string): string {
    const target = resolve(this.directory, name)
    const path = relative(resolve(this.directory), target)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('组件路径无效')
    return target
  }
  private async installed(item: RuntimePackage): Promise<boolean> {
    try {
      const marker = JSON.parse(await readFile(join(this.inside(item.id), 'runtime-installed.json'), 'utf8'))
      return marker.id === item.id && marker.kind === 'llama'
    } catch { return false }
  }
  async snapshot(): Promise<RuntimeSnapshot> {
    const packages = await Promise.all(this.packages.map(async item => ({ ...item, installed: await this.installed(item) })))
    return { packages, recipes: this.python?.states() ?? [], hardware: this.hardware,
      recommendation: { engineId: null, llamaId: null, reasons: [] }, local: this.local, python: this.pythonState,
      directory: this.directory, operation: this.operation ? { ...this.operation } : this.python?.operation ? { ...this.python.operation } : null,
      lastError: this.lastError ?? this.python?.lastError ?? null }
  }
  cancel(): void { this.cancellation?.abort(); this.python?.cancel() }
  async install(id: string, repair = false): Promise<void> {
    logDiagnostic('runtime.install.request', { id, repair })
    if (this.operation || this.python?.operation || this.checking) throw new Error('已有组件检查或安装任务')
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('这些组合仅支持 Windows x64')
    if (!this.pythonState.ready) throw new Error(this.pythonState.reason || '内置 Python 3.12 无法运行')
    this.lastError = null
    const kind = this.python?.has(id) ? 'engine' : 'llama'
    const current = this.local[kind]
    if (!repair && current.status === 'ready' && current.id === id) return
    let actual: LocalRuntime
    if (kind === 'engine') {
      await this.python!.install(id, repair)
      actual = await probeLocalEngine(this.pythonState.path, this.python!.directoryFor(id))
    } else {
      const item = this.packages.find(p => p.id === id)
      if (!item) throw new Error('安装组合不在清单中')
      if (repair || !await this.installed(item)) await this.perform(item)
      actual = await probeLocalLlama(this.inside(id))
    }
    if (actual.status !== 'ready') throw new Error(actual.reason)
    this.local[kind] = { ...actual, id, managed: true }
    await this.saveSelection()
    logDiagnostic('runtime.install.complete', { id, actual })
  }
  async importArchive(_path: string): Promise<void> { throw new Error('请在设置页选择组合安装') }
  private async digest(path: string, signal?: AbortSignal): Promise<string> {
    const hash = createHash('sha256')
    for await (const block of createReadStream(path, { signal })) hash.update(block as Buffer)
    return hash.digest('hex')
  }
  private async perform(item: RuntimePackage): Promise<void> {
    const controller = new AbortController()
    this.cancellation = controller
    this.lastError = null
    const parts = [item, ...(item.companions ?? [])]
    this.operation = { id: item.id, phase: 'download', bytes: 0, totalBytes: parts.reduce((n, p) => n + p.bytes, 0) }
    const staging = this.inside(`staging-${item.id}-${randomUUID()}`)
    const backup = this.inside(`backup-${item.id}-${randomUUID()}`)
    let movedOld = false
    try {
      await mkdir(this.directory, { recursive: true })
      let completed = 0
      for (const [index, part] of parts.entries()) {
        logDiagnostic('runtime.llama-install.download', { id: item.id, part: index, bytes: part.bytes })
        const archive = this.inside(`${item.id}-${index}.zip.partial`)
        this.operation.phase = 'download'
        await this.download(part, archive, controller.signal, bytes => { if (this.operation) this.operation.bytes = completed + bytes })
        this.operation.phase = 'verify'
        if (await this.digest(archive, controller.signal) !== part.sha256) {
          await rm(archive, { force: true })
          throw new Error('运行组件下载校验失败，请重试')
        }
        this.operation.phase = 'extract'
        logDiagnostic('runtime.llama-install.extract', { id: item.id, part: index })
        const extracted = index === 0 ? staging : this.inside(`staging-${item.id}-dll-${randomUUID()}`)
        try {
          await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.extractScript, '-Archive', archive, '-Destination', extracted],
            { windowsHide: true, signal: controller.signal, timeout: 10 * 60_000 })
          if (index) {
            const { cp } = await import('node:fs/promises')
            await cp(extracted, staging, { recursive: true })
          }
        } finally { if (index) await rm(extracted, { recursive: true, force: true }) }
        completed += part.bytes
      }
      this.operation.phase = 'check'
      // Import/version checks do not require a matching GPU or load a model.
      const actual = await probeLocalLlama(staging)
      if (actual.status !== 'ready') throw new Error(actual.reason)
      const binary = await open(join(staging, 'llama-server.exe'), 'r')
      try {
        const header = Buffer.alloc(64)
        await binary.read(header, 0, header.length, 0)
        const signature = Buffer.alloc(6)
        await binary.read(signature, 0, signature.length, header.readUInt32LE(60))
        if (signature.readUInt32LE(0) !== 0x4550 || signature.readUInt16LE(4) !== 0x8664) throw new Error('下载的 llama-server 不是 Windows x64 程序')
      } finally { await binary.close() }
      controller.signal.throwIfAborted()
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({ id: item.id, kind: 'llama', backend: item.backend, version: item.version, sha256: item.sha256 }), 'utf8')
      const destination = this.inside(item.id)
      try {
        await access(destination)
        const marker = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (marker.id !== item.id || marker.kind !== 'llama') throw new Error('目标目录不是软件安装的组件，不能覆盖')
        await renameRuntimeDirectory(destination, backup)
        movedOld = true
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      try { await renameRuntimeDirectory(staging, destination) }
      catch (error) { if (movedOld) await renameRuntimeDirectory(backup, destination); throw error }
      if (movedOld) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
    } catch (error) {
      logDiagnostic('runtime.llama-install.failed', { id: item.id, phase: this.operation?.phase, cancelled: controller.signal.aborted, ...processFailure(error) })
      this.lastError = controller.signal.aborted ? '安装已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      for (const artifact of [staging, ...parts.map((_part, index) => this.inside(`${item.id}-${index}.zip.partial`))]) {
        await removeRuntimeArtifact(this.directory, artifact).catch(error => {
          this.lastError = `${this.lastError ? `${this.lastError}；` : ''}安装临时文件清理失败：${String(error)}`
        })
      }
      this.operation = null
      this.cancellation = null
    }
  }
  private async download(item: Pick<RuntimePackage, 'url' | 'bytes'>, path: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
    let offset = await stat(path).then(s => s.size).catch(() => 0)
    if (offset === item.bytes) { progress(offset); return }
    if (offset > item.bytes) { await rm(path, { force: true }); offset = 0 }
    await withSessionProxy(this.runtimeProxy(), () => this.transfer(item, path, offset, signal, progress))
  }
  private async transfer(item: Pick<RuntimePackage, 'url' | 'bytes'>, path: string, offset: number, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
    const response = await net.fetch(this.accelerated(item.url), { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal })
    if (!response.ok || !response.body) throw new Error(`下载失败：HTTP ${response.status}`)
    if (response.status === 206) {
      const range = response.headers.get('content-range')
      if (!range?.startsWith(`bytes ${offset}-`) || !range.endsWith(`/${item.bytes}`)) throw new Error('下载续传范围无效')
    } else offset = 0
    const file = await open(path, offset ? 'a' : 'w')
    const reader = response.body.getReader()
    try {
      progress(offset)
      while (true) {
        signal.throwIfAborted()
        const { done, value } = await reader.read()
        if (done) break
        offset += value.byteLength
        if (offset > item.bytes) throw new Error('下载文件大小超过清单声明')
        let written = 0
        while (written < value.byteLength) written += (await file.write(value, written, value.byteLength - written)).bytesWritten
        progress(offset)
      }
      if (offset !== item.bytes) throw new Error('下载文件不完整，请重试')
    } finally {
      await reader.cancel().catch(() => undefined)
      await file.close()
    }
  }
  private runtimeProxy(): string {
    const network = this.options.network?.()
    return network?.proxyForRuntimeDownload ? network.proxyUrl.trim() : ''
  }
  private accelerated(url: string): string {
    const prefix = this.options.network?.().githubAccelerateUrl.trim() ?? ''
    if (!prefix) return url
    let host: string
    try { host = new URL(url).hostname.toLowerCase() } catch { return url }
    // An accelerator fronts GitHub only; download.pytorch.org wheels and the pip mirror keep their own address.
    return GITHUB_ASSET_HOSTS.has(host) ? prefix + url : url
  }
}
