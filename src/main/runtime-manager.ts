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
import { BUNDLED_CRISP_RUNTIME as BUNDLED_CRISP, CRISP_RUNTIME_VERSIONS, ONNX_RUNTIME_PROVIDERS, ONNX_RUNTIME_VERSIONS, RUNTIME_KINDS, runtimePackageSchema, type ComputeSettings, type LocalRuntime, type RuntimeKind, type RuntimePackage, type RuntimeSnapshot, type HardwareInventory } from '../shared/compute'
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
type OnnxVersion = typeof ONNX_RUNTIME_VERSIONS[number]
const ONNX_PROBE = 'import sys; sys.path.insert(0,sys.argv[1]); import onnxruntime as ort'
// ONNX IR 9, opset 17: a single float32 Add node with one input and one output.
const ONNX_PROBE_MODEL = '08093a390a0e0a01780a017812017922034164641205736d6f6b655a0f0a0178120a0a08080112040a020801620f0a0179120a0a08080112040a02080142021011'

function matchesOnnxVersion(actual: LocalRuntime, item: OnnxVersion): boolean {
  const backend = item.backend === 'cuda11' || item.backend === 'cuda12' ? 'cuda' : item.backend
  return actual.status === 'ready' && actual.version === item.version && actual.backend === backend
}

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
    const wheelRuntimes = [...CRISP_RUNTIME_VERSIONS.map(({ id }) => ({ id, kind: 'crisp' })), ...ONNX_RUNTIME_VERSIONS.map(({ id }) => ({ id, kind: 'onnx' }))]
    for (const { id, kind } of wheelRuntimes) {
      const destination = this.inside(id)
      if (await access(destination).then(() => true, () => false)) continue
      for (const name of names.filter(n => n.startsWith(`backup-${id}-`))) {
        try {
          const backup = this.inside(name)
          const marker = JSON.parse(await readFile(join(backup, 'runtime-installed.json'), 'utf8'))
          if (marker.id !== id || marker.kind !== kind) continue
          await renameRuntimeDirectory(backup, destination)
          break
        } catch { /* An unrecognized backup is left untouched. */ }
      }
    }
    await cleanupRuntimeArtifacts(this.directory, [...this.packages.map(item => item.id), ...wheelRuntimes.map(item => item.id)])
    try {
      const saved = JSON.parse(await readFile(join(this.directory, 'current-components.json'), 'utf8')) as RuntimeSnapshot['local']
      for (const kind of RUNTIME_KINDS) if (typeof saved[kind]?.path === 'string') this.local[kind] = { ...missingLocalRuntime(saved[kind].path), id: saved[kind].id }
    } catch { /* First launch discovers existing installations. */ }
    // Inventory is independent of model choice; prepare() alone enforces session requirements.
    await this.recheck()
  }

  async recheck(components: readonly RuntimeKind[] = RUNTIME_KINDS): Promise<void> {
    if (this.operation || this.python?.operation) throw new Error('组件安装中，请等待完成')
    if (this.checking) return this.checking
    this.checking = this.checkComponents(components).finally(() => { this.checking = null })
    return this.checking
  }
  private async checkComponents(components: readonly RuntimeKind[]): Promise<void> {
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
          const matching = this.packages.filter(item => item.backend === actual.backend && item.version === actual.version &&
            (item.backend !== 'cuda' || !!actual.cudaVersion && item.name.includes(`CUDA ${actual.cudaVersion}.`)))
          if (matching.length === 1) id = matching[0].id
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
      const selected = CRISP_RUNTIME_VERSIONS.find(item => item.id === crisp.id && resolve(crisp.path) === this.inside(item.id)) ?? BUNDLED_CRISP
      const managed = this.inside(selected.id)
      const base = join(this.options.baseDirectory, 'Lib', 'site-packages')
      const managedProbe = this.pythonState.ready ? await probeLocalCrisp(python, managed) : missingLocalRuntime(managed)
      const baseProbe = this.pythonState.ready ? await probeLocalCrisp(python, base) : missingLocalRuntime(base)
      const bundledRelease = CRISP_RUNTIME_VERSIONS.find(item => item.version === baseProbe.version && item.backend === baseProbe.backend)
      const bundledDisabled = bundledRelease ? await this.bundledRuntimeDisabled(bundledRelease.id) : false
      const managedMarker = await readFile(join(managed, 'runtime-installed.json'), 'utf8')
        .then(value => { try { return JSON.parse(value) as { id?: string; kind?: string } } catch { return null } }, () => null)
      crisp = managedProbe.status === 'ready' && managedProbe.version === selected.version && managedProbe.backend === selected.backend && managedMarker?.id === selected.id && managedMarker.kind === 'crisp' ? { ...managedProbe, id: selected.id, managed: true }
        : baseProbe.status === 'ready' && bundledRelease && !bundledDisabled ? { ...baseProbe, id: bundledRelease.id, managed: false, bundled: true }
          : managedProbe.status === 'ready' ? { ...managedProbe, status: 'incompatible', reason: 'CrispASR 目录缺少安装记录' }
            : managedProbe.status !== 'missing' ? managedProbe : bundledDisabled ? missingLocalRuntime(base) : baseProbe
    }
    const onnx = components.includes('onnx') ? await this.checkOnnx() : this.local.onnx
    this.local = { engine, llama, crisp, onnx }
    logDiagnostic('runtime.components.checked', { components, python: this.pythonState, local: this.local })
    await this.saveSelection()
  }
  private async saveSelection(): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const temporary = join(this.directory, 'current-components.json.tmp')
    await writeFile(temporary, JSON.stringify(this.local), 'utf8')
    await rename(temporary, join(this.directory, 'current-components.json'))
  }
  selectedDirectories(_compute?: ComputeSettings): { engine?: string; llama?: string; crisp?: string; onnx?: string } {
    return { engine: this.local.engine.status === 'ready' ? this.local.engine.path : undefined,
      llama: this.local.llama.status === 'ready' ? this.local.llama.path : undefined,
      crisp: this.local.crisp?.status === 'ready' && this.local.crisp.managed ? this.local.crisp.path : undefined,
      onnx: this.local.onnx?.status === 'ready' && this.local.onnx.managed ? this.local.onnx.path : undefined }
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
      const release = CRISP_RUNTIME_VERSIONS.find(item => item.id === id)
      if (!release || !this.pythonState.ready) return false
      const base = join(dirname(this.pythonState.path), 'Lib', 'site-packages')
      const actual = await probeLocalCrisp(this.pythonState.path, base)
      return actual.status === 'ready' && actual.version === release.version && actual.backend === release.backend
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
    const crisp = CRISP_RUNTIME_VERSIONS.find(item => item.id === id)
    if (crisp) { await this.installCrisp(repair, undefined, crisp); return }
    const onnxVersion = ONNX_RUNTIME_VERSIONS.find(item => item.id === id)
    if (onnxVersion) { await this.installOnnx(onnxVersion, repair); return }
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

  async uninstall(kind: RuntimeKind): Promise<void> {
    logDiagnostic('runtime.uninstall.request', { kind })
    if (this.operation || this.python?.operation || this.checking) throw new Error('已有组件检查或安装任务')
    const current = this.local[kind]
    if (kind === 'onnx') {
      if (!current?.managed || !current.id) throw new Error('只能卸载额外安装的 ONNX Runtime')
      await removeRuntimeArtifact(this.directory, this.inside(current.id))
      this.local.onnx = undefined
      await this.recheck(['onnx'])
      return
    }
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
    if (!CRISP_RUNTIME_VERSIONS.some(item => item.id === id)) throw new Error('CrispASR 组件无效')
    await removeRuntimeArtifact(this.directory, this.inside(id))
  }
  private async probeOnnx(path: string): Promise<LocalRuntime> {
    if (!this.pythonState.ready || !await access(join(path, 'onnxruntime', '__init__.py')).then(() => true, () => false)) {
      return missingLocalRuntime(path)
    }
    try {
      const { stdout } = await run(this.pythonState.path, ['-I', '-c', ONNX_PROBE + '; import json; print(json.dumps([ort.__version__,ort.get_available_providers()]))', path],
        { windowsHide: true, timeout: PROBE_TIMEOUT_MS })
      const [version, providers] = JSON.parse(stdout) as [string, string[]]
      const accelerator = providers.find(name => Object.hasOwn(ONNX_RUNTIME_PROVIDERS, name) && name !== 'CPUExecutionProvider')
      const backend = accelerator === 'TensorrtExecutionProvider' ? 'cuda' : accelerator ? ONNX_RUNTIME_PROVIDERS[accelerator].toLowerCase() : 'cpu'
      const runnable = await Promise.all(providers.filter(name => Object.hasOwn(ONNX_RUNTIME_PROVIDERS, name)).map(async provider => {
        const probe = ONNX_PROBE + '; import numpy as np; p=sys.argv[2]; o=ort.SessionOptions(); o.execution_mode=ort.ExecutionMode.ORT_SEQUENTIAL; o.enable_mem_pattern=False; o.intra_op_num_threads=1; s=ort.InferenceSession(bytes.fromhex(sys.argv[3]), o, providers=[p]); assert p in s.get_providers(); assert s.run(None, {"x": np.array([2], dtype=np.float32)})[0][0] == 4; print(p)'
        try {
          const result = await run(this.pythonState.path, ['-I', '-c', probe, path, provider, ONNX_PROBE_MODEL],
            { windowsHide: true, timeout: PROBE_TIMEOUT_MS })
          return result.stdout.trim().endsWith(provider) ? provider : null
        } catch { return null }
      }))
      const executionProviders = runnable.filter(provider => provider !== null)
      const gpuAvailable = executionProviders.some(provider => ['DmlExecutionProvider', 'CUDAExecutionProvider', 'TensorrtExecutionProvider', 'WebGpuExecutionProvider'].includes(provider))
      return { path, status: 'ready', backend, version, gpuAvailable, executionProviders, reason: '' }
    } catch (error) {
      return { ...missingLocalRuntime(path), status: 'failed', reason: String(error) }
    }
  }
  private async ownsOnnx(version: OnnxVersion, path: string): Promise<boolean> {
    try {
      const marker = JSON.parse(await readFile(join(path, 'runtime-installed.json'), 'utf8'))
      return marker.kind === 'onnx' && marker.id === version.id
    } catch { return false }
  }
  private async checkOnnx(): Promise<LocalRuntime> {
    const selected = ONNX_RUNTIME_VERSIONS.find(item => item.id === this.local.onnx?.id)
    if (selected) {
      const path = this.inside(selected.id)
      if (await this.ownsOnnx(selected, path)) {
        const actual = await this.probeOnnx(path)
        if (matchesOnnxVersion(actual, selected)) {
          return { ...actual, backend: selected.backend, id: selected.id, managed: true }
        }
      }
    }
    const base = await this.probeOnnx(join(this.options.baseDirectory, 'Lib', 'site-packages'))
    const bundled = ONNX_RUNTIME_VERSIONS.find(item => item.version === base.version && item.backend === base.backend)
    return { ...base, id: bundled?.id, bundled: base.status === 'ready' }
  }
  private async installOnnx(version: OnnxVersion, repair: boolean): Promise<void> {
    const current = this.local.onnx
    if (!repair && current?.status === 'ready' && current.id === version.id) return

    const { id } = version
    const controller = new AbortController()
    this.cancellation = controller
    this.operation = { id, phase: 'check', bytes: 0, totalBytes: version.bytes, startedAt: Date.now() }
    const destination = this.inside(id)
    const staging = this.inside(`staging-${id}-${randomUUID()}`)
    const downloadDirectory = this.inside(`staging-${id}-${randomUUID()}`)
    const backup = this.inside(`backup-${id}-${randomUUID()}`)
    const signal = controller.signal
    try {
      const existed = await access(destination).then(() => true, () => false)
      if (existed && !await this.ownsOnnx(version, destination)) throw new Error('ONNX Runtime 安装目录已被占用')
      const installed = existed && !repair ? await this.probeOnnx(destination) : null
      if (installed && matchesOnnxVersion(installed, version)) {
        signal.throwIfAborted()
        this.local.onnx = { ...installed, backend: version.backend, id, managed: true }
      } else {
        await mkdir(downloadDirectory, { recursive: true })
        const wheel = join(downloadDirectory, version.filename)
        this.operation.phase = 'download'
        await this.download(version, wheel, signal, bytes => { this.operation!.bytes = bytes })
        this.operation.phase = 'verify'
        if (await this.digest(wheel, signal) !== version.sha256) throw new Error('ONNX Runtime wheel 校验失败')
        this.operation.phase = 'extract'
        await run(this.pythonState.path, ['-I', '-m', 'pip', '--isolated', 'install', '--no-deps', '--no-index', '--ignore-installed', '--target', staging, wheel],
          { windowsHide: true, timeout: 120_000, signal, env: { ...process.env, PIP_CONFIG_FILE: 'nul' } })
        this.operation.phase = 'check'
        const actual = await this.probeOnnx(staging)
        if (!matchesOnnxVersion(actual, version) || !actual.executionProviders?.includes('CPUExecutionProvider')) {
          throw new Error(actual.reason || 'ONNX Runtime 版本或执行提供程序不匹配')
        }
        await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({ id, kind: 'onnx' }), 'utf8')
        signal.throwIfAborted()
        if (existed) await renameRuntimeDirectory(destination, backup)
        try { await renameRuntimeDirectory(staging, destination) }
        catch (error) { if (existed) await renameRuntimeDirectory(backup, destination); throw error }
        this.local.onnx = { ...actual, backend: version.backend, path: destination, id, managed: true }
      }
      try { await this.saveSelection() }
      catch (error) { this.local.onnx = current; throw error }
      if (current?.managed && current.id && current.id !== id) {
        await removeRuntimeArtifact(this.directory, this.inside(current.id)).catch(error => logDiagnostic('runtime.onnx.cleanup.failed', { error }))
      }
      await removeRuntimeArtifact(this.directory, backup).catch(error => logDiagnostic('runtime.onnx.cleanup.failed', { error }))
    } catch (error) {
      this.lastError = signal.aborted ? '安装已取消' : String(error)
      throw new Error(this.lastError)
    } finally {
      for (const artifact of [staging, downloadDirectory]) await removeRuntimeArtifact(this.directory, artifact).catch(() => undefined)
      this.operation = null
      this.cancellation = null
    }
  }
  private async installCrisp(repair: boolean, offline?: { files: string[]; signal: AbortSignal }, release = BUNDLED_CRISP): Promise<void> {
    const { id, version, backend, files } = release
    const previous = this.local.crisp
    if (!repair && this.local.crisp?.status === 'ready' && this.local.crisp.id === id
      && (this.local.crisp.managed || this.local.crisp.bundled)) return
    offline?.signal.throwIfAborted()
    const base = join(dirname(this.pythonState.path), 'Lib', 'site-packages')
    const bundled = this.pythonState.ready ? await probeLocalCrisp(this.pythonState.path, base) : missingLocalRuntime(base)
    if (bundled.status === 'ready' && bundled.version === version && bundled.backend === backend
      && (!this.local.crisp?.managed || !repair)) {
      await this.setBundledRuntimeEnabled(id, true)
      this.local.crisp = { ...bundled, id, managed: false, bundled: true }
      await this.saveSelection()
      if (previous?.managed && previous.id && previous.id !== id) {
        await this.removeManagedRuntime('crisp', previous.id).catch(error => logDiagnostic('runtime.crisp.cleanup.failed', { error }))
      }
      return
    }
    const controller = new AbortController()
    this.cancellation = controller
    const abort = (): void => controller.abort()
    offline?.signal.addEventListener('abort', abort, { once: true })
    const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0)
    this.operation = { id, phase: 'download', bytes: 0, totalBytes, startedAt: Date.now() }
    const staging = this.inside(`staging-${id}-${randomUUID()}`)
    const wheelDirectory = this.inside(`staging-${id}-dll-${randomUUID()}`)
    const destination = this.inside(id)
    const backup = this.inside(`backup-${id}-${randomUUID()}`)
    const wheels = offline?.files ?? files.map(item => join(wheelDirectory, item.name))
    let backedUp = false
    try {
      await mkdir(staging, { recursive: true })
      await mkdir(wheelDirectory, { recursive: true })
      let completed = 0
      for (const [index, item] of files.entries()) {
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
      if (backend !== 'cpu') {
        const extract = [
          'import pathlib, shutil, sys, zipfile',
          'backend = sys.argv[3]',
          'root = pathlib.Path(sys.argv[2]) / "crispasr" / backend',
          'expected = {"crispasr.dll", "ggml-base.dll", "ggml-cpu.dll", "ggml.dll", "whisper.dll", f"ggml-{backend}.dll"}',
          'if backend == "cuda": expected.update({"cublas64_12.dll", "cublasLt64_12.dll", "cudart64_12.dll"})',
          'with zipfile.ZipFile(sys.argv[1]) as wheel:',
          '    names = {pathlib.PurePosixPath(name).name: name for name in wheel.namelist() if name.startswith("crispasr/") and name.lower().endswith(".dll")}',
          '    assert names.keys() == expected, "CrispASR wheel library list changed"',
          '    root.mkdir(parents=True, exist_ok=True)',
          '    for name, member in names.items():',
          '        with wheel.open(member) as source, (root / name).open("wb") as target:',
          '            shutil.copyfileobj(source, target, length=1024 * 1024)',
        ].join('\n')
        await run(python, ['-I', '-c', extract, wheels[1], staging, backend],
          { windowsHide: true, timeout: 120_000, signal: controller.signal })
      }
      const actual = await probeLocalCrisp(python, staging)
      if (actual.status !== 'ready' || actual.version !== version || actual.backend !== backend) throw new Error(actual.reason || 'CrispASR 组件验证失败')
      await writeFile(join(staging, 'runtime-installed.json'), JSON.stringify({ id, kind: 'crisp', version: actual.version }), 'utf8')
      controller.signal.throwIfAborted()
      if (await access(destination).then(() => true, () => false)) {
        const marker = JSON.parse(await readFile(join(destination, 'runtime-installed.json'), 'utf8'))
        if (marker.id !== id || marker.kind !== 'crisp') throw new Error('目标目录不是软件安装的 CrispASR 组件')
        await renameRuntimeDirectory(destination, backup)
        backedUp = true
      }
      try { await renameRuntimeDirectory(staging, destination) }
      catch (error) { if (backedUp) await renameRuntimeDirectory(backup, destination); throw error }
      this.local.crisp = { ...actual, path: destination, id, managed: true }
      try { await this.saveSelection() }
      catch (error) {
        this.local.crisp = previous
        await removeRuntimeArtifact(this.directory, destination)
        if (backedUp) await renameRuntimeDirectory(backup, destination)
        throw error
      }
      if (backedUp) await removeRuntimeArtifact(this.directory, backup).catch(error => logDiagnostic('runtime.crisp.cleanup.failed', { error }))
      if (previous?.managed && previous.id && previous.id !== id) {
        await this.removeManagedRuntime('crisp', previous.id).catch(error => logDiagnostic('runtime.crisp.cleanup.failed', { error }))
      }
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
      installCrisp: (id, files, signal) => {
        const release = CRISP_RUNTIME_VERSIONS.find(item => item.id === id)
        if (!release) throw new Error('Unknown CrispASR version')
        return this.installCrisp(true, { files, signal }, release)
      },
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
    const crisp = CRISP_RUNTIME_VERSIONS.find(item => item.id === id)
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
      if (crisp) return actual.version === crisp.version && actual.backend === crisp.backend
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
