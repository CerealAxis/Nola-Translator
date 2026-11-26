import { ttsText } from '@/i18n/tts-ui'
import { modelLanguageName, type UiLanguage } from '../../../shared/languages'
import { restoreIpcError } from '../../../shared/ipc-error'

export function ttsCompatibilityReason(language: UiLanguage, code?: string, details: Record<string, unknown> = {}, targetLanguage?: string): string | undefined {
  const messages: Record<string, Parameters<typeof ttsText>[1]> = {
    MODEL_LANGUAGE_UNSUPPORTED: 'modelLanguageUnsupported', VOICE_LANGUAGE_UNSUPPORTED: 'voiceLanguageUnsupported',
    LANGUAGE_UNVERIFIED: 'languageUnverified', VOICE_MODEL_MISMATCH: 'voiceModelMismatch', VOICE_UNVERIFIED: 'voiceUnverified',
    VOICE_MISSING: 'missing', VOICE_DELETED: 'missing', PROFILE_REVISION_MISSING: 'missing',
    VOICE_CONDITIONING_UNSUPPORTED: 'conditioningUnsupported', ASSET_INVALID: 'assetInvalid', BINDING_UNAVAILABLE: 'bindingUnavailable',
    VOICE_PREPARATION_REQUIRED: details.reason === 'realtime-design-sample-required' ? 'realtimeSampleRequired' : 'voicePreparation',
  }
  const key = messages[code ?? '']
  if (!key) return undefined
  const target = typeof details.targetLanguage === 'string' ? details.targetLanguage : targetLanguage
  return ttsText(language, key).replace('{language}', target ? modelLanguageName(target, language, true) : ttsText(language, 'language'))
}

export function ttsFailureReason(language: UiLanguage, error: unknown, targetLanguage?: string): string | undefined {
  const restored = restoreIpcError(error)
  if (!restored || typeof restored !== 'object' || !('code' in restored) || typeof restored.code !== 'string') return undefined
  const details = 'details' in restored && restored.details && typeof restored.details === 'object' ? restored.details as Record<string, unknown> : {}
  return ttsCompatibilityReason(language, restored.code, details, targetLanguage)
}
