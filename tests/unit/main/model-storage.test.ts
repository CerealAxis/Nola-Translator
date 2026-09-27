import { mkdtemp, readdir, rmdir, writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modelStorageEnvironment, validateModelStorageDirectory } from '../../../src/main/model-storage'

describe('model storage', () => {
  it('preserves legacy model and Argos locations without a custom root', () => {
    const root = join(tmpdir(), 'user-data')
    const env = modelStorageEnvironment(root)
    expect(env.FLUENTCAPTIONS_MODEL_DIR).toBe(join(root, 'models'))
    expect(env.XDG_DATA_HOME).toBe(join(root, 'argos', 'data'))
  })

  it('puts models, packages and large temporary/cache files on the selected drive', () => {
    const root = join(tmpdir(), 'custom-models')
    const env = modelStorageEnvironment(join(tmpdir(), 'old'), root)
    for (const key of ['FLUENTCAPTIONS_MODEL_DIR', 'XDG_DATA_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'HF_HOME', 'HF_HUB_CACHE', 'TEMP', 'TMP', 'TMPDIR']) {
      expect(env[key].startsWith(root)).toBe(true)
    }
  })

  it('keeps absolute drive-letter roots and falls back for relative ones', () => {
    const userData = join(tmpdir(), 'user-data')
    expect(modelStorageEnvironment(userData, 'relative/models').FLUENTCAPTIONS_MODEL_DIR).toBe(join(userData, 'models'))
    if (process.platform === 'win32') {
      const drive = modelStorageEnvironment(userData, 'd:\\Models\\FluentCaptions')
      expect(drive.FLUENTCAPTIONS_MODEL_DIR.startsWith('d:\\')).toBe(true)
      expect(drive.XDG_DATA_HOME.startsWith('d:\\')).toBe(true)
      const unc = modelStorageEnvironment(userData, '\\\\server\\share\\models')
      expect(unc.FLUENTCAPTIONS_MODEL_DIR.startsWith('\\\\server\\share')).toBe(true)
    }
  })

  it('checks a writable directory without leaving probe files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'fc-storage-'))
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
})
