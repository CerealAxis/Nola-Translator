import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VoiceLibrary } from '../../src/main/tts/voice-library'
import { VoiceAssets, resolveVoiceAssetPath } from '../../src/main/tts/voice-assets'
import type { TtsVoiceProfile } from '../../src/shared/tts/voice-profile'
import { TtsOrchestrator } from '../../src/main/tts/tts-orchestrator'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'

function wav() {
  const data = Buffer.alloc(46)
  data.write('RIFF'); data.writeUInt32LE(38, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(2, 40)
  return data
}

const roots: string[] = []
const libraries: VoiceLibrary[] = []
afterEach(async () => {
  for (const library of libraries.splice(0)) library.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function root() { const value = await mkdtemp(join(tmpdir(), 'nola-voice-')); roots.push(value); return value }
const design = (): TtsVoiceProfile => ({ schemaVersion: 1, id: 'design', revision: 1, name: 'Narrator', kind: 'design',
  representations: [{ kind: 'design-recipe', description: 'A calm voice', recipe: {}, seed: 42 }],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })

it('saves recipes without executing models, keeps revisions and deleted references', async () => {
  const folder = await root(), library = await VoiceLibrary.open(folder)
  libraries.push(library)
  const first = library.save(design())
  const second = library.save({ ...first, representations: [{ kind: 'design-recipe', description: 'A new voice', recipe: {} }] }, first.revision)
  expect(second.revision).toBe(2)
  expect(library.profile(first.id, 1)?.representations).toEqual(first.representations)
  expect(() => library.save(first, 1)).toThrow('voiceRevisionConflict')
  library.delete(first.id, 2)
  expect(library.list()).toEqual([])
  expect(library.profile(first.id, 1)).toMatchObject({ id: first.id, revision: 1, deletedAt: expect.any(String) })
})

it('rejects traversal, absolute paths and directory links', async () => {
  const folder = await root(), outside = await root()
  await mkdir(join(folder, 'profiles'))
  for (const value of ['../escape', '/escape', 'C:/escape', 'profiles\\escape']) {
    await expect(resolveVoiceAssetPath(folder, value)).rejects.toThrow('ASSET_INVALID')
  }
  await symlink(outside, join(folder, 'profiles', 'linked'), 'junction')
  await expect(resolveVoiceAssetPath(folder, 'profiles/linked')).rejects.toThrow('ASSET_INVALID')
})

it('stores validated audio by relative asset id and verifies its digest', async () => {
  const data = Buffer.alloc(46)
  data.write('RIFF'); data.writeUInt32LE(38, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(2, 40)
  const assets = new VoiceAssets(await root())
  const asset = await assets.write('profile', 'reference', data)
  expect(asset.relativePath).toMatch(/^profile\//)
  expect(await assets.read(asset)).toEqual(data)
  await expect(assets.read({ ...asset, sha256: '0'.repeat(64) })).rejects.toThrow('ASSET_INVALID')
})

it('pins the profile revision before executing and preserves it in generation history', async () => {
  const folder = await root(), library = await VoiceLibrary.open(folder), assets = new VoiceAssets(join(folder, 'voices'))
  libraries.push(library)
  const profile = library.save({ ...design(), representations: [{ kind: 'design-recipe', description: 'Original', recipe: {}, authoringModelBinding: 'resource:VoiceDesign' }] })
  const orchestrator = new TtsOrchestrator({ capabilities: async binding => ttsCatalogCapabilities('qwen3-tts', 'Qwen3-TTS-VoiceDesign', binding),
    profile: async (id, revision) => library.profile(id, revision), asset: async id => library.asset(id), bindings: async () => [], scopeId: 'local' }, library, assets)
  await orchestrator.synthesize({ schemaVersion: 1, requestId: crypto.randomUUID(), modelBinding: 'resource:VoiceDesign',
    voiceRef: { kind: 'profile', profileId: profile.id }, text: 'Hello', targetLanguage: 'en' }, new AbortController().signal,
    orchestrator.adapter(async request => {
      library.save({ ...profile, representations: [{ kind: 'design-recipe', description: 'Changed', recipe: {} }] }, profile.revision)
      expect(request.conditioning).toMatchObject({ description: 'Original' })
      return { text: '', audio: `data:audio/wav;base64,${wav().toString('base64')}` }
    }))
  const generation = library.history()[0]
  expect(generation.state).toBe('complete')
  expect(generation.request.profileRevision).toBe(1)
  expect(generation.request.conditioning).toMatchObject({ description: 'Original' })
})
