import { mkdir, mkdtemp, readFile, rmdir } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'

import { RECOGNITION_MODEL_IDS, type RecognitionModelId } from '../shared/settings'

export function modelStorageEnvironment(userData: string, configuredPath = ''): Record<string, string> {
  const root = configuredPath && isAbsolute(configuredPath) ? normalize(configuredPath) : userData
  return {
    NOLA_TRANSLATOR_MODEL_DIR: join(root, 'models'),
    TMP: join(root, 'cache', 'tmp'),
    TEMP: join(root, 'cache', 'tmp'),
    TMPDIR: join(root, 'cache', 'tmp'),
    // Models arrive through the app's own download manager, so loading is forced offline and must never fall back to the network.
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
  }
}

export type EngineRuntimeStatus = {
  recognition?: { modelId: RecognitionModelId; loaded: boolean; runtime: string }
  hymt2?: { device: string; ready: boolean }
}

export async function readEngineStatus(modelDir: string): Promise<EngineRuntimeStatus | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(modelDir, '.runtime', 'engine-status.json'), 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    const status: EngineRuntimeStatus = {}
    const recognition = source.recognition
    if (recognition && typeof recognition === 'object') {
      const record = recognition as Record<string, unknown>
      const modelId = RECOGNITION_MODEL_IDS.find((id) => id === record.modelId)
      if (modelId && typeof record.loaded === 'boolean' && typeof record.runtime === 'string') {
        status.recognition = { modelId, loaded: record.loaded, runtime: record.runtime }
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
  // Probe with a real directory rather than Windows access-mode flags.
  const probe = await mkdtemp(join(root, '.nola-translator-write-check-'))
  await rmdir(probe)
  return root
}
