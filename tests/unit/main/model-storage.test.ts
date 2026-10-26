import { mkdir, mkdtemp, readFile, readdir, rm, rmdir, writeFile, unlink, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupStorageCaches, modelStorageEnvironment, readEngineStatus, validateModelStorageDirectory } from '../../../src/main/model-storage'

describe('model storage', () => {
  it('does not follow a models junction when removing download fragments', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-cache-link-'))
    try {
      const external = join(root, 'external')
      const storage = join(root, 'storage')
      await mkdir(join(external, '.downloads'), { recursive: true })
      await writeFile(join(external, '.downloads', 'user-file'), 'keep')
      await mkdir(storage)
      await symlink(external, join(storage, 'models'), 'junction')
      await cleanupStorageCaches(storage)
      expect(await readFile(join(external, '.downloads', 'user-file'), 'utf8')).toBe('keep')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('removes fresh download and temporary caches at startup while preserving installed data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-cache-'))
    try {
      for (const name of ['cache/tmp', '.cache', 'models/.downloads/fresh', 'runtimes/wheel-cache', 'runtimes/pip-temp', 'models/installed', 'meetings']) {
        await mkdir(join(root, name), { recursive: true })
        await writeFile(join(root, name, 'keep-or-remove'), 'data')
      }
      await cleanupStorageCaches(root)
      expect((await readdir(root)).sort()).toEqual(['meetings', 'models', 'runtimes'])
      expect(await readdir(join(root, 'models'))).toEqual(['installed'])
      expect(await readdir(join(root, 'runtimes'))).toEqual([])
      expect(await readFile(join(root, 'meetings', 'keep-or-remove'), 'utf8')).toBe('data')
    } finally { await rm(root, { recursive: true, force: true }) }
  })
  it('points the model directory at the default root and forces offline model loads', () => {
    const root = join(tmpdir(), 'user-data')
    const env = modelStorageEnvironment(root)
    expect(env.NOLA_TRANSLATOR_MODEL_DIR).toBe(join(root, 'models'))
    expect(env.HF_HUB_OFFLINE).toBe('1')
    expect(env.TRANSFORMERS_OFFLINE).toBe('1')
    // The Argos XDG and HF cache variables are deliberately unset: the app's own download manager owns model placement.
    expect(env).not.toHaveProperty('XDG_DATA_HOME')
    expect(env).not.toHaveProperty('XDG_CONFIG_HOME')
    expect(env).not.toHaveProperty('XDG_CACHE_HOME')
    expect(env).not.toHaveProperty('HF_HOME')
    expect(env).not.toHaveProperty('HF_HUB_CACHE')
    expect(env).not.toHaveProperty('ARGOS_CHUNK_TYPE')
    expect(env).not.toHaveProperty('ARGOS_DEVICE_TYPE')
  })

  it('puts models and large temporary/cache files on the selected drive', () => {
    const root = join(tmpdir(), 'custom-models')
    const env = modelStorageEnvironment(join(tmpdir(), 'old'), root)
    for (const key of ['NOLA_TRANSLATOR_MODEL_DIR', 'TEMP', 'TMP', 'TMPDIR']) {
      expect(env[key].startsWith(root)).toBe(true)
    }
    expect(env.HF_HUB_OFFLINE).toBe('1')
    expect(env.TRANSFORMERS_OFFLINE).toBe('1')
  })

  it('keeps absolute drive-letter roots and falls back for relative ones', () => {
    const userData = join(tmpdir(), 'user-data')
    expect(modelStorageEnvironment(userData, 'relative/models').NOLA_TRANSLATOR_MODEL_DIR).toBe(join(userData, 'models'))
    if (process.platform === 'win32') {
      const drive = modelStorageEnvironment(userData, 'd:\\Models\\Nola Translator')
      expect(drive.NOLA_TRANSLATOR_MODEL_DIR.startsWith('d:\\')).toBe(true)
      expect(drive.TEMP.startsWith('d:\\')).toBe(true)
      const unc = modelStorageEnvironment(userData, '\\\\server\\share\\models')
      expect(unc.NOLA_TRANSLATOR_MODEL_DIR.startsWith('\\\\server\\share')).toBe(true)
    }
  })

  it('checks a writable directory without leaving probe files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-storage-'))
    try {
      expect(await validateModelStorageDirectory(root)).toBe(root)
      expect(await readdir(root)).toEqual([])
      const file = join(root, 'not-a-directory')
      await writeFile(file, '')
      await expect(validateModelStorageDirectory(file)).rejects.toThrow()
      await unlink(file)
      await expect(validateModelStorageDirectory('relative-folder')).rejects.toThrow('absolute')
    } finally { await rmdir(root) }
  })

  it('reads engine runtime status with full tolerance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nola-engine-status-'))
    try {
      expect(await readEngineStatus(root)).toBeNull()

      const runtimeDir = join(root, '.runtime')
      await mkdir(runtimeDir, { recursive: true })
      await writeFile(join(runtimeDir, 'engine-status.json'), '{broken', 'utf8')
      expect(await readEngineStatus(root)).toBeNull()

      await writeFile(join(runtimeDir, 'engine-status.json'), JSON.stringify({ recognition: { loaded: true } }), 'utf8')
      expect(await readEngineStatus(root)).toEqual({})

      await writeFile(join(runtimeDir, 'engine-status.json'), JSON.stringify({
        recognition: { modelId: 'sensevoice-small', loaded: true, runtime: 'cuda:0' },
        hymt2: { device: 'cuda', ready: true },
      }), 'utf8')
      expect(await readEngineStatus(root)).toEqual({
        recognition: { modelId: 'sensevoice-small', loaded: true, runtime: 'cuda:0' },
        hymt2: { device: 'cuda', ready: true },
      })
      await writeFile(join(runtimeDir, 'engine-status.json'), JSON.stringify({
        recognition: { modelId: 'totally-unknown-model', loaded: true, runtime: 'cuda:0' },
        hymt2: { device: 'cuda', ready: true },
      }), 'utf8')
      expect(await readEngineStatus(root)).toEqual({ hymt2: { device: 'cuda', ready: true } })
      expect(JSON.parse(await readFile(join(runtimeDir, 'engine-status.json'), 'utf8')).recognition.loaded).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
