import { execFile } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { LocalRuntime } from '../shared/compute'

const run = promisify(execFile)
export function missingLocalRuntime(path = ''): LocalRuntime {
  return { path, status: 'missing', backend: '', version: '', gpuAvailable: false, reason: '' }
}

// Probe and inference insert the same directory into the built-in interpreter's search path.
export async function probeLocalEngine(python: string, directory: string): Promise<LocalRuntime> {
  const result = missingLocalRuntime(directory)
  if (!await access(join(directory, 'torch')).then(() => true, () => false)) return result
  const extensions = await readdir(join(directory, 'torch')).catch(() => [] as string[])
  const abi = extensions.find(name => /^_C\.cp\d+-win_amd64\.pyd$/i.test(name))?.match(/cp\d+/)?.[0]
  if (abi && abi !== 'cp312') return { ...result, status: 'incompatible', reason: `已有 PyTorch 使用 ${abi}，无法由内置 Python 3.12 加载；请在设置中选择 Python 3.12 组合安装。` }
  try {
    const script = `import sys,json,importlib.util; sys.path[:0] = ${JSON.stringify([join(dirname(python), "Lib", "site-packages"), directory])}; import torch; xpu=getattr(getattr(torch,'xpu',None),'_is_compiled',lambda:False)(); dml=importlib.util.find_spec('torch_directml') is not None; importlib.import_module('torch_directml') if dml else None; backend='directml' if dml else 'rocm' if torch.version.hip else 'cuda' if torch.version.cuda else 'xpu' if xpu else 'cpu'; xf=importlib.util.find_spec('xformers'); from importlib.metadata import version; print(json.dumps(dict(torch=str(torch.__version__),backend=backend,path=str(__import__('pathlib').Path(torch.__file__).parent.parent),xformersVersion=version('xformers') if xf else '')))`
    const probe = await run(python, ['-I', '-c', script], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: '1' } })
    const actual = JSON.parse(probe.stdout.trim()) as { torch: string; backend: string; path: string; xformersVersion: string }
    return { ...result, path: actual.path, status: 'ready', backend: actual.backend, version: actual.torch,
      gpuAvailable: actual.backend !== 'cpu', xformersVersion: actual.xformersVersion }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    const reason = (failure.stderr?.trim() || failure.message).slice(-2048)
    const incompatible = /python3(?!12)\d*\.dll|cp31[013]|Python version|not a valid Win32/i.test(reason)
    return { ...result, status: incompatible ? 'incompatible' : 'failed', reason }
  }
}

export async function probeLocalLlama(directory: string): Promise<LocalRuntime> {
  const executable = join(directory, 'llama-server.exe')
  const result = missingLocalRuntime(directory)
  if (!await access(executable).then(() => true, () => false)) return result
  try {
    const version = await run(executable, ['--version'], { cwd: directory, windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024 })
    const files = (await readdir(directory)).join(' ').toLowerCase()
    const backend = ['cuda', 'vulkan', 'sycl', 'openvino', 'hip', 'rocm'].find(b => files.includes(`ggml-${b}`)) ?? 'cpu'
    const output = version.stdout + version.stderr
    const cudaVersion = /cudart64_13\.dll/.test(files) ? '13.4' : /cudart64_12\.dll/.test(files) ? '12.4' : undefined
    const build = /\bbuild\s+(\d+)/i.exec(output)?.[1] ?? /version:\s*(\d+)(?:\s|$)/i.exec(output)?.[1]
    return { ...result, status: 'ready', cudaVersion, backend: backend === 'hip' ? 'rocm' : backend, gpuAvailable: backend !== 'cpu',
      version: build ? `b${build}` : /version:\s*([^\r\n]+)/i.exec(output)?.[1]?.slice(0, 128) ?? output.trim().slice(0, 128) }
  } catch (error) {
    const failure = error as Error & { stderr?: string }
    return { ...result, status: 'failed', reason: (failure.stderr?.trim() || failure.message).slice(-2048) }
  }
}

/** Read registered installations, PATH and known legacy directories; never run their Python. */
export async function localCandidates(base: string, runtimes: string, legacyLlama?: string): Promise<{ torch: string[]; llama: string[] }> {
  const torch = [join(base, 'Lib', 'site-packages')]
  const llama = legacyLlama ? [legacyLlama] : []
  for (const entry of (process.env.PATH ?? '').split(';').filter(Boolean)) {
    llama.push(entry)
    torch.push(join(entry, 'Lib', 'site-packages'), join(dirname(entry), 'Lib', 'site-packages'))
  }
  torch.push(...(process.env.PYTHONPATH ?? '').split(';').filter(Boolean))
  const names = await readdir(runtimes).catch(() => [] as string[])
  for (const name of names.filter(n => !/^(staging-|backup-|wheel-cache)/.test(n))) {
    torch.push(join(runtimes, name), join(runtimes, name, 'Lib', 'site-packages'))
    llama.push(join(runtimes, name))
  }
  try {
    const registry = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-ChildItem -LiteralPath 'HKCU:\\Software\\Python\\PythonCore','HKLM:\\Software\\Python\\PythonCore' -ErrorAction SilentlyContinue | ForEach-Object { (Get-ItemProperty -LiteralPath ($_.PSPath + '\\InstallPath') -ErrorAction SilentlyContinue).'(default)' }"],
    { windowsHide: true, timeout: 5000 })
    for (const directory of registry.stdout.split(/\r?\n/).map(p => p.trim()).filter(Boolean)) torch.push(join(directory, 'Lib', 'site-packages'))
  } catch { /* Registry entries are optional discovery hints. */ }
  const unique = (paths: string[]) => [...new Map(paths.map(p => [resolve(p).toLowerCase(), resolve(p)])).values()]
  return { torch: unique(torch), llama: unique(llama) }
}
