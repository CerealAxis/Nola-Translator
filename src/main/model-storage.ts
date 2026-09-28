import { mkdir, mkdtemp, readFile, rmdir } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'

export function modelStorageEnvironment(userData: string, configuredPath = ''): Record<string, string> {
  const root = configuredPath && isAbsolute(configuredPath) ? normalize(configuredPath) : userData
  return {
    NOLA_TRANSLATOR_MODEL_DIR: join(root, 'models'),
    TMP: join(root, 'cache', 'tmp'),
    TEMP: join(root, 'cache', 'tmp'),
    TMPDIR: join(root, 'cache', 'tmp'),
    // 模型经应用自带下载管理器进入 NOLA_TRANSLATOR_MODEL_DIR；加载时强制离线，禁止回落到网络。
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
  }
}

export type EngineRuntimeStatus = {
  qwen?: { quant: string; loaded: boolean }
  hymt2?: { device: string; ready: boolean }
}

export async function readEngineStatus(modelDir: string): Promise<EngineRuntimeStatus | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(modelDir, '.runtime', 'engine-status.json'), 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    const status: EngineRuntimeStatus = {}
    const qwen = source.qwen
    if (qwen && typeof qwen === 'object') {
      const record = qwen as Record<string, unknown>
      if (typeof record.quant === 'string' && typeof record.loaded === 'boolean') {
        status.qwen = { quant: record.quant, loaded: record.loaded }
      }
    }
    const hymt2 = source.hymt2
    if (hymt2 && typeof hymt2 === 'object') {
      const record = hymt2 as Record<string, unknown>
      if (typeof record.device === 'string' && typeof record.ready === 'boolean') {
        status.hymt2 = { device: record.device, ready: record.ready }
      }
    }
    return status
  } catch {
    return null
  }
}

export async function validateModelStorageDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Storage path must be absolute')
  const root = normalize(path)
  await mkdir(root, { recursive: true })
  // Test actual creation instead of relying on Windows access-mode flags.
  const probe = await mkdtemp(join(root, '.nola-translator-write-check-'))
  await rmdir(probe)
  return root
}
