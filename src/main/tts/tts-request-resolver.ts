import type { TtsVoiceRef } from '../../shared/tts/voice-ref'
import type { TtsModelCapabilities } from '../../shared/tts/capabilities'
import { normalizeTtsLanguage, ttsLanguageCompatibility } from '../../shared/tts/compatibility'
import { TtsCompatibilityError } from '../../shared/tts/errors'
import { ttsSynthesisRequestSchema, type ResolvedTtsRequest, type ResolvedVoiceConditioning,
  type TtsSynthesisRequest } from '../../shared/tts/synthesis'
import type { TtsVoiceProfile } from '../../shared/tts/voice-profile'
import type { TtsVoiceBinding } from '../../shared/tts/voice-binding'
import { validateDesignRecipe } from '../../shared/tts/design-recipe'

export interface TtsResolutionContext {
  capabilities: (modelBinding: string) => Promise<TtsModelCapabilities>;
  profile: (id: string, revision?: number) => Promise<TtsVoiceProfile | undefined>;
  asset: (id: string) => Promise<{ sha256: string; mime: string; bytes: number; durationMs?: number }>;
  bindings: (profileId: string, revision: number) => Promise<TtsVoiceBinding[]>;
  scopeId: string;
  defaultVoiceRef?: TtsVoiceRef;
  sessionSpeaker?: (sessionId: string, speakerId: string) => Promise<ResolvedVoiceConditioning>;
  allowUnverifiedLanguage?: boolean;
  onFallback?: (original: TtsSynthesisRequest, resolved: ResolvedTtsRequest, error: TtsCompatibilityError) => void;
}

function immutable<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) immutable(item)
    Object.freeze(value)
  }
  return value
}

export async function resolveTtsRequest(raw: TtsSynthesisRequest, context: TtsResolutionContext): Promise<ResolvedTtsRequest> {
  const request = ttsSynthesisRequestSchema.parse(raw)
  try {
    return await resolve(request, context)
  } catch (error) {
    if (!(error instanceof TtsCompatibilityError) || !request.fallbackVoiceRef) throw error
    if (!context.onFallback) throw error
    const { fallbackVoiceRef, ...primary } = request
    const resolved = await resolve({ ...primary, voiceRef: fallbackVoiceRef }, context)
    context.onFallback(request, resolved, error)
    return resolved
  }
}

async function resolve(request: TtsSynthesisRequest, context: TtsResolutionContext): Promise<ResolvedTtsRequest> {
  const capabilities = await context.capabilities(request.modelBinding)
  const targetLanguage = normalizeTtsLanguage(request.targetLanguage)
  const checkLanguage = (status: ReturnType<typeof ttsLanguageCompatibility>, voice = false) => {
    if (status === 'incompatible') throw new TtsCompatibilityError(voice ? 'VOICE_LANGUAGE_UNSUPPORTED' : 'MODEL_LANGUAGE_UNSUPPORTED', { targetLanguage })
    if (status === 'unverified' && !context.allowUnverifiedLanguage) throw new TtsCompatibilityError('LANGUAGE_UNVERIFIED', { targetLanguage })
  }
  checkLanguage(ttsLanguageCompatibility(capabilities, targetLanguage))
  for (const [key, value] of Object.entries(request.controls ?? {})) {
    if (key === 'emotionStrength' && value !== undefined) throw new TtsCompatibilityError('CONTROL_UNSUPPORTED', { control: key })
    const capability = key === 'instruct' ? 'styleInstruction' : key === 'emotionStrength' ? 'emotion' : key
    if (value !== undefined && capabilities.supports[capability as keyof typeof capabilities.supports] !== true) {
      throw new TtsCompatibilityError('CONTROL_UNSUPPORTED', { control: key })
    }
    const limits = capabilities.controlLimits?.[key as 'speed' | 'pitch' | 'volume' | 'seed']
    if (typeof value === 'number' && limits && (limits.min !== undefined && value < limits.min
      || limits.max !== undefined && value > limits.max || limits.integer && !Number.isInteger(value))) {
      throw new TtsCompatibilityError('CONTROL_UNSUPPORTED', { control: key })
    }
  }
  if (request.pronunciation && !capabilities.supports.pronunciation) throw new TtsCompatibilityError('CONTROL_UNSUPPORTED', { control: 'pronunciation' })
  if (request.output?.format && !capabilities.outputFormats.includes(request.output.format)) throw new TtsCompatibilityError('OUTPUT_UNSUPPORTED')
  if (request.output?.sampleRate && !capabilities.sampleRates?.includes(request.output.sampleRate)) throw new TtsCompatibilityError('OUTPUT_UNSUPPORTED')
  const ref = request.voiceRef.kind === 'engine-default' && context.defaultVoiceRef && context.defaultVoiceRef.kind !== 'engine-default'
    ? context.defaultVoiceRef : request.voiceRef
  let profile: TtsVoiceProfile | undefined
  let conditioning: ResolvedVoiceConditioning
  const reference = async (assetId: string, purpose: 'human-reference' | 'designed-sample', transcript?: string, recordedLanguage?: string): Promise<ResolvedVoiceConditioning> => {
    if (capabilities.supports.cloning !== true) throw new TtsCompatibilityError('VOICE_CONDITIONING_UNSUPPORTED')
    if (capabilities.conditioning && !capabilities.conditioning.includes('reference-audio')) throw new TtsCompatibilityError('VOICE_PREPARATION_REQUIRED')
    let asset: Awaited<ReturnType<TtsResolutionContext['asset']>>
    try { asset = await context.asset(assetId) } catch { throw new TtsCompatibilityError('ASSET_INVALID', { assetId }) }
    const limits = capabilities.reference
    if (limits && (!limits.mimeTypes.includes(asset.mime) || limits.maxBytes && asset.bytes > limits.maxBytes
      || purpose === 'designed-sample' && !limits.acceptsSynthetic
      || limits.transcriptRequired && !transcript
      || limits.minSeconds !== undefined && (asset.durationMs === undefined || asset.durationMs < limits.minSeconds * 1000)
      || limits.maxSeconds !== undefined && (asset.durationMs === undefined || asset.durationMs > limits.maxSeconds * 1000)
      || limits.maxEncodedBytes && Math.ceil(asset.bytes / 3) * 4 > limits.maxEncodedBytes)) throw new TtsCompatibilityError('ASSET_INVALID', { assetId })
    return { kind: 'reference-audio', assetId, sha256: asset.sha256, transcript, recordedLanguage, purpose }
  }
  if (ref.kind === 'preset') {
    if (ref.modelBinding !== request.modelBinding) throw new TtsCompatibilityError('VOICE_MODEL_MISMATCH')
    const voice = capabilities.presetVoices.find(item => item.id === ref.voiceId)
    if (!voice) throw new TtsCompatibilityError('VOICE_UNVERIFIED', { voiceId: ref.voiceId })
    if (voice.modelIds && !voice.modelIds.includes(capabilities.modelId)) throw new TtsCompatibilityError('VOICE_MODEL_MISMATCH')
    checkLanguage(ttsLanguageCompatibility(capabilities, targetLanguage, voice), true)
    conditioning = { kind: 'preset', voiceId: voice.id }
  } else if (ref.kind === 'profile') {
    profile = await context.profile(ref.profileId, ref.revision)
    if (!profile) throw new TtsCompatibilityError(ref.revision ? 'PROFILE_REVISION_MISSING' : 'VOICE_MISSING')
    if (profile.deletedAt) throw new TtsCompatibilityError('VOICE_DELETED')
    if (profile.kind === 'clone' && capabilities.supports.cloning !== true) throw new TtsCompatibilityError('VOICE_CONDITIONING_UNSUPPORTED')
    const bindings = await context.bindings(profile.id, profile.revision)
    const binding = bindings.find(item => item.status === 'ready' && item.accountScope === context.scopeId
      && item.providerId === capabilities.providerId && item.modelIds.includes(capabilities.modelId)
      && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now())
      && (!item.activationDeadline || item.activatedAt || Date.parse(item.activationDeadline) > Date.now()))
    if (binding?.voiceId) {
      if (binding.languages) checkLanguage(ttsLanguageCompatibility({ ...capabilities, languages: { mode: 'finite', values: binding.languages } }, targetLanguage), true)
      conditioning = { kind: 'provider-voice', bindingId: binding.id, bindingRevision: binding.revision, voiceId: binding.voiceId, scopeId: binding.accountScope }
    } else if (profile.kind === 'design') {
      const recipe = profile.representations.find(item => item.kind === 'design-recipe')
      const sample = profile.lockedSampleAssetId ?? recipe?.renderedSampleAssetId
      if (sample && capabilities.supports.cloning === true) {
        const recording = profile.representations.filter(item => item.kind === 'reference-audio').find(item => item.assetId === sample)
        conditioning = await reference(sample, 'designed-sample', recording?.transcript, recording?.recordedLanguage)
      } else if (recipe && capabilities.supports.voiceDesign === true && recipe.authoringModelBinding === request.modelBinding
          && (!capabilities.conditioning || capabilities.conditioning.includes('design'))) {
        if (!validateDesignRecipe(recipe.recipeSchema ?? 'nola-description-v1', recipe.recipe, capabilities.providerId)) throw new TtsCompatibilityError('VOICE_CONDITIONING_UNSUPPORTED')
        if (recipe.seed !== undefined && !capabilities.supports.seed) throw new TtsCompatibilityError('CONTROL_UNSUPPORTED', { control: 'seed' })
        conditioning = { kind: 'design', description: recipe.description, recipe: recipe.recipe,
          recipeSchema: recipe.recipeSchema ?? 'nola-description-v1', authoringModelBinding: recipe.authoringModelBinding, seed: recipe.seed }
      } else throw new TtsCompatibilityError('VOICE_PREPARATION_REQUIRED')
    } else {
      const recordings = profile.representations.filter(item => item.kind === 'reference-audio')
      const primaryReferenceAssetId = profile.primaryReferenceAssetId
      const recording = primaryReferenceAssetId ? recordings.find(item => item.assetId === primaryReferenceAssetId)
        : recordings.length === 1 ? recordings[0] : undefined
      if (!recording) throw new TtsCompatibilityError('VOICE_PREPARATION_REQUIRED')
      conditioning = await reference(recording.assetId, 'human-reference', recording.transcript, recording.recordedLanguage)
    }
  } else if (ref.kind === 'session-speaker') {
    if (!context.sessionSpeaker) throw new TtsCompatibilityError('VOICE_MISSING')
    conditioning = await context.sessionSpeaker(ref.sessionId, ref.speakerId)
    if (conditioning.kind !== 'reference-audio') throw new TtsCompatibilityError('VOICE_CONDITIONING_UNSUPPORTED')
    conditioning = await reference(conditioning.assetId, conditioning.purpose, conditioning.transcript, conditioning.recordedLanguage)
  } else if (capabilities.defaultPresetVoiceId) {
    return resolve({ ...request, voiceRef: { kind: 'preset', modelBinding: request.modelBinding, voiceId: capabilities.defaultPresetVoiceId } }, context)
  } else conditioning = { kind: 'engine-default' }
  if (capabilities.conditioning && !capabilities.conditioning.includes(conditioning.kind)) throw new TtsCompatibilityError('VOICE_CONDITIONING_UNSUPPORTED')
  return immutable(structuredClone({ ...request, voiceRef: ref, targetLanguage, conditioning, modelId: capabilities.modelId,
    providerId: capabilities.providerId, capabilityRevision: capabilities.revision ?? 'catalog-v1',
    ...(profile ? { profileId: profile.id, profileRevision: profile.revision } : {}) }))
}
