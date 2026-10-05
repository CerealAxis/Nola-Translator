import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { LocalRuntime } from '../shared/compute'
import type { EngineLaunchSpec } from './engine-process'

const run = promisify(execFile)
export function missingLocalRuntime(path = '', source: LocalRuntime['source'] = 'bundled'): LocalRuntime {
  return { path, source, status: 'missing', backend: '', version: '', gpuAvailable: false, reason: '没有找到本地运行环境' }
}

/** Inspect existing runtimes read-only. */
export async function probeLocalEngine(launch: EngineLaunchSpec, source: LocalRuntime['source']): Promise<LocalRuntime> {
  const result = missingLocalRuntime(launch.command, source)
  if (!await access(launch.command).then(() => true, () => false)) return result
  try {
    const probe = await run(launch.command, launch.args, { cwd: launch.cwd, windowsHide: true,
      timeout: 30_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, ...launch.env, PYTHONUTF8: '1', NOLA_TRANSLATOR_RUNTIME_PROBE: '1' } })
    const actual = JSON.parse(probe.stdout.trim()) as { backend?: string; torch?: string; cudaAvailable?: boolean }
    if (!actual.backend || !actual.torch) throw new Error('当前引擎不支持环境检查，请更新引擎代码')
    return { ...result, status: 'ready', backend: actual.backend, version: actual.torch,
      gpuAvailable: actual.backend === 'cuda' && actual.cudaAvailable === true, reason: '' }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    return { ...result, status: 'failed', reason: (failure.stderr?.trim() || failure.message).slice(-2048) }
  }
}

export async function probeLocalLlama(directory: string, source: LocalRuntime['source']): Promise<LocalRuntime> {
  const executable = join(directory, 'llama-server.exe')
  const result = missingLocalRuntime(directory, source)
  if (!await access(executable).then(() => true, () => false)) return result
  try {
    const options = { cwd: directory, windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 }
    const [version, help, devices] = await Promise.all([run(executable, ['--version'], options),
      run(executable, ['--help'], options), run(executable, ['--list-devices'], options)])
    const supported = help.stdout + help.stderr
    // The app's launch args depend on these five flags, so a llama build
    // missing any of them cannot be driven by this client.
    for (const flag of ['--device', '--split-mode', '--fit-target', '--flash-attn', '--jinja']) {
      if (!supported.includes(flag)) throw new Error(`本地 llama 缺少所需参数 ${flag}，请选择兼容版本`)
    }
    const backend = /\b(CUDA|Vulkan|SYCL|HIP)\d+:/.exec(devices.stdout + devices.stderr)?.[1].toLowerCase() ?? 'cpu'
    return { ...result, status: 'ready', backend, gpuAvailable: backend !== 'cpu',
      version: /version:\s*([^\r\n]+)/i.exec(version.stdout + version.stderr)?.[1]?.slice(0, 128) ?? 'local', reason: '' }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    return { ...result, status: 'failed', reason: (failure.stderr?.trim() || failure.message).slice(-2048) }
  }
}
