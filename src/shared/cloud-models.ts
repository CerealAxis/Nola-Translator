import type { AppSettings, CredentialProvider, CustomTranslationModel } from './settings'
import { DEFAULT_SETTINGS } from './settings'
import { supportsRecognitionNativeTranslation } from './cloud-config'
import { customModelsOf, customModelSchema, customCredentialSlot } from './custom-models'
import { defaultModelBinding } from './model-policy'

export type CloudModelId = `custom:${string}` | 'cloud' | 'microsoft' | 'mymemory' | 'google' | 'index-translate' | 'aliyun' | 'minimax' | 'recognition'
export interface CloudModel {
  id: CloudModelId
  profile?: CustomTranslationModel
  kind: 'recognitionModel' | 'translationModel'
  free: boolean
  ready: boolean
  active: boolean
}

export function validEndpoint(value: string | undefined): boolean {
  try { return ['https:', 'http:'].includes(new URL(value ?? '').protocol) } catch { return false }
}

/** The legacy backup has its own connection and credential slot, separate from custom profiles. */
export function legacyFallbackReady(settings: AppSettings, credentials: Readonly<Record<CredentialProvider, boolean>>): boolean {
  const fallback = settings.translation.fallback
  return fallback.provider === 'cloud' && validEndpoint(fallback.cloudEndpoint) && !!fallback.cloudModel.trim() &&
    (fallback.cloudApiFormat !== 'anthropic' || !!credentials['fallback-cloud'])
}

/** Saved connection readiness is independent of which service is currently selected. */
export function cloudModelsOf(settings: AppSettings | null, credentials: Readonly<Record<CredentialProvider, boolean>>): CloudModel[] {
  const translation = settings?.translation
  const recognition = settings?.recognition
  const aliyunReady = !!credentials['aliyun-asr'] && !!recognition?.aliyunWorkspaceId?.trim()
  const nativeReady = aliyunReady && supportsRecognitionNativeTranslation({ ...DEFAULT_SETTINGS.recognition, ...recognition, provider: 'aliyun' })
  const models: CloudModel[] = [
    { id: 'aliyun', kind: 'recognitionModel', free: false, ready: aliyunReady, active: recognition?.provider === 'aliyun' },
    { id: 'minimax', kind: 'recognitionModel', free: false, ready: !!credentials['minimax-asr'] && validEndpoint(recognition?.minimaxEndpoint), active: recognition?.provider === 'minimax' },
    ...(['cloud', 'microsoft', 'mymemory', 'google', 'index-translate', 'recognition'] as const).map(id => ({
      id, kind: 'translationModel' as const, free: id === 'mymemory' || id === 'index-translate',
      ready: id === 'cloud' ? false : id === 'microsoft' ? credentials.microsoft && validEndpoint(translation?.microsoftEndpoint)
        : id === 'google' ? credentials.google : id === 'recognition' ? nativeReady : id === 'mymemory' ? validEndpoint(translation?.mymemoryEndpoint ?? DEFAULT_SETTINGS.translation.mymemoryEndpoint) : true,
      active: id !== 'cloud' && translation?.provider === id && translation.targetLanguage !== 'none',
    })),
    ...(translation ? customModelsOf(translation).map(profile => ({
      id: `custom:${profile.id}` as const, profile, kind: 'translationModel' as const, free: false,
      ready: customModelSchema.safeParse(profile).success && (profile.apiFormat !== 'anthropic' || !!credentials[customCredentialSlot(profile.id)]),
      active: translation.provider === 'cloud' && translation.targetLanguage !== 'none' && (translation.customModelId === profile.id || (!translation.customModelId && profile.id === 'legacy')),
    })) : []),
  ]
  return settings?.modelPolicy ? models.map(model => ({ ...model, active: defaultModelBinding(settings, model.kind === 'recognitionModel' ? 'asr' : 'mt') === (model.profile ? `mt-custom:${model.profile.id}` : `cloud:${model.id}`) })) : models
}

