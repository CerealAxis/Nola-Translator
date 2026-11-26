import { intersectTtsLanguages } from './compatibility'
import type { TtsModelCapabilities, TtsPresetVoiceDescriptor } from './capabilities'

export function mergeTtsCapabilities(base: TtsModelCapabilities, override?: Partial<TtsModelCapabilities>, presetVoiceIds?: string[]): TtsModelCapabilities {
  if (!override && presetVoiceIds === undefined) return base
  const voices = new Map<string, TtsPresetVoiceDescriptor>(base.presetVoices.map(voice => [voice.id, { ...voice, metadata: { ...voice.metadata, providerLanguages: voice.languages ?? null } }]))
  if (base.conditioning?.includes('preset')) for (const voice of override?.presetVoices ?? []) {
    const official = voices.get(voice.id)
    const languages = official && voice.languages !== undefined
      ? official.languages ? intersectTtsLanguages(official.languages, voice.languages) : voice.languages
      : official?.languages
    voices.set(voice.id, official ? { ...official, name: voice.name, ...(languages !== undefined ? { languages } : {}) } : { ...voice, metadata: { ...voice.metadata, userDefined: true } })
  }
  const languages = base.languages.mode === 'finite' ? override?.languages?.mode === 'finite'
    ? { mode: 'finite' as const, values: intersectTtsLanguages(base.languages.values, override.languages.values) } : base.languages
    : override?.languages ?? base.languages
  return { ...base, ...override, languages, schemaVersion: 1, modelBinding: base.modelBinding, providerId: base.providerId,
    modelId: base.modelId, defaultPresetVoiceId: presetVoiceIds === undefined || presetVoiceIds.includes(base.defaultPresetVoiceId ?? '') ? base.defaultPresetVoiceId : undefined,
    conditioning: presetVoiceIds !== undefined && base.conditioning?.includes('preset') && !presetVoiceIds.includes(base.defaultPresetVoiceId ?? '') ? base.conditioning.filter(kind => kind !== 'engine-default') : base.conditioning, presetVoices: [...voices.values()].filter(voice => presetVoiceIds === undefined || presetVoiceIds.includes(voice.id)), source: 'user-override' }
}
