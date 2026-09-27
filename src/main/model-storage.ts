import { mkdir, mkdtemp, rmdir } from 'node:fs/promises'
import { isAbsolute, join, normalize } from 'node:path'

export function modelStorageEnvironment(userData: string, configuredPath = ''): Record<string, string> {
  const root = configuredPath && isAbsolute(configuredPath) ? normalize(configuredPath) : userData
  return {
    FLUENTCAPTIONS_MODEL_DIR: join(root, 'models'),
    XDG_DATA_HOME: join(root, 'argos', 'data'),
    XDG_CONFIG_HOME: join(root, 'argos', 'config'),
    XDG_CACHE_HOME: join(root, 'argos', 'cache'),
    HF_HOME: join(root, 'cache', 'huggingface'),
    HF_HUB_CACHE: join(root, 'cache', 'huggingface', 'hub'),
    TMP: join(root, 'cache', 'tmp'),
    TEMP: join(root, 'cache', 'tmp'),
    TMPDIR: join(root, 'cache', 'tmp'),
    ARGOS_CHUNK_TYPE: 'MINISBD',
    ARGOS_DEVICE_TYPE: 'cpu',
  }
}

export async function validateModelStorageDirectory(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('Storage path must be absolute')
  const root = normalize(path)
  await mkdir(root, { recursive: true })
  // Test actual creation instead of relying on Windows access-mode flags.
  const probe = await mkdtemp(join(root, '.fluentcaptions-write-check-'))
  await rmdir(probe)
  return root
}
