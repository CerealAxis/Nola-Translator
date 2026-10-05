import { mkdir, mkdtemp, readFile, rmdir } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'

import { RECOGNITION_MODEL_IDS, type RecognitionModelId } from '../shared/settings'

// `dataRoot` is the app's single data root, not `userData`: models and cache default next to the
// rest of the app's data (see `data-root.ts`). A configured path still wins, but only when it is
// absolute — a relative or empty setting must not resolve against the process cwd.
export function modelStorageEnvironment(dataRoot: string, configuredPath = ''): Record<string, string> {
  const root = configuredPath && isAbsolute(configuredPath) ? normalize(configuredPath) : dataRoot
  return {
    NOLA_TRANSLATOR_MODEL_DIR: join(root, 'models'),
    TMP: join(root, 'cache', 'tmp'),
    TEMP: join(root, 'cache', 'tmp'),
    TMPDIR: join(root, 'cache', 'tmp'),
    // Belt-and-braces with the engine's `local_files_only=True`: a model that
    // is not on disk must fail rather than silently pull from the network.
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
