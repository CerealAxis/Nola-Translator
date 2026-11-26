import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { VoiceLibrary } from '../../src/main/tts/voice-library'
import { VoiceAssets } from '../../src/main/tts/voice-assets'
import { VoicePreparation } from '../../src/main/tts/voice-preparation'
import { ProviderVoiceAdapter, ProviderVoiceError } from '../../src/main/tts/adapters/provider-voices'
import { voiceAccountScope } from '../../src/main/tts/voice-scope'
import type { WorkspaceConnection } from '../../src/shared/model-workspace'

const roots: string[] = [], libraries: VoiceLibrary[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const library of libraries.splice(0)) library.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const connection: WorkspaceConnection = { id: 'account', service: 'elevenlabs-tts', capability: 'TTS', name: 'Eleven',
  endpoint: 'https://api.elevenlabs.io/v1', protocol: '', workspace: '', region: '',
  models: [{ id: 'eleven_multilingual_v2', name: 'Eleven', enabled: true }] }
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nola-preparation-')); roots.push(root)
  const library = await VoiceLibrary.open(root); libraries.push(library)
  const assets = new VoiceAssets(join(root, 'voices'))
  const now = new Date().toISOString()
  const profile = library.save({ schemaVersion: 1, id: 'voice', revision: 1, name: 'Narrator', kind: 'design',
    representations: [{ kind: 'design-recipe', description: 'Warm narrator', recipe: {}, authoringModelBinding: 'cloud:eleven' }],
    createdAt: now, updatedAt: now })
  return { library, assets, profile, preparation: new VoicePreparation({ library, assets }) }
}

it('deduplicates in-flight creation and saves the account and model binding', async () => {
  const { library, profile, preparation } = await fixture()
  let finish!: (value: { voiceId: string; status: 'processing' }) => void
  const create = vi.spyOn(ProviderVoiceAdapter.prototype, 'create').mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const signal = new AbortController().signal
  const first = preparation.prepare(profile.id, profile.revision, connection.models[0].id, connection, 'key', 'Hello world', 'en', signal)
  const second = preparation.prepare(profile.id, profile.revision, connection.models[0].id, connection, 'key', 'Hello world', 'en', signal)
  expect(first).toBe(second)
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
  expect(library.bindings(profile.id, profile.revision)[0].status).toBe('creating')
  finish({ voiceId: 'remote', status: 'processing' })
  const binding = await first
  expect(binding).toMatchObject({ status: 'processing', voiceId: 'remote', profileRevision: 1,
    modelIds: ['eleven_multilingual_v2'], accountScope: voiceAccountScope(connection, 'key') })
  const inspect = vi.spyOn(ProviderVoiceAdapter.prototype, 'inspect').mockResolvedValue('ready')
  expect((await preparation.prepare(profile.id, 1, connection.models[0].id, connection, 'key', 'Hello', 'en', signal)).status).toBe('ready')
  expect(inspect).toHaveBeenCalledWith('remote', connection.models[0].id)
  expect(create).toHaveBeenCalledTimes(1)
})

it('keeps an uncertain creation without silently creating a second cloud voice', async () => {
  const { profile, preparation, library } = await fixture()
  const create = vi.spyOn(ProviderVoiceAdapter.prototype, 'create').mockRejectedValue(new TypeError('connection lost'))
  const run = () => preparation.prepare(profile.id, 1, connection.models[0].id, connection, 'key', 'Hello', 'en', new AbortController().signal)
  await expect(run()).rejects.toThrow('connection lost')
  expect(library.bindings(profile.id, 1)[0].status).toBe('creating')
  await expect(run()).rejects.toThrow('voiceCreationNeedsReconciliation')
  expect(create).toHaveBeenCalledTimes(1)
})

it('marks a rejected design recipe as failed so it can be corrected', async () => {
  const { profile, preparation, library } = await fixture()
  vi.spyOn(ProviderVoiceAdapter.prototype, 'create').mockRejectedValue(new ProviderVoiceError('voiceRecipeUnsupported'))
  await expect(preparation.prepare(profile.id, 1, connection.models[0].id, connection, 'key', 'Hello', 'en',
    new AbortController().signal)).rejects.toThrow('voiceRecipeUnsupported')
  expect(library.bindings(profile.id, 1)[0].status).toBe('failed')
})

it('retains a created cloud voice when its returned sample cannot be stored', async () => {
  const { profile, preparation, library } = await fixture()
  vi.spyOn(ProviderVoiceAdapter.prototype, 'create').mockResolvedValue({ voiceId: 'created', status: 'ready', sample: Buffer.from('invalid audio') })
  await expect(preparation.prepare(profile.id, 1, connection.models[0].id, connection, 'key', 'Hello', 'en',
    new AbortController().signal)).rejects.toThrow('ASSET_INVALID')
  expect(library.bindings(profile.id, 1)[0]).toMatchObject({ status: 'ready', voiceId: 'created' })
})
