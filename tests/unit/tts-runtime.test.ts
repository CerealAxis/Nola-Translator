import type { ResourceRecord } from '../../src/shared/contracts'
import { modelWorkspaceSchema } from '../../src/shared/model-workspace'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTtsRuntime, type TtsRuntime } from '../../src/main/tts/tts-runtime'
import { DEFAULT_SETTINGS } from '../../src/shared/settings'
import { mergeTtsCapabilities } from '../../src/shared/tts/capability-overrides'
import { ttsCatalogCapabilities } from '../../src/shared/tts/catalog'
import { ProviderVoiceAdapter } from '../../src/main/tts/adapters/provider-voices'
import { astrBotSpeechBinding } from '../../src/shared/astrbot-speech-presets'
import type { WorkspaceConnection } from '../../src/shared/model-workspace'
const roots: string[] = [], runtimes: TtsRuntime[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const runtime of runtimes.splice(0)) { runtime.library.close(); await runtime.relay.close() }; for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture(connection: WorkspaceConnection, resources: ResourceRecord[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'nola-tts-runtime-')); roots.push(root)
  const settings = structuredClone(DEFAULT_SETTINGS)
  settings.modelWorkspace = { connections: [connection], localSources: {} }
  const runtime = await createTtsRuntime(root, { settings: () => settings, credential: async () => 'account-key', resources: async () => resources }); runtimes.push(runtime)
  return { runtime, settings }
}
it('merges configured voices without dropping official inventory or loosening its language restrictions', () => {
  const base = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'binding')
  base.presetVoices[0].languages = ['en']
  const merged = mergeTtsCapabilities(base, { presetVoices: [{ id: 'custom-one', name: 'One' }, { id: 'custom-two', name: 'Two' }, { id: 'mimo_default', name: 'Default', languages: ['zh'] }] })
  expect(merged.presetVoices).toHaveLength(11)
  expect(merged.presetVoices.find(voice => voice.id === 'mimo_default')).toMatchObject({ name: 'Default', languages: [] })
  expect(mergeTtsCapabilities(ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts-voicedesign', 'binding'), { presetVoices: [{ id: 'mimo_default', name: 'Default' }] }).presetVoices).toEqual([])
})
it('isolates saved overrides from a different model ID during model editing', async () => {
  const { runtime } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '',
    models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { capabilityOverride: { languages: { mode: 'finite', values: ['ja'] }, presetVoices: [{ id: 'custom', name: 'Custom' }] } } }] })
  const binding = astrBotSpeechBinding('mimo')
  expect((await runtime.capabilities(binding)).presetVoices).toHaveLength(10)
  expect(await runtime.capabilities(binding, false, 'mimo-v2.5-tts-voicedesign')).toMatchObject({ languages: { values: ['zh', 'en'] }, presetVoices: [], conditioning: ['design'] })
  const results = await runtime.compatibility(binding, 'zh', [{ kind: 'engine-default' }])
  expect(results).toMatchObject([{ compatible: false, code: 'MODEL_LANGUAGE_UNSUPPORTED' }])
})
it('inspects each provider voice before atomic save and retains separate IDs across rename and retry', async () => {
  const connection: WorkspaceConnection = { id: 'account', service: 'minimax-tts', capability: 'TTS', name: 'MiniMax', endpoint: 'https://api.minimax.io/v1', protocol: '', workspace: '', region: '',
    models: [{ id: 'speech-2.8-hd', name: 'MiniMax', enabled: true }] }
  const { runtime } = await fixture(connection), binding = astrBotSpeechBinding('minimax-tts')
  const inspect = vi.spyOn(ProviderVoiceAdapter.prototype, 'inspect').mockImplementation(async id => { if (id === 'bad') throw new Error('quota'); return 'ready' })
  const first = await runtime.addProviderVoice(binding, 'one', 'One')
  await expect(runtime.addProviderVoice(binding, 'bad', 'Bad')).rejects.toThrow('quota')
  expect(runtime.library.list()).toHaveLength(1)
  const second = await runtime.addProviderVoice(binding, 'two', 'Two')
  expect(second.id).not.toBe(first.id)
  expect((await runtime.addProviderVoice(binding, 'one', 'One')).id).toBe(first.id)
  expect(inspect).toHaveBeenCalledTimes(3)
  const renamed = runtime.library.save({ ...first, name: 'Renamed' }, first.revision)
  expect(runtime.library.bindings(renamed.id, renamed.revision)[0]).toMatchObject({ voiceId: 'one', profileRevision: 2 })
  expect(runtime.library.bindings(first.id, 1)[0]).toMatchObject({ voiceId: 'one', profileRevision: 1 })
  expect((await runtime.compatibility(binding, 'en', [{ kind: 'profile', profileId: renamed.id }]))[0].compatible).toBe(true)
})

it('deduplicates concurrent imports after provider inspection', async () => {
  const { runtime } = await fixture({ id: 'account', service: 'minimax-tts', capability: 'TTS', name: 'MiniMax', endpoint: 'https://api.minimax.io/v1', protocol: '', workspace: '', region: '', models: [{ id: 'speech-2.8-hd', name: 'MiniMax', enabled: true }] })
  vi.spyOn(ProviderVoiceAdapter.prototype, 'inspect').mockResolvedValue('ready')
  const binding = astrBotSpeechBinding('minimax-tts')
  const [first, second] = await Promise.all([runtime.addProviderVoice(binding, 'same', 'First'), runtime.addProviderVoice(binding, 'same', 'Second')])
  expect(first.id).toBe(second.id)
  expect(runtime.library.list()).toHaveLength(1)
})
it('reads the model inventory once for a large compatibility batch', async () => {
  const { runtime } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: '', protocol: '', workspace: '', region: '', models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true }] })
  const inventory = vi.spyOn(runtime.registry, 'capabilities')
  const refs = Array.from({ length: 500 }, () => ({ kind: 'engine-default' as const }))
  expect((await runtime.compatibility(astrBotSpeechBinding('mimo'), 'en', refs)).every(item => item.compatible)).toBe(true)
  expect(inventory).toHaveBeenCalledTimes(1)
})

it('allows narrowing official voice languages and restores inherited languages when cleared', () => {
  const base = ttsCatalogCapabilities('mimo', 'mimo-v2.5-tts', 'binding')
  base.presetVoices[0] = { ...base.presetVoices[0], languages: ['zh', 'en'], locale: 'zh-CN', modelIds: ['mimo-v2.5-tts'] }
  const narrow = mergeTtsCapabilities(base, { presetVoices: [{ id: 'mimo_default', name: 'Default', languages: ['en'] }] })
  expect(narrow.presetVoices[0]).toMatchObject({ languages: ['en'], locale: 'zh-CN', modelIds: ['mimo-v2.5-tts'] })
  expect(mergeTtsCapabilities(base, { presetVoices: [{ id: 'mimo_default', name: 'Default' }] }).presetVoices[0].languages).toEqual(['zh', 'en'])
})

it('persists local voice configuration and resolves its inventory and default without loading a worker', async () => {
  const resource: ResourceRecord = { resourceId: 'qwen3-tts-1.7b-customvoice', kind: 'ttsModel', provider: 'transformers-tts', name: 'Qwen3 TTS', description: '', languages: ['zh', 'en'], installed: true, installedBytes: 0, state: 'idle', cancellable: false }
  const { runtime, settings } = await fixture({ id: 'account', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '', models: [] }, [resource])
  settings.modelWorkspace!.localTts = { [resource.resourceId]: { defaultVoiceRef: { kind: 'preset', modelBinding: `resource:${resource.resourceId}`, voiceId: 'custom' }, capabilityOverride: { presetVoices: [{ id: 'custom', name: 'Custom', languages: ['en'] }] } } }
  expect(modelWorkspaceSchema.parse(settings.modelWorkspace).localTts).toEqual(settings.modelWorkspace!.localTts)
  const capabilities = await runtime.capabilities(`resource:${resource.resourceId}`)
  expect(capabilities.presetVoices).toHaveLength(10)
  expect(capabilities.defaultPresetVoiceId).toBe('custom')
  expect(capabilities.presetVoices.find(voice => voice.id === 'custom')).toMatchObject({ languages: ['en'] })
})

it('uses a configured cloud default under the migrated global engine default', async () => {
  const binding = astrBotSpeechBinding('mimo')
  const { runtime, settings } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '', models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'preset', modelBinding: binding, voiceId: 'custom' }, capabilityOverride: { presetVoices: [{ id: 'custom', name: 'Custom', languages: ['en'] }] } } }] })
  settings.synthesis.voiceRef = { kind: 'engine-default' }
  expect(await runtime.compatibility(binding, 'zh', [settings.synthesis.voiceRef])).toMatchObject([{ compatible: false, code: 'VOICE_LANGUAGE_UNSUPPORTED' }])
  expect(await runtime.compatibility(binding, 'en', [settings.synthesis.voiceRef])).toMatchObject([{ compatible: true }])
})

it('keeps removed voices out of inventory and refuses the factory default before calling an adapter', async () => {
  const binding = astrBotSpeechBinding('mimo')
  const { runtime } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '', models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true, tts: { defaultVoiceRef: { kind: 'engine-default' }, presetVoiceIds: [] } }] })
  expect((await runtime.capabilities(binding)).presetVoices).toEqual([])
  expect((await runtime.capabilities(binding, false, undefined, false, true)).presetVoices).toHaveLength(9)
  const synthesize = vi.fn()
  await expect(runtime.orchestrator.synthesize({ schemaVersion: 1, requestId: '46af795a-3ecb-4d9e-89a5-8d398e953a87', modelBinding: binding, text: 'Hello', targetLanguage: 'en', voiceRef: { kind: 'engine-default' } }, new AbortController().signal, { capabilities: async () => runtime.capabilities(binding), synthesize })).rejects.toMatchObject({ code: 'VOICE_CONDITIONING_UNSUPPORTED' })
  expect(synthesize).not.toHaveBeenCalled()
  expect(await runtime.compatibility(binding, 'en', [{ kind: 'preset', modelBinding: binding, voiceId: 'mimo_default' }])).toMatchObject([{ compatible: false, code: 'VOICE_UNVERIFIED' }])
})

it('uses the realtime design constraint in both compatibility and session resolution', async () => {
  const binding = astrBotSpeechBinding('mimo')
  const { runtime } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '', models: [{ id: 'mimo-v2.5-tts-voicedesign', name: 'Design', enabled: true }] })
  const now = new Date().toISOString()
  const profile = runtime.library.save({ schemaVersion: 1, id: 'design', revision: 1, name: 'Design', kind: 'design',
    representations: [{ kind: 'design-recipe', description: 'Warm voice', recipe: {}, authoringModelBinding: binding }], createdAt: now, updatedAt: now })
  const ref = { kind: 'profile' as const, profileId: profile.id }
  expect(await runtime.compatibility(binding, 'zh', [ref])).toMatchObject([{ compatible: true }])
  expect(await runtime.compatibility(binding, 'zh', [ref], 'realtime')).toMatchObject([{ compatible: false, code: 'VOICE_PREPARATION_REQUIRED', details: { reason: 'realtime-design-sample-required' } }])
  await expect(runtime.orchestrator.resolve({ schemaVersion: 1, requestId: crypto.randomUUID(), modelBinding: binding, voiceRef: ref, text: 'Hello', targetLanguage: 'zh' }, 'realtime')).rejects.toMatchObject({ code: 'VOICE_PREPARATION_REQUIRED' })
})

it('isolates missing session voices to their own compatibility result', async () => {
  const binding = astrBotSpeechBinding('mimo')
  const { runtime } = await fixture({ id: 'mimo', service: 'mimo', capability: 'TTS', name: 'MiMo', endpoint: 'https://api.xiaomimimo.com/v1', protocol: '', workspace: '', region: '', models: [{ id: 'mimo-v2.5-tts', name: 'MiMo', enabled: true }] })
  expect(await runtime.compatibility(binding, 'zh', [{ kind: 'session-speaker', sessionId: 'expired', speakerId: 'speaker' }, { kind: 'engine-default' }])).toMatchObject([
    { compatible: false, code: 'VOICE_MISSING' }, { compatible: true },
  ])
})
