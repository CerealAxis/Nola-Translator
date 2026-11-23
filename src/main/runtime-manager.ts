import { cleanupRuntimeArtifacts, removeRuntimeArtifact, renameRuntimeDirectory } from './runtime-files'
import { logDiagnostic, processFailure } from './session-log'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { net, session } from 'electron'
import { z } from 'zod'
import { CRISP_RUNTIME_ID, CRISP_RUNTIME_FILES, runtimePackageSchema, type ComputeSettings, type LocalRuntime, type RuntimePackage, type RuntimeSnapshot, type HardwareInventory } from '../shared/compute'
import type { NetworkSettings } from '../shared/settings'
import { probeHardware } from './hardware-inventory'
import { PythonEnvironments } from './python-environments'
import { pytorchWheelUrls, PYTORCH_WHEEL_MIRROR_OFF } from '../shared/pypi-mirrors'
import { GITHUB_PROXY_OFF } from '../shared/github-proxies'
import { localCandidates, missingLocalRuntime, probeLocalCrisp, probeLocalEngine, probeLocalLlama } from './local-runtimes'
import { resolveGithubProxyNode } from './github-proxy-probe'
import { isMainlandChina } from './network-region'
import { OfflineRuntimes, type OfflineRuntimeProgress } from './offline-runtimes'
import type { OfflineItem } from '../shared/offline'

const run = promisify(execFile)
const catalogSchema = z.object({ version: z.literal(1), packages: z.array(runtimePackageSchema).max(32) })
const GITHUB_ASSET_HOSTS = new Set(['github.com', 'objects.githubusercontent.com'])
const PROBE_TIMEOUT_MS = 10_000
const CRISP_ID = CRISP_RUNTIME_ID

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
  private local: RuntimeSnapshot['local'] = { engine: missingLocalRuntime(), llama: missingLocalRuntime(), crisp: missingLocalRuntime() }
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
      this.options.network, (url, bytes, signal) => this.probeUrl(url, bytes, signal))
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
    const crispDestination = this.inside(CRISP_ID)
    if (!await access(crispDestination).then(() => true, () => false)) {
      for (const name of names.filter(n => n.startsWith(`backup-${CRISP_ID}-`))) {
        try {
          const backup = this.inside(name)
          const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
          if (marker.id !== CRISP_ID || marker.kind !== 'crisp') continue
          await renameRuntimeDirectory(backup, crispDestination)
          break
        } catch { /* An unrecognized backup is left untouched. */ }
      }
    }
    await cleanupRuntimeArtifacts(this.directory, [...this.packages.map(item => item.id), CRISP_ID])
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'current-components.json'), 'utf8')) as RuntimeSnapshot['local']
      for (const kind of ['engine', 'llama', 'crisp'] as const) if (typeof saved[kind]?.path === 'string') this.local[kind] = { ...missingLocalRuntime(saved[kind].path), id: saved[kind].id }
    } catch { /* First launch discovers existing installations. */ }
    // Inventory is independent of model choice; prepare() alone enforces session requirements.
    await this.recheck()
  }

  async recheck(components: readonly ('engine' | 'llama' | 'crisp')[] = ['engine', 'llama', 'crisp']): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('组件安装中，请等待完成')
    if (this.checking) return this.checking
    this.checking = this.checkComponents(components).finally(() => { this.checking = null })
    return this.checking
  }
  private async checkComponents(components: readonly ('engine' | 'llama' | 'crisp')[]): Promise<void> {
    const python = join(this.options.baseDirectory, 'python.exe')
    this.pythonState = { ...this.pythonState, path: python }
    const needsTorch = components.includes('engine')
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
        let actual = kind === 'engine'
          ? this.pythonState.ready ? await probeLocalEngine(python, path) : { ...missingLocalRuntime(path), status: 'failed' as const, reason: this.pythonState.reason }
          : await probeLocalLlama(path)
        let id: string | undefined
        let managed = false
        try {
          const marker = JSON.parse(await readFile(join(path, 'runtime-installed.json'), 'utf8'))
          if (typeof marker.id === 'string' && resolve(path).toLowerCase() === this.inside(marker.id).toLowerCase() &&
            (kind === 'engine' ? this.python?.has(marker.id) && marker.kind === 'python' : this.packages.some(p => p.id === marker.id) && marker.kind === 'llama')) {
            id = marker.id
            managed = true
          }
        } catch { /* External and older installations are reused without repair ownership. */ }
        if (!id && kind === 'engine' && actual.status === 'ready') {
          id = this.python?.recipes.find(recipe => recipe.backend === actual.backend && recipe.torchVersion === actual.version.split('+')[0] &&
            (recipe.xformersVersion ?? '') === (actual.xformersVersion ?? '') &&
            (recipe.backend !== 'cuda' || recipe.wheel.filename.includes(`+${actual.version.split('+')[1]}-`)))?.id
        }
        const bundledLlama = kind === 'llama' && actual.status === 'ready' && actual.backend === 'vulkan'
          && this.options.localLlamaDirectory !== undefined
          && resolve(path).toLowerCase() === resolve(this.options.localLlamaDirectory).toLowerCase()
        if (!id && kind === 'llama' && actual.status === 'ready') {
          id = this.packages.find(item => item.backend === actual.backend && item.version === actual.version &&
            (item.backend !== 'cuda' || !!actual.cudaVersion && item.name.includes(`CUDA ${actual.cudaVersion}`)))?.id
        }
        if (bundledLlama && id && await this.bundledRuntimeDisabled(id)) actual = missingLocalRuntime(path)
        const found = { ...actual, id, managed, bundled: bundledLlama }
        if (actual.status === 'ready') return found
        if (actual.status !== 'missing' && !failure) failure = found
      }
      return failure ?? missingLocalRuntime()
    }
    const [engine, llama] = await Promise.all([
      needsTorch ? inspect('engine', candidates.torch) : this.local.engine,
      components.includes('llama') ? inspect('llama', candidates.llama) : this.local.llama,
    ])
    let crisp = this.local.crisp ?? missingLocalRuntime()
    if (components.includes('crisp')) {
      const managed = this.inside(CRISP_ID)
      const base = join(this.options.baseDirectory, 'Lib', 'site-packages')
      const managedProbe = this.pythonState.ready ? await probeLocalCrisp(python, managed) : missingLocalRuntime(managed)
      const baseProbe = this.pythonState.ready ? await probeLocalCrisp(python, base) : missingLocalRuntime(base)
      const bundledDisabled = await this.bundledRuntimeDisabled(CRISP_ID)
      const managedMarker = await readFile(join(managed, 'runtime-installed.json'), 'utf8')
        .then(value => { try { return JSON.parse(value) as { id?: string; kind?: string } } catch { return null } }, () => null)
      crisp = managedProbe.status === 'ready' && managedMarker?.id === CRISP_ID && managedMarker.kind === 'crisp' ? { ...managedProbe, id: CRISP_ID, managed: true }
        : baseProbe.status === 'ready' && !bundledDisabled ? { ...baseProbe, id: CRISP_ID, managed: false, bundled: true }
          : managedProbe.status === 'ready' ? { ...managedProbe, status: 'incompatible', reason: 'CrispASR 目录缺少安装记录' }
            : managedProbe.status !== 'missing' ? managedProbe : bundledDisabled ? missingLocalRuntime(base) : baseProbe
    }
    this.local = { engine, llama, crisp }
    logDiagnostic('runtime.components.checked', { components, python: this.pythonState, local: this.local })
    await this.saveSelection()
  }
  private async saveSelection(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, 'current-components.json.tmp')
    await writeFile(temporary, JSON.stringify(this.local), 'utf8')
    await rename(temporary, join(this.directory, 'current-components.json'))
  }
  selectedDirectories(_compute?: ComputeSettings): { engine?: string; llama?: string; crisp?: string } {
    return { engine: this.local.engine.status === 'ready' ? this.local.engine.path : undefined,
      llama: this.local.llama.status === 'ready' ? this.local.llama.path : undefined,
      crisp: this.local.crisp?.status === 'ready' && this.local.crisp.managed ? this.local.crisp.path : undefined }
  }
  async prepare(compute: ComputeSettings, translation: 'torch' | 'llama' | 'none' = 'llama', localRecognition = true): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('组件安装中，请等待完成')
    if (this.checking) await this.checking
    // Initialization and explicit rechecks validate the ABI; each caption start only verifies
    // that those components still exist, avoiding another cold Python/Torch import.
    const needsTorch = (localRecognition && compute.recognitionEngine === 'pytorch') || translation === 'torch'
    const needsLlama = (localRecognition && compute.recognitionEngine === 'llama') || translation === 'llama'
    const needsCrisp = localRecognition && compute.recognitionEngine === 'crisp'
    const files = [this.pythonState.path, ...(needsTorch ? [join(this.local.engine.path, 'torch', '__init__.py')] : []),
      ...(needsLlama ? [join(this.local.llama.path, 'llama-server.exe')] : []),
      ...(needsCrisp && this.local.crisp?.path ? [join(this.local.crisp.path, 'crispasr', '__init__.py')] : [])]
    if (!(await Promise.all(files.map(path => path ? access(path).then(() => true, () => false) : false))).every(Boolean)) {
      await this.recheck()
    }
    for (const kind of [...(needsTorch ? ['engine'] as const : []), ...(needsLlama ? ['llama'] as const : [])]) {
      const component = this.local[kind]
      if (component.status !== 'ready') throw new Error(`RUNTIME_${kind === 'engine' ? 'TORCH' : 'LLAMA'}: ${component.reason || (kind === 'engine' ? '尚未安装 PyTorch' : '尚未安装 llama.cpp')}；请前往设置 → 计算设备选择组合${component.managed ? '重新安装／修复' : '安装'}`)
    }
    if (needsCrisp && this.local.crisp?.status !== 'ready') throw new Error(`RUNTIME_CRISP: ${this.local.crisp?.reason || '尚未安装 CrispASR'}；请前往设置 → 计算设备安装`)
  }
  private inside(name: string): string {
    const target = resolve(this.directory, name)
    const path = relative(resolve(this.directory), target)
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('组件路径无效')
    return target
  }
  private bundledRuntimeMarker(id: string): string { return join(this.directory, `bundled-${id}.disabled`) }
  private async bundledRuntimeDisabled(id: string): Promise<boolean> {
    return access(this.bundledRuntimeMarker(id)).then(() => true, () => false)
  }
  private async setBundledRuntimeEnabled(id: string, enabled: boolean): Promise<void> {
    const marker = this.bundledRuntimeMarker(id)
    if (enabled) await rm(marker, { force: true })
    else {
      await mkdir(this.directory, { recursive: true })
      await writeFile(marker, 'disabled', 'utf8')
    }
  }
  private async isBundledRuntime(kind: 'engine' | 'llama' | 'crisp', id: string): Promise<boolean> {
    if (kind === 'crisp') {
      if (id !== CRISP_ID || !this.pythonState.ready) return false
      const base = join(dirname(this.pythonState.path), 'Lib', 'site-packages')
      const actual = await probeLocalCrisp(this.pythonState.path, base)
      return actual.status === 'ready' && actual.version === '0.8.43' && actual.backend === 'vulkan'
    }
    if (kind !== 'llama' || !this.options.localLlamaDirectory) return false
    const item = this.packages.find(packageItem => packageItem.id === id)
    if (!item) return false
    const actual = await probeLocalLlama(this.options.localLlamaDirectory)
    return actual.status === 'ready' && actual.backend === 'vulkan' && actual.backend === item.backend && actual.version === item.version
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
    if (id === CRISP_ID) { await this.installCrisp(repair); return }
    const kind = this.python?.has(id) ? 'engine' : 'llama'
    const current = this.local[kind]
    const previousId = current.managed ? current.id : undefined
    if (!repair && current.status === 'ready' && current.id === id && current.managed) return
    let actual: LocalRuntime
    if (kind === 'engine') {
      await this.python!.install(id, repair)
      actual = await probeLocalEngine(this.pythonState.path, this.python!.directoryFor(id))
    } else {
      const item = this.packages.find(p => p.id === id)
      if (!item) throw new Error('安装组合不在清单中')
      if (await this.isBundledRuntime('llama', id)) {
        await this.setBundledRuntimeEnabled(id, true)
        await this.recheck(['llama'])
        return
      }
      if (repair || !await this.installed(item)) await this.perform(item)
      actual = await probeLocalLlama(this.inside(id))
    }
    if (actual.status !== 'ready') throw new Error(actual.reason)
    this.local[kind] = { ...actual, id, managed: true }
    if (previousId && previousId !== id) {
      try {
        await this.removeManagedRuntime(kind, previousId)
        logDiagnostic('runtime.install.removed-previous', { kind, id: previousId })
      } catch (error) {
        logDiagnostic('runtime.install.previous-remove-failed', { kind, id: previousId, error: String(error) })
      }
    }
    await this.saveSelection()
    logDiagnostic('runtime.install.complete', { id, actual })
  }

  async uninstall(kind: 'engine' | 'llama' | 'crisp'): Promise<void> {
    logDiagnostic('runtime.uninstall.request', { kind })
    if (this.operation || this.python?.operation || this.checking) throw new Error('已有组件检查或安装任务')
    const current = this.local[kind]
    if (!current || current.status !== 'ready' || !current.id || (!current.managed && !current.bundled)) {
      throw new Error('只能卸载由软件管理或随包提供的运行组件')
    }
    if (current.bundled || await this.isBundledRuntime(kind, current.id)) {
      await this.setBundledRuntimeEnabled(current.id, false)
    }
    if (current.managed) await this.removeManagedRuntime(kind, current.id)
    await this.recheck([kind])
    logDiagnostic('runtime.uninstall.complete', { kind })
  }

  private async removeManagedRuntime(kind: 'engine' | 'llama' | 'crisp', id: string): Promise<void> {
    if (kind === 'engine') {
      if (!this.python?.has(id)) throw new Error('PyTorch 组合不在清单中')
      await this.python.uninstall(id)
      return
    }
    if (kind === 'llama') {
      if (!this.packages.some(item => item.id === id)) throw new Error('llama.cpp 组件不在清单中')
      await removeRuntimeArtifact(this.directory, this.inside(id))
      return
    }
    if (id !== CRISP_ID) throw new Error('CrispASR 组件无效')
    await removeRuntimeArtifact(this.directory, this.inside(CRISP_ID))
  }
  private async installCrisp(repair: boolean, offline?: { files: string[]; signal: AbortSignal }): Promise<void> {
    if (!repair && this.local.crisp?.status === 'ready' && this.local.crisp.id === CRISP_ID
      && (this.local.crisp.managed || this.local.crisp.bundled)) return
    offline?.signal.throwIfAborted()
    const base = join(dirname(this.pythonState.path), 'Lib', 'site-packages')
    const bundled = this.pythonState.ready ? await probeLocalCrisp(this.pythonState.path, base) : missingLocalRuntime(base)
    if (bundled.status === 'ready' && bundled.version === '0.8.43' && bundled.backend === 'vulkan'
      && (!this.local.crisp?.managed || !repair)) {
      await this.setBundledRuntimeEnabled(CRISP_ID, true)
      await this.recheck(['crisp'])
      return
    }
    const controller = new AbortController()
    this.cancellation = controller
    const abort = (): void => controller.abort()
    offline?.signal.addEventListener('abort', abort, { once: true })
    const totalBytes = CRISP_RUNTIME_FILES.reduce((sum, item) => sum + item.bytes, 0)
    this.operation = { id: CRISP_ID, phase: 'download', bytes: 0, totalBytes, startedAt: Date.now() }
    const staging = this.inside(`staging-${CRISP_ID}-${randomUUID()}`)
    const wheelDirectory = this.inside(`staging-${CRISP_ID}-dll-${randomUUID()}`)
    const destination = this.inside(CRISP_ID)
    const backup = this.inside(`backup-${CRISP_ID}-${randomUUID()}`)
    const wheels = offline?.files ?? CRISP_RUNTIME_FILES.map(item => join(wheelDirectory, item.name))
    let backedUp = false
    try {
      await mkdir(staging, { recursive: true })
      await mkdir(wheelDirectory, { recursive: true })
      let completed = 0
      for (const [index, item] of CRISP_RUNTIME_FILES.entries()) {
        if (!offline) await this.download(item, wheels[index], controller.signal, bytes => {
          if (this.operation) this.operation.bytes = completed + bytes
        })
        this.operation!.phase = 'verify'
        if (await this.digest(wheels[index], controller.signal) !== item.sha256) throw new Error('CrispASR wheel 校验失败')
        completed += item.bytes
        this.operation!.phase = 'download'
      }
      controller.signal.throwIfAborted()
      this.operation!.phase = 'extract'
      const python = this.pythonState.path
      await run(python, ['-I', '-m', 'pip', '--isolated', 'install', '--no-deps', '--no-index', '--ignore-installed', '--target', staging, wheels[0]],
        { windowsHide: true, timeout: 120_000, signal: controller.signal, env: { ...process.env, PIP_CONFIG_FILE: 'nul' } })
      const extract = `import pathlib,sys,zipfile; wheel=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2])/'crispasr'/'vulkan'; names={pathlib.PurePosixPath(n).name:n for n in wheel.namelist() if n.startswith('crispasr/') and n.lower().endswith('.dll')}; expected={'crispasr.dll','ggml-base.dll','ggml-cpu.dll','ggml-vulkan.dll','ggml.dll','whisper.dll'}; assert names.keys()==expected, 'Vulkan wheel library list changed'; root.mkdir(parents=True,exist_ok=True); [(root/name).write_bytes(wheel.read(member)) for name,member in names.items()]`
      await run(python, ['-I', '-c', extract, wheels[1], staging], { windowsHide: true, timeout: 30_000, signal: controller.signal })
      const actual = await probeLocalCrisp(python, staging)
      if (actual.status !== 'ready' || actual.version !== '0.8.43' || actual.backend !== 'vulkan') throw new Error(actual.reason || 'CrispASR 组件验证失败')
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({ id: CRISP_ID, kind: 'crisp', version: actual.version }), 'utf8')
      controller.signal.throwIfAborted()
      if (await access(destination).then(() => true, () => false)) {
        const marker = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (marker.id !== CRISP_ID || marker.kind !== 'crisp') throw new Error('目标目录不是软件安装的 CrispASR 组件')
        await renameRuntimeDirectory(destination, backup)
        backedUp = true
      }
      try { await renameRuntimeDirectory(staging, destination) }
      catch (error) { if (backedUp) await renameRuntimeDirectory(backup, destination); throw error }
      if (backedUp) await removeRuntimeArtifact(this.directory, backup)
      this.local.crisp = { ...actual, path: destination, id: CRISP_ID, managed: true }
      await this.saveSelection()
    } catch (error) {
      this.lastError = controller.signal.aborted ? '安装已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      offline?.signal.removeEventListener('abort', abort)
      for (const artifact of [staging, wheelDirectory]) await removeRuntimeArtifact(this.directory, artifact).catch(() => undefined)
      this.operation = null
      this.cancellation = null
    }
  }
  async importArchive(_path: string): Promise<void> { throw new Error('请在设置页选择组合安装') }
  private offlineService(): OfflineRuntimes {
    return new OfflineRuntimes({ python: join(this.options.baseDirectory, 'python.exe'), temporaryDirectory: this.directory, recipes: this.python?.recipes ?? [], packages: this.packages,
      network: this.options.network,
      download: async (item, path, signal, progress) => {
        await this.download({ ...item, url: await this.resolveWheelUrl(item, signal) }, path, signal, progress)
      },
      installCrisp: (files, signal) => this.installCrisp(true, { files, signal }),
      installPython: async (id, wheelhouse, requirements, signal) => {
        if (!this.python) throw new Error('Runtime manager is not initialized')
        await this.python.install(id, true, { wheelhouse, requirements, signal })
        const actual = await probeLocalEngine(this.pythonState.path, this.python.directoryFor(id))
        if (actual.status !== 'ready') throw new Error(actual.reason)
        this.local.engine = { ...actual, id, managed: true }
        await this.saveSelection()
      },
      installLlama: async (id, files, signal) => {
        const item = this.packages.find(pkg => pkg.id === id)
        if (!item) throw new Error('Unknown runtime combination')
        await this.perform(item, { files, signal })
        const actual = await probeLocalLlama(this.inside(id))
        if (actual.status !== 'ready') throw new Error(actual.reason)
        this.local.llama = { ...actual, id, managed: true }
        await this.saveSelection()
      } })
  }
  private async reusableOfflineRuntime(id: string, signal?: AbortSignal): Promise<boolean> {
    const recipe = this.python?.recipes.find(item => item.id === id)
    const pkg = this.packages.find(item => item.id === id)
    const crisp = id === CRISP_ID
    if (!recipe && !pkg && !crisp) return false
    const kind = crisp ? 'crisp' : recipe ? 'engine' : 'llama'
    const selected = this.local[kind]
    const directory = this.inside(id)
    if (!selected || selected.id !== id || !selected.managed || selected.status !== 'ready' || resolve(selected.path) !== directory) return false
    try {
      signal?.throwIfAborted()
      const marker = JSON.parse(await readFile(join(directory, 'runtime-installed.json'), 'utf8'))
      if (marker.id !== id || marker.kind !== (crisp ? 'crisp' : recipe ? 'python' : 'llama')) return false
      const actual = crisp ? await probeLocalCrisp(this.pythonState.path, directory) : recipe ? await probeLocalEngine(this.pythonState.path, directory) : await probeLocalLlama(directory)
      signal?.throwIfAborted()
      if (actual.status !== 'ready') return false
      if (crisp) return actual.version === '0.8.43' && actual.backend === 'vulkan'
      return recipe
        ? actual.backend === recipe.backend && actual.version.split('+')[0] === recipe.torchVersion && (!recipe.xformersVersion || actual.xformersVersion === recipe.xformersVersion)
        : actual.backend === pkg!.backend && actual.version === pkg!.version
    } catch {
      signal?.throwIfAborted()
      return false
    }
  }
  async inspectOffline(directory: string, signal?: AbortSignal): Promise<OfflineItem[]> {
    const items = await this.offlineService().inspect(directory, signal)
    return Promise.all(items.map(async item => item.status === 'ready' && await this.reusableOfflineRuntime(item.id, signal)
      ? { ...item, status: 'installed' as const } : item))
  }
  prepareOffline(ids: string[], directory: string, signal: AbortSignal, progress: OfflineRuntimeProgress): Promise<void> {
    return this.offlineService().prepare(ids, directory, signal, progress)
  }
  async installOffline(ids: string[], directory: string, signal: AbortSignal, progress: OfflineRuntimeProgress): Promise<void> {
    if (this.operation || this.python?.operation || this.checking) throw new Error('已有组件检查或安装任务')
    if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('这些组合仅支持 Windows x64')
    if (!this.pythonState.ready) throw new Error(this.pythonState.reason || '内置 Python 3.12 无法运行')
    const items = await this.inspectOffline(directory, signal)
    const pending = ids.filter(id => !items.some(item => item.id === id && item.status === 'installed'))
    if (pending.length) await this.offlineService().install(pending, directory, signal, progress)
  }
  private async digest(path: string, signal?: AbortSignal): Promise<string> {
    const hash = createHash('sha256')
    for await (const block of createReadStream(path, { signal })) hash.update(block as Buffer)
    return hash.digest('hex')
  }
  private async perform(item: RuntimePackage, offline?: { files: string[]; signal: AbortSignal }): Promise<void> {
    const controller = new AbortController()
    const abort = (): void => controller.abort()
    offline?.signal.throwIfAborted()
    offline?.signal.addEventListener('abort', abort, { once: true })
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
        const archive = offline ? offline.files[index] : this.inside(`${item.id}-${index}.zip.partial`)
        this.operation.phase = 'download'
        if (!offline) await this.download(part, archive, controller.signal, bytes => { if (this.operation) this.operation.bytes = completed + bytes })
        this.operation.phase = 'verify'
        if (await this.digest(archive, controller.signal) !== part.sha256) {
          if (!offline) await rm(archive, { force: true })
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
      offline?.signal.removeEventListener('abort', abort)
    }
  }
  private async download(item: Pick<RuntimePackage, 'url' | 'bytes'>, path: string, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
    let offset = await stat(path).then(s => s.size).catch(() => 0)
    if (offset === item.bytes) { progress(offset); return }
    if (offset > item.bytes) { await rm(path, { force: true }); offset = 0 }
    await withSessionProxy(this.runtimeProxy(), () => this.transfer(item, path, offset, signal, progress))
  }
  private async transfer(item: Pick<RuntimePackage, 'url' | 'bytes'>, path: string, offset: number, signal: AbortSignal, progress: (bytes: number) => void): Promise<void> {
    const response = await net.fetch(await this.accelerated(item.url), { headers: offset ? { Range: `bytes=${offset}-` } : {}, signal })
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
  private async probeUrl(url: string, bytes: number, signal: AbortSignal): Promise<boolean> {
    const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS)
    const requestSignal = AbortSignal.any([signal, timeout])
    try {
      const response = await withSessionProxy(this.runtimeProxy(), () => net.fetch(url, { method: 'HEAD', signal: requestSignal }))
      await response.body?.cancel().catch(() => undefined)
      if (!response.ok) return false
      // Some mirrors answer 200 with an HTML portal page for a missing path, so a declared length
      // that disagrees with the wheel size rules the mirror out.
      const length = response.headers.get('content-length')
      return !length || Number(length) === bytes
    } catch (error) {
      signal.throwIfAborted()
      logDiagnostic('runtime.python-mirror-probe.failed', { url, ...processFailure(error) })
      return false
    }
  }
  /** Picks the first mirror that answers for this artifact's declared size, keeping the official address last. */
  private async resolveWheelUrl(item: { url: string; bytes: number }, signal: AbortSignal): Promise<string> {
    const network = this.options.network?.()
    if (!network || network.pytorchWheelMirrorUrl === PYTORCH_WHEEL_MIRROR_OFF) return item.url
    if (network.pytorchWheelMirrorUrl === 'auto' && !await isMainlandChina()) return item.url
    const candidates = pytorchWheelUrls(item.url, network.pytorchWheelMirrorUrl)
    for (const candidate of candidates.slice(0, -1)) {
      if (await this.probeUrl(candidate, item.bytes, signal)) return candidate
    }
    return candidates.at(-1) ?? item.url
  }
  private async accelerated(url: string): Promise<string> {
    let host: string
    try { host = new URL(url).hostname.toLowerCase() } catch { return url }
    // An accelerator fronts GitHub only; download.pytorch.org wheels and the pip mirror keep their own address.
    // The host decides before the node is resolved, so a wheel download never waits on a probe whose
    // result would be discarded on the next line.
    if (!GITHUB_ASSET_HOSTS.has(host)) return url
    // Read per request so a node picked in settings, or a probe that measured a different one, reaches
    // the next download without a restart.
    const network = this.options.network?.()
    if (!network?.useGithubAccelerate || network.githubAccelerateUrl === GITHUB_PROXY_OFF) return url
    if (network.githubAccelerateUrl === 'auto' && !await isMainlandChina()) return url
    const prefix = await resolveGithubProxyNode(network.githubAccelerateUrl)
    if (!prefix) return url
    return prefix + url
  }
}
