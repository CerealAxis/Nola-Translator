import { createHash } from 'node:crypto'
import type { AppSettings, CredentialProvider } from '../../shared/settings'
import type { ResourceRecord } from '../../shared/contracts'
import { workspaceSpeechConnection, workspaceSpeechModel } from '../../shared/model-workspace'
import { customCredentialSlot } from '../../shared/custom-models'
import { ttsCatalogCapabilities } from '../../shared/tts/catalog'
import type { TtsModelCapabilities, TtsPresetVoiceDescriptor } from '../../shared/tts/capabilities'
import { TtsCapabilityRegistry } from './tts-capability-registry'
import { VoiceLibrary } from './voice-library'
import { VoiceAssets } from './voice-assets'
import { TtsOrchestrator } from './tts-orchestrator'
import { VoicePreparation } from './voice-preparation'
import { join } from 'node:path'
import { voiceAccountScope } from './voice-scope'
import { ProviderVoiceAdapter } from './adapters/provider-voices'
import { astrBotSpeechPresetForBinding } from '../../shared/astrbot-speech-presets'
import { SessionVoices } from './session-voices'
import { randomUUID } from 'node:crypto'
import { TtsProviderRelay } from './tts-provider-relay'
import { DirectModelTtsAdapter } from './adapters/direct-model-adapter'
import { inferAstrBotSpeech } from '../astrbot-speech'
import type { ResolvedTtsRequest } from '../../shared/tts/synthesis'
import type { TtsUsage } from '../../shared/tts/voice-library-api'
import type { TtsVoiceRef } from '../../shared/tts/voice-ref'
import { mergeTtsCapabilities } from '../../shared/tts/capability-overrides'

export async function createTtsRuntime(root: string, dependencies: {
  settings(): AppSettings;
  credential(provider: CredentialProvider): Promise<string>;
  resources(): Promise<ResourceRecord[]>;
  inventory?(binding: string): Promise<TtsPresetVoiceDescriptor[]>;
}) {
  const library = await VoiceLibrary.open(root)
  const assets = new VoiceAssets(join(root, 'voices'))
  const registry = new TtsCapabilityRegistry()
  const localInventories = new Map<string, TtsPresetVoiceDescriptor[]>()
  const sessionVoices = new SessionVoices()
  const relay = new TtsProviderRelay()
  const scopeFor = async (binding: string) => {
    const connection = workspaceSpeechConnection(dependencies.settings().modelWorkspace, 'tts', binding)
    if (!connection) return 'local'
    const key = connection.service === 'edge-tts' ? '' : await dependencies.credential(connection.service === 'mimo' ? 'mimo-tts' : customCredentialSlot(connection.id))
    return voiceAccountScope(connection, key)
  }
  const capabilities = async (binding: string, refresh = false, modelId?: string, cachedOnly = false, catalog = false): Promise<TtsModelCapabilities> => {
    const connection = workspaceSpeechConnection(dependencies.settings().modelWorkspace, 'tts', binding)
    if (connection) {
      const savedModel = workspaceSpeechModel(connection, binding)
      const model = modelId ? { ...savedModel, id: modelId } : savedModel
      if (!model) throw new Error('voiceModelMissing')
      const key = connection.service === 'edge-tts' ? '' : await dependencies.credential(
        connection.service === 'mimo' ? 'mimo-tts' : customCredentialSlot(connection.id))
      const value = await registry.capabilities(connection, model.id, binding, key,
        createHash('sha256').update(key).digest('hex'), AbortSignal.timeout(15_000), refresh, cachedOnly)
      return catalog ? value : mergeTtsCapabilities(value, savedModel?.id === model.id ? savedModel.tts?.capabilityOverride : undefined, savedModel?.id === model.id ? savedModel.tts?.presetVoiceIds : undefined)
    }
    const provider = astrBotSpeechPresetForBinding(binding)
    if (modelId && provider?.capability === 'TTS') return ttsCatalogCapabilities(provider.id, modelId, binding)
    const resource = (await dependencies.resources()).find(item => binding === `resource:${item.resourceId}`)
    if (!resource) throw new Error('voiceModelMissing')
    const isQwen = /qwen3.*tts|tts.*qwen3/i.test(resource.resourceId + resource.name)
    const value = ttsCatalogCapabilities(isQwen ? 'qwen3-tts' : resource.provider, resource.resourceId, binding)
    value.outputFormats = ['wav', 'mp3', 'pcm']
    if (!isQwen && resource.languages.length) value.languages = { mode: 'finite', values: resource.languages }
    if (/llama/i.test(resource.provider)) value.conditioning = []
    if (refresh && dependencies.inventory && value.conditioning?.includes('preset')) localInventories.set(binding, await dependencies.inventory(binding))
    const inventory = localInventories.get(binding)
    if (inventory) { value.presetVoices = inventory; value.source = 'runtime-probe' }
    if (catalog) return value
    const saved = dependencies.settings().modelWorkspace?.localTts?.[resource.resourceId]
    return mergeTtsCapabilities({ ...value, defaultPresetVoiceId: saved?.defaultVoiceRef?.kind === 'preset' ? saved.defaultVoiceRef.voiceId : value.defaultPresetVoiceId }, saved?.capabilityOverride, saved?.presetVoiceIds)
  }
  const orchestrator = new TtsOrchestrator(async binding => ({ defaultVoiceRef: (() => {
    const workspace = dependencies.settings().modelWorkspace
    const connection = workspaceSpeechConnection(workspace, 'tts', binding)
    return connection ? workspaceSpeechModel(connection, binding)?.tts?.defaultVoiceRef : workspace?.localTts?.[binding.slice('resource:'.length)]?.defaultVoiceRef
  })(), capabilities: value => capabilities(value, false, undefined, true),
    profile: async (id, revision) => library.profile(id, revision),
    asset: async id => library.asset(id), bindings: async (id, revision) => library.bindings(id, revision),
    scopeId: await scopeFor(binding),
    sessionSpeaker: async (sessionId, speakerId) => sessionVoices.resolve(sessionId, speakerId),
  }), library, assets)
  const preparation = new VoicePreparation({ library, assets })
  const prepare = async (profileId: string, revision: number, binding: string, text: string, language: string) => {
    const connection = workspaceSpeechConnection(dependencies.settings().modelWorkspace, 'tts', binding)
    const model = connection && workspaceSpeechModel(connection, binding)
    if (!connection || !model) throw new Error('voicePreparationUnsupported')
    const profile = library.profile(profileId, revision)
    const capability = await capabilities(binding)
    if (!profile || profile.deletedAt) throw new Error('voicePreparationUnsupported')
    const strategy = profile.kind === 'design' && !profile.lockedSampleAssetId ? 'design' : 'clone'
    if ((strategy === 'design' ? capability.supports.voiceDesign : capability.supports.cloning) !== true) throw new Error('voicePreparationUnsupported')
    if (strategy === 'design' && profile.representations.find(item => item.kind === 'design-recipe')?.authoringModelBinding !== binding) throw new Error('voiceAuthoringModelMismatch')
    const key = await dependencies.credential(customCredentialSlot(connection.id))
    return preparation.prepare(profileId, revision, model.id, connection, key, text, language, AbortSignal.timeout(120_000), strategy)
  }
  const refreshBinding = async (profileId: string, revision: number, bindingId: string, remove = false) => {
    const binding = library.bindings(profileId, revision).find(item => item.id === bindingId)
    const connection = dependencies.settings().modelWorkspace?.connections.find(item => item.id === binding?.connectionId)
    if (!binding?.voiceId || !connection) throw new Error('voiceBindingMissing')
    const key = await dependencies.credential(customCredentialSlot(connection.id))
    if (voiceAccountScope(connection, key) !== binding.accountScope) throw new Error('voiceAccountChanged')
    const adapter = new ProviderVoiceAdapter(connection, key, AbortSignal.timeout(30_000))
    if (remove) {
      const profile = library.profile(profileId, revision)
      if (!profile) throw new Error('voiceMissing')
      await adapter.remove(binding.voiceId, binding.creationKind ?? profile.kind, binding.modelIds[0])
    }
    const status = remove ? 'deleted' as const : await adapter.inspect(binding.voiceId, binding.modelIds[0])
    const next = { ...binding, revision: binding.revision + 1, status, lastVerifiedAt: new Date().toISOString() }
    library.saveBinding(next)
    return next
  }
  const compatibility = (binding: string, language: string, refs: TtsVoiceRef[], usage?: TtsUsage) => orchestrator.compatibility(binding, language, refs, usage)
  const addProviderVoice = async (binding: string, voiceId: string, name: string) => {
    const connection = workspaceSpeechConnection(dependencies.settings().modelWorkspace, 'tts', binding)
    const model = connection && workspaceSpeechModel(connection, binding)
    if (!connection || !model || !(await capabilities(binding, false, undefined, true)).voiceRegistration?.inspect) throw new Error('voicePreparationUnsupported')
    const key = await dependencies.credential(customCredentialSlot(connection.id))
    const scope = voiceAccountScope(connection, key)
    const existingVoice = () => library.list().find(profile => !profile.deletedAt && library.bindings(profile.id, profile.revision)
      .some(item => item.accountScope === scope && item.modelIds.includes(model.id) && item.voiceId === voiceId && ['ready', 'processing'].includes(item.status)))
    const existing = existingVoice()
    if (existing) return existing
    const status = await new ProviderVoiceAdapter(connection, key, AbortSignal.timeout(30_000)).inspect(voiceId, model.id)
    if (!['ready', 'processing'].includes(status)) throw new Error('voiceBindingUnavailable')
    const concurrent = existingVoice()
    if (concurrent) return concurrent
    const now = new Date().toISOString(), profileId = randomUUID(), bindingId = randomUUID()
    return library.save({ schemaVersion: 1, id: profileId, revision: 1, name, kind: 'imported',
      representations: [{ kind: 'provider-voice', providerId: connection.service, voiceId, modelIds: [model.id] }], createdAt: now, updatedAt: now }, undefined,
      { schemaVersion: 1, id: bindingId, revision: 1, profileId, profileRevision: 1, providerId: connection.service,
        connectionId: connection.id, accountScope: scope, region: connection.region, workspace: connection.workspace,
        endpoint: connection.endpoint, apiFamily: `${connection.service}:voice-v1`, voiceId, modelIds: [model.id],
        status: status === 'ready' ? 'ready' : 'processing', sourceAssetHashes: [], createdAt: now, lastVerifiedAt: now })
  }
  const realtimeRelay = async (snapshot: ResolvedTtsRequest) => {
    const connection = workspaceSpeechConnection(dependencies.settings().modelWorkspace, 'tts', snapshot.modelBinding)
    const selected = connection && workspaceSpeechModel(connection, snapshot.modelBinding)
    if (!connection || !selected) throw new Error('voiceModelMissing')
    const frozen = structuredClone(connection), model = { ...structuredClone(selected), id: snapshot.modelId, enabled: true }
    const key = await dependencies.credential(connection.service === 'mimo' ? 'mimo-tts' : customCredentialSlot(connection.id))
    const adapter = new DirectModelTtsAdapter({ capabilities: binding => capabilities(binding, false, undefined, true),
      reference: async id => {
        const asset = library.asset(id)
        return `data:${asset.mime};base64,${(await assets.read(asset)).toString('base64')}`
      }, execute: (request, signal) => inferAstrBotSpeech(frozen, request, key, signal, model) })
    return relay.register(snapshot, async (request, signal) => {
      const result = await adapter.synthesize(request, signal)
      library.activateBinding(request)
      return result
    })
  }
  return { library, assets, registry, capabilities, orchestrator, scopeFor, prepare, refreshBinding, sessionVoices, compatibility, addProviderVoice, relay, realtimeRelay }
}
export type TtsRuntime = Awaited<ReturnType<typeof createTtsRuntime>>
