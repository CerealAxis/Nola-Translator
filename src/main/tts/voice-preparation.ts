import { randomUUID } from 'node:crypto'
import type { TtsVoiceBinding } from '../../shared/tts/voice-binding'
import type { TtsRuntime } from './tts-runtime'
import { ProviderVoiceAdapter } from './adapters/provider-voices'
import type { WorkspaceConnection } from '../../shared/model-workspace'
import { voiceAccountScope } from './voice-scope'
import { ProviderVoiceError } from './adapters/provider-voices'
import { dashscopeVoiceApiModel } from './adapters/dashscope-voice-family'

export class VoicePreparation {
  private readonly pending = new Map<string, Promise<TtsVoiceBinding>>()
  constructor(private readonly runtime: Pick<TtsRuntime, 'library' | 'assets'>) {}

  prepare(profileId: string, revision: number, modelId: string, connection: WorkspaceConnection,
    key: string, previewText: string, language: string, signal: AbortSignal, strategy?: 'clone' | 'design'): Promise<TtsVoiceBinding> {
    const scope = voiceAccountScope(connection, key)
    const identity = JSON.stringify([profileId, revision, modelId, scope])
    const current = this.pending.get(identity)
    if (current) return current
    const operation = this.create(profileId, revision, modelId, connection, key, previewText, language, scope, signal, strategy)
      .finally(() => this.pending.delete(identity))
    this.pending.set(identity, operation)
    return operation
  }

  private async create(profileId: string, revision: number, modelId: string, connection: WorkspaceConnection,
    key: string, previewText: string, language: string, scope: string, signal: AbortSignal, strategy?: 'clone' | 'design'): Promise<TtsVoiceBinding> {
    let profile = this.runtime.library.profile(profileId, revision)
    if (!profile || profile.deletedAt) throw new Error('voiceMissing')
    if (strategy === 'clone' && profile.kind === 'design') {
      const sampleId = profile.lockedSampleAssetId
      const sample = profile.representations.filter(item => item.kind === 'reference-audio').find(item => item.assetId === sampleId)
      if (!sample) throw new Error('voiceSampleMissing')
      profile = { ...profile, kind: 'clone', primaryReferenceAssetId: sample.assetId, representations: [sample] }
    }
    const previous = this.runtime.library.bindings(profileId, revision).find(binding => binding.accountScope === scope && binding.modelIds.includes(modelId))
    const adapter = new ProviderVoiceAdapter(connection, key, signal)
    if (previous && ['ready', 'processing', 'creating'].includes(previous.status)) {
      if (!previous.voiceId) throw new Error('voiceCreationNeedsReconciliation')
      const status = await adapter.inspect(previous.voiceId, modelId)
      const binding = { ...previous, revision: previous.revision + 1, status, lastVerifiedAt: new Date().toISOString() }
      this.runtime.library.saveBinding(binding)
      return binding
    }
    const references = profile.representations.filter(item => item.kind === 'reference-audio')
    const reference = profile.primaryReferenceAssetId ? references.find(item => item.assetId === profile.primaryReferenceAssetId)
      : references.length === 1 ? references[0] : undefined
    const asset = reference ? this.runtime.library.asset(reference.assetId) : undefined
    const id = randomUUID()
    const binding: TtsVoiceBinding = { schemaVersion: 1, id, revision: 1, profileId, profileRevision: revision,
      providerId: connection.service, connectionId: connection.id, accountScope: scope,
      creationKind: profile.kind,
      workspace: connection.workspace, region: connection.region, endpoint: connection.endpoint,
      apiFamily: connection.service === 'dashscope-tts' ? dashscopeVoiceApiModel(modelId, profile.kind) : `${connection.service}:voice-v1`, modelIds: [modelId], status: 'creating',
      createdAt: new Date().toISOString(), sourceAssetHashes: asset ? [asset.sha256] : [],
      ...(connection.service === 'minimax-tts' && profile.kind !== 'design' ? { voiceId: 'nola_' + id.replaceAll('-', '') } : {}),
    }
    this.runtime.library.saveBinding(binding)
    let result
    try {
      result = await adapter.create({ profile, modelId, voiceId: binding.voiceId ?? id, previewText, language,
        reference: asset ? { asset, data: await this.runtime.assets.read(asset), transcript: reference?.transcript } : undefined })
    } catch (error) {
      if (error instanceof ProviderVoiceError && (error.status === undefined || [400, 401, 402, 403, 404, 422, 429].includes(error.status))) {
        this.runtime.library.saveBinding({ ...binding, revision: 2, status: 'failed' })
      }
      throw error
    }
    const next = { ...binding, revision: 2, voiceId: result.voiceId, status: result.status,
      activationDeadline: result.activationDeadline, lastVerifiedAt: new Date().toISOString() }
    this.runtime.library.saveBinding(next)
    if (result.sample) {
      const sample = await this.runtime.assets.write(profileId, 'sample', result.sample)
      this.runtime.library.addAsset(sample)
      this.runtime.library.lockSample(profileId, revision, sample.id, previewText)
    }
    return next
  }
}
